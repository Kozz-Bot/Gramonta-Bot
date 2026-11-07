const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const sharp = require('sharp');
const { createBackgroundRemover } = require('../dist/Services/BackgroundRemoval');
const {
	verifyModel,
	defaultModelPath,
} = require('../dist/Services/BackgroundRemoval/model');
const workerFile = path.join(__dirname, 'fixtures/background-worker.cjs');

test('queue runs one job at a time, bounds admission and reuses a single worker', async t => {
	const worker = createBackgroundRemover({ workerFile, maxPending: 2 });
	t.after(() => worker.close());
	const a = worker.remove(Buffer.from('a')),
		b = worker.remove(Buffer.from('b'));
	await assert.rejects(worker.remove(Buffer.from('c')), /fila/);
	const [one, two] = (await Promise.all([a, b])).map(r =>
		JSON.parse(r.bytes.toString())
	);
	assert.equal(one.parallel, 1);
	assert.equal(two.parallel, 1);
	assert.equal(one.pid, two.pid);
	await assert.rejects(worker.remove(Buffer.alloc(8000001)), /8 MB/);
});
test('worker crash/timeout release the queue; idle workers exit and are recreated', async t => {
	const worker = createBackgroundRemover({
		workerFile,
		timeoutMs: 1000,
		idleMs: 30,
	});
	t.after(() => worker.close());
	const crash = worker.remove(Buffer.from('crash'));
	const afterCrash = worker.remove(Buffer.from('after-crash'));
	await assert.rejects(crash);
	await afterCrash;
	const hung = worker.remove(Buffer.from('hang'));
	const next = worker.remove(Buffer.from('after-timeout'));
	await assert.rejects(hung);
	const one = JSON.parse((await next).bytes.toString());
	await new Promise(resolve => setTimeout(resolve, 90));
	const two = JSON.parse(
		(await worker.remove(Buffer.from('after-idle'))).bytes.toString()
	);
	assert.notEqual(one.pid, two.pid);
	worker.close();
	await assert.rejects(worker.remove(Buffer.from('closed')), /indisponível/);
});
test(
	'real CPU model yields alpha, preserves original transparency and refuses animation/invalid pixels',
	{ skip: !fs.existsSync(defaultModelPath()) },
	async t => {
		const worker = createBackgroundRemover();
		t.after(() => worker.close());
		assert.equal(verifyModel(fs.readFileSync(defaultModelPath())), true);
		assert.equal(verifyModel(Buffer.from('invalid')), false);
		const image = await sharp(
			Buffer.from(
				'<svg width="512" height="400"><rect width="512" height="400" fill="white"/><circle cx="256" cy="200" r="130" fill="red"/></svg>'
			)
		)
			.png()
			.toBuffer();
		const result = await worker.remove(image);
		const decoded = await sharp(result.bytes)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		assert.equal(decoded.info.width, 512);
		assert.equal(decoded.info.height, 400);
		assert.equal(decoded.info.channels, 4);
		let clear = 0,
			visible = 0;
		for (let p = 3; p < decoded.data.length; p += 4) {
			if (decoded.data[p] < 20) clear++;
			if (decoded.data[p] > 235) visible++;
		}
		assert.ok(clear > 10000);
		assert.ok(visible > 10000);
		const transparent = await sharp({
			create: { width: 128, height: 128, channels: 4, background: '#00000000' },
		})
			.png()
			.toBuffer();
		const output = await worker.remove(transparent);
		assert.equal((await sharp(output.bytes).stats()).channels[3].max, 0);
		await assert.rejects(worker.remove(Buffer.from('invalid image')));
		const gif = await sharp(image).gif().toBuffer();
		await assert.rejects(worker.remove(gif), /GIFs e vídeos/);
		const large = await sharp({
			create: { width: 4001, height: 4000, channels: 3, background: 'white' },
		})
			.png()
			.toBuffer();
		await assert.rejects(worker.remove(large));
	}
);
