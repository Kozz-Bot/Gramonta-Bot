const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
	AutoTramontaEngine,
	defaults,
	validateSettings,
	isSelfControl,
} = require('../dist/Services/AutoTramonta/engine');
const { createAutoStore } = require('../dist/Services/AutoTramonta/store');
const { parseAutoReply } = require('../dist/Services/AutoTramonta/ai');
const {
	AUTO_MARKER,
	HUMAN_RECENT_MS,
	isAutoMessage,
	markAutoMessage,
	stripAutoMarker,
	isOwnerMessage,
} = require('../dist/Services/AutoTramonta/identity');
const { sendAutoText } = require('../dist/Services/AutoTramonta/transport');
const single = text => ({ messages: text ? [{ text }] : [] });

const group = { id: '123@g.us', name: 'Grupo teste' };
const ownerIds = ['5511000000000@s.whatsapp.net', '999@lid'];
const config = (extra = {}) => ({
	...defaults(),
	ownerIds,
	groups: [group],
	enabled: true,
	cadence: [10, 10],
	online: [60, 60],
	offline: [60, 60],
	...extra,
});
function fixture(extra = {}, deps = {}) {
	let now = 1_000_000,
		calls = [],
		sends = [],
		saves = [];
	const generate =
		deps.generate ||
		(async input => {
			calls.push(input);
			return single(
				calls.length === 1 ? 'Ahh tá de boa' : `Pode ser ${calls.length}`
			);
		});
	const engine = new AutoTramontaEngine(config(extra), {
		now: () => now,
		random: () => 0.2,
		persist: value => saves.push(value),
		ready: () => true,
		allowed: () => true,
		send: (chatId, text, quoteMessageId) =>
			sends.push({ chatId, text, quoteMessageId }),
		wait: async () => {},
		...deps,
		generate: async (...args) => {
			const reply = await generate(...args);
			return typeof reply === 'string' ? single(reply) : reply;
		},
	});
	let seq = 0;
	return {
		engine,
		calls,
		sends,
		saves,
		advance: ms => (now += ms),
		message: (extra = {}) =>
			engine.ingest({
				id: `msg-${++seq}`,
				chatId: group.id,
				author: 'Pessoa',
				text: 'Vai ter café?',
				timestamp: now,
				mentioned: false,
				...extra,
			}),
	};
}

