const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const sharp = require('sharp');
const {
	prepareMedia,
	MAX_MEDIA_BYTES,
} = require('../dist/Services/MediaUnderstanding/convert');
const { interpretMedia } = require('../dist/Services/MediaUnderstanding/interpret');
const Fuel = require('../dist/API/FuelIXApi').default;
const cdn = require('../dist/API/TemporaryCdnMedia');
const run = promisify(execFile);
let directory, video, silent, voice;
const media = (bytes, mimeType = 'video/mp4') => ({
	data: bytes.toString('base64'),
	transportType: 'b64',
	mimeType,
	sizeInBytes: bytes.length,
	duration: 0,
});
before(async () => {
	directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-video-fixture-'));
	const common = [
		'-nostdin',
		'-v',
		'error',
		'-y',
		'-f',
		'lavfi',
		'-i',
		'testsrc=size=64x32:rate=4',
		'-threads',
		'1',
		'-filter_threads',
		'1',
	];
	await run('ffmpeg', [
		...common,
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=440',
		'-t',
		'3',
		'-c:v',
		'mpeg4',
		'-c:a',
		'aac',
		path.join(directory, 'sound.mp4'),
	]);
	await run('ffmpeg', [
		...common,
		'-t',
		'1',
		'-c:v',
		'mpeg4',
		path.join(directory, 'silent.mp4'),
	]);
	await run('ffmpeg', [
		'-nostdin',
		'-v',
		'error',
		'-y',
		'-f',
		'lavfi',
		'-i',
		'sine=frequency=440',
		'-t',
		'2',
		'-c:a',
		'libmp3lame',
		path.join(directory, 'voice.mp3'),
	]);
	video = await fs.readFile(path.join(directory, 'sound.mp4'));
	silent = await fs.readFile(path.join(directory, 'silent.mp4'));
	voice = await fs.readFile(path.join(directory, 'voice.mp3'));
});
after(async () => {
	if (directory) await fs.rm(directory, { recursive: true, force: true });
});
test('real video preparation samples bounded frames with timestamps, extracts playable audio and removes temporary files', async () => {
	const prepared = await prepareMedia(media(video), {
		startSeconds: 0.5,
		endSeconds: 2.5,
	});
	const audio = prepared.audioPath;
	try {
		assert.equal(prepared.kind, 'video');
		assert.equal(prepared.partial, true);
		assert.equal(prepared.frames.length, 2);
		assert.ok(prepared.frames.every(f => f.seconds >= 0.5 && f.seconds <= 2.5));
		for (const frame of prepared.frames) {
			const info = await sharp(frame.bytes).metadata();
			assert.equal(info.format, 'jpeg');
			assert.ok(info.width <= 768 && info.height <= 768);
		}
		const { stdout } = await run('ffprobe', [
			'-v',
			'error',
			'-show_streams',
			'-of',
			'json',
			audio,
		]);
		const info = JSON.parse(stdout);
		assert.equal(info.streams[0].codec_type, 'audio');
		assert.equal(info.streams[0].sample_rate, '16000');
	} finally {
		await prepared.cleanup();
	}
	await assert.rejects(fs.stat(audio));
});
test('silent videos and audio messages remain useful; size, duration window, corrupt input and playlists are bounded', async () => {
	let prepared = await prepareMedia(media(silent));
	try {
		assert.equal(prepared.noAudio, true);
		assert.equal(prepared.frames.length, 1);
	} finally {
		await prepared.cleanup();
	}
	prepared = await prepareMedia(media(voice, 'audio/mpeg'));
	try {
		assert.equal(prepared.kind, 'audio');
		assert.equal(prepared.frames.length, 0);
		assert.ok(prepared.audioPath);
	} finally {
		await prepared.cleanup();
	}
	await assert.rejects(
		prepareMedia({ ...media(video), sizeInBytes: MAX_MEDIA_BYTES + 1 }),
		/32 MB/
	);
	await assert.rejects(prepareMedia(media(video), { startSeconds: 10 }), /trecho/);
	await assert.rejects(
		prepareMedia(media(video), { startSeconds: 2, endSeconds: 1 }),
		/trecho/
	);
	await assert.rejects(prepareMedia(media(Buffer.from('corrupt'))), /corrompida/);
	await assert.rejects(
		prepareMedia(
			media(Buffer.from('#EXTM3U\n#EXTINF:1,\nhttp://127.0.0.1/private\n'))
		),
		/corrompida/
	);
});
test('interpretation includes frames and full-window speech; transcription failure preserves visual evidence and reports audio missing', async t => {
	const old = Fuel.transcribeFile,
		upload = cdn.getTemporaryCdnMediaUrl;
	let audioFile,
		transcriptions = 0;
	Fuel.transcribeFile = async file => {
		audioFile = file;
		transcriptions++;
		return { alternatives: [{ transcript: 'O teste tem uma cena colorida.' }] };
	};
	cdn.getTemporaryCdnMediaUrl = async m => {
		assert.equal(m.mimeType, 'image/jpeg');
		return 'https://example.invalid/frame.jpg';
	};
	t.after(() => {
		Fuel.transcribeFile = old;
		cdn.getTemporaryCdnMediaUrl = upload;
	});
	let result = await interpretMedia(media(video));
	assert.match(result.summary.transcript, /cena colorida/);
	assert.equal(result.summary.sampledFrames, 3);
	assert.equal(transcriptions, 1);
	assert.equal(result.parts.filter(p => p.type === 'image_url').length, 3);
	await assert.rejects(fs.stat(audioFile));
	Fuel.transcribeFile = async () => {
		throw Error('offline');
	};
	result = await interpretMedia(media(video));
	assert.equal(result.summary.audio, 'transcription_unavailable');
	assert.equal(result.parts.filter(p => p.type === 'image_url').length, 3);
	result = await interpretMedia(media(silent));
	assert.equal(result.summary.audio, 'no_audio_track');
	Fuel.transcribeFile = async () => ({
		alternatives: [{ transcript: 'Áudio preservado' }],
	});
	cdn.getTemporaryCdnMediaUrl = async () => {
		throw Error('CDN offline');
	};
	result = await interpretMedia(media(video));
	assert.equal(result.summary.transcript, 'Áudio preservado');
	assert.equal(result.summary.visual, 'unavailable');
	assert.equal(result.summary.sampledFrames, 0);
	assert.equal(result.summary.partial, true);
	assert.equal(result.parts.length, 0);
	await assert.rejects(interpretMedia(media(silent)), /disponibilizar/);
	Fuel.transcribeFile = async () => {
		throw Error('offline');
	};
	await assert.rejects(interpretMedia(media(voice, 'audio/mpeg')), /transcrever/);
});
test('photo decoding preserves proportions, applies limits and rejects non-image bytes even with image MIME', async () => {
	const bytes = await sharp({
		create: { width: 1600, height: 800, channels: 3, background: 'red' },
	})
		.png()
		.toBuffer();
	const prepared = await prepareMedia(media(bytes, 'image/png'));
	try {
		const info = await sharp(prepared.frames[0].bytes).metadata();
		assert.equal(info.width, 1024);
		assert.equal(info.height, 512);
	} finally {
		await prepared.cleanup();
	}
	await assert.rejects(
		prepareMedia(media(Buffer.from('<svg width="2" height="2"/>'), 'image/png')),
		/compatível/
	);
});
