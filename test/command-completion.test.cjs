const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const load = (relative, mocks) => {
	const file = path.resolve(__dirname, '../dist', relative),
		exports = {};
	const local = createRequire(file);
	vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
		exports,
		process,
		console,
		Promise,
		require: name => (Object.hasOwn(mocks, name) ? mocks[name] : local(name)),
	});
	return exports;
};
const tick = () => new Promise(resolve => setImmediate(resolve));

test('help finishes only after all help resources settle and the final reply is emitted', async () => {
	const { startHelpInstance } = load('Handlers/Help/index.js', {
		'kozz-module-maker': {
			createMethod: (name, func) => ({ [name]: func }),
			createModule: options => options,
		},
	});
	const pending = [],
		replies = [];
	let finished = false;
	const work = startHelpInstance()
		.commands.methods.default({
			ask: {
				gateway: async () => ({ response: [{ name: 'video' }, { name: 'audio' }] }),
				handler: () =>
					new Promise((resolve, reject) => pending.push({ resolve, reject })),
			},
			reply: body => replies.push(body),
		})
		.then(() => {
			finished = true;
		});
	await tick();
	assert.equal(finished, false);
	assert.equal(pending.length, 2);
	pending[0].resolve({ response: '!video LINK' });
	await tick();
	assert.equal(finished, false);
	assert.equal(replies.length, 0);
	pending[1].reject(new Error('Unavailable help'));
	await work;
	assert.equal(finished, true);
	assert.match(replies[0], /!video LINK/);
});

test('premium middleware awaits the final charge, propagates failure to its reply, and does not charge rejected commands', async () => {
	let release,
		started,
		chargeCount = 0,
		failCharge = false;
	const gate = new Promise(resolve => {
		release = resolve;
	});
	const start = new Promise(resolve => {
		started = resolve;
	});
	const { usePremiumCommand } = load('Middlewares/Coins.js', {
		'../../dist/API/Firebase': {},
		'../../dist/API/CoinsApi': {
			assertUserExists: async () => ({ userExists: true }),
			getUserData: async () => ({ coins: 100, premiumValidUntil: 0 }),
			spendCoins: async () => {
				chargeCount++;
				started();
				await gate;
				if (failCharge) throw new Error('Cobrança de teste recusada');
			},
		},
	});
	const replies = [];
	const requester = {
		message: { contact: { id: '11@lid' } },
		reply: value => replies.push(value),
	};
	let completed = false;
	const work = usePremiumCommand(
		10,
		async () => {},
		'Sem moedas'
	)(requester, {}).then(() => {
		completed = true;
	});
	await start;
	await tick();
	assert.equal(completed, false);
	release();
	await work;
	assert.equal(completed, true);
	await usePremiumCommand(10, async () => false, 'Sem moedas')(requester, {});
	assert.equal(chargeCount, 1);
	failCharge = true;
	await usePremiumCommand(10, async () => {}, 'Sem moedas')(requester, {});
	assert.match(replies.at(-1), /Cobrança de teste recusada/);
});

test('command feedback keeps final responses after progress and reports media without bytes or source URLs', () => {
	const {
		inChatScope,
		guardModuleSocket,
	} = require('../dist/Services/ChatCommands/scope');
	const socket = { emit: () => true };
	guardModuleSocket(socket);
	const scope = {
		chatId: '123@g.us',
		boundaryId: 'b',
		boundaryName: 'kozz-zapo',
		personIds: new Set(),
		messageIds: new Set(['request']),
		replies: [],
		outputs: [],
	};
	inChatScope(scope, () => {
		for (let index = 0; index < 10; index++)
			socket.emit('reply_with_text', {
				chatId: '123@g.us',
				boundaryId: 'b',
				quoteId: 'request',
				body: `Progresso ${index}`,
			});
		socket.emit('reply_with_text', {
			chatId: '123@g.us',
			boundaryId: 'b',
			quoteId: 'request',
			body: 'Resultado final confirmado',
		});
		socket.emit('reply_with_media', {
			chatId: '123@g.us',
			boundaryId: 'b',
			quoteId: 'request',
			body: '',
			media: {
				data: 'https://cdn.example.com/video?token=PRIVATE',
				transportType: 'url',
				mimeType: 'video/mp4',
				duration: 3,
				sizeInBytes: 50,
			},
		});
	});
	assert.equal(scope.replies.length, 8);
	assert.equal(scope.replies.at(-1), 'Resultado final confirmado');
	assert.equal(scope.outputs.at(-1).type, 'media');
	assert.equal(scope.outputs.at(-1).media.mimeType, 'video/mp4');
	assert.doesNotMatch(
		JSON.stringify(scope.outputs),
		/PRIVATE|cdn\.example|transportType/
	);
});
