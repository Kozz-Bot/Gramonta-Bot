const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const axios = require('axios');
const { roleArtwork } = require('../dist/Handlers/Role/artwork');
const png = async () =>
	sharp({ create: { width: 16, height: 24, channels: 3, background: '#884422' } })
		.png()
		.toBuffer();
const imageMedia = bytes => ({
	transportType: 'b64',
	data: bytes.toString('base64'),
	mimeType: 'image/png',
	sizeInBytes: bytes.length,
});
test('artwork accepts attachments/quotes, keeps image bytes and ignores unrelated quoted text', async () => {
	const bytes = await png(),
		media = imageMedia(bytes);
	assert.equal(
		await roleArtwork({
			message: { messageType: 'TEXT', quotedMessage: { messageType: 'TEXT' } },
		}),
		undefined
	);
	for (const message of [
		{ messageType: 'IMAGE', media },
		{ messageType: 'TEXT', quotedMessage: { messageType: 'IMAGE', media } },
	]) {
		const result = await roleArtwork({ message });
		assert.equal(result.transportType, 'b64');
		assert.equal(result.mimeType, 'image/png');
		assert.deepEqual(Buffer.from(result.data, 'base64'), bytes);
	}
});
test('missing quoted image is recovered in its origin chat and unavailable artwork stops publication', async () => {
	const calls = [],
		bytes = await png();
	const r = {
		message: {
			chatId: '123@g.us',
			boundaryId: 'kozz-zapo',
			quotedMessage: { id: 'art', messageType: 'IMAGE' },
		},
		ask: {
			boundary: async (boundary, resource, args) => {
				calls.push({ boundary, resource, args });
				return {
					response:
						resource === 'message_by_id' ? { media: imageMedia(bytes) } : undefined,
				};
			},
		},
	};
	assert.equal((await roleArtwork(r)).sizeInBytes, bytes.length);
	assert.deepEqual(
		calls.map(c => c.resource),
		['cached_message_by_id', 'message_by_id']
	);
	assert.ok(
		calls.every(
			c =>
				c.boundary === 'kozz-zapo' &&
				c.args.chatId === '123@g.us' &&
				c.args.messageId === 'art'
		)
	);
	r.ask.boundary = async () => ({ response: undefined });
	await assert.rejects(roleArtwork(r), /Reenvie a imagem/);
});
test('URL artwork downloads bytes with limits and freezes content; invalid and oversized images fail', async t => {
	const bytes = await png(),
		get = axios.get;
	t.after(() => {
		axios.get = get;
	});
	let calls = 0;
	axios.get = async (url, options) => {
		calls++;
		assert.equal(url, 'https://media.invalid/art.png');
		assert.equal(options.maxContentLength, 8000000);
		assert.equal(options.timeout, 30000);
		return { data: bytes };
	};
	const r = {
		message: {
			messageType: 'IMAGE',
			media: {
				transportType: 'url',
				data: 'https://media.invalid/art.png',
				mimeType: 'image/png',
				sizeInBytes: 0,
			},
		},
	};
	const result = await roleArtwork(r);
	assert.equal(calls, 1);
	assert.deepEqual(Buffer.from(result.data, 'base64'), bytes);
	assert.equal(result.transportType, 'b64');
	for (const media of [
		{ ...imageMedia(Buffer.from('broken')) },
		{ ...imageMedia(bytes), sizeInBytes: 8000001 },
		{ ...imageMedia(bytes), transportType: 'invalid' },
	]) {
		await assert.rejects(
			roleArtwork({ message: { messageType: 'IMAGE', media } }),
			/8 MB/
		);
	}
});
