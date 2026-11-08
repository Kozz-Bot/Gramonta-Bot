const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	normalizeTweetUrl,
	downloadTwitterVideo,
	TwitterError,
} = require('../dist/Handlers/Twitter/download');

test('accepts tweet links and removes tracking parameters', () => {
	for (const input of [
		'https://x.com/test/status/123?s=20',
		'https://mobile.twitter.com/test/status/123/video/1',
		'https://twitter.com/i/web/status/123',
	]) {
		assert.equal(normalizeTweetUrl(input), 'https://twitter.com/i/status/123');
	}
});
test('rejects other hosts, credentials, profiles and extra arguments before downloading', async () => {
	for (const input of [
		'',
		'file:///etc/passwd',
		'https://x.com.evil.com/test/status/123',
		'https://x.com@localhost/test/status/123',
		'http://x.com/test/status/123',
		'https://x.com/test',
		'https://x.com/test/status/123 extra',
	]) {
		assert.throws(() => normalizeTweetUrl(input), TwitterError);
		await assert.rejects(downloadTwitterVideo(input), TwitterError);
	}
});

const { downloadHarness } = require('./helpers/download-harness.cjs');
function handler(download, platform = 'twitter') {
	return downloadHarness(async url => ({
		...(await download(url, platform)),
		mimeType: 'video/mp4',
	})).social(platform);
}
function requester(query, from = 'user') {
	const replies = [],
		sent = [];
	const reply = value => replies.push(value);
	reply.withMedia = value => sent.push(value);
	return {
		rawCommand: { query },
		message: { boundaryId: 'zapo', from },
		reply,
		replies,
		sent,
	};
}
test('requires link and sends downloaded video through origin reply', async () => {
	let calls = 0;
	const methods = handler(async () => {
		calls++;
		return { data: Buffer.from('video'), duration: 3 };
	});
	for (const query of ['', 'https://evil.com/post']) {
		const req = requester(query);
		await methods.default(req);
		assert.equal(req.sent.length, 0);
		assert.equal(req.replies.length, 2);
	}
	assert.equal(calls, 0);
	const req = requester('https://x.com/test/status/123');
	await methods.fallback(req);
	assert.equal(req.sent[0].mimeType, 'video/mp4');
	assert.equal(req.sent[0].transportType, 'b64');
	assert.equal(Buffer.from(req.sent[0].data, 'base64').toString(), 'video');
});
test('limits concurrency and releases slots after failures', async () => {
	const pending = [];
	const run = handler(
		() => new Promise((resolve, reject) => pending.push({ resolve, reject }))
	).fallback;
	const first = run(requester('https://x.com/test/status/123', 'a'));
	const second = run(requester('https://x.com/test/status/123', 'b'));
	for (const from of ['a', 'c']) {
		const req = requester('https://x.com/test/status/123', from);
		await run(req);
		assert.equal(req.replies.length, 2);
		assert.equal(req.sent.length, 0);
	}
	assert.equal(pending.length, 2);
	pending[0].reject(new TwitterError('Falha de teste'));
	pending[1].resolve({ data: Buffer.from('video'), duration: 1 });
	await Promise.all([first, second]);
	const next = run(requester('https://x.com/test/status/123', 'a'));
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(pending.length, 3);
	pending[2].resolve({ data: Buffer.from('video'), duration: 1 });
	await next;
});

test('all video commands extract links from quoted text and captions', async () => {
	for (const [platform, link] of [
		['twitter', 'https://x.com/test/status/123'],
		['instagram', 'https://www.instagram.com/reel/Code/'],
		['facebook', 'https://www.facebook.com/reel/123'],
		['tiktok', 'https://vt.tiktok.com/ZSgHweQy2/'],
	]) {
		let calls = 0;
		const run = handler(async (url, actualPlatform) => {
			calls++;
			assert.equal(actualPlatform, platform);
			assert.equal(
				url,
				platform === 'twitter' ? 'https://twitter.com/i/status/123' : link
			);
			return { data: Buffer.from('video'), duration: 3 };
		}, platform).default;
		const req = requester('');
		req.message.quotedMessage = {
			id: 'quoted',
			body: `Confira esse vídeo: (${link}).\nCompartilhado pelo aplicativo.`,
			messageType: 'IMAGE',
		};
		await run(req);
		assert.equal(calls, 1);
		assert.equal(req.sent.length, 1);
	}
});

test('explicit link takes precedence over quote and shared text works as argument', async () => {
	let downloaded;
	const run = handler(async url => {
		downloaded = url;
		return { data: Buffer.from('video'), duration: 1 };
	}, 'tiktok').fallback;
	const req = requester(
		'Confira https://vt.tiktok.com/ZSgHweQy2/ Compartilhado via TikTok'
	);
	req.message.quotedMessage = { body: 'https://www.tiktok.com/@other/video/456' };
	await run(req);
	assert.equal(downloaded, 'https://vt.tiktok.com/ZSgHweQy2/');
	const bad = requester('https://example.com');
	bad.message.quotedMessage = req.message.quotedMessage;
	downloaded = undefined;
	await run(bad);
	assert.equal(downloaded, undefined);
	assert.equal(bad.sent.length, 0);
});

