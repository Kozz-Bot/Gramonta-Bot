const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
	createUpdateGroupsStore,
	updateGroups,
} = require('../dist/Services/Updates/store');
const { publishUpdate } = require('../dist/Services/Updates/publish');

test('push announcements use persisted opt-ins, validate group types and avoid duplicates and uncertain retries', async t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kozz-updates-'));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const file = path.join(directory, 'groups.json');
	const store = createUpdateGroupsStore(file);
	assert.deepEqual(store.list(), []);
	const groups = [
		{ id: '123@g.us', name: 'Conversa', groupType: 'community_group' },
		{ id: '124@g.us', name: 'Avisos', groupType: 'announcement' },
		{ id: '125@g.us', name: 'Comunidade', groupType: 'community' },
		{ id: '126@g.us', name: 'Não selecionado', groupType: 'group' },
	];
	for (const g of groups.slice(0, 3)) store.add(g);
	store.add(groups[0]);
	assert.equal(createUpdateGroupsStore(file).list().length, 3);
	assert.equal(fs.statSync(file).mode & 0o777, 0o600);
	const sent = [];
	const args = {
		directory,
		repository: 'repo',
		commit: 'a'.repeat(40),
		summary: 'Agora você escolhe os grupos pela IA.',
		groups,
		send: (id, body) => sent.push({ id, body }),
	};
	const first = await publishUpdate(args);
	assert.deepEqual(sent.map(s => s.id).sort(), ['123@g.us', '124@g.us']);
	assert.match(sent[0].body, /Novidades do Gramonta/);
	assert.equal(first.find(r => r.chatId === '125@g.us').status, 'unavailable');
	await publishUpdate(args);
	assert.equal(sent.length, 2);
	store.remove('123@g.us');
	await publishUpdate({ ...args, commit: 'b'.repeat(40) });
	assert.equal(sent.at(-1).id, '124@g.us');
	await publishUpdate({
		...args,
		commit: 'c'.repeat(40),
		send() {
			throw new Error('uncertain');
		},
	});
	await publishUpdate({ ...args, commit: 'c'.repeat(40) });
	assert.equal(sent.length, 3);
	await assert.rejects(publishUpdate({ ...args, commit: 'not-a-commit' }));
	fs.writeFileSync(file, '{}');
	assert.throws(() => store.list());
});

