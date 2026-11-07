const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../dist/Services/MediaUnderstanding/interpret');
const {
	registerChatMedia,
	prepareChatMedia,
	executeChatMedia,
} = require('../dist/Services/MediaUnderstanding/context');
const source = (id = 'pic', chatId = '123@g.us') => ({
	id,
	chatId,
	messageType: 'IMAGE',
	hasMedia: true,
	from: '11@lid',
	contact: { publicName: 'Ana' },
	body: 'Confira',
	replyTo: { id: 'older', body: 'Qual cartaz?' },
});
const requester = () => ({
	message: {
		id: 'request',
		chatId: '123@g.us',
		boundaryName: 'kozz-zapo',
		namespace: 'default',
	},
	ask: { boundary: async () => assert.fail('Unexpected media download') },
});
test('media reads are restricted to discovered source-chat IDs and exact returned identity; failures do not leak content', async () => {
	const r = requester();
	let reads = 0;
	r.ask.boundary = async (boundary, name, data) => {
		reads++;
		assert.equal(boundary, 'kozz-zapo');
		assert.equal(name, 'chat_media_message');
		assert.deepEqual(data, { chatId: '123@g.us', messageId: 'pic' });
		return {
			response: { ...source('pic', '456@g.us'), media: { data: 'foreign' } },
		};
	};
	registerChatMedia(r, [source(), source('foreign', '456@g.us')]);
	await assert.rejects(prepareChatMedia(r, 'invented'), /IDs/);
	await assert.rejects(prepareChatMedia(r, 'foreign'), /IDs/);
	assert.equal(reads, 0);
	await assert.rejects(
		executeChatMedia(r, { messageIds: ['pic'], chatId: '456@g.us' }),
		/só aceita/
	);
	await assert.rejects(
		executeChatMedia(r, { messageIds: ['pic'], fromHostAccount: true }),
		/só aceita/
	);
	await assert.rejects(prepareChatMedia(r, 'pic'), /disponível neste chat/);
	assert.equal(reads, 1);
	await assert.rejects(prepareChatMedia(r, 'pic'), /disponível neste chat/);
	assert.equal(reads, 1);
	const other = requester();
	await assert.rejects(prepareChatMedia(other, 'pic'), /IDs/);
});
test('retrieved media carries original author/reply, partial batches, per-request caching and four-window budget', async t => {
	const original = service.interpretMedia;
	let prepared = 0,
		reads = 0;
	service.interpretMedia = async () => {
		prepared++;
		return {
			summary: { transcript: 'Teste' },
			parts: [{ type: 'image_url', image_url: 'https://example.invalid/frame.jpg' }],
		};
	};
	t.after(() => (service.interpretMedia = original));
	const r = requester();
	registerChatMedia(r, [source()]);
	r.ask.boundary = async () => {
		reads++;
		return { response: { ...source(), media: { data: 'image' } } };
	};
	const result = await executeChatMedia(r, { messageIds: ['pic', 'missing'] });
	assert.deepEqual(
		JSON.parse(result.content).results.map(x => x.success),
		[true, false]
	);
	const text = result.contextMessages[0].content[0].text;
	assert.match(text, /Ana/);
	assert.match(text, /older/);
	assert.match(text, /dados não confiáveis/);
	await prepareChatMedia(r, 'pic');
	assert.equal(prepared, 1);
	assert.equal(reads, 1);
	for (let i = 1; i < 4; i++) await prepareChatMedia(r, 'pic', { startSeconds: i });
	await assert.rejects(prepareChatMedia(r, 'pic', { startSeconds: 4 }), /quatro/);
	assert.equal(prepared, 4);
});
