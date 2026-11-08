const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const sharp = require('sharp');
const Fuel = require('../dist/API/FuelIXApi').default;
const observability = require('../dist/API/AiObservability');

for (const edit of [false, true]) {
	test(`Image ${edit ? 'editing' : 'generation'} survives reused socket idle timeout and honors explicit deadline`, async t => {
		const originalLog = observability.logAiUsage;
		const originalKey = process.env.FUELIX_API_KEY;
		const originalBase = process.env.FUELIX_BASE_URL;
		const events = [],
			sockets = [],
			timers = new Set();
		observability.logAiUsage = async event => events.push(event);
		const server = http.createServer((req, res) => {
			req.resume();
			req.on('end', () => {
				sockets.push(req.socket);
				res.setHeader('Content-Type', 'application/json');
				if (req.url === '/responses') {
					res.end(JSON.stringify({ id: 'local', output: [] }));
					return;
				}
				assert.equal(req.url, edit ? '/images/edits' : '/images/generations');
				const timer = setTimeout(() => {
					timers.delete(timer);
					res.end(JSON.stringify({ data: [{ b64_json: 'synthetic-image' }] }));
				}, 5500);
				timers.add(timer);
			});
		});
		server.keepAliveTimeout = 60000;
		t.after(async () => {
			for (const timer of timers) clearTimeout(timer);
			server.closeAllConnections();
			await new Promise(resolve => server.close(resolve));
			observability.logAiUsage = originalLog;
			if (originalKey === undefined) delete process.env.FUELIX_API_KEY;
			else process.env.FUELIX_API_KEY = originalKey;
			if (originalBase === undefined) delete process.env.FUELIX_BASE_URL;
			else process.env.FUELIX_BASE_URL = originalBase;
		});
		await new Promise((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', resolve);
		});
		process.env.FUELIX_API_KEY = 'test-placeholder';
		process.env.FUELIX_BASE_URL = `http://127.0.0.1:${server.address().port}`;
		const png = await sharp({
			create: { width: 2, height: 2, channels: 3, background: 'blue' },
		})
			.png()
			.toBuffer();
		const references = edit
			? [
					{
						data: png.toString('base64'),
						transportType: 'base64',
						mimeType: 'image/png',
					},
				]
			: [];
		// The preceding timed Responses call leaves follow-redirects' timeout listener
		// on the keep-alive socket, exactly as in the WhatsApp tool workflow.
		await Fuel.createToolResponseCompletion({
			messages: [{ role: 'user', content: 'Synthetic test' }],
			tools: [],
		});
		const started = Date.now();
		assert.equal(
			(await Fuel.generateImage('Synthetic test image', references)).b64_json,
			'synthetic-image'
		);
		assert.ok(Date.now() - started >= 5500);
		assert.equal(sockets[0], sockets[1], 'Must exercise the same reused socket');
		await assert.rejects(
			Fuel.generateImage('Synthetic test image', references, 100),
			error => error.code === 'ECONNABORTED' && /100ms/.test(error.message)
		);
		const eventName = edit ? 'image_edit' : 'image_generation';
		assert.equal(
			events.filter(event => event.event === eventName && event.status === 'success')
				.length,
			1
		);
		assert.equal(
			events.filter(event => event.event === eventName && event.status === 'error')
				.length,
			1
		);
	});
}
