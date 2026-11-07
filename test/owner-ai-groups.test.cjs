const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { executeOwnerTool } = require('../dist/Services/OwnerAI/execute');
const {
	approvalQueue,
	ownerOrigin,
	bindPanelOrigin,
} = require('../dist/Services/OwnerAI/control');

function owner() {
	const calls = [],
		previews = [],
		images = [];
	const r = {
		message: {
			id: 'device-message',
			chatId: '123@g.us',
			fromHostAccount: true,
			boundaryId: 'boundary-1',
			boundaryName: 'kozz-zapo',
		},
		ask: {
			boundary: async (_id, resource, args) => {
				calls.push({ resource, args });
				return {
					response:
						resource === 'owner_ai_authorize'
							? { authorized: true }
							: resource === 'owner_ai_search'
								? { matches: [{ id: args.query, name: 'Grupo' }] }
								: { updated: true },
				};
			},
		},
		reply: {
			withButtons: (_body, options) => previews.push(options),
			withMedia: { fromB64: (...args) => images.push(args) },
		},
	};
	return { r, calls, previews, images };
}
const tokenOf = f => f.previews.at(-1).buttons[0].command.split(' ').at(-1);

test('group name waits for confirmation and applies exact name once', async () => {
	const f = owner();
	await executeOwnerTool(f.r, 'owner_set_group_subject', {
		chatId: '789@g.us',
		subject: 'Baguncinha: nova piada',
	});
	assert.ok(!f.calls.some(c => c.resource === 'owner_ai_group_subject'));
	const token = tokenOf(f);
	await approvalQueue.take(token, ownerOrigin(f.r), true, f.r);
	const changes = f.calls.filter(c => c.resource === 'owner_ai_group_subject');
	assert.equal(changes.length, 1);
	assert.equal(changes[0].args.subject, 'Baguncinha: nova piada');
	assert.equal(changes[0].args.chatId, '789@g.us');
	assert.equal(
		(await approvalQueue.take(token, ownerOrigin(f.r), true, f.r)).found,
		false
	);
});

test('non-host, panel, private target and invalid subject cannot prepare group changes', async () => {
	for (const setup of [
		f => {
			f.r.message.fromHostAccount = false;
		},
		f => bindPanelOrigin(f.r, 'browser', 'delegated-token'),
	]) {
		const f = owner();
		setup(f);
		for (const name of ['owner_set_group_subject', 'owner_set_group_picture'])
			await assert.rejects(
				executeOwnerTool(f.r, name, {
					chatId: '789@g.us',
					subject: 'Nome',
					source: 'attached',
					prompt: '',
				})
			);
		assert.equal(f.previews.length, 0);
	}
	for (const args of [
		{ chatId: '123@lid', subject: 'Nome' },
		{ chatId: '789@g.us', subject: 'x'.repeat(101) },
		{ chatId: '789@g.us', subject: 'nome\nsegunda linha' },
	])
		await assert.rejects(
			executeOwnerTool(owner().r, 'owner_set_group_subject', args)
		);
});

test('picture preview is the exact normalized image applied after approval', async () => {
	const f = owner();
	const bytes = await sharp({
		create: { width: 32, height: 16, channels: 3, background: '#00ff00' },
	})
		.png()
		.toBuffer();
	f.r.message.quotedMessage = {
		media: {
			mimeType: 'image/png',
			transportType: 'b64',
			data: bytes.toString('base64'),
		},
	};
	await executeOwnerTool(f.r, 'owner_set_group_picture', {
		chatId: '789@g.us',
		source: 'attached',
		prompt: '',
	});
	assert.equal(f.images.length, 1);
	assert.ok(!f.calls.some(c => c.resource === 'owner_ai_group_picture'));
	await approvalQueue.take(tokenOf(f), ownerOrigin(f.r), true, f.r);
	const applied = f.calls.find(c => c.resource === 'owner_ai_group_picture');
	assert.equal(applied.args.imageBase64, f.images[0][0]);
	const meta = await sharp(
		Buffer.from(applied.args.imageBase64, 'base64')
	).metadata();
	assert.equal(meta.width, 640);
	assert.equal(meta.height, 640);
	assert.equal(meta.format, 'jpeg');
});

test('missing image cannot prepare action; confirmation refuses a lost host proof', async () => {
	const f = owner();
	await assert.rejects(
		executeOwnerTool(f.r, 'owner_set_group_picture', {
			chatId: '789@g.us',
			source: 'attached',
			prompt: '',
		})
	);
	assert.equal(f.previews.length, 0);
	await executeOwnerTool(f.r, 'owner_set_group_subject', {
		chatId: '789@g.us',
		subject: 'Nome',
	});
	f.r.message.fromHostAccount = false;
	await assert.rejects(approvalQueue.take(tokenOf(f), ownerOrigin(f.r), true, f.r));
	assert.ok(!f.calls.some(c => c.resource === 'owner_ai_group_subject'));
});
