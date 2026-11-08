const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { parse } = require('../../../framework/kozz-gw/dist/Parser');
const { originalCommandQuery } = require('../dist/Utils/commandText');

const request = body => ({
	message: { body },
	rawCommand: parse(
		body
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
	).result,
});
const load = (name, starter, mocks = {}) => {
	const file = path.resolve(__dirname, `../dist/Handlers/${name}/index.js`);
	const localRequire = createRequire(file),
		exports = {};
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
		exports,
		process,
		Buffer,
		URL,
		console,
		require: dependency =>
			dependency === 'kozz-module-maker'
				? {
						createMethod: (name, func, args = {}) => ({ [name]: { func, args } }),
						createModule: config => ({
							resources: { upsertResource: () => config },
						}),
					}
				: Object.hasOwn(mocks, dependency)
					? mocks[dependency]
					: localRequire(dependency),
	});
	return exports[starter]().commands.methods;
};

test('original command arguments preserve signed URLs, subcommands, whitespace and synthetic fallbacks', () => {
	const link = 'https://example.com/PhotoAbC.png?Token=XyZ&sig=A%2Fb--C';
	assert.equal(
		originalCommandQuery(request(`!yt video ${link}`), 'yt', 'video'),
		link
	);
	assert.equal(
		originalCommandQuery(request(`/YT SONG\n${link}`), 'yt', 'song'),
		link
	);
	assert.equal(originalCommandQuery(request(`!fb ${link}`), 'fb'), link);
	assert.equal(originalCommandQuery(request('!yt song'), 'yt', 'song'), '');
	assert.equal(
		originalCommandQuery(
			{
				message: { body: '!ai outro pedido https://other.example/Wrong' },
				rawCommand: { immediateArg: link },
			},
			'yt',
			'video'
		),
		link
	);
	assert.equal(
		originalCommandQuery(
			{
				message: { body: `!s from-link ${link}` },
				rawCommand: { immediateArg: 'structured' },
			},
			'yt',
			'video'
		),
		'structured'
	);
});

test('legacy YouTube handlers preserve IDs, signatures and search case through the unified service', async () => {
	const { downloadHarness } = require('./helpers/download-harness.cjs');
	const calls = [],
		sends = [],
		replies = [];
	const methods = downloadHarness(async (query, mode) => {
		calls.push([mode, query]);
		return {
			data: Buffer.from('media'),
			duration: 2,
			mimeType: mode === 'audio' ? 'audio/ogg; codecs=opus' : 'video/mp4',
		};
	}).youtube();
	const reply = value => replies.push(value);
	reply.withMedia = media => sends.push(media);
	const link = 'https://www.youtube.com/watch?v=dQw4w9WgXc&si=TokenAbC';
	for (const [method, mode] of [
		['video', 'video'],
		['song', 'audio'],
	]) {
		await methods[method]({ ...request(`!yt ${method} ${link}`), reply });
		assert.deepEqual(calls.at(-1), [mode, link]);
	}
	await methods.video({ ...request('!yt video Música Árvore'), reply });
	assert.deepEqual(calls.at(-1), ['video', 'Música Árvore']);
	await methods.song({ ...request('!yt song'), reply });
	assert.equal(calls.length, 3);
	assert.equal(sends.length, 3);
	assert.equal(sends[1].asVoiceNote, true);
	assert.equal(replies.filter(v => String(v).includes('será removido')).length, 4);
});

test('sticker from-link preserves path case and signed query parameters in the actual media payload', async () => {
	const methods = load('Sticker', 'startStickerHandler', {
		'../../../dist/API/QuoteApi': {},
	});
	const media = [],
		replies = [];
	const reply = text => replies.push(text);
	reply.withSticker = value => media.push(value);
	const link = 'https://example.com/PhotoAbC.png?Token=XyZ&sig=A%2Fb--C';
	await methods['from-link'].func({ ...request(`!s from-link ${link}`), reply });
	assert.equal(media[0].data, link);
	assert.equal(media[0].transportType, 'url');
	await methods['from-link'].func({ ...request('!s from-link'), reply });
	await methods['from-link'].func({ ...request('!s from-link invalid'), reply });
	assert.equal(media.length, 1);
	assert.equal(replies.length, 2);
});
