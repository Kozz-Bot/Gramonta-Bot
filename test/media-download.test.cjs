const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { downloadHarness } = require('./helpers/download-harness.cjs');
const { downloadQuery } = require('../dist/Services/MediaDownload/request');
const {
	publicUrl,
	extractDownloadUrl,
	youtubeUrl,
	MAX_BYTES,
} = require('../dist/Services/MediaDownload/urls');
const { prepareMedia } = require('../dist/Services/MediaDownload/media');
const { commandOutcome, aiContract } = require('../dist/Services/OwnerAI/contracts');

const loadService = (relative, mocks) => {
	const file = path.resolve(__dirname, '../dist', relative),
		exports = {};
	const localRequire = createRequire(file);
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
		exports,
		process,
		Buffer,
		URL,
		console,
		require: name => (Object.hasOwn(mocks, name) ? mocks[name] : localRequire(name)),
	});
	return exports;
};
const requester = (body, query, from = 'user') => {
	const replies = [],
		sent = [];
	const reply = value => replies.push(String(value));
	reply.withMedia = value => sent.push(value);
	return {
		message: {
			body,
			from,
			boundaryId: 'origin',
			chatId: '123@g.us',
			to: '123@g.us',
		},
		rawCommand: { query },
		reply,
		replies,
		sent,
	};
};

test('unified handlers preserve URLs, send the requested media and register AI contracts', async () => {
	const calls = [];
	const h = downloadHarness(async (query, mode) => {
		calls.push([query, mode]);
		return {
			data: Buffer.from('media'),
			duration: 2,
			mimeType: mode === 'audio' ? 'audio/ogg; codecs=opus' : 'video/mp4',
		};
	});
	const url = 'https://example.com/VideoAbC?Token=XyZ&sig=A%2Fb--C';
	for (const mode of ['video', 'audio']) {
		const r = requester(`!${mode} ${url}`, url.toLowerCase());
		await h.generic(mode).fallback(r);
		assert.deepEqual(calls.at(-1), [url, mode]);
		assert.equal(r.sent.length, 1);
		assert.equal(r.sent[0].transportType, 'b64');
		assert.equal(r.sent[0].asVoiceNote, mode === 'audio' ? true : undefined);
		assert.equal(commandOutcome(r.rawCommand).status, 'submitted');
		assert.ok(aiContract(mode).methods.default.examples.length);
		assert.equal(
			r.replies.some(v => v.includes('será removido')),
			false
		);
	}
});

test('query handles quoted links, origin-only recovery, search names, and explicit invalid URLs', async () => {
	const r = requester('!video', '');
	r.message.quotedMessage = { id: 'quoted' };
	r.ask = {
		boundary: async (boundary, name, args) => {
			assert.equal(boundary, 'origin');
			assert.equal(name, 'message_by_id');
			assert.deepEqual(args, { messageId: 'quoted', chatId: '123@g.us' });
			return { response: { body: 'Veja https://example.com/VideoAbC' } };
		},
	};
	assert.equal(await downloadQuery(r, 'video'), 'https://example.com/VideoAbC');
	assert.equal(
		await downloadQuery(requester('!audio Música Árvore', 'musica arvore'), 'audio'),
		'Música Árvore'
	);
	const bad = requester(
		'!video http://localhost/private',
		'http://localhost/private'
	);
	bad.message.quotedMessage = { body: 'https://example.com/Good' };
	await assert.rejects(downloadQuery(bad, 'video'), /HTTPS/);
});