test('owner controls update groups through actual AI execution; members and cross-chat sends remain blocked', async t => {
	const Module = require('node:module');
	const { EventEmitter } = require('node:events');
	const maker = require('kozz-module-maker');
	const {
		onCommand,
	} = require('kozz-module-maker/dist/Socket/Events/Handle/Command');
	const {
		createAskResource,
	} = require('kozz-module-maker/dist/Message/RoutineCreation/AskResource');
	const { registerOwnerAiModule } = require('../dist/Services/OwnerAI/modules');
	const { executeChatTool } = require('../dist/Services/ChatCommands/execute');
	const { inChatScope } = require('../dist/Services/ChatCommands/scope');
	const { commandOutcome } = require('../dist/Services/OwnerAI/contracts');
	const cwd = process.cwd();
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kozz-updates-ai-'));
	process.chdir(dir);
	t.after(() => {
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	const socket = new EventEmitter();
	socket.connected = true;
	const outgoing = new Set();
	const emit = socket.emit.bind(socket);
	socket.onAnyOutgoing = fn => outgoing.add(fn);
	socket.offAnyOutgoing = fn => outgoing.delete(fn);
	socket.emit = (name, data) => {
		outgoing.forEach(fn => fn(name, data));
		return emit(name, data);
	};
	const groups = [
		{ id: '123@g.us', name: 'Atual', groupType: 'group' },
		{ id: '456@g.us', name: 'Outro', groupType: 'community_group' },
		{ id: '457@g.us', name: 'Duplicado', groupType: 'community' },
		{ id: '458@g.us', name: 'Duplicado', groupType: 'announcement' },
	];
	const replies = [];
	const sends = [];
	socket.on('reply_with_text', p => replies.push(p));
	socket.on('send_message', p => sends.push(p));
	socket.on('ask_resource', p => {
		const response = p.request.resource === 'all_groups' ? groups : { matches: [] };
		queueMicrotask(() => emit(`reply_resource/${p.request.id}`, { response }));
	});
	let runtime;
	const originalLoad = Module._load;
	Module._load = function (name, parent, main) {
		if (name === 'kozz-module-maker')
			return {
				...maker,
				createModule: config => {
					runtime = {
						name: config.name,
						socket,
						commandMethods: config.commands.methods,
						executeCommand: onCommand(
							socket,
							config.commands.methods,
							[],
							config.name,
							'',
							['kozz-zapo']
						),
						resources: { upsertResource: () => runtime },
					};
					return runtime;
				},
			};
		return originalLoad.call(this, name, parent, main);
	};
	try {
		require('../dist/Handlers/Updates').startUpdatesHandler();
	} finally {
		Module._load = originalLoad;
	}
	registerOwnerAiModule(runtime);
	registerOwnerAiModule({ name: 'ai', commandMethods: {}, socket });
	const request = host => ({
		message: {
			id: 'request',
			namespace: 'default',
			boundaryId: 'boundary',
			boundaryName: 'kozz-zapo',
			from: '11@lid',
			contact: { id: '11@lid' },
			chatId: '123@g.us',
			to: '123@g.us',
			taggedContacts: [],
			fromHostAccount: host,
		},
		ask: createAskResource(socket, {
			requester: { id: 'ai', type: 'Handler', namespace: 'default' },
		}),
	});
	const call = (host, method, group = '') =>
		executeChatTool(request(host), 'chat_execute_command', {
			module: 'updates',
			method,
			immediateArg: group,
			namedArgs: '{}',
			recipientIds: [],
		});
	assert.deepEqual(
		JSON.parse(
			(
				await executeChatTool(request(false), 'chat_list_commands', {
					module: 'updates',
				})
			).content
		),
		[]
	);
	await assert.rejects(call(false, 'adicionar'), /dono/);
	const direct = {
		module: 'updates',
		method: 'adicionar',
		namedArgs: {},
		boundaryName: 'kozz-zapo',
		boundaryId: 'boundary',
		message: request(false).message,
	};
	await runtime.executeCommand(direct);
	assert.equal(commandOutcome(direct).success, false);
	assert.deepEqual(updateGroups.list(), []);
	assert.match((await call(true, 'adicionar')).content, /"success":true/);
	assert.equal(updateGroups.list()[0].id, '123@g.us');
	assert.match((await call(true, 'buscar', 'Outro')).content, /456@g.us/);
	assert.match((await call(true, 'adicionar', 'Outro')).content, /"success":true/);
	assert.deepEqual(
		updateGroups.list().map(g => g.id),
		['123@g.us', '456@g.us']
	);
	assert.match(
		(await call(true, 'adicionar', 'Duplicado')).content,
		/"success":false/
	);
	assert.match(
		(await call(true, 'adicionar', '457@g.us')).content,
		/"success":false/
	);
	assert.equal(updateGroups.list().length, 2);
	assert.match((await call(true, 'listar')).content, /Outro/);
	assert.match((await call(true, 'remover', '456@g.us')).content, /"success":true/);
	assert.match((await call(true, 'remover')).content, /"success":true/);
	assert.deepEqual(updateGroups.list(), []);
	assert.equal(sends.length, 0);
	assert.ok(replies.every(p => p.chatId === '123@g.us'));
	const scope = {
		chatId: '123@g.us',
		boundaryId: 'boundary',
		boundaryName: 'kozz-zapo',
		personIds: new Set(),
		messageIds: new Set(),
	};
	assert.throws(
		() =>
			inChatScope(scope, () =>
				socket.emit('ask_resource', {
					responder: { type: 'Boundary', id: 'boundary' },
					request: { id: 'bad', resource: 'all_groups' },
				})
			),
		/restrito ao chat/
	);
	assert.equal(
		inChatScope({ ...scope, updateGroupsControl: true }, () =>
			socket.emit('send_message', { chatId: '456@g.us', boundaryId: 'boundary' })
		),
		false
	);
});
