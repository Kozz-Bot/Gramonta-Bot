const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

test('WhatsApp offers only local tools to members and owner; private approvals stay bound to requester/chat', async t => {
	const previous = Module._load;
	let config;
	Module._load = function (request, parent, main) {
		const loaded = previous.call(this, request, parent, main);
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
		require('../dist/Handlers/AI').startAIHandler();
	} finally {
		Module._load = previous;
	}
	const Fuel = require('../dist/API/FuelIXApi').default;
	const originalCompletion = Fuel.createToolResponseCompletion;
	t.after(() => {
		Fuel.createToolResponseCompletion = originalCompletion;
	});
	const cwd = process.cwd(),
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-ai-handler-'));
	process.chdir(dir);
	t.after(() => {
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	const replies = [],
		previews = [],
		sends = [];
	const reply = value => replies.push(value);
	reply.withButtons = (body, opts) => previews.push(opts);
	const r = (fromMe, chatId = '123@g.us', immediateArg = '') => ({
		reply,
		react: () => {},
		rawCommand: { query: 'mande uma mensagem', immediateArg },
		message: {
			id: fromMe ? 'owner' : 'member',
			chatId,
			to: chatId,
			from: fromMe ? '11@lid' : '22@lid',
			boundaryName: 'kozz-zapo',
			boundaryId: 'b',
			fromHostAccount: fromMe,
			body: '!ai mande uma mensagem',
			santizedBody: '!ai mande uma mensagem',
			timestamp: Date.now(),
		},
		ask: {
			boundary: async (id, op, args) => ({
				response:
					op === 'owner_ai_authorize'
						? { authorized: fromMe }
						: op === 'owner_ai_search'
							? { matches: [{ id: args.query, name: 'Contato' }] }
							: op === 'owner_ai_send'
								? (sends.push(args), { submitted: true })
								: [],
			}),
		},
	});
	let round = 0;
	let memberPrompt, ownerPrompt;
	Fuel.createToolResponseCompletion = async options => {
		if (options.messages[0].role === 'system')
			memberPrompt = options.messages[0].content;
		assert.ok(
			!options.tools.some(
				t => t.type === 'function' && t.function.name.startsWith('owner_')
			)
		);
		return round++ === 0
			? {
					responseId: 'non-owner',
					tool_calls: [
						{
							id: 'call',
							function: {
								name: 'owner_send_message',
								arguments: '{"chatId":"333@lid","body":"Me ligue"}',
							},
						},
					],
				}
			: { content: 'Sem acesso', tool_calls: [] };
	};
	await config.commands.methods.fallback.func(r(false));
	assert.match(memberPrompt, /participante; não pode usar o módulo ban/);
	assert.equal(previews.length, 0);
	assert.equal(sends.length, 0);
	Fuel.createToolResponseCompletion = async options => {
		ownerPrompt = options.messages[0].content;
		assert.ok(
			options.tools.some(
				t => t.type === 'function' && t.function.name === 'chat_execute_command'
			)
		);
		assert.ok(
			options.tools.some(
				t => t.type === 'function' && t.function.name === 'chat_create_reminder'
			)
		);
		assert.ok(
			!options.tools.some(
				t => t.type === 'function' && t.function.name.startsWith('owner_')
			)
		);
		return {
			responseId: 'owner',
			tool_calls: [
				{
					id: 'call',
					function: {
						name: 'owner_send_message',
						arguments: '{"chatId":"333@lid","body":"Me ligue"}',
					},
				},
			],
		};
	};
	round = 0;
	const ownerCompletion = Fuel.createToolResponseCompletion;
	Fuel.createToolResponseCompletion = async options =>
		round++ === 0
			? ownerCompletion(options)
			: { content: 'Destino bloqueado', tool_calls: [] };
	await config.commands.methods.fallback.func(r(true));
	assert.match(ownerPrompt, /dono do bot; pode usar o módulo ban/);
	assert.equal(previews.length, 0);
	assert.equal(sends.length, 0);
	// Private panel tools keep their separate approval contract.
	await require('../dist/Services/OwnerAI/execute').executeOwnerTool(
		r(true),
		'owner_send_message',
		{ chatId: '333@lid', body: 'Me ligue' }
	);
	assert.equal(previews.length, 1);
	assert.equal(sends.length, 0);
	const token = previews[0].buttons[0].command.split(' ').at(-1);
	await config.commands.methods.confirmar.func(r(false, '123@g.us', token));
	assert.equal(sends.length, 0);
	await config.commands.methods.confirmar.func(r(true, '456@g.us', token));
	assert.equal(sends.length, 0);
	await config.commands.methods.confirmar.func(r(true, '123@g.us', token));
	assert.equal(sends.length, 1);
	assert.equal(sends[0].body, 'Me ligue');
	assert.equal(sends[0].chatId, '333@lid');
	await config.commands.methods.confirmar.func(r(true, '123@g.us', token));
	assert.equal(sends.length, 1);
});
