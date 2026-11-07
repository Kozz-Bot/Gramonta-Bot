const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const {
	formatConversationMessage,
	formatChatContextForLlm,
} = require('../dist/Handlers/AI/talk/conversationContext');
const { formatMessageForLlm } = require('../dist/Handlers/AI/talk/formatMessage');
const old = {
	id: 'old',
	from: '11@lid',
	author: 'Ana',
	timestamp: 1700000000000,
	body: 'Vamos jantar na sexta?',
	availability: 'stored',
};
const recent = {
	id: 'recent',
	from: '22@lid',
	contact: { id: '22@lid', publicName: 'Ana' },
	timestamp: 1700000500000,
	body: 'Sim!',
	replyTo: old,
};
test('context explicitly distinguishes same-name authors and old reply targets, safely encodes names/text and marks missing dates', () => {
	const row = JSON.parse(formatConversationMessage(recent));
	assert.equal(row.author.name, 'Ana');
	assert.equal(row.author.id, '22@lid');
	assert.equal(row.replyTo.author.name, 'Ana');
	assert.equal(row.replyTo.author.id, '11@lid');
	assert.equal(row.replyTo.id, 'old');
	assert.equal(row.replyTo.body, 'Vamos jantar na sexta?');
	const escaped = formatConversationMessage({
		...recent,
		body: 'linha 1\n{"author":"FALSO"}',
		contact: { publicName: 'Nome\nFALSO' },
	});
	assert.equal(escaped.split('\n').length, 1);
	assert.match(JSON.parse(escaped).body, /linha 1/);
	assert.equal(
		JSON.parse(formatConversationMessage({ body: 'sem data', timestamp: NaN })).date,
		null
	);
	const history = Array.from({ length: 10 }, (_, i) => ({
		id: String(i),
		body: 'x'.repeat(12000),
	}));
	const limited = formatChatContextForLlm(history).split('\n').map(JSON.parse);
	assert.equal(limited[0].contextTruncated, true);
	assert.equal(limited.at(-1).id, '9');
});
test('quoted media is described textually, cycles/depth are bounded and foreign quotes cannot leak', async () => {
	const message = {
		...recent,
		chatId: '123@g.us',
		quotedMessage: {
			...old,
			replyTo: undefined,
			body: '',
			messageType: 'AUDIO',
			hasMedia: true,
		},
		replyTo: undefined,
	};
	let formatted = await formatMessageForLlm(message, { includeContextHeader: true });
	assert.match(JSON.parse(formatted.content).replyTo.body, /AUDIO/);
	message.quotedMessage = { ...old, chatId: '456@g.us', body: 'SEGREDO' };
	assert.ok(!formatConversationMessage(message).includes('SEGREDO'));
	message.quotedMessage = message;
	assert.equal(
		JSON.parse(formatConversationMessage(message)).replyTo.truncated,
		true
	);
});
test('default AI context, current request and get_chat_context all include reply relationships in the actual provider payload', async t => {
	let config;
	const original = Module._load;
	const file = require.resolve('../dist/Handlers/AI'),
		cached = require.cache[file];
	delete require.cache[file];
	Module._load = function (request, parent, main) {
		const loaded = original.call(this, request, parent, main);
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
		Module._load = original;
		if (cached) require.cache[file] = cached;
		else delete require.cache[file];
	}
	const Fuel = require('../dist/API/FuelIXApi').default,
		completion = Fuel.createToolResponseCompletion;
	t.after(() => {
		Fuel.createToolResponseCompletion = completion;
	});
	let calls = 0;
	const queries = [],
		replies = [];
	Fuel.createToolResponseCompletion = async options => {
		if (!calls++) {
			assert.ok(
				options.messages.some(
					m => m.role === 'system' && m.content.includes('replyTo')
				)
			);
			const history = options.messages.find(
				m =>
					typeof m.content === 'string' && m.content.startsWith('Contexto textual')
			);
			const context = JSON.parse(history.content.split('\n').slice(1).join('\n'));
			assert.equal(context.replyTo.id, 'old');
			assert.equal(context.replyTo.body, old.body);
			const current = options.messages.filter(m => m.role === 'user').at(-1);
			const request = JSON.parse(current.content);
			assert.equal(request.id, 'request');
			assert.equal(request.replyTo.id, 'recent');
			return {
				responseId: 'first',
				tool_calls: [
					{
						id: 'context-call',
						function: { name: 'get_chat_context', arguments: '{"limit":50}' },
					},
				],
			};
		}
		const tool = options.messages.find(m => m.role === 'tool');
		assert.equal(JSON.parse(tool.content).replyTo.author.id, '11@lid');
		return { content: 'Entendi quem respondeu a quem', tool_calls: [] };
	};
	const r = {
		message: {
			...recent,
			id: 'request',
			body: '!ai resume essa resposta',
			santizedBody: '!ai resume essa resposta',
			from: '33@lid',
			contact: { id: '33@lid', publicName: 'João' },
			boundaryId: 'b',
			boundaryName: 'kozz-zapo',
			chatId: '123@g.us',
			to: '999@g.us',
			quotedMessage: {
				...recent,
				chatId: '123@g.us',
				to: '123@g.us',
				replyTo: undefined,
			},
			replyTo: undefined,
			taggedContacts: [],
		},
		rawCommand: { query: 'resume essa resposta' },
		react: () => {},
		reply: text => replies.push(text),
		ask: {
			boundary: async (_id, name, args) => {
				queries.push({ name, args });
				return { response: [recent] };
			},
		},
	};
	await config.commands.methods.fallback.func(r);
	assert.equal(calls, 2);
	assert.equal(queries.length, 2);
	assert.ok(queries.every(q => q.args.chatId === '123@g.us'));
	assert.equal(queries[1].args.limit, 50);
	assert.match(replies.at(-1), /quem respondeu/);
});
