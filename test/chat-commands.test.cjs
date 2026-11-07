const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const maker = require('kozz-module-maker');
const { onCommand } = require('kozz-module-maker/dist/Socket/Events/Handle/Command');
const {
	createAskResource,
} = require('kozz-module-maker/dist/Message/RoutineCreation/AskResource');
const { createReminderStore } = require('../dist/Handlers/Lembrete/store');
const {
	registerOwnerAiModule,
	invokeModule,
} = require('../dist/Services/OwnerAI/modules');
const { executeOwnerTool } = require('../dist/Services/OwnerAI/execute');
const { approvalQueue, ownerOrigin } = require('../dist/Services/OwnerAI/control');
const { executeChatTool } = require('../dist/Services/ChatCommands/execute');
const {
	guardModuleSocket,
	inChatScope,
} = require('../dist/Services/ChatCommands/scope');
const { createReminderRunner } = require('../dist/Handlers/Lembrete/scheduler');

const fixture = t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-reminder-')),
		cwd = process.cwd();
	process.chdir(dir);
	const store = createReminderStore(path.join(dir, 'reminders')),
		replies = [],
		previews = [],
		socket = new EventEmitter();
	const state = {
		requests: [],
		helps: {},
		members: [{ id: '11@lid' }, { id: '22@lid' }],
	};
	socket.connected = true;
	const outgoing = new Set(),
		emit = socket.emit.bind(socket);
	socket.onAnyOutgoing = fn => outgoing.add(fn);
	socket.offAnyOutgoing = fn => outgoing.delete(fn);
	socket.emit = (name, data) => {
		outgoing.forEach(fn => fn(name, data));
		return emit(name, data);
	};
	socket.on('reply_with_text', payload => replies.push(payload));
	const resource = (name, args) => {
		state.requests.push({ name, args });
		if (name === 'group_event') return { submitted: true };
		if (name === 'owner_ai_authorize') return { authorized: true };
		if (name === 'owner_ai_search')
			return {
				matches: args.query.endsWith('@g.us')
					? [{ id: args.query, name: 'Grupo de teste', kind: 'group' }]
					: [
							{
								id: '22@lid',
								name: 'Pessoa de teste',
								kind: 'contact',
								aliases: ['22@lid', '222@s.whatsapp.net'],
							},
						],
			};
		if (name === 'group_members')
			return {
				matches: state.members.map(p => ({
					...p,
					name: p.id === '22@lid' ? 'Ana' : 'Autor',
					aliases: [
						p.id,
						p.id === '22@lid' ? '222@s.whatsapp.net' : '111@s.whatsapp.net',
					],
				})),
			};
		if (name === 'contact_info')
			return { id: args.id, publicName: 'Ana', isHostAccount: false };
		if (name === 'group_chat_info') return { participants: state.members };
		if (name === 'lid_from_jid')
			return { lid: args.id === '111@s.whatsapp.net' ? '11@lid' : '22@lid' };
		if (name === 'jid_from_lid')
			return {
				jid: args.id === '22@lid' ? '222@s.whatsapp.net' : '111@s.whatsapp.net',
			};
		return {};
	};
	socket.on('ask_resource', payload =>
		queueMicrotask(() =>
			emit(`reply_resource/${payload.request.id}`, {
				...payload,
				response:
					payload.request.resource === 'help'
						? state.helps[payload.responder.id]?.({})
						: resource(payload.request.resource, payload.request.data),
			})
		)
	);
	const originalLoad = Module._load,
		interval = global.setInterval;
	const file = require.resolve('../dist/Handlers/Lembrete'),
		cached = require.cache[file];
	delete require.cache[file];
	global.setInterval = () => ({ unref() {} });
	const mockLoad = function (request, parent, isMain) {
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
						resources: {
							upsertResource: (name, getter) => {
								if (name === 'help') state.helps[options.name] = getter;
								return runtime;
							},
						},
						ask: createAskResource(socket, {
							requester: { id: options.name, type: 'Handler', namespace: 'default' },
						}),
					};
					return runtime;
				},
			};
		if (request === './store' && parent.filename.endsWith('/Lembrete/index.js'))
			return {
				...require('../dist/Handlers/Lembrete/store'),
				createReminderStore: () => store,
			};
		if (request.endsWith('/Group/groupState'))
			return { areCommandsDisabledForGroup: () => false };
		if (request.endsWith('/Mute/mutedDB')) return { isUserMutted: () => false };
		return originalLoad.call(this, request, parent, isMain);
	};
	Module._load = mockLoad;
	try {
		registerOwnerAiModule({ name: 'ai', commandMethods: {}, socket: undefined });
		registerOwnerAiModule(require(file).startLembreteHandler());
	} finally {
		Module._load = originalLoad;
		global.setInterval = interval;
		if (cached) require.cache[file] = cached;
		else delete require.cache[file];
	}
	const requester = (patch = {}) => ({
		message: {
			id: 'original-request',
			body: '!ai crie um lembrete para a pessoa marcada daqui a 1 minuto',
			from: '111@s.whatsapp.net',
			contact: { id: '111@s.whatsapp.net' },
			to: '123@g.us',
			chatId: '123@g.us',
			groupName: 'Grupo de origem',
			namespace: 'default',
			boundaryId: 'boundary-test',
			boundaryName: 'kozz-zapo',
			fromHostAccount: false,
			taggedContacts: [{ id: '22@lid', publicName: 'Pessoa de teste' }],
			...patch,
		},
		ask: {
			boundary: async (_id, name, args) => ({ response: resource(name, args) }),
			handler: createAskResource(socket, {
				requester: { id: 'ai', type: 'Handler', namespace: 'default' },
			}).handler,
		},
		reply: Object.assign(body => replies.push(body), {
			withButtons: (body, options) => previews.push({ body, options }),
		}),
	});
	t.after(() => {
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	const loadHandler = (path, starter) => {
		Module._load = mockLoad;
		try {
			registerOwnerAiModule(require(path)[starter]());
		} finally {
			Module._load = originalLoad;
		}
	};
	return { store, requester, replies, previews, state, dir, socket, loadHandler };
};

test('real legacy handlers receive fallback text like the gateway, and catalogue includes their actual help', async t => {
	const f = fixture(t);
	f.loadHandler('../dist/Handlers/Horoscope', 'startHoroscopeHandler');
	f.loadHandler('../dist/Handlers/Sound', 'startSoundHandler');
	const horoscope = require('../dist/API/HoroscopeAPI').default;
	const sounds = require('../dist/API/MyInstantsApi');
	const previousHoroscope = horoscope.getDaily,
		previousSearch = sounds.searchSounds;
	t.after(() => {
		horoscope.getDaily = previousHoroscope;
		sounds.searchSounds = previousSearch;
	});
	const signs = [],
		queries = [];
	horoscope.getDaily = async sign => {
		signs.push(sign);
		return null;
	};
	sounds.searchSounds = async query => {
		queries.push(query);
		return [];
	};
	const run = (module, method, immediateArg) =>
		executeChatTool(f.requester(), 'chat_execute_command', {
			module,
			method,
			immediateArg,
			namedArgs: '{}',
			recipientIds: [],
		});
	await run('horoscopo', 'fallback', 'aries');
	await run('horoscopo', 'touro', '');
	await run('som', 'fallback', 'risada engraçada');
	assert.deepEqual(signs, ['aries', 'touro']);
	assert.deepEqual(queries, ['risada engraçada']);
	const catalogue = JSON.parse(
		(await executeChatTool(f.requester(), 'chat_list_commands', { module: 'som' }))
			.content
	);
	assert.match(catalogue[0].help, /\/som vine boom/);
	assert.ok(f.replies.filter(p => p.chatId).every(p => p.chatId === '123@g.us'));
});

test('AI forwards verified owner privileges to the real all handler, while members keep its authorization requirement', async t => {
	const f = fixture(t);
	f.loadHandler('../dist/Handlers/All', 'startAllHandler');
	const args = {
		module: 'all',
		method: 'fallback',
		immediateArg: 'aviso importante',
		namedArgs: '{}',
		recipientIds: [],
	};
	const member = await executeChatTool(f.requester(), 'chat_execute_command', args);
	assert.match(member.content, /não tem autorização/);
	const owner = await executeChatTool(
		f.requester({ fromHostAccount: true }),
		'chat_execute_command',
		args
	);
	assert.match(owner.content, /mencionou todos os membros: aviso importante/);
	assert.ok(f.replies.filter(p => p.chatId).every(p => p.chatId === '123@g.us'));
});

test('any member creates a real reminder immediately, preserves recipients, and persists only the source destination', async t => {
	const f = fixture(t),
		r = f.requester();
	const done = await executeChatTool(r, 'chat_create_reminder', {
		duration: '1m',
		text: 'Reunião',
		recipientIds: ['22@lid'],
	});
	assert.equal(done.terminal, false);
	assert.equal(JSON.parse(done.content).status, 'scheduled');
	assert.equal(f.previews.length, 0);
	const reminder = f.store.list('kozz-zapo', '123@g.us')[0];
	assert.equal(reminder.localOnly, true);
	assert.equal(reminder.private, false);
	assert.equal(reminder.owner.id, '111@s.whatsapp.net');
	assert.deepEqual(
		reminder.recipients.map(p => p.id),
		['222@s.whatsapp.net']
	);
	const reopened = createReminderStore(path.join(f.dir, 'reminders'));
	assert.throws(
		() =>
			reopened.change('kozz-zapo', '123@g.us', reminder.id, reminder.owner, true, {
				private: true,
			}),
		/somente neste chat/
	);
	const destinations = [];
	await createReminderRunner({
		store: reopened,
		ready: async () => true,
		allowed: () => true,
		send: async (_, delivery) => {
			destinations.push(delivery.chatId);
			return { submitted: true };
		},
	})(reminder.due);
	assert.deepEqual(destinations, ['123@g.us']);
});
test('tools reject forged destination/identity, foreign recipients, recursive commands and private side effects', async t => {
	const f = fixture(t),
		r = f.requester();
	const args = { duration: '1m', text: 'Reunião', recipientIds: [] };
	for (const key of ['chatId', 'boundaryId', 'fromHostAccount', 'private'])
		await assert.rejects(
			executeChatTool(r, 'chat_create_reminder', { ...args, [key]: '456@g.us' })
		);
	await assert.rejects(
		executeChatTool(r, 'chat_create_reminder', {
			...args,
			recipientIds: ['99@lid'],
		}),
		/chat de origem/
	);
	await assert.rejects(
		executeChatTool(r, 'chat_create_reminder', { ...args, text: 'teste --privado' })
	);
	for (const module of ['ai', 'test', 'transmit', 'autotramonta', 'autostatus'])
		await assert.rejects(
			executeChatTool(r, 'chat_execute_command', {
				module,
				method: 'default',
				immediateArg: '',
				namedArgs: '{}',
				recipientIds: [],
			})
		);
	await assert.rejects(
		executeChatTool(r, 'chat_execute_command', {
			module: 'lembrete',
			method: 'criar',
			immediateArg: '1m teste --privado',
			namedArgs: '{}',
			recipientIds: [],
		}),
		/privado/
	);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 0);
	const people = await executeChatTool(r, 'chat_find_members', { query: 'Ana' });
	assert.deepEqual(
		JSON.parse(people.content).matches.map(m => m.id),
		['22@lid']
	);
});
test('real command dispatch preserves caller permissions and original media, and strips foreign quotes', async t => {
	const f = fixture(t),
		captured = [];
	const methods = maker.createMethod('default', r => {
		captured.push(r.message);
		r.reply('OK');
	});
	registerOwnerAiModule({
		name: 'ping',
		commandMethods: methods,
		socket: f.socket,
		executeCommand: onCommand(
			f.socket,
			methods,
			[
				command =>
					command.message.fromHostAccount
						? command
						: { ...command, namedArgs: { abort: true } },
			],
			'ping',
			'',
			['kozz-zapo']
		),
	});
	const args = {
		module: 'ping',
		method: 'default',
		immediateArg: '',
		namedArgs: '{}',
		recipientIds: [],
	};
	assert.equal(
		JSON.parse(
			(await executeChatTool(f.requester(), 'chat_execute_command', args)).content
		).success,
		false
	);
	assert.equal(captured.length, 0);
	const media = { mimeType: 'image/jpeg', transportType: 'b64', data: 'AAAA' };
	await executeChatTool(
		f.requester({
			fromHostAccount: true,
			media,
			quotedMessage: { id: 'foreign', to: '456@g.us', chatId: '456@g.us' },
		}),
		'chat_execute_command',
		args
	);
	assert.equal(captured.length, 1);
	assert.equal(captured[0].fromHostAccount, true);
	assert.equal(captured[0].from, '111@s.whatsapp.net');
	assert.equal(captured[0].chatId, '123@g.us');
	assert.deepEqual(captured[0].media, media);
	assert.equal(captured[0].quotedMessage, undefined);
});
test('transport guard isolates concurrent chats and timers, and blocks foreign resources before emission', async () => {
	const socket = new EventEmitter(),
		sent = [];
	socket.on('send_message', p => sent.push(p.chatId));
	guardModuleSocket(socket);
	const scope = id => ({
		chatId: id,
		boundaryId: 'b',
		boundaryName: 'kozz-zapo',
		messageIds: new Set(['m']),
		personIds: new Set(['11@lid']),
	});
	const a = scope('123@g.us'),
		b = scope('456@g.us');
	await Promise.all(
		[a, b].map(ctx =>
			inChatScope(ctx, async () => {
				await new Promise(resolve => setImmediate(resolve));
				socket.emit('send_message', { chatId: ctx.chatId, boundaryId: 'b' });
				await new Promise(resolve =>
					setTimeout(() => {
						socket.emit('send_message', { chatId: '999@lid', boundaryId: 'b' });
						resolve();
					}, 5)
				);
			})
		)
	);
	assert.deepEqual(sent.sort(), ['123@g.us', '456@g.us']);
	assert.ok(a.violation && b.violation);
	let queries = 0;
	socket.on('ask_resource', () => queries++);
	for (const data of [{ chatId: '999@g.us' }, { chatId: '123@g.us' }]) {
		assert.throws(() =>
			inChatScope(scope('123@g.us'), () =>
				socket.emit('ask_resource', {
					responder: {
						type: 'Boundary',
						id: data.chatId === '123@g.us' ? 'other' : 'b',
					},
					request: { resource: 'group_chat_info', data },
				})
			)
		);
	}
	assert.throws(() =>
		inChatScope(scope('123@g.us'), () =>
			socket.emit('ask_resource', {
				responder: { type: 'Boundary', id: 'b' },
				request: { resource: 'all_groups', data: {} },
			})
		)
	);
	assert.equal(queries, 0);
	// Ordinary direct commands are unaffected outside an AI scope.
	socket.emit('send_message', { chatId: '999@lid', boundaryId: 'b' });
	assert.equal(sent.at(-1), '999@lid');
});

