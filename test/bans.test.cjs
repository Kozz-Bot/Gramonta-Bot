const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
	botBans,
	createBanStore,
	normalizeBanId,
} = require('../dist/Services/Bans/store');
const { useBans } = require('../dist/Middlewares/Bans');
const { onCommand } = require('kozz-module-maker/dist/Socket/Events/Handle/Command');

test('permanent bans block real command execution across chats and aliases, persist and revoke', async t => {
	const cwd = process.cwd();
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kozz-bans-'));
	process.chdir(dir);
	t.after(() => {
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	const number = '5511999990000@s.whatsapp.net';
	const lid = '123456789@lid';
	const other = '5511888880000@s.whatsapp.net';
	botBans.ban('+55 (11) 99999-0000', [lid], 'teste');
	assert.equal(createBanStore().isBanned([lid]), true);
	assert.equal(fs.statSync('.runtime/access/bans.json').mode & 0o777, 0o600);
	let calls = 0;
	const emissions = [];
	const socket = { on() {}, emit: (...args) => emissions.push(args) };
	const execute = onCommand(
		socket,
		{
			default: {
				args: {},
				func: async () => {
					calls++;
				},
			},
		},
		[useBans],
		'ping',
		'',
		['*']
	);
	const command = (id, chat, aliases = []) => ({
		module: 'ping',
		method: 'default',
		boundaryName: 'kozz-zapo',
		boundaryId: 'boundary',
		namedArgs: {},
		message: {
			id: 'test',
			boundaryId: 'boundary',
			boundaryName: 'kozz-zapo',
			contact: { id, aliases },
			from: id,
			to: chat,
			chatId: chat,
		},
	});
	for (const chat of ['one@g.us', 'two@g.us', number]) {
		await execute(command(number, chat));
		await execute(command(lid, chat));
		await execute(command('5511999990000:4@s.whatsapp.net', chat));
		await execute(command(other, chat, [lid]));
	}
	assert.equal(calls, 0);
	assert.equal(emissions.length, 0);
	await execute(command(other, 'one@g.us'));
	assert.equal(calls, 1);
	// A new runtime reads the same list. Revocation takes effect without restart.
	createBanStore().unban(lid);
	await execute(command(number, 'one@g.us'));
	assert.equal(calls, 2);
	assert.equal(botBans.isBanned([lid]), false);
	assert.equal(normalizeBanId(lid), lid);
	assert.throws(() => normalizeBanId('one@g.us'));
	assert.throws(() => botBans.ban('not a number', [], 'invalid'));
	// Corrupt state must not silently permit banned users.
	fs.writeFileSync('.runtime/access/bans.json', '{');
	assert.throws(() => useBans(command(number, 'one@g.us')));
});

test('ban/unban handlers and AI preserve owner identity, reason and real outcomes', async t => {
	const Module = require('node:module');
	const { EventEmitter } = require('node:events');
	const maker = require('kozz-module-maker');
	const {
		createAskResource,
	} = require('kozz-module-maker/dist/Message/RoutineCreation/AskResource');
	const { registerOwnerAiModule } = require('../dist/Services/OwnerAI/modules');
	const { executeChatTool } = require('../dist/Services/ChatCommands/execute');
	const { commandOutcome } = require('../dist/Services/OwnerAI/contracts');
	const cwd = process.cwd();
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kozz-ban-ai-'));
	process.chdir(dir);
	t.after(() => {
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	const owner = '5511888880000@s.whatsapp.net';
	const target = '5511999990000@s.whatsapp.net';
	const lid = '123456789@lid';
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
	const replies = [];
	socket.on('reply_with_text', p => replies.push(p));
	socket.on('ask_resource', p => {
		let response = {};
		if (p.request.resource === 'group_members')
			response = {
				matches: [
					{ id: owner, name: 'Dono', aliases: [owner] },
					{ id: target, name: 'Pessoa', aliases: [target, lid] },
				],
			};
		if (p.request.resource === 'lid_from_jid') response = { lid };
		if (p.request.resource === 'jid_from_lid') response = { jid: target };
		if (p.request.resource === 'contact_info')
			response = { id: p.request.data.id, publicName: 'Pessoa' };
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
							[useBans],
							config.name,
							'',
							['*']
						),
						resources: { upsertResource: () => runtime },
						config,
					};
					return runtime;
				},
			};
		return originalLoad.call(this, name, parent, main);
	};
	try {
		require('../dist/Handlers/Ban').startBanHandler();
	} finally {
		Module._load = originalLoad;
	}
	registerOwnerAiModule(runtime);
	registerOwnerAiModule({ name: 'ai', commandMethods: {}, socket });
	const request = host => ({
		message: {
			id: 'request',
			body: '!ai',
			namespace: 'default',
			boundaryId: 'boundary',
			boundaryName: 'kozz-zapo',
			from: owner,
			contact: { id: owner },
			chatId: '123@g.us',
			to: '123@g.us',
			taggedContacts: [],
			fromHostAccount: host,
		},
		ask: createAskResource(socket, {
			requester: { id: 'ai', type: 'Handler', namespace: 'default' },
		}),
	});
	const direct = async (
		host,
		args,
		tagged = [{ id: target }],
		method = 'default'
	) => {
		const command = {
			module: 'ban',
			method,
			namedArgs: args,
			boundaryName: 'kozz-zapo',
			boundaryId: 'boundary',
			message: { ...request(host).message, taggedContacts: tagged },
		};
		await runtime.executeCommand(command);
		return commandOutcome(command);
	};
	assert.equal((await direct(false, { reason: 'negado' })).success, false);
	assert.equal(botBans.isBanned([target]), false);
	assert.equal((await direct(true, {})).success, false);
	assert.equal(
		(await direct(true, { reason: 'self' }, [{ id: owner }])).success,
		false
	);
	assert.equal((await direct(true, { reason: 'motivo direto' })).success, true);
	assert.equal(botBans.list()[0].reason, 'motivo direto');
	assert.equal(botBans.isBanned([lid]), true);
	const beforeList = replies.length;
	assert.equal((await direct(false, {}, [], 'list')).success, false);
	assert.doesNotMatch(JSON.stringify(replies.slice(beforeList)), /motivo direto/);
	const beforeOwnerList = replies.length;
	assert.equal((await direct(true, {}, [], 'list')).success, true);
	assert.match(JSON.stringify(replies.slice(beforeOwnerList)), /motivo direto/);
	assert.match(JSON.stringify(replies.slice(beforeOwnerList)), /Desde:/);
	assert.equal(
		runtime.config.commands.aliases.find(a => a.name === 'banlist').target.method,
		'list'
	);
	assert.equal((await direct(true, {}, [{ id: lid }], 'unban')).success, true);
	assert.equal(runtime.config.commands.aliases[0].name, 'unban');
	const aiArgs = {
		module: 'ban',
		method: 'default',
		immediateArg: '',
		namedArgs: JSON.stringify({ targetId: target, reason: 'motivo pela IA' }),
		recipientIds: [],
	};
	await assert.rejects(
		() => executeChatTool(request(false), 'chat_execute_command', aiArgs),
		/não identificou o solicitante.*dono/
	);
	assert.equal(botBans.isBanned([target]), false);
	const publicCatalog = await executeChatTool(request(false), 'chat_list_commands', {
		module: 'ban',
	});
	assert.deepEqual(JSON.parse(publicCatalog.content), []);
	const catalog = await executeChatTool(request(true), 'chat_list_commands', {
		module: 'ban',
	});
	assert.equal(JSON.parse(catalog.content)[0].name, 'ban');
	const result = await executeChatTool(
		request(true),
		'chat_execute_command',
		aiArgs
	);
	assert.match(result.content, /"success":true/);
	assert.equal(botBans.list()[0].reason, 'motivo pela IA');
	assert.equal(botBans.isBanned([target, lid]), true);
	const listed = await executeChatTool(request(true), 'chat_execute_command', {
		...aiArgs,
		method: 'list',
		namedArgs: '{}',
	});
	assert.match(listed.content, /"success":true/);
	assert.match(listed.content, /motivo pela IA/);
	await assert.rejects(() =>
		executeChatTool(request(false), 'chat_execute_command', {
			...aiArgs,
			method: 'list',
			namedArgs: '{}',
		})
	);
	const unban = await executeChatTool(request(true), 'chat_execute_command', {
		...aiArgs,
		method: 'unban',
		namedArgs: JSON.stringify({ targetId: lid }),
	});
	assert.match(unban.content, /"success":true/);
	assert.equal(botBans.isBanned([target]), false);
	const beforeEmpty = replies.length;
	assert.equal((await direct(true, {}, [], 'list')).success, true);
	assert.match(JSON.stringify(replies.slice(beforeEmpty)), /Nenhuma pessoa/);
	const invalid = await executeChatTool(request(true), 'chat_execute_command', {
		...aiArgs,
		namedArgs: JSON.stringify({ targetId: target }),
	});
	assert.match(invalid.content, /"success":false/);
	assert.equal(botBans.isBanned([target]), false);
	// Original @mentions used to be silently added alongside targetId, so the
	// real handler rejected even an otherwise valid AI ban as a mixed target.
	const markedRequest = request(true);
	markedRequest.message.taggedContacts = [{ id: lid }];
	const marked = await executeChatTool(
		markedRequest,
		'chat_execute_command',
		aiArgs
	);
	assert.match(marked.content, /"success":true/);
	assert.equal(botBans.isBanned([target, lid]), true);
	const aliasUnban = await executeChatTool(request(true), 'chat_execute_command', {
		...aiArgs,
		module: 'unban',
		method: 'default',
		namedArgs: JSON.stringify({ targetId: lid }),
	});
	assert.match(aliasUnban.content, /"success":true/);
	assert.equal(botBans.isBanned([target]), false);
	await assert.rejects(
		() =>
			executeChatTool(request(true), 'chat_execute_command', {
				...aiArgs,
				recipientIds: [owner],
			}),
		/conflitantes/
	);
	await assert.rejects(
		() =>
			executeChatTool(request(true), 'chat_execute_command', {
				...aiArgs,
				namedArgs: JSON.stringify({ targetId: '5511777770000', reason: 'fora' }),
			}),
		/origem/
	);
	assert.equal(botBans.isBanned([target]), false);
	assert.ok(replies.length > 0);
	assert.ok(replies.every(p => p.chatId === '123@g.us'));
});
