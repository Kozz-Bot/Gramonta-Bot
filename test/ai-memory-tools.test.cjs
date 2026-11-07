const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const {
	executeMemoryTool,
	registerMemoryEvidence,
	initialMemoryContext,
} = require('../dist/Services/AiMemory/execute');
const {
	memoryStore,
	closeMemoryStores,
} = require('../dist/Services/AiMemory/store');
const { bindPanelOrigin } = require('../dist/Services/OwnerAI/control');
const fixture = t => {
	const cwd = process.cwd(),
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-tools-'));
	process.chdir(dir);
	t.after(() => {
		closeMemoryStores();
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	const members = [
		{ id: '11@lid', name: 'Ana', aliases: ['11@lid', '111@s.whatsapp.net'] },
		{ id: '22@lid', name: 'João', aliases: ['22@lid', '222@s.whatsapp.net'] },
		{ id: '33@lid', name: 'Pedro', aliases: ['33@lid'] },
	];
	const requester = (patch = {}) => ({
		message: {
			id: 'request',
			body: '!ai guarda que prefiro pizza sem cebola',
			timestamp: Date.now(),
			boundaryId: 'b',
			boundaryName: 'kozz-zapo',
			namespace: 'default',
			chatId: '123@g.us',
			to: '123@g.us',
			from: '11@lid',
			contact: { id: '11@lid', publicName: 'Ana' },
			fromHostAccount: false,
			taggedContacts: [],
			groupName: 'Grupo A',
			...patch,
		},
		rawCommand: { query: 'guarda que prefiro pizza sem cebola' },
		react() {},
		reply() {},
		ask: {
			boundary: async (_boundary, name) => ({
				response: name === 'group_members' ? { matches: members } : [],
			}),
		},
	});
	return { requester, members };
};
const create = {
	subjectType: 'person',
	personId: '',
	topic: 'comida.preferida',
	text: 'Prefere pizza sem cebola',
	sourceMessageId: 'request',
};
const readResult = result => JSON.parse(result.content).result;
const scope = { namespace: 'default', boundary: 'kozz-zapo', chatId: '123@g.us' };
test('tools create/read/search/update/delete immediately for members and initial recall never crosses chats', async t => {
	const f = fixture(t),
		r = f.requester();
	const made = readResult(await executeMemoryTool(r, 'chat_memory_create', create));
	assert.equal(made.created, true);
	assert.equal(made.memory.subjectId, '111@s.whatsapp.net');
	assert.equal(made.memory.attribution, 'self_reported');
	const found = readResult(
		await executeMemoryTool(r, 'chat_memory_search', {
			query: 'pizza',
			subjectType: 'person',
			personId: '11@lid',
			limit: 10,
			offset: 0,
		})
	);
	assert.equal(found.total, 1);
	assert.equal(found.memories[0].canEdit, true);
	assert.match(initialMemoryContext(r, 'comida'), /pizza sem cebola/);
	const foreign = f.requester({ id: 'other', chatId: '456@g.us', to: '456@g.us' });
	assert.ok(!initialMemoryContext(foreign, 'pizza').includes('pizza sem cebola'));
	await assert.rejects(
		executeMemoryTool(foreign, 'chat_memory_get', { id: made.memory.id }),
		/não encontrada/
	);
	const changed = readResult(
		await executeMemoryTool(
			f.requester({ id: 'correction', body: '!ai agora prefiro sushi' }),
			'chat_memory_update',
			{
				id: made.memory.id,
				revision: 1,
				text: 'Agora prefere sushi',
				sourceMessageId: 'correction',
			}
		)
	);
	assert.equal(changed.memory.revision, 2);
	assert.match(changed.memory.text, /sushi/);
	assert.equal(
		readResult(
			await executeMemoryTool(r, 'chat_memory_delete', {
				id: made.memory.id,
				revision: 2,
			})
		).deleted,
		true
	);
	assert.equal(memoryStore().search(scope).total, 0);
});
test('evidence binds to original author/message, verifies group people and refuses forged destination/privilege/source', async t => {
	const f = fixture(t),
		r = f.requester();
	registerMemoryEvidence(r, [
		{
			id: 'joao-fact',
			chatId: '123@g.us',
			from: '22@lid',
			body: 'Eu prefiro café sem açúcar',
			timestamp: Date.now(),
		},
	]);
	const m = readResult(
		await executeMemoryTool(r, 'chat_memory_create', {
			...create,
			personId: '222@s.whatsapp.net',
			text: 'Prefere café sem açúcar',
			sourceMessageId: 'joao-fact',
		})
	).memory;
	assert.equal(m.source.authorId, '22@lid');
	assert.equal(m.source.messageId, 'joao-fact');
	assert.equal(m.attribution, 'self_reported');
	for (const key of ['chatId', 'boundaryId', 'fromHostAccount', 'actorId'])
		await assert.rejects(
			executeMemoryTool(r, 'chat_memory_create', { ...create, [key]: '456@g.us' }),
			/parâmetros extras/
		);
	await assert.rejects(
		executeMemoryTool(r, 'chat_memory_create', {
			...create,
			sourceMessageId: 'invented',
		}),
		/fonte/
	);
	await assert.rejects(
		executeMemoryTool(r, 'chat_memory_create', { ...create, personId: '99@lid' }),
		/participantes/
	);
	registerMemoryEvidence(r, [
		{ id: 'foreign', chatId: '456@g.us', from: '22@lid', body: 'segredo' },
	]);
	await assert.rejects(
		executeMemoryTool(r, 'chat_memory_create', {
			...create,
			sourceMessageId: 'foreign',
		}),
		/fonte/
	);
	const outsider = f.requester({ from: '33@lid', contact: { id: '33@lid' } });
	await assert.rejects(
		executeMemoryTool(outsider, 'chat_memory_delete', { id: m.id, revision: 1 }),
		/Somente/
	);
	const subject = f.requester({ from: '22@lid', contact: { id: '22@lid' } });
	const selfOnly = readResult(
		await executeMemoryTool(subject, 'chat_memory_search', {
			query: '',
			subjectType: 'person',
			personId: '',
			limit: 20,
			offset: 0,
		})
	);
	assert.equal(selfOnly.total, 1);
	assert.equal(selfOnly.memories[0].id, m.id);
	assert.equal(
		readResult(await executeMemoryTool(subject, 'chat_memory_get', { id: m.id }))
			.canDelete,
		true
	);
	assert.equal(
		readResult(
			await executeMemoryTool(subject, 'chat_memory_delete', {
				id: m.id,
				revision: 1,
			})
		).deleted,
		true
	);
	const panel = f.requester();
	bindPanelOrigin(panel, 'web');
	await assert.rejects(
		executeMemoryTool(panel, 'chat_memory_search', {
			query: '',
			subjectType: 'all',
			personId: '',
			limit: 10,
			offset: 0,
		}),
		/chat original/
	);
});
test('group memories are scoped to the current group; private memory is isolated and cannot invent groups/contacts', async t => {
	const f = fixture(t),
		r = f.requester();
	const group = readResult(
		await executeMemoryTool(r, 'chat_memory_create', {
			...create,
			subjectType: 'group',
			topic: 'encontro',
			text: 'O encontro habitual é na quinta',
		})
	);
	assert.equal(group.memory.subjectId, '123@g.us');
	const privateRequest = f.requester({ chatId: '11@lid', to: '11@lid' });
	await assert.rejects(
		executeMemoryTool(privateRequest, 'chat_memory_create', {
			...create,
			subjectType: 'group',
		}),
		/este grupo/
	);
	assert.equal(
		readResult(await executeMemoryTool(privateRequest, 'chat_memory_create', create))
			.created,
		true
	);
	assert.equal(
		readResult(
			await executeMemoryTool(privateRequest, 'chat_memory_search', {
				query: '',
				subjectType: 'all',
				personId: '',
				limit: 20,
				offset: 0,
			})
		).total,
		1
	);
	await assert.rejects(
		executeMemoryTool(privateRequest, 'chat_memory_create', {
			...create,
			personId: '99@lid',
		}),
		/participantes/
	);
});
test('actual AI runner exposes CRUD, learns automatically from context and recalls it on the next invocation without confirmation', async t => {
	const f = fixture(t);
	let config;
	const originalLoad = Module._load,
		file = require.resolve('../dist/Handlers/AI'),
		cached = require.cache[file];
	delete require.cache[file];
	Module._load = function (request, parent, main) {
		const loaded = originalLoad.call(this, request, parent, main);
		if (request === 'kozz-module-maker')
			return {
				...loaded,
				createModule: options => {
					config = options;
					const runtime = { resources: { upsertResource: () => runtime } };
					return runtime;
				},
			};
		return loaded;
	};
	try {
		require(file).startAIHandler();
	} finally {
		Module._load = originalLoad;
		if (cached) require.cache[file] = cached;
		else delete require.cache[file];
	}
	const Fuel = require('../dist/API/FuelIXApi').default,
		previous = Fuel.createToolResponseCompletion;
	t.after(() => {
		Fuel.createToolResponseCompletion = previous;
	});
	const r = f.requester({
		id: 'casual',
		body: '!ai sugere um jantar, eu prefiro pizza sem cebola',
	});
	r.rawCommand.query = 'sugere um jantar, eu prefiro pizza sem cebola';
	const replies = [];
	r.reply = text => replies.push(text);
	r.reply.withButtons = () => assert.fail('Memory must not ask confirmation');
	let round = 0;
	Fuel.createToolResponseCompletion = async options => {
		assert.ok(options.tools.some(t => t.function?.name === 'chat_memory_create'));
		assert.ok(!options.tools.some(t => t.function?.name?.startsWith('owner_')));
		if (round++ === 0)
			return {
				responseId: 'save',
				tool_calls: [
					{
						id: 'save-call',
						function: {
							name: 'chat_memory_create',
							arguments: JSON.stringify({ ...create, sourceMessageId: 'casual' }),
						},
					},
				],
			};
		const output = JSON.parse(options.messages.find(m => m.role === 'tool').content);
		assert.equal(output.success, true);
		assert.equal(output.result.created, true);
		return {
			content: 'Sugiro pizza sem cebola e guardei sua preferência.',
			tool_calls: [],
		};
	};
	await config.commands.methods.fallback.func(r);
	assert.match(replies.at(-1), /guardei/);
	assert.equal(memoryStore().search(scope).total, 1);
	Fuel.createToolResponseCompletion = async options => {
		const remembered = options.messages.find(
			m =>
				typeof m.content === 'string' &&
				m.content.startsWith('Memórias persistentes')
		);
		assert.match(remembered.content, /Prefere pizza sem cebola/);
		assert.match(options.messages[0].content, /automaticamente/);
		return { content: 'Você prefere pizza sem cebola.', tool_calls: [] };
	};
	const later = f.requester({
		id: 'later',
		body: '!ai qual minha preferência de comida?',
	});
	later.rawCommand.query = 'qual minha preferência de comida?';
	later.reply = text => replies.push(text);
	await config.commands.methods.fallback.func(later);
	assert.match(replies.at(-1), /prefere pizza/);
});