test('AI cannot change legacy private recipients until private delivery is disabled', async t => {
	const f = fixture(t),
		owner = { id: '111@s.whatsapp.net', aliases: ['111@s.whatsapp.net', '11@lid'] },
		now = Date.now();
	const reminder = f.store.create({
		boundary: 'kozz-zapo',
		chatId: '123@g.us',
		chatName: 'Origem',
		owner,
		text: 'Manual',
		created: now,
		due: now + 60000,
		recipients: [owner],
		private: true,
	});
	const run = (method, immediateArg) =>
		executeChatTool(f.requester(), 'chat_execute_command', {
			module: 'lembrete',
			method,
			immediateArg,
			namedArgs: '{}',
			recipientIds: ['22@lid'],
		});
	assert.equal(
		JSON.parse((await run('pessoas', `${reminder.id} @22`)).content).success,
		false
	);
	assert.equal(
		f.store.get('kozz-zapo', '123@g.us', reminder.id).recipients[0].id,
		owner.id
	);
	await run('privado', `${reminder.id} off`);
	assert.equal(f.store.get('kozz-zapo', '123@g.us', reminder.id).localOnly, true);
	assert.equal(
		JSON.parse((await run('pessoas', `${reminder.id} @22`)).content).success,
		null
	);
	assert.deepEqual(
		f.store.get('kozz-zapo', '123@g.us', reminder.id).deliveries.map(d => d.chatId),
		['123@g.us']
	);
});
test('scoped mute maintenance changes subscriptions only in the source group, including expiration callbacks', async t => {
	const file = require.resolve('../dist/Proxies/Mute/subscriptions'),
		old = require.cache[file],
		original = Module._load;
	delete require.cache[file];
	let routes = [];
	Module._load = function (request, parent, main) {
		if (request === './mutedDB' && parent.filename === file)
			return {
				getActiveMuteRoutes: () => routes.filter(r => r.expiration > Date.now()),
			};
		return original.call(this, request, parent, main);
	};
	let create;
	try {
		create = require(file).createMuteSubscriptions;
	} finally {
		Module._load = original;
		if (old) require.cache[file] = old;
		else delete require.cache[file];
	}
	const socket = new EventEmitter(),
		incoming = socket.emit.bind(socket),
		sent = [];
	for (const event of ['request_proxy', 'revoke_proxy'])
		socket.on(event, payload => sent.push({ event, payload }));
	const subscriptions = create(socket);
	incoming('introduction_ack', { success: true });
	sent.length = 0;
	guardModuleSocket(socket);
	routes = [
		{ boundary: 'kozz-zapo', chat: '123@g.us', expiration: Date.now() + 30 },
		{ boundary: 'kozz-zapo', chat: '456@g.us', expiration: Date.now() + 60000 },
	];
	const scope = {
		chatId: '123@g.us',
		boundaryId: 'b',
		boundaryName: 'kozz-zapo',
		messageIds: new Set(),
		personIds: new Set(),
	};
	inChatScope(scope, () => subscriptions.sync());
	await new Promise(resolve => setTimeout(resolve, 60));
	assert.deepEqual(
		sent.map(s => [s.event, s.payload.source.chats]),
		[
			['request_proxy', ['123@g.us']],
			['revoke_proxy', ['123@g.us']],
		]
	);
	assert.equal(scope.violation, undefined);
	subscriptions.sync();
	assert.deepEqual(sent.at(-1).payload.source.chats, ['456@g.us']);
	incoming('disconnect');
});

