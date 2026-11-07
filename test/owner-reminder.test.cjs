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
const { ownerTools } = require('../dist/Services/OwnerAI/tools');

const fixture = t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-reminder-')),
		cwd = process.cwd();
	process.chdir(dir);
	const store = createReminderStore(path.join(dir, 'reminders')),
		replies = [],
		previews = [],
		socket = new EventEmitter();
	const state = { members: [{ id: '11@lid' }, { id: '22@lid' }] };
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
			socket.emit(`reply_resource/${payload.request.id}`, {
				...payload,
				response: resource(payload.request.resource, payload.request.data),
			})
		)
	);
	const originalLoad = Module._load,
		interval = global.setInterval;
	const file = require.resolve('../dist/Handlers/Lembrete'),
		cached = require.cache[file];
	delete require.cache[file];
	global.setInterval = () => ({ unref() {} });
	Module._load = function (request, parent, isMain) {
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
			fromHostAccount: true,
			taggedContacts: [{ id: '22@lid', publicName: 'Pessoa de teste' }],
			...patch,
		},
		ask: {
			boundary: async (_id, name, args) => ({ response: resource(name, args) }),
		},
		reply: Object.assign(body => replies.push(body), {
			withButtons: (body, options) => previews.push({ body, options }),
		}),
	});
	t.after(() => {
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	return { store, requester, replies, previews, state };
};
test('the exact invalid invocation observed in production is rejected before approval, and the catalog supplies syntax/examples', async t => {
	const f = fixture(t),
		r = f.requester();
	const listed = await executeOwnerTool(r, 'owner_list_commands', {
		module: 'lembrete',
	});
	const catalog = JSON.parse(listed.content)[0];
	assert.match(catalog.description, /owner_create_reminder/);
	const create = catalog.methods.find(m => m.method === 'criar');
	assert.match(create.syntax, /TEMPO TEXTO/);
	assert.ok(create.examples.some(s => s.startsWith('1m ')));
	await assert.rejects(
		executeOwnerTool(r, 'owner_execute_command', {
			module: 'lembrete',
			method: 'criar',
			chatId: '123@g.us',
			immediateArg: 'em 1 minuto @22 ensinar como funcionam os lembretes',
			namedArgs: '{}',
		}),
		/nunca "em 1 minuto/
	);
	assert.equal(f.previews.length, 0);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 0);
});
test('structured tool creates the actual reminder with the intended recipient after a confirmation click without mentions', async t => {
	const f = fixture(t),
		r = f.requester();
	assert.ok(ownerTools.some(tool => tool.function.name === 'owner_create_reminder'));
	const result = await executeOwnerTool(r, 'owner_create_reminder', {
		chatId: '123@g.us',
		duration: '1m',
		text: 'ensinar como funcionam os lembretes',
		recipientIds: ['22@lid'],
		private: true,
	});
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 0);
	assert.match(f.previews[0].body, /Daqui a: 1m/);
	assert.match(f.previews[0].body, /Pessoa de teste/);
	const confirmed = f.requester({ id: 'confirmation-click', taggedContacts: [] });
	const done = await approvalQueue.take(
		result.approvalId,
		ownerOrigin(r),
		true,
		confirmed
	);
	assert.equal(done.result.scheduled, true);
	assert.equal(done.result.invoked, true);
	const reminder = f.store.list('kozz-zapo', '123@g.us')[0];
	assert.equal(reminder.due - reminder.created, 60000);
	assert.equal(reminder.text, 'ensinar como funcionam os lembretes');
	assert.deepEqual(
		reminder.recipients.map(p => p.id),
		['222@s.whatsapp.net']
	);
	assert.deepEqual(
		reminder.deliveries.map(d => d.chatId),
		['123@g.us', '222@s.whatsapp.net']
	);
	assert.equal(done.result.reminderId, reminder.id);
	assert.equal(
		(await approvalQueue.take(result.approvalId, ownerOrigin(r), true, confirmed))
			.found,
		false
	);
});
test('generic command preserves original mentions too and never reports handler validation failure as success', async t => {
	const f = fixture(t),
		r = f.requester();
	const prepared = await executeOwnerTool(r, 'owner_execute_command', {
		module: 'lembrete',
		method: 'criar',
		chatId: '123@g.us',
		immediateArg: '1m lembrar --pessoas @22',
		namedArgs: '{}',
	});
	r.message.taggedContacts = [];
	const ok = await approvalQueue.take(
		prepared.approvalId,
		ownerOrigin(r),
		true,
		f.requester({ taggedContacts: [] })
	);
	assert.equal(ok.result.scheduled, true);
	assert.equal(
		f.store.list('kozz-zapo', '123@g.us')[0].recipients[0].id,
		'222@s.whatsapp.net'
	);
	const failed = await invokeModule({
		module: 'lembrete',
		method: 'criar',
		immediateArg: 'em 1 minuto teste',
		namedArgs: {},
		query: 'criar em 1 minuto teste',
		boundaryId: 'boundary-test',
		boundaryName: 'kozz-zapo',
		namespace: 'default',
		taggedContacts: [],
		message: {
			...r.message,
			body: '!lembrete criar em 1 minuto teste',
			taggedContacts: [],
		},
	});
	assert.equal(failed.executed, false);
	assert.equal(failed.outcome.success, false);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 1);
});
test('structured reminders target another group and consolidate phone/LID aliases before scheduling', async t => {
	const f = fixture(t),
		r = f.requester({ chatId: '456@g.us', to: '456@g.us' });
	const pending = await executeOwnerTool(r, 'owner_create_reminder', {
		chatId: '123@g.us',
		duration: '2h',
		text: 'reunião',
		recipientIds: ['22@lid', '222@s.whatsapp.net'],
		private: true,
	});
	const result = await approvalQueue.take(
		pending.approvalId,
		ownerOrigin(r),
		true,
		f.requester({ chatId: '456@g.us', to: '456@g.us', taggedContacts: [] })
	);
	assert.equal(result.result.scheduled, true);
	assert.equal(f.store.list('kozz-zapo', '456@g.us').length, 0);
	const reminder = f.store.list('kozz-zapo', '123@g.us')[0];
	assert.equal(reminder.chatName, 'Grupo de teste');
	assert.equal(reminder.due - reminder.created, 7200000);
	assert.equal(reminder.recipients.length, 1);
	assert.equal(reminder.deliveries.length, 2);
});
test('missing member during confirmation yields a failed outcome; bad structured arguments never propose an action', async t => {
	const f = fixture(t),
		r = f.requester(),
		args = {
			chatId: '123@g.us',
			duration: '1m',
			text: 'lembrar',
			recipientIds: ['22@lid'],
			private: false,
		};
	for (const patch of [
		{ duration: 'em 1 minuto' },
		{ private: 'true' },
		{ text: 'lembrar --privado' },
		{ recipientIds: ['inventado'] },
	])
		await assert.rejects(
			executeOwnerTool(r, 'owner_create_reminder', { ...args, ...patch })
		);
	assert.equal(f.previews.length, 0);
	const pending = await executeOwnerTool(r, 'owner_create_reminder', args);
	f.state.members = [{ id: '11@lid' }];
	const result = await approvalQueue.take(
		pending.approvalId,
		ownerOrigin(r),
		true,
		f.requester({ taggedContacts: [] })
	);
	assert.equal(result.result.invoked, false);
	assert.equal(result.result.success, false);
	assert.equal(result.result.scheduled, undefined);
	assert.match(result.result.error, /precisam estar neste grupo/);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 0);
	const audit = fs
		.readFileSync('.runtime/owner-ai/audit.jsonl', 'utf8')
		.trim()
		.split('\n')
		.map(JSON.parse);
	assert.equal(audit.at(-1).status, 'not_completed');
});
