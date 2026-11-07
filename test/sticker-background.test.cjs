const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const sharp = require('sharp');
const maker = require('kozz-module-maker');
const { onCommand } = require('kozz-module-maker/dist/Socket/Events/Handle/Command');
const {
	createAskResource,
} = require('kozz-module-maker/dist/Message/RoutineCreation/AskResource');
const {
	registerOwnerAiModule,
	invokeModule,
} = require('../dist/Services/OwnerAI/modules');
const { executeChatTool } = require('../dist/Services/ChatCommands/execute');
const { commandOutcome } = require('../dist/Services/OwnerAI/contracts');
const { stickerPhoto } = require('../dist/Handlers/Sticker/background');
const { backgroundRemover } = require('../dist/Services/BackgroundRemoval');
const { parse } = require('../../../framework/kozz-gw/dist/Parser');
const baseMessage = {
	id: 'request',
	boundaryId: 'b',
	boundaryName: 'kozz-zapo',
	namespace: 'default',
	from: '11@lid',
	contact: { id: '11@lid', publicName: 'Pessoa' },
	fromHostAccount: false,
	chatId: '123@g.us',
	to: '123@g.us',
	body: '!s --sem-fundo',
	messageType: 'TEXT',
	taggedContacts: [],
};
const media = bytes => ({
	data: bytes.toString('base64'),
	transportType: 'b64',
	mimeType: 'image/png',
	sizeInBytes: bytes.length,
});

test('photo lookup uses origin-chat cache/history, rejects foreign quotes and unsafe/missing/oversized sources', async () => {
	const calls = [],
		bytes = Buffer.from('mock media bytes');
	const r = {
		message: {
			...baseMessage,
			quotedMessage: { ...baseMessage, id: 'photo', messageType: 'IMAGE' },
		},
		ask: {
			boundary: async (boundary, resource, data) => {
				calls.push([boundary, resource, data]);
				return {
					response:
						resource === 'message_by_id' ? { media: media(bytes) } : undefined,
				};
			},
		},
	};
	assert.deepEqual(await stickerPhoto(r), bytes);
	assert.deepEqual(
		calls.map(c => c[1]),
		['cached_message_by_id', 'message_by_id']
	);
	assert.ok(
		calls.every(
			c => c[0] === 'b' && c[2].chatId === '123@g.us' && c[2].messageId === 'photo'
		)
	);
	await assert.rejects(
		stickerPhoto({
			...r,
			message: {
				...r.message,
				quotedMessage: { ...r.message.quotedMessage, chatId: '456@g.us' },
			},
		}),
		/mesmo chat/
	);
	for (const patch of [
		{ messageType: 'VIDEO' },
		{ media: { ...media(bytes), mimeType: 'image/gif' } },
		{ media: { ...media(bytes), sizeInBytes: 8000001 } },
		{ media: { ...media(bytes), transportType: 'url', data: 'file:///etc/passwd' } },
	])
		await assert.rejects(
			stickerPhoto({ ...r, message: { ...baseMessage, ...patch } })
		);
	await assert.rejects(
		stickerPhoto({ ...r, ask: { boundary: async () => ({ response: undefined }) } }),
		/expirado/
	);
});

