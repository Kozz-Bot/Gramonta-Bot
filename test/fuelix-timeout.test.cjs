const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Fuel = require('../dist/API/FuelIXApi').default;
const observability = require('../dist/API/AiObservability');

test('Responses survives the agent idle timeout on the actual reused transcription connection and honors explicit deadlines', async t => {
	const events = [],
		timers = new Set(),
		sockets = [];
	const log = observability.logAiUsage,
		key = process.env.FUELIX_API_KEY,
		base = process.env.FUELIX_BASE_URL;
	observability.logAiUsage = async e => events.push(e);
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fuelix-timeout-'));
	const file = path.join(dir, 'audio.mp3');
	await fs.writeFile(file, Buffer.from('artificial audio'));
	const server = http.createServer((req, res) => {
		req.resume();
		req.on('end', () => {
			res.setHeader('Content-Type', 'application/json');
			if (req.url === '/audio/transcriptions') {
				sockets[0] = req.socket;
				res.end(JSON.stringify({ text: 'Teste de áudio' }));
				return;
			}
			assert.equal(req.url, '/responses');
			sockets.push(req.socket);
			const timer = setTimeout(() => {
				timers.delete(timer);
				res.end(
					JSON.stringify({
						id: 'local-response',
						output: [
							{
								type: 'message',
								content: [{ type: 'output_text', text: 'Resumo de teste' }],
							},
						],
					})
				);
			}, 5500);
			timers.add(timer);
		});
	});
	server.keepAliveTimeout = 60000;
	t.after(async () => {
		for (const timer of timers) clearTimeout(timer);
		server.closeAllConnections();
		await new Promise(resolve => server.close(resolve));
		observability.logAiUsage = log;
		if (key === undefined) delete process.env.FUELIX_API_KEY;
		else process.env.FUELIX_API_KEY = key;
		if (base === undefined) delete process.env.FUELIX_BASE_URL;
		else process.env.FUELIX_BASE_URL = base;
		await fs.rm(dir, { recursive: true, force: true });
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	process.env.FUELIX_API_KEY = 'test-placeholder';
	process.env.FUELIX_BASE_URL = `http://127.0.0.1:${server.address().port}`;
	assert.equal(
		(await Fuel.transcribeFile(file)).alternatives[0].transcript,
		'Teste de áudio'
	);
	const payload = {
		messages: [{ role: 'user', content: 'Resuma o vídeo artificial' }],
		tools: [],
	};
	const started = Date.now(),
		result = await Fuel.createToolResponseCompletion(payload);
	assert.equal(result.content, 'Resumo de teste');
	assert.ok(Date.now() - started >= 5500);
	assert.equal(
		sockets[0],
		sockets[1],
		'Must reuse the socket carrying the old transcription timeout listener'
	);
	await assert.rejects(
		Fuel.createToolResponseCompletion({ ...payload, timeoutMs: 100 }),
		e => e.code === 'ECONNABORTED' && /100ms/.test(e.message)
	);
	assert.equal(
		events.filter(e => e.event === 'chat_completion' && e.status === 'success')
			.length,
		1
	);
	assert.equal(
		events.filter(e => e.event === 'chat_completion' && e.status === 'error').length,
		1
	);
});
