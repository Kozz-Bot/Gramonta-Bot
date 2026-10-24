const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, readdir, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStatusRunner, localDateTime, validateSlots } = require('../dist/Services/PeriodicStatus/scheduler');
const { createStatusStore } = require('../dist/Services/PeriodicStatus/store');

const group = { kind: 'group', chatId: '123@g.us' };
const status = { kind: 'status', recipients: ['5511999999999@s.whatsapp.net'] };
const slot = { weekday: 1, time: '08:15', statusId: 'daily', destinations: [status, group] };
const providers = new Map([['daily', () => ({ body: 'Teste' })]]);
const memoryStore = () => {
 const records = new Map();
 const key = record => `${record.date}/${record.destination}/${record.publicationId || ''}`;
 return {
  records,
  async has(date, destination, publicationId) { return records.has(key({ date, destination, publicationId })); },
  async claim(record) { if (records.has(key(record))) return false; records.set(key(record), record); return true; },
  async finish(record) { records.set(key(record), record); },
 };
};
const setup = (overrides = {}) => {
 const sent = [];
 const store = memoryStore();
 const options = { slots: [slot], providers, store, now: () => new Date('2026-10-26T11:15:00Z'), publish: async (content, destination) => sent.push({ content, destination }), ...overrides };
 return { options, sent, store: options.store, tick: createStatusRunner(options) };
};

test('uses Brasília date even when UTC has already moved to the next day', () => {
 assert.deepEqual(localDateTime(new Date('2026-10-27T01:00:00Z')), { date: '2026-10-26', weekday: 1, minute: 22 * 60 });
});

test('publishes at the configured daily time to status and groups, once after recreation', async () => {
 const f = setup();
 await f.tick();
 await f.tick();
 await createStatusRunner(f.options)();
 assert.deepEqual(f.sent.map(send => send.destination.kind), ['status', 'group']);
 assert.ok([...f.store.records.values()].every(record => record.state === 'sent'));
});

test('supports different hours on different weekdays and does not send early or stale posts', async () => {
 for (const timestamp of ['2026-10-26T11:14:59Z', '2026-10-26T11:30:00Z', '2026-10-27T11:15:00Z']) {
  const f = setup({ now: () => new Date(timestamp) });
  await f.tick();
  assert.equal(f.sent.length, 0);
 }
 const f = setup({ slots: [slot, { ...slot, weekday: 2, time: '16:40' }], now: () => new Date('2026-10-27T19:40:00Z') });
 await f.tick();
 assert.equal(f.sent.length, 2);
});

test('recovers a recent delay and waits for readiness before preparing or reserving', async () => {
 let ready = false;
 let prepared = 0;
 const f = setup({
  now: () => new Date('2026-10-26T11:29:59Z'),
  ready: async () => ready,
  providers: new Map([['daily', () => { prepared++; return { body: 'Teste' }; }]]),
 });
 await f.tick();
 assert.equal(prepared, 0);
 assert.equal(f.store.records.size, 0);
 ready = true;
 await f.tick();
 assert.equal(prepared, 1);
 assert.equal(f.sent.length, 2);
});

test('continues other destinations on an ambiguous failure and does not automatically resend', async () => {
 let attempts = 0;
 const f = setup({ publish: async (_, destination) => { attempts++; if (destination.kind === 'status') throw new Error('lost ack'); } });
 await assert.rejects(f.tick(), /1 destino/);
 await createStatusRunner(f.options)();
 assert.equal(attempts, 2);
 assert.deepEqual([...f.store.records.values()].map(record => record.state), ['failed', 'sent']);
});

test('does not claim empty content or late provider results and can retry preparation failures', async () => {
 let now = new Date('2026-10-26T11:15:00Z');
 let body = '';
 const f = setup({ now: () => now, providers: new Map([['daily', () => ({ body })]]) });
 await assert.rejects(f.tick(), /sem conteúdo/);
 assert.equal(f.store.records.size, 0);
 body = 'Pronto';
 await f.tick();
 assert.equal(f.sent.length, 2);
 const late = setup({ now: () => now, providers: new Map([['daily', async () => { now = new Date('2026-10-26T11:30:00Z'); return { body }; }]]) });
 await late.tick();
 assert.equal(late.sent.length, 0);
});

test('serializes overlapping ticks and rejects duplicate/invalid schedule entries', async () => {
 const f = setup();
 await Promise.all([f.tick(), f.tick(), f.tick()]);
 assert.equal(f.sent.length, 2);
 for (const slots of [
  [slot, slot], [{ ...slot, time: '24:00' }], [{ ...slot, weekday: 7 }],
  [{ ...slot, statusId: 'missing' }], [{ ...slot, destinations: [] }],
  [{ ...slot, destinations: [group, group] }],
  [{ ...slot, destinations: [{ kind: 'status', recipients: [] }] }],
  [{ ...slot, destinations: [{ kind: 'group', chatId: '123@lid' }] }],
 ]) assert.throws(() => validateSlots(slots, providers));
 validateSlots([], new Map());
});

test('exclusive durable reservations survive recreation and isolate destination/date', async t => {
 const directory = await mkdtemp(path.join(os.tmpdir(), 'kozz-periodic-status-'));
 t.after(() => rm(directory, { recursive: true, force: true }));
 const record = { date: '2026-10-26', destination: 'status', statusId: 'daily', scheduledTime: '08:15', state: 'sending', updatedAt: new Date().toISOString() };
 const a = createStatusStore(directory);
 const b = createStatusStore(directory);
 assert.deepEqual((await Promise.all([a.claim(record), b.claim(record)])).sort(), [false, true]);
 assert.equal(await b.has(record.date, record.destination), true);
 assert.equal(await b.claim({ ...record, statusId: 'changed-content' }), false);
 await b.finish({ ...record, state: 'sent' });
 const files = await readdir(directory);
 assert.equal(files.length, 1);
 assert.equal(JSON.parse(await readFile(path.join(directory, files[0]), 'utf8')).state, 'sent');
 assert.equal(await b.claim({ ...record, destination: 'group:123@g.us' }), true);
 assert.equal(await b.claim({ ...record, date: '2026-10-27' }), true);
 assert.equal(await b.claim({ ...record, publicationId: 'other@12:00' }), true);
 assert.equal(await a.has(record.date, record.destination, 'other@12:00'), true);
});

test('midnight and a second daily publication both send once, including simultaneous slots', async () => {
 let now = new Date('2026-10-26T03:00:00Z');
 const slots = [{ ...slot, time: '00:00' }, { ...slot, time: '12:00' }];
 const f = setup({ slots, now: () => now });
 await f.tick();
 now = new Date('2026-10-26T15:00:00Z');
 await f.tick();
 await createStatusRunner(f.options)();
 assert.equal(f.sent.length, 4);
 assert.equal(f.store.records.size, 4);
 const simultaneous = setup({
  slots: [slot, { ...slot, statusId: 'other' }],
  providers: new Map([...providers, ['other', () => ({ body: 'other' })]]),
 });
 await simultaneous.tick();
 assert.equal(simultaneous.sent.length, 4);
});