test('structured event invokes the actual handler with original artwork only in the source group', async t => {
	const f = fixture(t),
		original = Module._load;
	const roleFile = require.resolve('../dist/Handlers/Role'),
		cachedRole = require.cache[roleFile];
	delete require.cache[roleFile];
	Module._load = function (request, parent, main) {
		if (request === 'kozz-module-maker')
			return {
				...maker,
				createModule: options => {
					const runtime = {
						name: options.name,
						commandMethods: options.commands.methods,
						socket: f.socket,
						executeCommand: onCommand(
							f.socket,
							options.commands.methods,
							[],
							options.name,
							'',
							['kozz-zapo']
						),
						resources: { upsertResource: () => runtime },
						ask: createAskResource(f.socket, {
							requester: { id: options.name, type: 'Handler', namespace: 'default' },
						}),
					};
					return runtime;
				},
			};
		return original.call(this, request, parent, main);
	};
	try {
		registerOwnerAiModule(require('../dist/Handlers/Role').startRoleHandler());
	} finally {
		Module._load = original;
		if (cachedRole) require.cache[roleFile] = cachedRole;
		else delete require.cache[roleFile];
	}
	const image = await require('sharp')({
		create: { width: 8, height: 8, channels: 3, background: 'red' },
	})
		.png()
		.toBuffer();
	const media = {
		transportType: 'b64',
		data: image.toString('base64'),
		mimeType: 'image/png',
		sizeInBytes: image.length,
	};
	const day = new Date(Date.now() + 3 * 86400000);
	const dateTime = `${String(day.getUTCDate()).padStart(2, '0')}/${String(day.getUTCMonth() + 1).padStart(2, '0')}/${day.getUTCFullYear()} 19:00`;
	const result = await executeChatTool(f.requester({ media }), 'chat_create_event', {
		title: 'Futebol',
		dateTime,
		location: 'Quadra',
	});
	assert.equal(result.terminal, false);
	assert.equal(JSON.parse(result.content).status, 'submitted');
	assert.equal(f.previews.length, 0);
	const events = f.state.requests.filter(r => r.name === 'group_event');
	assert.equal(events.length, 1);
	assert.equal(events[0].args.chatId, '123@g.us');
	assert.equal(events[0].args.title, 'Futebol');
	assert.equal(events[0].args.artwork.data, media.data);
});