test('video/audio/legacy commands share slots; failures release them and expose actual outcomes', async () => {
	const pending = [];
	const h = downloadHarness(
		() => new Promise((resolve, reject) => pending.push({ resolve, reject }))
	);
	const url = 'https://example.com/Video';
	const one = requester(`!video ${url}`, url, 'a');
	const first = h.generic('video').default(one);
	await new Promise(resolve => setImmediate(resolve));
	const duplicate = requester(`!audio ${url}`, url, 'a');
	await h.generic('audio').default(duplicate);
	assert.match(duplicate.replies.join(''), /em andamento/);
	const two = requester(
		'!fb https://facebook.com/reel/123',
		'https://facebook.com/reel/123',
		'b'
	);
	const second = h.social('facebook').default(two);
	await new Promise(resolve => setImmediate(resolve));
	const busy = requester('!yt song nome', 'song nome', 'c');
	busy.rawCommand.immediateArg = 'nome';
	await h.youtube().song(busy);
	assert.match(busy.replies.join(''), /ocupado/);
	assert.equal(pending.length, 2);
	pending[0].reject(new Error('secret provider URL'));
	pending[1].resolve({
		data: Buffer.from('media'),
		duration: 1,
		mimeType: 'video/mp4',
	});
	await Promise.all([first, second]);
	assert.equal(commandOutcome(one.rawCommand).success, false);
	assert.doesNotMatch(one.replies.join(''), /secret provider/);
	const next = h.generic('audio').default(requester(`!audio ${url}`, url, 'a'));
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(pending.length, 3);
	pending[2].resolve({
		data: Buffer.from('audio'),
		duration: 1,
		mimeType: 'audio/ogg; codecs=opus',
	});
	await next;
});

test('routing uses yt-dlp then Cobalt; YouTube and searches exclusively use the remote API', async () => {
	const calls = [];
	let failPrimary = false,
		failYoutube = false;
	const service = loadService('Services/MediaDownload/download.js', {
		'./providers': {
			downloadWithYtDlp: async (url, mode) => {
				calls.push(['yt-dlp', url, mode]);
				if (failPrimary) throw new Error('fail');
				return Buffer.from('primary');
			},
			downloadWithCobalt: async (url, mode) => {
				calls.push(['cobalt', url, mode]);
				return Buffer.from('fallback');
			},
		},
		'./network': { resolvePublicUrl: async url => url },
		'./media': { prepareMedia: async (data, mode) => ({ data, mode }) },
		'../../API/YoutubeAPI': {
			searchResults: async query => {
				calls.push(['search', query]);
				return { results: [{ link: 'https://youtu.be/AbC' }] };
			},
			downloadYoutubeMedia: async (url, mode) => {
				calls.push(['youtube-https', url, mode]);
				if (failYoutube) throw new Error('remote error');
				return Buffer.from('youtube');
			},
		},
	});
	assert.equal(
		(
			await service.downloadMedia('https://example.com/Video', 'video')
		).data.toString(),
		'primary'
	);
	assert.deepEqual(
		calls.map(c => c[0]),
		['yt-dlp']
	);
	calls.length = 0;
	failPrimary = true;
	assert.equal(
		(
			await service.downloadMedia('https://example.com/Video', 'audio')
		).data.toString(),
		'fallback'
	);
	assert.deepEqual(
		calls.map(c => c[0]),
		['yt-dlp', 'cobalt']
	);
	calls.length = 0;
	await service.downloadMedia('https://youtu.be/AbC', 'video');
	assert.deepEqual(
		calls.map(c => c[0]),
		['youtube-https']
	);
	calls.length = 0;
	await service.downloadMedia('Música Árvore', 'audio');
	assert.deepEqual(
		calls.map(c => c[0]),
		['search', 'youtube-https']
	);
	calls.length = 0;
	failYoutube = true;
	await assert.rejects(
		service.downloadMedia('https://youtu.be/AbC', 'audio'),
		/remote error/
	);
	assert.deepEqual(
		calls.map(c => c[0]),
		['youtube-https']
	);
});