test('real sticker handler supports the parsed flag and local AI execution, preserves alpha, and reports rejection', async t => {
	const socket = new EventEmitter(),
		rawEmit = socket.emit.bind(socket),
		outgoing = new Set(),
		sent = [],
		queries = [];
	socket.connected = true;
	socket.onAnyOutgoing = fn => outgoing.add(fn);
	socket.offAnyOutgoing = fn => outgoing.delete(fn);
	socket.emit = (name, payload) => {
		outgoing.forEach(fn => fn(name, payload));
		return rawEmit(name, payload);
	};
	socket.on('reply_with_sticker', payload => sent.push(payload));
	const replies = [];
	socket.on('reply_with_text', payload => replies.push(payload));
	socket.on('ask_resource', payload => {
		queries.push(payload.request);
		const response =
			payload.request.resource === 'group_members'
				? { matches: [{ id: '11@lid', name: 'Pessoa', aliases: ['11@lid'] }] }
				: {};
		queueMicrotask(() =>
			rawEmit(`reply_resource/${payload.request.id}`, { ...payload, response })
		);
	});
	const original = Module._load,
		file = require.resolve('../dist/Handlers/Sticker'),
		cached = require.cache[file];
	delete require.cache[file];
	Module._load = function (request, parent, main) {
		if (request === 'kozz-module-maker')
			return {
				...maker,
				createModule: options => {
					const runtime = {
						name: options.name,
						commandMethods: options.commands.methods,
						socket,
						executeCommand: onCommand(
							socket,
							options.commands.methods,
							[],
							options.name,
							'',
							['kozz-zapo']
						),
						resources: { upsertResource: () => runtime },
						ask: createAskResource(socket, {
							requester: { id: options.name, type: 'Handler', namespace: 'default' },
						}),
					};
					return runtime;
				},
			};
		return original.call(this, request, parent, main);
	};
	try {
		registerOwnerAiModule(require(file).startStickerHandler());
	} finally {
		Module._load = original;
		if (cached) require.cache[file] = cached;
		else delete require.cache[file];
	}
	t.after(() => backgroundRemover.close());
	const image = await sharp(
		Buffer.from(
			'<svg width="200" height="200"><rect width="200" height="200" fill="white"/><circle cx="100" cy="100" r="65" fill="red"/></svg>'
		)
	)
		.png()
		.toBuffer();
	const parsed = parse('!s --sem-fundo');
	assert.equal(parsed.isError, false);
	assert.equal(parsed.result.namedArgs['sem-fundo'], true);
	const shortParsed = parse('!s --sf');
	assert.equal(shortParsed.isError, false);
	assert.equal(shortParsed.result.namedArgs.sf, true);
	const command = {
		...shortParsed.result,
		boundaryId: 'b',
		boundaryName: 'kozz-zapo',
		namespace: 'default',
		taggedContacts: [],
		message: { ...baseMessage, media: media(image), messageType: 'IMAGE' },
	};
	assert.equal((await invokeModule(command)).executed, true);
	assert.equal(commandOutcome(command).success, true);
	assert.equal(sent.length, 1);
	assert.equal(sent[0].chatId, '123@g.us');
	const sticker =
		await require('../../../framework/kozz-zapo/dist/sticker').imageToWebpSticker(
			Buffer.from(sent[0].media.data, 'base64')
		);
	const stickerInfo = await sharp(sticker).metadata(),
		stickerStats = await sharp(sticker).stats();
	assert.equal(stickerInfo.width, 512);
	assert.equal(stickerInfo.height, 512);
	assert.equal(stickerInfo.hasAlpha, true);
	assert.equal(stickerStats.channels[3].min, 0);
	const decoded = await sharp(Buffer.from(sent[0].media.data, 'base64')).stats();
	assert.ok(decoded.channels[3].min < 20);
	assert.ok(decoded.channels[3].max > 235);
	const r = {
		message: {
			...baseMessage,
			body: '!ai faz uma figurinha sem fundo',
			quotedMessage: {
				...baseMessage,
				id: 'photo',
				messageType: 'IMAGE',
				media: media(image),
			},
		},
		ask: {
			boundary: async () => ({
				response: {
					matches: [{ id: '11@lid', name: 'Pessoa', aliases: ['11@lid'] }],
				},
			}),
		},
	};
	const args = {
		module: 's',
		method: 'default',
		immediateArg: '',
		namedArgs: '{"sem-fundo":true}',
		recipientIds: [],
	};
	const catalog = JSON.parse(
		(await executeChatTool(r, 'chat_list_commands', { module: 's' })).content
	)[0];
	assert.equal(
		catalog.methods.find(m => m.method === 'default').args['sem-fundo'],
		'boolean?'
	);
	assert.match(catalog.description, /sem-fundo/);
	assert.equal(
		JSON.parse((await executeChatTool(r, 'chat_execute_command', args)).content)
			.status,
		'submitted'
	);
	assert.equal(sent.length, 2);
	assert.ok(sent.every(s => s.chatId === '123@g.us' && s.boundaryId === 'b'));
	await assert.rejects(
		executeChatTool(r, 'chat_execute_command', {
			...args,
			immediateArg: '--sem-fundo',
			namedArgs: '{}',
		}),
		/namedArgs/
	);
	const otherChat = {
		...r,
		message: {
			...r.message,
			chatId: '456@g.us',
			to: '456@g.us',
			quotedMessage: {
				...r.message.quotedMessage,
				chatId: '456@g.us',
				to: '456@g.us',
			},
		},
	};
	assert.equal(
		JSON.parse(
			(await executeChatTool(otherChat, 'chat_execute_command', args)).content
		).status,
		'submitted'
	);
	assert.equal(sent[2].chatId, '456@g.us');
	const invalid = {
		...command,
		message: {
			...baseMessage,
			messageType: 'VIDEO',
			media: { ...media(image), mimeType: 'video/mp4' },
		},
	};
	assert.equal((await invokeModule(invalid)).executed, false);
	assert.equal(sent.length, 3);
	// Existing ordinary sticker conversion bypasses the remover.
	const normal = {
		...command,
		namedArgs: {},
		message: { ...baseMessage, media: media(image) },
	};
	await invokeModule(normal);
	assert.equal(sent.length, 4);
	assert.equal(sent[3].media.data, media(image).data);
	assert.ok(replies.length >= 1);
});