test('control only accepts owner self-chat on Gramonta ZAPO, including device JID', () => {
	const base = {
		fromHostAccount: true,
		boundaryName: 'kozz-zapo',
		chatId: ownerIds[0],
	};
	assert.equal(isSelfControl(base, ownerIds), true);
	assert.equal(isSelfControl({ ...base, chatId: '999:4@lid' }, ownerIds), true);
	for (const patch of [
		{ fromHostAccount: false },
		{ chatId: group.id },
		{ chatId: '777@lid' },
		{ boundaryName: 'ai-test-zapo' },
	]) {
		assert.equal(isSelfControl({ ...base, ...patch }, ownerIds), false);
	}
});
test('silence causes no model requests; a new message produces one reply at cadence', async () => {
	const f = fixture();
	await f.engine.tick();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 0);
	f.message();
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 1);
	f.message();
	await f.engine.tick();
	assert.equal(f.sends.length, 2);
	assert.deepEqual(
		f.calls[1].context.filter(x => x.own).map(x => x.text),
		['Ahh tá de boa']
	);
});
test('messages before cadence wait; own messages, commands, old events and duplicates do not trigger', async () => {
	const f = fixture();
	f.message({ own: true, text: markAutoMessage('Resposta automática') });
	f.message({ text: '!ping' });
	f.message({ timestamp: 1 });
	f.message({ chatId: '222@g.us' });
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 0);
	f.message({ id: 'one' });
	f.message({ id: 'one' });
	await f.engine.tick();
	assert.equal(f.calls.length, 1);
	assert.deepEqual(f.calls[0].newMessageIds, ['one']);
	f.message();
	await f.engine.tick();
	assert.equal(f.calls.length, 1);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 2);
});
test('online/offline windows alternate, with no sending during offline', async () => {
	const f = fixture();
	f.advance(60_000);
	await f.engine.tick();
	assert.equal(f.engine.status()[0].phase, 'offline');
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 0);
	f.advance(50_000);
	await f.engine.tick();
	assert.equal(f.engine.status()[0].phase, 'online');
	assert.equal(f.calls.length, 0);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
});
test('mention wakes automatic offline phase at 100%, with normal cadence', async () => {
	const f = fixture({ mentionChance: 100 });
	f.advance(60_000);
	f.message({ mentioned: true });
	assert.equal(f.engine.status()[0].phase, 'online');
	await f.engine.tick();
	assert.equal(f.calls.length, 0);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
});
test('zero probability and nonmention do not wake, and duplicate mention cannot roll again', async () => {
	const zero = fixture({ mentionChance: 0 });
	zero.advance(60_000);
	zero.message({ mentioned: true });
	assert.equal(zero.engine.status()[0].phase, 'offline');
	const normal = fixture({ mentionChance: 100 });
	normal.advance(60_000);
	normal.message();
	assert.equal(normal.engine.status()[0].phase, 'offline');
	let rolls = 0;
	const dup = fixture(
		{ mentionChance: 50 },
		{
			random: () => {
				rolls++;
				return 0.9;
			},
		}
	);
	dup.advance(60_000);
	dup.message({ id: 'same', mentioned: true });
	const afterFirst = rolls;
	dup.message({ id: 'same', mentioned: true });
	assert.equal(rolls, afterFirst);
});
test('manual stop cannot be woken by a mention; starting requires selected groups', async () => {
	const f = fixture({ mentionChance: 100 });
	f.engine.configure({ enabled: false });
	f.message({ mentioned: true });
	f.advance(200_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 0);
	assert.equal(f.engine.status()[0].phase, 'parado');
	assert.throws(() => f.engine.configure({ groups: [], enabled: true }), /grupo/);
});
test('stopping while the model is running aborts and suppresses late output, even after restart', async () => {
	let resolve, signal;
	const f = fixture(
		{},
		{
			generate: (_, s) => {
				signal = s;
				return new Promise(r => {
					resolve = r;
				});
			},
		}
	);
	f.message();
	f.advance(10_000);
	const pending = f.engine.tick();
	assert.ok(resolve);
	f.engine.configure({ enabled: false });
	assert.equal(signal.aborted, true);
	f.engine.configure({ enabled: true });
	resolve('Resposta atrasada');
	await pending;
	assert.equal(f.sends.length, 0);
});
test('model runs serially and messages before the last response cannot cause another reply', async () => {
	let resolve;
	const f = fixture(
		{},
		{
			generate: () =>
				new Promise(r => {
					resolve = r;
				}),
		}
	);
	f.message();
	f.advance(10_000);
	const pending = f.engine.tick();
	f.message();
	await f.engine.tick();
	resolve('Boaaa');
	await pending;
	assert.equal(f.sends.length, 1);
	assert.equal(f.engine.status()[0].pending, 0);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
});
test('model choosing silence evaluates the batch only once', async () => {
	let calls = 0;
	const f = fixture(
		{},
		{
			generate: async () => {
				calls++;
				return '';
			},
		}
	);
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(calls, 1);
	assert.equal(f.sends.length, 0);
});
test('provider failure preserves pending work for next cadence without a busy loop', async () => {
	let calls = 0;
	const f = fixture(
		{},
		{
			generate: async () => {
				if (++calls === 1) throw new Error('fail');
				return 'Boa';
			},
		}
	);
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	assert.match(f.engine.status()[0].lastError, /Falha/);
	await f.engine.tick();
	assert.equal(calls, 1);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	assert.equal(f.engine.status()[0].lastError, undefined);
});
test('offline/disconnected/disabled group checks suppress output, including mid-generation', async () => {
	for (const blocked of [{ ready: () => false }, { allowed: () => false }]) {
		const f = fixture({}, blocked);
		f.message();
		f.advance(10_000);
		await f.engine.tick();
		assert.equal(f.calls.length, 0);
	}
	let ready = true;
	const f = fixture(
		{},
		{
			ready: () => ready,
			generate: async () => {
				ready = false;
				return 'Oi';
			},
		}
	);
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 0);
	const ends = fixture(
		{},
		{
			generate: async () => {
				ends.advance(50_000);
				return 'Oi';
			},
		}
	);
	ends.message();
	ends.advance(10_000);
	await ends.engine.tick();
	assert.equal(ends.sends.length, 0);
});
test('invalid configuration is rejected and a failed write cannot enable runtime', () => {
	for (const patch of [
		{ cadence: [0, 10] },
		{ cadence: [20, 10] },
		{ offline: [60, Infinity] },
		{ mentionChance: 101 },
		{ groups: [{ id: '123@lid', name: 'private' }] },
	]) {
		assert.throws(() => validateSettings(config(patch)));
	}
	const f = fixture(
		{ enabled: false },
		{
			persist: () => {
				throw new Error('disk full');
			},
		}
	);
	assert.throws(() => f.engine.configure({ enabled: true }), /disk full/);
	assert.equal(f.engine.config.enabled, false);
});
test('settings persist privately and malformed state is preserved rather than overwritten', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autotramonta-'));
	try {
		const store = createAutoStore(dir);
		store.save(config({ enabled: false }));
		assert.deepEqual(store.load(), config({ enabled: false }));
		assert.equal(fs.statSync(path.join(dir, 'config.json')).mode & 0o777, 0o600);
		fs.writeFileSync(path.join(dir, 'config.json'), '{broken');
		assert.throws(() => store.load());
		assert.equal(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'), '{broken');
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
test('AI output parser accepts silence/JSON and refuses commands, malformed and oversized output', () => {
	assert.deepEqual(
		parseAutoReply('{"messages":[{"text":"KKKKKkk","quoteMessageId":null}]}'),
		single('KKKKKkk')
	);
	assert.deepEqual(parseAutoReply('```json\n{"messages":[]}\n```'), single(''));
	for (const value of [
		'!ping',
		'{}',
		'{"messages":null}',
		JSON.stringify(single('!autotramonta iniciar')),
		JSON.stringify(single('a'.repeat(401))),
		JSON.stringify(single('\u200B!ping')),
	])
		assert.throws(() => parseAutoReply(value));
});
test('stopping one pending group also prevents generation for every subsequent group', async () => {
	let resolve,
		calls = 0;
	const f = fixture(
		{ groups: [group, { id: '456@g.us', name: 'Outro' }] },
		{
			generate: () => {
				calls++;
				return new Promise(r => {
					resolve = r;
				});
			},
		}
	);
	f.message();
	f.message({ chatId: '456@g.us' });
	f.advance(10_000);
	const pending = f.engine.tick();
	f.engine.configure({ enabled: false });
	resolve('Tarde demais');
	await pending;
	assert.equal(calls, 1);
	assert.equal(f.sends.length, 0);
});
test('changing mention chance keeps an offline group offline and adding a group preserves pending messages', async () => {
	const f = fixture();
	f.advance(60_000);
	await f.engine.tick();
	f.message();
	f.engine.configure({ mentionChance: 100 });
	assert.equal(f.engine.status()[0].phase, 'offline');
	assert.equal(f.engine.status()[0].pending, 1);
	f.engine.configure({ groups: [group, { id: '456@g.us', name: 'Outro' }] });
	assert.equal(f.engine.status()[0].phase, 'offline');
	assert.equal(f.engine.status()[0].pending, 1);
	assert.equal(f.engine.status()[1].phase, 'online');
});
test('automatic sends carry exactly one trailing zero-width space and echoes cannot take over', async () => {
	const f = fixture();
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends[0].text, `Ahh tá de boa${AUTO_MARKER}`);
	assert.equal(
		markAutoMessage(`Oi${AUTO_MARKER}${AUTO_MARKER}`),
		`Oi${AUTO_MARKER}`
	);
	assert.equal(stripAutoMarker(f.sends[0].text), 'Ahh tá de boa');
	assert.equal(isAutoMessage(f.sends[0].text), true);
	f.message({ own: true, text: f.sends[0].text });
	assert.equal(f.engine.status()[0].phase, 'online');
	assert.equal(f.engine.status()[0].humanPaused, false);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 1);
});
test('manual activity pauses only that group, drops pending replies and blocks mention wake', async () => {
	const f = fixture({
		mentionChance: 100,
		groups: [group, { id: '456@g.us', name: 'Outro' }],
	});
	f.message();
	f.message({ own: true, text: 'Deixa que eu respondo' });
	assert.equal(f.engine.config.enabled, true);
	assert.equal(f.engine.status()[0].humanPaused, true);
	assert.equal(f.engine.status()[0].pending, 0);
	assert.equal(f.engine.status()[1].phase, 'online');
	f.message({ mentioned: true });
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 0);
	assert.equal(f.engine.status()[0].phase, 'offline');
	f.message({ chatId: '456@g.us' });
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	assert.equal(f.sends[0].chatId, '456@g.us');
});
test('new manual messages renew the pause; duplicates and old manual events do not', async () => {
	const f = fixture({ offline: [300, 300] });
	f.message({ id: 'human-1', own: true });
	const initial = f.engine.status()[0].until;
	f.advance(20_000);
	f.message({ id: 'human-1', own: true });
	assert.equal(f.engine.status()[0].until, initial);
	f.message({ id: 'human-old', own: true, timestamp: 1 });
	assert.equal(f.engine.status()[0].until, initial);
	f.message({ id: 'human-2', own: true });
	assert.ok(f.engine.status()[0].until > initial);
});
test('manual takeover cancels pending model output even if the provider ignores cancellation', async () => {
	let resolve, signal;
	const f = fixture(
		{},
		{
			generate: (_, s) => {
				signal = s;
				return new Promise(r => {
					resolve = r;
				});
			},
		}
	);
	f.message();
	f.advance(10_000);
	const pending = f.engine.tick();
	f.message({ own: true, text: 'Eu assumo' });
	assert.equal(signal.aborted, true);
	resolve('Resposta tardia');
	await pending;
	assert.equal(f.sends.length, 0);
	assert.equal(f.engine.status()[0].humanPaused, true);
});
test('next online cycle resumes after human pause with fresh peer activity, never while human is recent', async () => {
	const f = fixture({ mentionChance: 100 });
	f.message({ own: true });
	f.advance(60_000);
	f.message({ mentioned: true });
	await f.engine.tick();
	assert.equal(f.engine.status()[0].humanPaused, true);
	assert.equal(f.calls.length, 0);
	f.advance(HUMAN_RECENT_MS - 60_000);
	await f.engine.tick();
	assert.equal(f.engine.status()[0].phase, 'online');
	assert.equal(f.calls.length, 0);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
});
test('no peer activity after manual takeover means no response when the pause expires', async () => {
	const f = fixture();
	f.message();
	f.message({ own: true });
	f.advance(HUMAN_RECENT_MS);
	await f.engine.tick();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.calls.length, 0);
});
test('recent owner history from before process startup also suppresses generation', async () => {
	const f = fixture(
		{},
		{
			generate: async () => {
				f.message({
					id: 'missed-human',
					own: true,
					text: 'Eu já respondi',
					timestamp: 990_000,
				});
				return 'Late output';
			},
		}
	);
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.engine.status()[0].humanPaused, true);
	assert.equal(f.sends.length, 0);
});
test('a marked message from another participant is still peer activity, and owner aliases include devices', async () => {
	const f = fixture();
	f.message({ text: `Oi${AUTO_MARKER}` });
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	assert.equal(f.engine.status()[0].humanPaused, false);
	assert.equal(isOwnerMessage({ from: '999:4@lid' }, ownerIds), true);
	assert.equal(isOwnerMessage({ contact: { id: ownerIds[0] } }, ownerIds), true);
	assert.equal(isOwnerMessage({ fromHostAccount: true }, ownerIds), true);
	assert.equal(isOwnerMessage({ from: '777@lid' }, ownerIds), false);
});
test('model may quote a recent peer message but invented, own and synthetic quote IDs are removed', () => {
	const context = [
		{ id: 'peer', text: 'Bora?', own: false },
		{ id: 'owner', text: 'Oi', own: true },
		{ id: 'synthetic', text: 'Oi', quotable: false },
	];
	const reply = id =>
		parseAutoReply(
			JSON.stringify({ messages: [{ text: 'Bora sim', quoteMessageId: id }] }),
			context
		);
	assert.equal(reply('peer').messages[0].quoteMessageId, 'peer');
	for (const id of ['invented', 'owner', 'synthetic'])
		assert.equal(reply(id).messages[0].quoteMessageId, undefined);
	assert.equal(reply(null).messages[0].quoteMessageId, undefined);
});
test('reply parser rejects oversized bursts and malformed quotes before any partial output', () => {
	for (const messages of [
		Array(4).fill({ text: 'Oi' }),
		[{ text: '' }],
		[{ text: 'Oi', quoteMessageId: 42 }],
		Array(3).fill({ text: 'a'.repeat(300) }),
		[{ text: 'Boa' }, { text: '!ping' }],
	]) {
		assert.throws(() => parseAutoReply(JSON.stringify({ messages })));
	}
});
test('burst preserves message order, quote choice, markers and context with bounded gaps', async () => {
	const gaps = [];
	const f = fixture(
		{},
		{
			generate: async () => ({
				messages: [
					{ text: 'Acho que sim', quoteMessageId: 'question' },
					{ text: 'Mas depende do café' },
					{ text: 'KKKKKkk' },
				],
			}),
			wait: async ms => {
				gaps.push(ms);
			},
		}
	);
	f.message({ id: 'question' });
	f.advance(10_000);
	await f.engine.tick();
	assert.deepEqual(
		f.sends.map(p => stripAutoMarker(p.text)),
		['Acho que sim', 'Mas depende do café', 'KKKKKkk']
	);
	assert.deepEqual(
		f.sends.map(p => p.quoteMessageId),
		['question', undefined, undefined]
	);
	assert.ok(f.sends.every(p => isAutoMessage(p.text)));
	assert.equal(gaps.length, 2);
	assert.ok(gaps.every(ms => ms >= 1200 && ms <= 3500));
	assert.equal(f.engine.status()[0].pending, 0);
	assert.equal(f.engine.status()[0].sent, 3);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 3);
});
test('human takeover between burst parts cancels all remaining messages', async () => {
	const f = fixture(
		{},
		{
			generate: async () => ({
				messages: [{ text: 'Primeiro' }, { text: 'Segundo' }],
			}),
			wait: async (_, signal) => {
				f.message({ own: true, text: 'Eu assumo' });
				assert.equal(signal.aborted, true);
			},
		}
	);
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	assert.equal(f.engine.status()[0].humanPaused, true);
});
test('manual stop and removal of group between burst parts cancel remaining messages', async () => {
	for (const patch of [{ enabled: false }, { enabled: false, groups: [] }]) {
		const f = fixture(
			{},
			{
				generate: async () => ({
					messages: [{ text: 'Primeiro' }, { text: 'Segundo' }],
				}),
				wait: async () => {
					f.engine.configure(patch);
				},
			}
		);
		f.message();
		f.advance(10_000);
		await f.engine.tick();
		assert.equal(f.sends.length, 1);
	}
});
test('offline transition or disconnect during burst suppresses later parts and never repeats the first', async () => {
	for (const mode of ['offline', 'disconnect']) {
		let ready = true;
		const f = fixture(
			{},
			{
				ready: () => ready,
				generate: async () => ({
					messages: [{ text: 'Primeiro' }, { text: 'Segundo' }],
				}),
				wait: async () => {
					if (mode === 'offline') f.advance(50_000);
					else ready = false;
				},
			}
		);
		f.message();
		f.advance(10_000);
		await f.engine.tick();
		assert.equal(f.sends.length, 1);
		ready = true;
		f.advance(10_000);
		await f.engine.tick();
		assert.equal(f.sends.length, 1);
	}
});
test('quoted messages use WhatsApp reply transport with quoteId; plain parts remain normal sends', () => {
	const events = [];
	const socket = {
		connected: true,
		emit: (event, payload) => events.push({ event, payload }),
	};
	sendAutoText(socket, group.id, markAutoMessage('Sim'), 'question');
	sendAutoText(socket, group.id, markAutoMessage('Mas depende'));
	assert.equal(events[0].event, 'reply_with_text');
	assert.equal(events[0].payload.quoteId, 'question');
	assert.equal(events[0].payload.chatId, group.id);
	assert.equal(events[0].payload.boundaryId, 'kozz-zapo');
	assert.equal(events[1].event, 'send_message');
	assert.equal(events[1].payload.quoteId, undefined);
	assert.ok(events.every(e => isAutoMessage(e.payload.body)));
	socket.connected = false;
	assert.throws(() => sendAutoText(socket, group.id, 'Oi', 'question'));
});
test('new unrelated activity cannot cause a second reply to a previously answered message', async () => {
	let round = 0;
	const f = fixture(
		{},
		{
			generate: async input => ({
				respondingToMessageIds: round++ === 0 ? ['question'] : ['question'],
				messages: [
					{
						text: round === 1 ? 'Às oito da noite' : 'O horário é oito',
						quoteMessageId: 'question',
					},
				],
			}),
		}
	);
	f.message({ id: 'question' });
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	f.message({ id: 'unrelated', text: 'Hoje tá chovendo' });
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	assert.equal(f.engine.status()[0].pending, 0);
	assert.equal(f.engine.status()[0].lastError, undefined);
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(round, 2);
});
test('recent own replies survive the context limit; a genuine new follow-up may get a new answer', async () => {
	const inputs = [];
	let round = 0;
	const f = fixture(
		{ online: [600, 600] },
		{
			generate: async input => {
				inputs.push(input);
				round++;
				if (round === 1)
					return {
						respondingToMessageIds: ['question'],
						messages: [{ text: 'Às oito', quoteMessageId: 'question' }],
					};
				if (round === 2)
					return {
						respondingToMessageIds: [input.newMessageIds[0]],
						messages: [{ text: 'Repetindo o horário', quoteMessageId: 'question' }],
					};
				return {
					respondingToMessageIds: ['follow-up'],
					messages: [{ text: 'Na praça da esquina', quoteMessageId: 'follow-up' }],
				};
			},
		}
	);
	f.message({ id: 'question' });
	f.advance(10_000);
	await f.engine.tick();
	for (let i = 0; i < 60; i++)
		f.message({ id: `traffic-${i}`, text: `Outro assunto ${i}` });
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(
		inputs[1].context.some(p => p.own),
		false
	);
	assert.equal(inputs[1].recentReplies[0].text, 'Às oito');
	assert.ok(inputs[1].answeredMessageIds.includes('question'));
	assert.equal(f.sends.length, 1);
	f.message({ id: 'follow-up', text: 'E onde vai ser?' });
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 2);
	assert.equal(f.sends[1].quoteMessageId, 'follow-up');
});
test('literal repeated sentences are suppressed even without quotes or with cosmetic changes', async () => {
	let round = 0;
	const f = fixture(
		{},
		{
			generate: async input => ({
				respondingToMessageIds: input.newMessageIds,
				messages: [
					{ text: round++ ? 'Q CHUVINHA   GOSTOSA!!!' : 'Q chuvinha gostosa 🌧️' },
				],
			}),
		}
	);
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	f.message();
	f.advance(10_000);
	await f.engine.tick();
	assert.equal(f.sends.length, 1);
	assert.equal(f.engine.status()[0].pending, 0);
});
test('production parser requires a new unresolved target and suppresses repeats of recent own history', () => {
	const context = [
		{ id: 'old', own: false },
		{ id: 'new', own: false },
	];
	const plan = ids =>
		JSON.stringify({
			respondingToMessageIds: ids,
			messages: [{ text: 'Uma resposta nova', quoteMessageId: 'new' }],
		});
	for (const ids of [[], ['old'], ['missing']])
		assert.deepEqual(parseAutoReply(plan(ids), context, ['new']), { messages: [] });
	assert.deepEqual(parseAutoReply(plan(['new']), context, ['new'], ['new']), {
		messages: [],
	});
	assert.equal(parseAutoReply(plan(['new']), context, ['new']).messages.length, 1);
	const repeated = JSON.stringify({
		respondingToMessageIds: ['new'],
		messages: [{ text: 'Q chuvinha gostosa 🌧️' }],
	});
	assert.deepEqual(
		parseAutoReply(
			repeated,
			[
				...context,
				{
					id: 'sent',
					own: true,
					text: 'Q chuvinha gostosa 🌧️',
					timestamp: Date.now(),
				},
			],
			['new']
		),
		{ messages: [] }
	);
});
test('provider gets native assistant memory even after own replies leave the main conversation', async () => {
	const axios = require('axios');
	const observability = require('../dist/API/AiObservability');
	const { generateAutoReply } = require('../dist/Services/AutoTramonta/ai');
	const previousPost = axios.post,
		previousLog = observability.logAiUsage,
		previousKey = process.env.FUELIX_API_KEY;
	let payload;
	axios.post = async (_, data) => {
		payload = data;
		return {
			data: {
				choices: [
					{
						message: {
							content: JSON.stringify({
								respondingToMessageIds: ['new'],
								messages: [{ text: 'Uma contribuição diferente' }],
							}),
						},
					},
				],
			},
		};
	};
	observability.logAiUsage = async () => {};
	process.env.FUELIX_API_KEY = 'test-placeholder';
	try {
		const reply = await generateAutoReply(
			{
				chatId: group.id,
				newMessageIds: ['new'],
				answeredMessageIds: ['old', 'outside-context'],
				context: [
					{
						id: 'new',
						author: 'Pessoa',
						text: 'Mas como isso funciona?',
						timestamp: Date.now(),
					},
					{
						id: 'old',
						author: 'Pessoa',
						text: 'Já resolvido',
						timestamp: Date.now() - 10_000,
					},
					{
						id: 'echo',
						author: 'Tramonta',
						own: true,
						text: 'Minha resposta anterior',
						timestamp: Date.now() - 5500,
					},
				],
				recentReplies: [
					{
						id: 'sent',
						author: 'Tramonta',
						own: true,
						text: 'Minha resposta anterior',
						timestamp: Date.now() - 5000,
						respondingToMessageIds: ['old'],
					},
				],
			},
			new AbortController().signal
		);
		assert.equal(reply.messages.length, 1);
		assert.ok(
			payload.messages.some(
				m => m.role === 'assistant' && m.content.includes('Minha resposta anterior')
			)
		);
		const current = JSON.parse(payload.messages.at(-1).content);
		assert.deepEqual(current.answeredMessageIds, ['old']);
		assert.deepEqual(current.newMessageIds, ['new']);
		assert.equal(current.recentReplies[0].text, 'Minha resposta anterior');
		assert.deepEqual(current.recentReplies[0].respondingToMessageIds, ['old']);
	} finally {
		axios.post = previousPost;
		observability.logAiUsage = previousLog;
		if (previousKey === undefined) delete process.env.FUELIX_API_KEY;
		else process.env.FUELIX_API_KEY = previousKey;
	}
});