test('YouTube API enforces HTTPS and bounded isolated responses without writing shared files', async () => {
	const calls = [];
	let json;
	const service = loadService('API/YoutubeAPI.js', {
		axios: {
			create: config => ({
				defaults: config,
				request: async args => {
					calls.push(args);
					return {
						headers: { 'content-type': json ? 'application/json' : 'video/mp4' },
						data: json ? Buffer.from(JSON.stringify(json)) : Buffer.from('media'),
					};
				},
			}),
			isAxiosError: () => false,
		},
		'../Services/MediaDownload/network': {
			fetchPublicMedia: async url => {
				calls.push(url);
				return Buffer.from('remote');
			},
		},
	});
	assert.equal(
		(await service.downloadYoutubeMedia('https://youtu.be/AbC', 'video')).toString(),
		'media'
	);
	assert.equal(calls[0].maxContentLength, MAX_BYTES);
	assert.equal(calls[0].maxRedirects, 0);
	json = { base64: Buffer.from('audio').toString('base64') };
	assert.equal(
		(await service.downloadYoutubeMedia('https://youtu.be/AbC', 'audio')).toString(),
		'audio'
	);
	json = { path: '/etc/passwd' };
	await assert.rejects(
		service.downloadYoutubeMedia('https://youtu.be/AbC', 'video'),
		/não retornou/
	);
});

test('public URL and DNS guards reject local addresses and keep signed URL case', async () => {
	for (const url of [
		'file:///etc/passwd',
		'http://example.com/v',
		'https://127.0.0.1/v',
		'https://[::1]/v',
		'https://localhost/v',
		'https://x.internal/v',
		'https://user:pass@example.com/v',
		'https://example.com:9011/v',
	])
		assert.throws(() => publicUrl(url));
	assert.equal(
		extractDownloadUrl('Confira https://example.com/AbC?sig=XyZ'),
		'https://example.com/AbC?sig=XyZ'
	);
	assert.equal(youtubeUrl('https://youtube.com.evil.com/v'), false);
	for (const address of [
		'127.0.0.1',
		'10.1.2.3',
		'169.254.169.254',
		'192.168.0.1',
		'172.16.0.1',
	]) {
		const service = loadService('Services/MediaDownload/urls.js', {
			'node:dns/promises': { lookup: async () => [{ address, family: 4 }] },
		});
		await assert.rejects(service.publicAddress('example.com'), /público/);
	}
});

test('yt-dlp proxy refuses local and YouTube targets for every subrequest', async t => {
	const { downloadProxy } = require('../dist/Services/MediaDownload/network');
	const proxy = await downloadProxy();
	t.after(proxy.close);
	for (const target of [
		'http://127.0.0.1:9011/',
		'http://localhost/',
		'http://www.youtube.com/watch?v=AbC',
	]) {
		const status = await new Promise((resolve, reject) => {
			const req = http.request(proxy.url, { path: target }, res => {
				res.resume();
				resolve(res.statusCode);
			});
			req.on('error', reject);
			req.end();
		});
		assert.equal(status, 403);
	}
});

let directory, fixture;
before(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), 'unified-download-test-'));
	fixture = path.join(directory, 'video.mp4');
	execFileSync('ffmpeg', [
		'-v',
		'error',
		'-f',
		'lavfi',
		'-i',
		'color=c=blue:s=32x32:r=5',
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=440',
		'-t',
		'1',
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-c:a',
		'aac',
		fixture,
	]);
});
after(() => fs.rmSync(directory, { recursive: true, force: true }));
test('actual media processing validates MP4 and converts audio to playable Opus; rejects empty/corrupt/oversized files', async () => {
	const input = fs.readFileSync(fixture);
	const video = await prepareMedia(input, 'video');
	assert.equal(video.mimeType, 'video/mp4');
	assert.ok(video.duration > 0);
	const audio = await prepareMedia(input, 'audio');
	assert.equal(audio.mimeType, 'audio/ogg; codecs=opus');
	const output = path.join(directory, 'audio.ogg');
	fs.writeFileSync(output, audio.data);
	const codec = execFileSync(
		'ffprobe',
		[
			'-v',
			'error',
			'-select_streams',
			'a:0',
			'-show_entries',
			'stream=codec_name',
			'-of',
			'csv=p=0',
			output,
		],
		{ encoding: 'utf8' }
	).trim();
	assert.equal(codec, 'opus');
	await assert.rejects(prepareMedia(Buffer.alloc(0), 'video'), /vazio/);
	await assert.rejects(prepareMedia(Buffer.alloc(MAX_BYTES + 1), 'video'), /32 MB/);
	await assert.rejects(prepareMedia(Buffer.from('invalid'), 'video'));
});