test('actual handler preserves case-sensitive Facebook, Instagram and TikTok codes despite gateway normalization', async () => {
	for (const [platform, command, url] of [
		['facebook', '!fb', 'https://www.facebook.com/share/v/19tFAqdJz8/'],
		['facebook', '/FB', 'https://www.facebook.com/share/r/AbC123/'],
		['instagram', '!ig', 'https://www.instagram.com/reel/AbC_123/'],
		['tiktok', '!tt', 'https://vt.tiktok.com/ZSgHweQy2/'],
	]) {
		const methods = handler(async actual => {
			assert.equal(actual, url);
			return { data: Buffer.from('video'), duration: 1 };
		}, platform);
		const req = requester(`Veja ${url.toLowerCase()} Compartilhado`);
		req.message.body = `${command} Veja ${url} Compartilhado`;
		req.message.quotedMessage = { body: 'https://www.facebook.com/reel/999' };
		await methods.fallback(req);
		assert.equal(req.sent.length, 1);
	}
});

test('original explicit invalid input does not fall back to a quote or unrelated message body', async () => {
	let downloaded;
	const methods = handler(async url => {
		downloaded = url;
		return { data: Buffer.from('video'), duration: 1 };
	}, 'facebook');
	const invalid = requester('https://example.com');
	invalid.message.body = '!fb https://example.com';
	invalid.message.quotedMessage = { body: 'https://www.facebook.com/reel/999' };
	await methods.fallback(invalid);
	assert.equal(downloaded, undefined);
	assert.equal(invalid.sent.length, 0);
	const synthetic = requester('https://www.facebook.com/share/v/19tFAqdJz8/');
	synthetic.message.body = '!ai analise https://www.facebook.com/reel/999';
	await methods.fallback(synthetic);
	assert.equal(downloaded, 'https://www.facebook.com/share/v/19tFAqdJz8/');
	assert.equal(synthetic.sent.length, 1);
});

test('recovers missing quoted body from the origin boundary only', async () => {
	const run = handler(async url => {
		assert.equal(url, 'https://twitter.com/i/status/123');
		return { data: Buffer.from('video'), duration: 1 };
	}).default;
	const req = requester('');
	req.message.chatId = 'group@g.us';
	req.message.quotedMessage = { id: 'quoted' };
	req.ask = {
		boundary: async (...args) => {
			assert.deepEqual(args, [
				'zapo',
				'message_by_id',
				{ messageId: 'quoted', chatId: 'group@g.us' },
			]);
			return { response: { body: 'Legenda https://x.com/test/status/123' } };
		},
	};
	await run(req);
	assert.equal(req.sent.length, 1);
});

test('reports quote with no valid video link, unavailable body and recovery failure', async () => {
	let calls = 0;
	const run = handler(async () => {
		calls++;
		throw new Error('should not run');
	}, 'tiktok').default;
	for (const body of [
		'Sem link',
		'https://x.com/test/status/123',
		'https://www.tiktok.com/@user',
		'',
	]) {
		const req = requester('');
		req.message.quotedMessage = { id: 'quoted', body };
		req.ask = { boundary: async () => ({ response: undefined }) };
		await run(req);
		assert.equal(req.sent.length, 0);
		assert.equal(req.replies.length, 2);
	}
	const failed = requester('');
	failed.message.quotedMessage = { id: 'quoted' };
	failed.ask = {
		boundary: async () => {
			throw new Error('private boundary detail');
		},
	};
	await run(failed);
	assert.equal(failed.sent.length, 0);
	assert.equal(failed.replies.length, 2);
	assert.equal(calls, 0);
});

test('new commands validate their own platforms and reply with MP4', async () => {
	for (const [platform, query] of [
		['instagram', 'https://www.instagram.com/reel/Code/'],
		['facebook', 'https://www.facebook.com/reel/123'],
		['tiktok', 'https://www.tiktok.com/@user/video/123'],
	]) {
		const methods = handler(async (url, actualPlatform) => {
			assert.equal(actualPlatform, platform);
			return { data: Buffer.from('test-video'), duration: 4 };
		}, platform);
		const bad = requester('https://x.com/test/status/123');
		await methods.fallback(bad);
		assert.equal(bad.sent.length, 0);
		const good = requester(query);
		await methods.fallback(good);
		assert.equal(good.sent.length, 1);
		assert.equal(good.sent[0].fileName, `video.mp4`);
		assert.equal(good.sent[0].sizeInBytes, 10);
	}
});

test('download slots are shared across different platform commands', async () => {
	const pending = [];
	const harness = downloadHarness(
		() => new Promise(resolve => pending.push(resolve))
	);
	const ig = harness.social('instagram').fallback;
	const fb = harness.social('facebook').fallback;
	const first = ig(requester('https://instagram.com/reel/Code/', 'a'));
	const duplicate = requester('https://facebook.com/reel/123', 'a');
	await fb(duplicate);
	assert.equal(pending.length, 1);
	assert.equal(duplicate.replies.length, 2);
	const second = fb(requester('https://facebook.com/reel/123', 'b'));
	const busy = requester('https://instagram.com/reel/Code/', 'c');
	await ig(busy);
	assert.equal(pending.length, 2);
	assert.equal(busy.replies.length, 2);
	pending.forEach(resolve => resolve({ data: Buffer.from('video'), duration: 1 }));
	await Promise.all([first, second]);
});
