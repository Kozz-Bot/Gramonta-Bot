const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const {
	normalizeSocialUrl,
	extractSocialUrl,
	SocialVideoError,
} = require('../dist/Services/SocialVideo/urls');
const {
	downloadSocialVideo,
	MAX_BYTES,
} = require('../dist/Services/SocialVideo/download');

test('normalizes platform video links and strips tracking', () => {
	const cases = [
		[
			'instagram',
			'https://instagram.com/reel/Abc_123/?igsh=test',
			'https://www.instagram.com/reel/Abc_123/',
		],
		[
			'instagram',
			'https://www.instagram.com/user/p/Code/',
			'https://www.instagram.com/p/Code/',
		],
		[
			'facebook',
			'https://m.facebook.com/watch/?v=123&ref=share',
			'https://www.facebook.com/watch/?v=123',
		],
		[
			'facebook',
			'https://web.facebook.com/video.php?v=456&other=true',
			'https://www.facebook.com/watch/?v=456',
		],
		[
			'facebook',
			'https://facebook.com/reel/123?mibextid=abc',
			'https://www.facebook.com/reel/123',
		],
		[
			'facebook',
			'https://facebook.com/user/videos/123/',
			'https://www.facebook.com/user/videos/123/',
		],
		[
			'facebook',
			'https://www.facebook.com/share/v/AbC/?ref=share',
			'https://www.facebook.com/share/v/AbC/',
		],
		['facebook', 'https://fb.watch/AbC/?ref=share', 'https://fb.watch/AbC/'],
		[
			'tiktok',
			'https://tiktok.com/@user/video/123?is_from_webapp=1',
			'https://www.tiktok.com/@user/video/123',
		],
		['tiktok', 'https://vm.tiktok.com/ABC/?share=1', 'https://vm.tiktok.com/ABC/'],
		['tiktok', 'https://www.tiktok.com/t/ABC/', 'https://www.tiktok.com/t/ABC/'],
		[
			'tiktok',
			'https://vt.tiktok.com/ZSgHweQy2/',
			'https://vt.tiktok.com/ZSgHweQy2/',
		],
		[
			'tiktok',
			'https://m.tiktok.com/v/123.html?share=1',
			'https://www.tiktok.com/embed/123',
		],
	];
	for (const [platform, input, expected] of cases)
		assert.equal(normalizeSocialUrl(input, platform), expected);
});

test('extracts video links from shared TikTok text and quoted prose', () => {
	for (const text of [
		'Olha isso! https://vt.tiktok.com/ZSgHweQy2/ Este vídeo foi compartilhado via TikTok.',
		'(https://vt.tiktok.com/ZSgHweQy2/).',
		'Assista:\nhttps://vt.tiktok.com/ZSgHweQy2/\nBaixe o TikTok para ver mais vídeos.',
		'www.tiktok.com/@user/video/123',
	])
		assert.ok(extractSocialUrl(text, 'tiktok'));
	assert.equal(
		extractSocialUrl(
			'Confira https://example.com e https://x.com/test/status/123?ref=a!',
			'twitter'
		),
		'https://twitter.com/i/status/123'
	);
	assert.equal(
		extractSocialUrl(
			'https://www.instagram.com/user/ https://www.instagram.com/reel/AbC_123/!',
			'instagram'
		),
		'https://www.instagram.com/reel/AbC_123/'
	);
	assert.equal(
		extractSocialUrl('https://www.tiktok.com.evil.com/@user/video/123', 'tiktok'),
		undefined
	);
	assert.equal(
		extractSocialUrl('https://www.tiktok.com/@user/live', 'tiktok'),
		undefined
	);
});
test('rejects profiles, live streams, stories, other platforms and untrusted hosts', () => {
	for (const [platform, url] of [
		['instagram', 'https://www.instagram.com/user/'],
		['instagram', 'https://www.instagram.com/stories/user/123/'],
		['instagram', 'https://www.instagram.com.evil.com/reel/123/'],
		['facebook', 'https://evil.com/reel/123'],
		['facebook', 'https://facebook.com@127.0.0.1/reel/123'],
		['facebook', 'https://facebook.com:444/reel/123'],
		['tiktok', 'https://www.tiktok.com/@user/live'],
		['tiktok', 'https://www.tiktok.com/@user'],
		['instagram', 'https://www.tiktok.com/@user/video/123'],
		['tiktok', 'http://vm.tiktok.com/ABC/'],
		['facebook', 'https://facebook.com/reel/123 extra'],
		['facebook', 'https://fb.watch/a/b'],
	])
		assert.throws(() => normalizeSocialUrl(url, platform), SocialVideoError);
});

