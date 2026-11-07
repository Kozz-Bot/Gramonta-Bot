const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const enginePackage = require('../dist/Services/AutoTramonta/engine');
const { defaults } = enginePackage;

test('private menu supports buttons, selection, settings and stop while rejecting every other chat', async () => {
	const owner = '5511000000000@s.whatsapp.net';
	let saved = { ...defaults(), ownerIds: [owner] };
	let captured,
		instance,
		liveEngine,
		now = Date.now(),
		history = [];
	const generatedInputs = [],
		outgoing = [];
	const socket = new EventEmitter();
	socket.connected = true;
	socket.onAnyOutgoing = () => {};
	socket.offAnyOutgoing = () => {};
	for (const event of ['send_message', 'reply_with_text'])
		socket.on(event, payload => outgoing.push({ event, payload }));
	const originalLoad = Module._load,
		originalInterval = global.setInterval;
	const text = child =>
		Array.isArray(child) ? child.map(text).join('') : (child ?? '');
	Module._load = function (request, parent, isMain) {
		if (request === 'kozz-module-maker')
			return {
				createMethod: (name, callback) => ({ [name]: callback }),
				Line: ({ children }) => text(children) + '\n',
				Bold: ({ children }) => '*' + text(children) + '*',
				createModule: options => {
					captured = options;
					instance = {
						socket,
						sendMessage: () => {
							throw new Error('No live group sends in menu test');
						},
						ask: {
							boundary: async (_, name) => ({
								response:
									name === 'chat_status'
										? { connected: true, registered: true, hasQr: false }
										: name === 'recent_chat_messages'
											? history
											: [
													{ id: '123@g.us', name: 'Grupo café' },
													{ id: '456@g.us', name: 'Outro grupo' },
												],
							}),
						},
						resources: { upsertResource: () => instance },
					};
					return instance;
				},
			};
		if (request.endsWith('/Services/AutoTramonta/store'))
			return {
				createAutoStore: () => ({
					load: () => structuredClone(saved),
					save: value => {
						saved = structuredClone(value);
					},
				}),
			};
		if (request.endsWith('/Services/AutoTramonta/engine'))
			return {
				...enginePackage,
				AutoTramontaEngine: class extends enginePackage.AutoTramontaEngine {
					constructor(settings, deps) {
						super(settings, {
							...deps,
							now: () => now,
							random: () => 0,
							wait: async () => {},
						});
						liveEngine = this;
					}
				},
			};
		if (request.endsWith('/Services/AutoTramonta/ai'))
			return {
				autoModel: () => 'test-model',
				generateAutoReply: async input => {
					generatedInputs.push(input);
					return {
						respondingToMessageIds: input.newMessageIds,
						messages: [
							{ text: 'Pode ser às oito', quoteMessageId: 'history-question' },
							{ text: 'Mas ainda vou confirmar' },
						],
					};
				},
			};
		if (request.endsWith('/Group/groupState'))
			return { areCommandsDisabledForGroup: () => false };
		if (request.endsWith('/Mute/mutedDB')) return { isUserMutted: () => false };
		return originalLoad.call(this, request, parent, isMain);
	};
	global.setInterval = () => ({ unref() {} });
	const oldKey = process.env.FUELIX_API_KEY;
	process.env.FUELIX_API_KEY = 'test-placeholder';
	try {
		require('../dist/Handlers/AutoTramonta').startAutoTramontaHandler();
		const replies = [];
		const reply = body => replies.push({ body });
		reply.withButtons = (body, options) => {
			assert.ok(typeof body === 'string' && body.length < 3700);
			assert.ok(options.buttons.length >= 1 && options.buttons.length <= 3);
			for (const b of options.buttons) {
				assert.ok(b.label.length <= 20);
				assert.match(b.command, /^!autotramonta/);
			}
			replies.push({ body, ...options });
		};
		const requester = (method, immediateArg = '', patch = {}) => ({
			reply,
			message: {
				fromHostAccount: true,
				boundaryName: 'kozz-zapo',
				chatId: owner,
				...patch,
			},
			rawCommand: { method, immediateArg },
		});
		const run = (method, argument = '', patch) =>
			captured.commands.methods[method](requester(method, argument, patch));
		for (const patch of [
			{ fromHostAccount: false },
			{ chatId: '123@g.us' },
			{ chatId: '777@lid' },
			{ boundaryName: 'ai-test-zapo' },
		])
			await run('default', '', patch);
		assert.equal(replies.length, 0);
		socket.emit('introduction_ack', { success: true });
		await new Promise(resolve => setImmediate(resolve));
		await run('default');
		assert.match(replies.at(-1).body, /parado/);
		await run('iniciar');
		assert.match(replies.at(-1).body, /grupo/);
		assert.equal(saved.enabled, false);
		await run('buscar', 'cafe');
		assert.match(replies.at(-1).body, /Grupo café/);
		assert.equal(replies.at(-1).buttons[0].command, '!autotramonta grupo 123@g.us');
		await run('grupo', '123@g.us');
		assert.equal(saved.groups.length, 1);
		await run('iniciar');
		assert.equal(saved.enabled, true);
		await run('cadencia', '15 40');
		assert.deepEqual(saved.cadence, [15, 40]);
		await run('online', '2 5');
		assert.deepEqual(saved.online, [120, 300]);
		await run('offline', '5 15');
		assert.deepEqual(saved.offline, [300, 900]);
		await run('chance', '100');
		assert.equal(saved.mentionChance, 100);
		await run('chance', '101');
		assert.equal(saved.mentionChance, 100);
		assert.match(replies.at(-1).body, /0 a 100/);
		history = [
			{
				id: 'history-question',
				body: 'Qual horário?',
				timestamp: now - 60_000,
				contact: { id: 'peer@lid', publicName: 'Ana' },
				fromHostAccount: false,
			},
			{
				id: 'history-auto',
				body: 'To vendo aqui\u200B',
				timestamp: now - 30_000,
				contact: { id: owner },
				fromHostAccount: true,
			},
		];
		captured.proxy.onMessage({
			message: {
				id: 'new-question',
				boundaryName: 'kozz-zapo',
				chatId: '123@g.us',
				from: 'peer@lid',
				contact: { id: 'peer@lid', publicName: 'Ana' },
				body: 'Conseguiu ver?',
				timestamp: now,
				messageType: 'TEXT',
				taggedContacts: [],
			},
		});
		now += 40_000;
		await liveEngine.tick();
		assert.equal(generatedInputs.length, 1);
		assert.ok(
			generatedInputs[0].context.some(
				p =>
					p.id === 'history-question' &&
					p.author === 'Ana' &&
					p.text === 'Qual horário?'
			)
		);
		assert.ok(
			generatedInputs[0].context.some(
				p => p.id === 'history-auto' && p.own && p.text === 'To vendo aqui'
			)
		);
		assert.deepEqual(generatedInputs[0].newMessageIds, ['new-question']);
		assert.equal(outgoing.length, 2);
		assert.equal(outgoing[0].event, 'reply_with_text');
		assert.equal(outgoing[0].payload.quoteId, 'history-question');
		assert.equal(outgoing[1].event, 'send_message');
		assert.ok(outgoing.every(p => p.payload.body.endsWith('\u200B')));
		// A manual history message missed by the proxy must stop generation too.
		now += 40_000;
		history.push({
			id: 'missed-human',
			body: 'Deixa que eu confirmo',
			timestamp: now - 3000,
			fromHostAccount: true,
			contact: { id: owner },
		});
		captured.proxy.onMessage({
			message: {
				id: 'new-question-2',
				boundaryName: 'kozz-zapo',
				chatId: '123@g.us',
				from: 'peer@lid',
				contact: { id: 'peer@lid', publicName: 'Ana' },
				body: 'Beleza?',
				timestamp: now,
				messageType: 'TEXT',
				taggedContacts: [],
			},
		});
		await liveEngine.tick();
		assert.equal(generatedInputs.length, 1);
		assert.equal(outgoing.length, 2);
		assert.equal(liveEngine.status()[0].humanPaused, true);
		const ownMessage = {
			boundaryName: 'kozz-zapo',
			chatId: '123@g.us',
			fromHostAccount: true,
			id: 'auto-echo',
			from: owner,
			contact: { id: owner, publicName: 'Tramonta' },
			body: 'Resposta automática\u200B',
			timestamp: now,
			messageType: 'TEXT',
		};
		await run('parar');
		await run('iniciar');
		captured.proxy.onMessage({ message: ownMessage });
		await run('status');
		assert.doesNotMatch(replies.at(-1).body, /pausado: você assumiu/);
		captured.proxy.onMessage({
			message: {
				...ownMessage,
				id: 'human',
				body: 'Agora eu respondo',
				fromHostAccount: false,
			},
		});
		await run('status');
		assert.match(replies.at(-1).body, /pausado: você assumiu/);
		for (const method of [
			'ajustes',
			'ritmo',
			'periodos',
			'janelaonline',
			'janelaoffline',
			'mencoes',
		])
			await run(method);
		await run('parar');
		assert.equal(saved.enabled, false);
		await run('grupo', '123@g.us');
		assert.equal(saved.groups.length, 0);
	} finally {
		Module._load = originalLoad;
		global.setInterval = originalInterval;
		if (oldKey === undefined) delete process.env.FUELIX_API_KEY;
		else process.env.FUELIX_API_KEY = oldKey;
	}
});
