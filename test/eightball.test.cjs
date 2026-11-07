const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const maker = require('kozz-module-maker');
const { onCommand } = require('kozz-module-maker/dist/Socket/Events/Handle/Command');
const { registerOwnerAiModule } = require('../dist/Services/OwnerAI/modules');
const { executeChatTool } = require('../dist/Services/ChatCommands/execute');

test('8ball dispatches free text, helps on empty input, and runs through AI only in the original chat', async () => {
	const socket = new EventEmitter(),
		replies = [];
	socket.connected = true;
	socket.on('reply_with_text', payload => replies.push(payload));
	const originalLoad = Module._load;
	let runtime;
	Module._load = function (request, parent, main) {
		if (request === 'kozz-module-maker')
			return {
				...maker,
				createModule: options => {
					runtime = {
						name: options.name,
						commandMethods: options.commands.methods,
						socket,
						executeCommand: onCommand(
							socket,
							options.commands.methods,
							[],
							options.name,
							'',
							['*']
						),
						resources: { upsertResource: () => runtime },
					};
					return runtime;
				},
			};
		return originalLoad.call(this, request, parent, main);
	};
	try {
		registerOwnerAiModule(
			require('../dist/Handlers/EightBall').startEightBallHandler()
		);
	} finally {
		Module._load = originalLoad;
	}
	const message = {
		id: 'question',
		from: '111@s.whatsapp.net',
		to: '222@s.whatsapp.net',
		chatId: '222@s.whatsapp.net',
		boundaryId: 'b',
		boundaryName: 'kozz-zapo',
		namespace: 'default',
		body: '!8ball Vou ter sorte hoje?',
		fromHostAccount: false,
	};
	const command = (method, query, immediateArg) => ({
		module: '8ball',
		method,
		query,
		immediateArg,
		namedArgs: {},
		message,
		boundaryId: 'b',
		boundaryName: 'kozz-zapo',
		namespace: 'default',
	});
	await runtime.executeCommand(
		command('Vou', 'Vou ter sorte hoje?', 'ter sorte hoje?')
	);
	assert.match(replies.at(-1).body, /🎱/);
	assert.doesNotMatch(replies.at(-1).body, /Exemplo/);
	await runtime.executeCommand(command('default', '', null));
	assert.match(replies.at(-1).body, /!8ball Vou ter sorte hoje\?/);
	await runtime.executeCommand(command('help', 'help', null));
	assert.match(replies.at(-1).body, /brincadeira/);
	const requester = { message: { ...message, id: 'ai-question' } };
	const args = {
		module: '8ball',
		method: 'default',
		immediateArg: 'Vou ter sorte hoje?',
		namedArgs: '{}',
		recipientIds: [],
	};
	const result = JSON.parse(
		(await executeChatTool(requester, 'chat_execute_command', args)).content
	);
	assert.equal(result.success, true);
	assert.equal(result.status, 'submitted');
	assert.equal(replies.at(-1).chatId, message.chatId);
	assert.equal(replies.at(-1).boundaryId, message.boundaryId);
	assert.equal(replies.at(-1).quoteId, 'ai-question');
	await assert.rejects(
		executeChatTool(requester, 'chat_execute_command', {
			...args,
			chatId: '999@g.us',
		})
	);
	await assert.rejects(
		executeChatTool(requester, 'chat_execute_command', {
			...args,
			immediateArg: '   ',
		}),
		/pergunta/
	);
});
