const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const {
	createReminderStore,
	parseDuration,
	parseReminder,
	consolidatePeople,
} = require('../dist/Handlers/Lembrete/store');
const { createReminderRunner } = require('../dist/Handlers/Lembrete/scheduler');
const owner = {
	id: '111@s.whatsapp.net',
	aliases: ['111@s.whatsapp.net', '11@lid'],
};
const ana = { id: '222@s.whatsapp.net', aliases: ['222@s.whatsapp.net', '22@lid'] };
const joao = { id: '333@s.whatsapp.net', aliases: ['333@s.whatsapp.net', '33@lid'] };
const setup = t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lembrete-'));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const store = createReminderStore(dir),
		created = Date.now();
	const make = patch =>
		store.create({
			boundary: 'kozz-zapo',
			chatId: '123@g.us',
			chatName: 'Amigos',
			text: 'Falar com fulano',
			owner,
			created,
			due: created + 60000,
			recipients: [ana, joao],
			private: true,
			...patch,
		});
	return { dir, store, make, created };
};
test('time is a variable parameter with s/m/h/d and compound values; flags preserve text and identify the requested people', () => {
	assert.equal(parseDuration('3h'), 10800000);
	assert.equal(parseDuration('10m'), 600000);
	assert.equal(parseDuration('2d'), 172800000);
	assert.equal(parseDuration('1h30m'), 5400000);
	assert.equal(parseDuration('30S'), 30000);
	for (const value of [
		'0h',
		'-3h',
		'amanhã',
		'h',
		'3',
		'5s',
		'366d',
		'999999999999999999d',
	])
		assert.throws(() => parseDuration(value));
	const r = parseReminder('1h30m falar com Fulano --pessoas @22 @33 --privado');
	assert.equal(r.duration, 5400000);
	assert.equal(r.text, 'falar com Fulano');
	assert.equal(r.private, true);
	assert.deepEqual(r.peopleTokens, ['22', '33']);
	assert.equal(parseReminder('10m beber água').private, false);
	assert.deepEqual(
		parseReminder('30s reunião --privado --pessoas @22').peopleTokens,
		['22']
	);
	for (const input of [
		'3h',
		'3h --privado',
		'3h teste --privado false',
		'3h teste --todo',
		'3h teste --privado --privado',
		'3h teste --pessoas Ana',
	])
		assert.throws(() => parseReminder(input));
	assert.equal(
		consolidatePeople([ana, { id: '22@lid', aliases: ['22@lid'] }]).length,
		1
	);
});
test('reminders persist, isolate chats, let only the creator/host change people/private mode, and cancel before dispatch', t => {
	const { store, dir, make } = setup(t),
		r = make();
	assert.deepEqual(
		r.deliveries.map(d => d.chatId),
		['123@g.us', ana.id, joao.id]
	);
	assert.equal(fs.statSync(path.join(dir, 'reminders.json')).mode & 0o777, 0o600);
	assert.equal(createReminderStore(dir).get('kozz-zapo', r.chatId, r.id).due, r.due);
	assert.throws(() => store.get('kozz-zapo', '456@g.us', r.id));
	assert.throws(() => store.get('other', r.chatId, r.id));
	assert.throws(() =>
		store.change('kozz-zapo', r.chatId, r.id, ana, false, { cancel: true })
	);
	const changed = store.change(
		'kozz-zapo',
		r.chatId,
		r.id,
		{ id: '11@lid', aliases: ['11@lid'] },
		false,
		{ recipients: [joao], private: false }
	);
	assert.equal(changed.deliveries.length, 1);
	assert.deepEqual(changed.recipients, [joao]);
	const enabled = store.change('kozz-zapo', r.chatId, r.id, ana, true, {
		private: true,
	});
	assert.deepEqual(
		enabled.deliveries.map(d => d.chatId),
		[r.chatId, joao.id]
	);
	store.change('kozz-zapo', r.chatId, r.id, owner, false, { cancel: true });
	assert.equal(store.due(r.due).length, 0);
	assert.throws(() =>
		store.change('kozz-zapo', r.chatId, r.id, owner, false, { private: false })
	);
	fs.writeFileSync(path.join(dir, 'reminders.json'), '{}');
	assert.throws(() => createReminderStore(dir));
	assert.equal(fs.readFileSync(path.join(dir, 'reminders.json'), 'utf8'), '{}');
});
test('runner sends origin plus each private message, records partial failures separately and never repeats them', async t => {
	const { store, make } = setup(t),
		r = make(),
		calls = [];
	const tick = createReminderRunner({
		store,
		ready: async () => true,
		allowed: () => true,
		send: async (reminder, delivery) => {
			calls.push(delivery.chatId);
			if (delivery.chatId === ana.id) throw Error('timeout');
			return { submitted: true };
		},
	});
	await tick(r.due - 1);
	assert.equal(calls.length, 0);
	await tick(r.due);
	assert.deepEqual(calls, [r.chatId, ana.id, joao.id]);
	const result = store.get(r.boundary, r.chatId, r.id);
	assert.equal(result.status, 'complete');
	assert.deepEqual(
		result.deliveries.map(d => d.state),
		['submitted', 'uncertain', 'submitted']
	);
	await tick(r.due + 60000);
	assert.equal(calls.length, 3);
});
test('runner defers offline/disabled reminders, rechecks cancellation after awaits, and does not run concurrent ticks', async t => {
	const { store, make } = setup(t),
		r = make({ private: false });
	let online = false,
		allowed = true,
		calls = 0;
	const tick = createReminderRunner({
		store,
		ready: async () => online,
		allowed: () => allowed,
		send: async () => {
			calls++;
			return { submitted: true };
		},
	});
	await tick(r.due);
	assert.equal(calls, 0);
	online = true;
	allowed = false;
	await tick(r.due);
	assert.equal(calls, 0);
	allowed = true;
	await tick(r.due + 10000);
	assert.equal(calls, 1);
	const r2 = make({ private: false });
	const cancelled = createReminderRunner({
		store,
		ready: async () => {
			store.change(r2.boundary, r2.chatId, r2.id, owner, false, { cancel: true });
			return true;
		},
		allowed: () => true,
		send: async () => assert.fail('Cancelled while waiting'),
	});
	await cancelled(r2.due);
	const r3 = make({ private: false });
	let release;
	const gate = new Promise(resolve => {
		release = resolve;
	});
	const serial = createReminderRunner({
		store,
		ready: async () => true,
		allowed: () => true,
		send: async () => {
			calls++;
			await gate;
			return { submitted: true };
		},
	});
	const first = serial(r3.due);
	await new Promise(resolve => setImmediate(resolve));
	await serial(r3.due);
	release();
	await first;
	assert.equal(calls, 2);
});
test('a restart never resends a destination that was in flight but still processes the remaining recipients', async t => {
	const { store, make, dir } = setup(t),
		r = make();
	r.status = 'dispatching';
	r.deliveries[0].state = 'sending';
	store.put(r);
	const recovered = createReminderStore(dir),
		calls = [];
	const tick = createReminderRunner({
		store: recovered,
		ready: async () => true,
		allowed: () => true,
		send: async (_, delivery) => {
			calls.push(delivery.chatId);
			return { submitted: true };
		},
	});
	await tick(r.due);
	assert.deepEqual(calls, [ana.id, joao.id]);
	assert.equal(
		recovered.get(r.boundary, r.chatId, r.id).deliveries[0].state,
		'uncertain'
	);
});
test('handler parses real command text and mentions, supports list changes/private flag, and rejects untrusted or nonmember targets', async t => {
	const { store } = setup(t),
		replies = [],
		requests = [];
	let options, runtime;
	const originalLoad = Module._load,
		interval = global.setInterval;
	const text = x => (Array.isArray(x) ? x.map(text).join('') : (x ?? ''));
	global.setInterval = () => ({ unref() {} });
	Module._load = function (request, parent, isMain) {
		if (request === 'kozz-module-maker')
			return {
				Line: ({ children }) => text(children) + '\n',
				Bold: ({ children }) => text(children),
				createMethod: (name, fn) => ({ [name]: fn }),
				createModule: config => {
					options = config;
					runtime = {
						socket: {
							connected: true,
							on() {},
							onAnyOutgoing() {},
							offAnyOutgoing() {},
							removeAllListeners() {},
						},
						ask: {
							boundary: async (boundary, resource, args) => {
								requests.push([boundary, resource, args]);
								const mapping = {
									'111@s.whatsapp.net': { lid: '11@lid' },
									'22@lid': { jid: ana.id },
									'33@lid': { jid: joao.id },
								};
								return {
									response:
										resource === 'group_chat_info'
											? {
													participants: [
														{ id: '11@lid' },
														{ id: '22@lid' },
														{ id: '33@lid' },
													],
												}
											: mapping[args.id] || {},
								};
							},
						},
						resources: { upsertResource: () => runtime },
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
		require('../dist/Handlers/Lembrete').startLembreteHandler();
		const run = (method, body, patch = {}) =>
			options.commands.methods[method]({
				reply: body => replies.push(body),
				message: {
					body,
					chatId: '123@g.us',
					boundaryName: 'kozz-zapo',
					boundaryId: 'old-socket-id',
					from: owner.id,
					fromHostAccount: false,
					taggedContacts: [{ id: '22@lid' }, { id: '33@lid' }],
					...patch,
				},
				rawCommand: {},
			});
		await run(
			'fallback',
			'!lembrete 1h30m falar com Fulano --pessoas @22 @33 --privado'
		);
		const r = store.list('kozz-zapo', '123@g.us')[0];
		assert.equal(r.text, 'falar com Fulano');
		assert.equal(r.due - r.created, 5400000);
		assert.deepEqual(
			r.recipients.map(p => p.id),
			[ana.id, joao.id]
		);
		assert.equal(r.private, true);
		assert.ok(requests.every(row => row[0] === 'kozz-zapo'));
		await run('privado', `!lembrete privado ${r.id} off`);
		assert.equal(store.get(r.boundary, r.chatId, r.id).private, false);
		await run('pessoas', `!lembrete pessoas ${r.id} @33`);
		assert.deepEqual(
			store.get(r.boundary, r.chatId, r.id).recipients.map(p => p.id),
			[joao.id]
		);
		await run('cancelar', `!lembrete cancelar ${r.id}`, { from: '22@lid' });
		assert.match(replies.at(-1), /Somente/);
		await run('fallback', '!lembrete 10m fazer algo --pessoas @44 --privado', {
			taggedContacts: [],
		});
		assert.match(replies.at(-1), /Selecione/);
		await run('fallback', '!lembrete 10m fazer algo --pessoas @44 --privado', {
			taggedContacts: [{ id: '44@lid' }],
		});
		assert.match(replies.at(-1), /precisam estar neste grupo/);
		await run('fallback', '!lembrete 10m falar no privado', {
			chatId: owner.id,
			taggedContacts: [],
		});
		assert.equal(store.list('kozz-zapo', owner.id)[0].deliveries.length, 1);
		await run('fallback', '!lembrete 10m falar --privado', {
			chatId: owner.id,
			taggedContacts: [],
		});
		assert.match(replies.at(-1), /Use --privado em um grupo/);
		await run('cancelar', `!lembrete cancelar ${r.id}`);
		assert.equal(store.get(r.boundary, r.chatId, r.id).status, 'cancelled');
	} finally {
		Module._load = originalLoad;
		global.setInterval = interval;
	}
});