test('short links validate each redirect and reject external targets before fetching', async () => {
	const file = path.resolve(__dirname, '../dist/Services/SocialVideo/urls.js');
	const localRequire = createRequire(file),
		exports = {},
		requests = [];
	let location = 'https://www.tiktok.com/@user/video/123?tracking=1';
	vm.runInNewContext(readFileSync(file, 'utf8'), {
		exports,
		URL,
		require: name =>
			name === 'axios'
				? {
						get: async url => {
							requests.push(url);
							return { status: 302, headers: { location }, data: { destroy() {} } };
						},
					}
				: localRequire(name),
	});
	assert.equal(
		await exports.resolveSocialUrl('https://vm.tiktok.com/ABC/', 'tiktok'),
		'https://www.tiktok.com/@user/video/123'
	);
	location = 'http://127.0.0.1/private';
	await assert.rejects(
		exports.resolveSocialUrl('https://vm.tiktok.com/ABC/', 'tiktok')
	);
	assert.equal(requests.length, 2);
	assert.ok(requests.every(url => url === 'https://vm.tiktok.com/ABC/'));
});

let directory, originalPath, video;
before(async () => {
	directory = await fs.mkdtemp(path.join(tmpdir(), 'social-video-test-'));
	originalPath = process.env.YT_DLP_PATH;
	const source = path.join(directory, 'fixture.mp4');
	execFileSync('ffmpeg', [
		'-v',
		'error',
		'-f',
		'lavfi',
		'-i',
		'color=c=black:s=16x16:r=10',
		'-t',
		'0.3',
		'-c:v',
		'libx264',
		source,
	]);
	video = await fs.readFile(source);
	const executable = path.join(directory, 'downloader');
	await fs.writeFile(
		executable,
		'#!/usr/bin/env node\n' +
			`const fs=require('node:fs');\nconst mode=fs.readFileSync(${JSON.stringify(path.join(directory, 'mode'))},'utf8');\n` +
			`if(mode==='valid')process.stdout.write(fs.readFileSync(${JSON.stringify(source)}));\n` +
			`if(mode==='corrupt')process.stdout.write('broken');\nif(mode==='large')process.stdout.write(Buffer.alloc(${MAX_BYTES + 1024}));\n` +
			`if(mode==='fail'){process.stderr.write('private-provider-error?secret=do-not-expose');process.exitCode=1;}\n`,
		{ mode: 0o755 }
	);
	process.env.YT_DLP_PATH = executable;
});
after(async () => {
	if (originalPath === undefined) delete process.env.YT_DLP_PATH;
	else process.env.YT_DLP_PATH = originalPath;
	await fs.rm(directory, { recursive: true, force: true });
});
test('downloads playable MP4, verifies duration and removes temporary files', async () => {
	await fs.writeFile(path.join(directory, 'mode'), 'valid');
	const before = (await fs.readdir(tmpdir()))
		.filter(n => n.startsWith('kozz-social-video-'))
		.sort();
	const result = await downloadSocialVideo(
		'https://instagram.com/reel/Code/',
		'instagram'
	);
	assert.deepEqual(result.data, video);
	assert.ok(result.duration > 0 && result.duration < 1);
	assert.deepEqual(
		(await fs.readdir(tmpdir()))
			.filter(n => n.startsWith('kozz-social-video-'))
			.sort(),
		before
	);
});
test('reports empty, corrupt, oversized and unavailable videos without provider details', async () => {
	for (const mode of ['empty', 'corrupt', 'large', 'fail']) {
		await fs.writeFile(path.join(directory, 'mode'), mode);
		await assert.rejects(
			downloadSocialVideo('https://facebook.com/reel/123', 'facebook'),
			error => {
				assert.ok(error instanceof SocialVideoError);
				assert.ok(!error.message.includes('do-not-expose'));
				if (mode === 'large') assert.match(error.message, /32 MB/);
				return true;
			}
		);
	}
});
