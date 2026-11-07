const { test } = require('node:test');
const assert = require('node:assert/strict');
const { executeOwnerTool } = require('../dist/Services/OwnerAI/execute');
const { registerOwnerAiModule } = require('../dist/Services/OwnerAI/modules');
const { approvalQueue, ownerOrigin } = require('../dist/Services/OwnerAI/control');
const { ownerTools } = require('../dist/Services/OwnerAI/tools');
const sharp = require('sharp');
test('AI event tool validates fields, stays pending until owner confirmation and invokes role.create exactly once', async () => {
	const calls = [],
		previews = [];
	registerOwnerAiModule({
		name: 'role',
		socket: { connected: true },
		commandMethods: { criar: { args: {} } },
		executeCommand: async command => {
			calls.push(command);
			return { executed: true };
		},
	});
	const r = {
		message: {
			id: 'request-role',
			chatId: '456@g.us',
			to: '456@g.us',
			from: '11@lid',
			boundaryId: 'kozz-zapo',
			boundaryName: 'kozz-zapo',
			fromHostAccount: true,
		},
		ask: {
			boundary: async (_id, operation, args) => ({
				response:
					operation === 'owner_ai_authorize'
						? { authorized: true }
						: operation === 'owner_ai_search'
							? { matches: [{ id: args.query, name: 'Baguncinha' }] }
							: {},
			}),
		},
		reply: Object.assign(() => {}, {
			withButtons: (body, options) => previews.push({ body, options }),
		}),
	};
	const date = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'America/Sao_Paulo',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(Date.now() + 7 * 86400000);
	const args = {
		chatId: '123@g.us',
		title: 'Churrasco',
		dateTime: `${date} 14:00`,
		location: 'Casa do João',
	};
	assert.ok(ownerTools.some(t => t.function.name === 'owner_create_role'));
	for (const patch of [
		{ title: '' },
		{ title: 'Título | escondido' },
		{ chatId: '123@lid' },
		{ dateTime: 'amanhã' },
	])
		await assert.rejects(
			executeOwnerTool(r, 'owner_create_role', { ...args, ...patch })
		);
	assert.equal(previews.length, 0);
	assert.equal(calls.length, 0);
	const result = await executeOwnerTool(r, 'owner_create_role', args);
	assert.equal(result.terminal, true);
	assert.equal(calls.length, 0);
	assert.match(previews[0].body, /Churrasco/);
	assert.match(previews[0].body, /Casa do João/);
	await approvalQueue.take(result.approvalId, ownerOrigin(r), true, r);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].module, 'role');
	assert.equal(calls[0].method, 'criar');
	assert.equal(calls[0].message.chatId, '123@g.us');
	assert.equal(calls[0].immediateArg, `Churrasco | ${date} 14:00 | Casa do João`);
	assert.equal(
		(await approvalQueue.take(result.approvalId, ownerOrigin(r), true, r)).found,
		false
	);
	const bytes = await sharp({
		create: { width: 16, height: 24, channels: 3, background: '#884422' },
	})
		.png()
		.toBuffer();
	const media = {
		transportType: 'b64',
		data: bytes.toString('base64'),
		mimeType: 'image/png',
		sizeInBytes: bytes.length,
	};
	r.message.quotedMessage = { messageType: 'IMAGE', media };
	r.message.id = 'request-with-art';
	const withArt = await executeOwnerTool(r, 'owner_create_role', args);
	assert.equal(calls.length, 1);
	assert.match(previews.at(-1).body, /TODOS/);
	// Changing the source after the preview cannot replace the approved artwork.
	media.data = Buffer.from('changed').toString('base64');
	await approvalQueue.take(withArt.approvalId, ownerOrigin(r), true, r);
	assert.equal(calls.length, 2);
	assert.equal(calls[1].message.chatId, '123@g.us');
	assert.equal(calls[1].message.messageType, 'IMAGE');
	assert.equal(calls[1].message.quotedMessage, undefined);
	assert.deepEqual(Buffer.from(calls[1].message.media.data, 'base64'), bytes);
	await assert.rejects(
		executeOwnerTool(
			{ ...r, message: { ...r.message, fromHostAccount: false } },
			'owner_create_role',
			args
		)
	);
});
