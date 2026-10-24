const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const maker = require('kozz-module-maker');

function fixture(t, { introduced = true } = {}) {
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kozz-mute-'));
 const file = path.join(dir, 'muted.json');
 fs.writeFileSync(file, '{"muted":[]}');
 t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
 let now = Date.UTC(2026, 9, 19, 12);
 class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
 }
 const cache = new Map();
 const requests = new WeakMap();
 const timers = new Set();
 const { ProxyRegistry } = require('../../../framework/kozz-gw/dist/Proxies');
 const registry = new ProxyRegistry();
 const setTimer = (callback, delay) => {
  const timer = { callback, due: now + delay, unref() {} }; timers.add(timer); return timer;
 };
 function mockModule(options) {
  const listeners = new Map(), emitted = [];
  const socket = {
   on(event, fn) { const callbacks = listeners.get(event) || []; callbacks.push(fn); listeners.set(event, callbacks); return socket; },
   emit(event, payload) {
    emitted.push({ event, payload });
    if (event === 'request_proxy') registry.createProxy({ requestedBy: options.name, namespace: 'default', payload });
    if (event === 'revoke_proxy') registry.revokeProxy({ namespace: 'default', payload });
    return socket;
   },
   receive(event, payload) {
    if (event === 'introduction_ack' && payload?.success) registry.markSubscriberConnected(options.name, 'default');
    if (event === 'disconnect') registry.markSubscriberDisconnected(options.name, 'default');
    return Promise.all((listeners.get(event) || []).map(fn => fn(payload)));
   },
   emitted,
  };
  const instance = { ...options, socket, resources: { upsertResource: (name, fn) => { instance[name] = fn; return instance; } } };
  return instance;
 }
 const root = path.resolve(__dirname, '../dist');
 function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const local = createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
   module, exports: module.exports, process, console, Error, Date: Clock, setTimeout: setTimer, clearTimeout: timer => timers.delete(timer),
   require: name => {
    if (name === 'fs') return { ...fs, readFileSync: (p, ...args) => fs.readFileSync(p === './src/Proxies/Mute/muted.json' ? file : p, ...args), writeFileSync: (p, ...args) => fs.writeFileSync(p === './src/Proxies/Mute/muted.json' ? file : p, ...args) };
    if (name === 'kozz-module-maker') return { ...maker, createModule: mockModule };
    if (name === 'kozz-module-maker/dist/Message') {
     const original = local(name);
     return { ...original, createMessageObject: (...args) => requests.get(args[1]) ?? original.createMessageObject(...args) };
    }
    const resolved = local.resolve(name);
    return resolved.startsWith(root + path.sep) ? load(resolved) : local(name);
   },
  }, { filename });
  return module.exports;
 }
 let config = load(path.join(root, 'Proxies/Mute/index.js')).startMuteHandler();
 if (introduced) config.socket.receive('introduction_ack', { success: true });
 const middleware = load(path.join(root, 'Proxies/Mute/middleware/useMute.js')).useMute;
 const user = { id: '5511999990000@s.whatsapp.net' };
 const lid = { id: '123456789@lid' };
 const other = { id: '5511888880000@s.whatsapp.net' };
 function request({ host = true, chat = 'a@g.us', boundary = 'kozz-zapo', contact = user, tagged = [user], mapping = true } = {}) {
  const replies = [], sends = [], queries = [];
  let deletes = 0;
  return {
   message: { boundaryId: 'actual-boundary', boundaryName: boundary, fromHostAccount: host, from: contact.id, contact, chatId: chat, to: chat, taggedContacts: tagged, delete: async () => { deletes++; } },
   reply: async body => replies.push(body),
   sendMessage: async (...args) => sends.push(args),
   ask: { boundary: async (...args) => { queries.push(args); return { response: mapping ? { jid: user.id, lid: lid.id } : undefined }; } },
   replies, sends, queries, get deletes() { return deletes; },
  };
 }
 return {
  get db() { return load(path.join(root, 'Proxies/Mute/mutedDB.js')); }, get config() { return config; },
  middleware, user, lid, other, request, registry, now: () => now,
  advance(ms) {
   now += ms;
   for (const timer of [...timers]) if (timer.due <= now) { timers.delete(timer); timer.callback(); }
  },
  receive(req) { requests.set(req.message, req); return config.socket.receive('proxied_message', req.message); },
  command: (name, req, args = {}) => config.commands.methods[name].func(req, args),
  records: () => JSON.parse(fs.readFileSync(file)).muted,
  restart() {
   config.socket.receive('disconnect'); cache.clear();
   config = load(path.join(root, 'Proxies/Mute/index.js')).startMuteHandler();
   return config;
  },
 };
}

test('only the host may mute, extend or revoke; private chats and missing mentions are rejected', async t => {
 const f = fixture(t);
 for (const action of ['default', 'extend', 'unmute']) {
  const req = f.request({ host: false }); await f.command(action, req);
  assert.match(req.replies[0], /Apenas o dono/);
 }
 const privateReq = f.request({ chat: f.user.id }); await f.command('default', privateReq);
 assert.match(privateReq.replies[0], /grupos/);
 const noTags = f.request({ tagged: [] }); await f.command('default', noTags);
 assert.match(noTags.replies[0], /Marque/);
 assert.equal(f.records().length, 0);
});

test('bare !mute defaults to five minutes and applies only to the mentioned user in the current group', async t => {
 const f = fixture(t), req = f.request(); await f.command('default', req);
 assert.equal(f.db.getMuteRegister(f.user, 'a@g.us').expiration, f.now() + 300_000);
 assert.equal(f.db.getMuteRegister(f.user, 'a@g.us').reason, 'Não informado');
 assert.equal(f.db.isUserMutted(f.user, 'b@g.us'), false);
 assert.equal(f.db.isUserMutted(f.other, 'a@g.us'), false);
 assert.equal(f.db.isUserMutted(f.lid, 'a@g.us'), true);
 assert.equal(req.queries[0][0], 'actual-boundary');
 f.advance(300_000); assert.equal(f.db.isUserMutted(f.user, 'a@g.us'), false);
});

test('optional reason and time work independently; invalid durations leave storage unchanged', async t => {
 const f = fixture(t);
 for (const time of [0, -1, NaN, Infinity, 1e20]) {
  const req = f.request(); await f.command('default', req, { time });
  assert.match(req.replies[0], /tempo válido/);
 }
 assert.equal(f.records().length, 0);
 await f.command('default', f.request(), { reason: 'spam' });
 assert.equal(f.db.getMuteRegister(f.user, 'a@g.us').reason, 'spam');
 await f.command('default', f.request({ chat: 'b@g.us' }), { time: 10 });
 assert.equal(f.db.getMuteRegister(f.user, 'b@g.us').expiration, f.now() + 600_000);
});

test('extension adds to remaining time and revoke affects only the selected group, including LID aliases', async t => {
 const f = fixture(t);
 await f.command('default', f.request(), { reason: 'spam' });
 await f.command('default', f.request({ chat: 'b@g.us' }));
 f.advance(60_000);
 await f.command('extend', f.request({ tagged: [f.lid] }), { time: 2 });
 const mute = f.db.getMuteRegister(f.user, 'a@g.us');
 assert.equal(mute.expiration, f.now() + 360_000); assert.equal(mute.reason, 'spam');
 await f.command('unmute', f.request({ tagged: [f.lid] }));
 assert.equal(f.db.isUserMutted(f.user, 'a@g.us'), false);
 assert.equal(f.db.isUserMutted(f.user, 'b@g.us'), true);
 const req = f.request(); await f.command('extend', req);
 assert.match(req.replies[0], /não está silenciado/);
});

test('proxy deletes every muted message but emits at most one template notice per user/group/minute', async t => {
 const f = fixture(t); await f.command('default', f.request(), { reason: 'spam' });
 const messages = Array.from({ length: 10 }, (_, i) => f.request({ host: false, contact: i % 2 ? f.lid : f.user }));
 await Promise.all(messages.map(req => f.receive(req)));
 assert.equal(messages.reduce((sum, req) => sum + req.sends.length, 0), 1);
 assert.equal(messages.reduce((sum, req) => sum + req.deletes, 0), 10);
 assert.equal(messages[0].sends[0][0], 'a@g.us');
 assert.match(messages[0].sends[0][1], /você está silenciado do grupo até .*Motivo: spam/);
 f.advance(59_999); const early = f.request(); await f.receive(early); assert.equal(early.sends.length, 0);
 f.advance(1); const next = f.request(); await f.receive(next); assert.equal(next.sends.length, 1);
 for (const options of [{ chat: 'b@g.us' }, { chat: f.user.id }, { contact: f.other, mapping: false }]) {
  const req = f.request(options); await f.receive(req); assert.equal(req.sends.length, 0); assert.equal(req.deletes, 0);
 }
});

test('revoke/reapply and extension do not reset the notification cooldown', async t => {
 const f = fixture(t); await f.command('default', f.request());
 await f.receive(f.request());
 await f.command('extend', f.request());
 const extended = f.request(); await f.receive(extended); assert.equal(extended.sends.length, 0);
 await f.command('unmute', f.request()); await f.command('default', f.request());
 const reapplied = f.request(); await f.receive(reapplied); assert.equal(reapplied.sends.length, 0);
});

test('proxy discovers mappings for existing records and keeps their per-group history', async t => {
 const f = fixture(t); f.db.mutePerson(f.lid, 'a@g.us', 'legacy', 300_000);
 const req = f.request({ contact: f.user }); await f.receive(req);
 assert.equal(req.deletes, 1); assert.equal(f.db.isUserMutted(f.user, 'a@g.us'), true);
 assert.equal(req.queries[0][0], 'actual-boundary');
});

test('registration includes current boundaries, aliases and help; middleware uses the same group scope', async t => {
 const f = fixture(t);
 assert.equal(f.config.commands.boundariesToHandle.includes('*'), true);
 assert.equal(f.config.proxy, undefined);
 assert.equal(f.config.commands.aliases.find(a => a.name === 'unmute').target.method, 'unmute');
 assert.equal(f.config.commands.aliases.find(a => a.name === 'mutemais').target.method, 'extend');
 assert.match(f.config.help(), /5 minutos/);
 await f.command('default', f.request());
 const blocked = { message: f.request({ host: false }).message, module: 'test' };
 assert.equal(f.middleware(blocked).namedArgs.abort, true);
 const otherChat = { message: f.request({ host: false, chat: 'b@g.us' }).message, module: 'test' };
 assert.equal(f.middleware(otherChat).namedArgs, undefined);
 const hostRevoke = { message: f.request().message, module: 'mute' };
 assert.equal(f.middleware(hostRevoke).namedArgs, undefined);
});

test('simultaneous changes preserve both groups and notification budgets are independent', async t => {
 const f = fixture(t);
 await Promise.all([
  f.command('default', f.request()),
  f.command('default', f.request({ chat: 'b@g.us' })),
 ]);
 f.db.mutePerson(f.other, 'a@g.us', 'other', 300_000);
 for (const options of [{}, { chat: 'b@g.us' }, { contact: f.other }]) {
  const req = f.request(options); await f.receive(req);
  assert.equal(req.sends.length, 1); assert.equal(req.deletes, 1);
 }
 assert.equal(f.records().find(person => person.id === f.user.id).mutes.length, 2);
});

test('chatId takes precedence over to and deletion still runs if notification fails', async t => {
 const f = fixture(t), command = f.request(); command.message.to = f.user.id;
 await f.command('default', command);
 const req = f.request(); req.message.to = f.user.id;
 req.sendMessage = async () => { throw new Error('Test send failure'); };
 const original = console.error;
 const errors = []; console.error = (...args) => errors.push(args);
 try { await f.receive(req); } finally { console.error = original; }
 assert.equal(req.deletes, 1); assert.equal(errors.length, 1);
 const duplicate = f.request(); await f.receive(duplicate);
 assert.equal(duplicate.sends.length, 0);
 f.advance(300_000);
 const expired = f.request(); await f.receive(expired);
 assert.equal(expired.deletes, 0); assert.equal(expired.sends.length, 0);
});

test('command registers the exact boundary/group with the real gateway registry', async t => {
 const f = fixture(t);
 const boundary = 'another-whatsapp-connection';
 f.registry.markBoundaryConnected(boundary, 'default');
 await f.command('default', f.request({ boundary }));
 const subscription = f.registry.getSubscriptionsForMessage(boundary, 'a@g.us', 'default')[0];
 assert.equal(subscription.status, 'active');
 assert.equal(subscription.subscriber, 'mute');
 assert.equal(subscription.source.boundary, boundary);
 assert.deepEqual([...subscription.source.chats], ['a@g.us']);
 assert.equal(f.records()[0].mutes[0].boundaryName, boundary);
 assert.equal(f.registry.getSubscriptionsForMessage(boundary, 'b@g.us', 'default').length, 0);
 assert.equal(f.registry.getSubscriptionsForMessage('kozz-zapo', 'a@g.us', 'default').length, 0);
 assert.equal(f.registry.getSubscriptionsForMessage(boundary, 'a@g.us', 'other-namespace').length, 0);
 // Exercise the actual message-object creation and its outbound socket payloads.
 await f.config.socket.receive('proxied_message', { ...f.request({ host: false, boundary }).message, id: 'incoming-test' });
 assert.equal(f.config.socket.emitted.filter(e => e.event === 'send_message').length, 1);
 assert.equal(f.config.socket.emitted.filter(e => e.event === 'delete_message').length, 1);
 f.registry.markBoundaryDisconnected(boundary, 'default');
 assert.equal(f.registry.getSubscriptionsForMessage(boundary, 'a@g.us', 'default').length, 0);
 f.registry.markBoundaryConnected(boundary, 'default');
 assert.equal(f.registry.getSubscriptionsForMessage(boundary, 'a@g.us', 'default').length, 1);
});

test('subscriptions wait for introduction and restore from disk after restart and reconnect', async t => {
 const f = fixture(t, { introduced: false });
 const sources = [{ boundary: 'wa-one', chat: 'a@g.us' }, { boundary: 'wa-two', chat: 'b@g.us' }];
 for (const source of sources) {
  f.registry.markBoundaryConnected(source.boundary, 'default');
  await f.command('default', f.request(source));
 }
 assert.equal(f.config.socket.emitted.filter(e => e.event === 'request_proxy').length, 0);
 await f.config.socket.receive('introduction_ack', { success: false });
 assert.equal(f.config.socket.emitted.length, 0);
 await f.config.socket.receive('introduction_ack', { success: true });
 assert.equal(f.registry.getAllSubscriptions().length, 2);
 const restarted = f.restart();
 assert.equal(restarted.socket.emitted.length, 0);
 await restarted.socket.receive('introduction_ack', { success: true });
 for (const source of sources) assert.equal(f.registry.getSubscriptionsForMessage(source.boundary, source.chat).length, 1);
 await restarted.socket.receive('disconnect');
 // Simulate gateway loss of all registry state.
 f.registry.revokeProxy({ payload: { subscriber: 'mute' } });
 await restarted.socket.receive('introduction_ack', { success: true });
 assert.equal(f.registry.getAllSubscriptions().length, 2);
 assert.equal(restarted.socket.emitted.filter(e => e.event === 'request_proxy').length, 4);
});

test('subscription lasts until the last user is unmuted or expires; extension reschedules expiry', async t => {
 const f = fixture(t), boundary = 'wa-one';
 f.registry.markBoundaryConnected(boundary);
 await f.command('default', f.request({ boundary }));
 await f.command('default', f.request({ boundary, tagged: [f.other], mapping: false }));
 assert.equal(f.config.socket.emitted.filter(e => e.event === 'request_proxy').length, 1);
 await f.command('unmute', f.request({ boundary }));
 assert.equal(f.registry.getAllSubscriptions().length, 1);
 await f.command('extend', f.request({ boundary, tagged: [f.other], mapping: false }), { time: 5 });
 f.advance(300_000);
 assert.equal(f.registry.getAllSubscriptions().length, 1);
 f.advance(300_000);
 assert.equal(f.registry.getAllSubscriptions().length, 0);
 await f.command('default', f.request({ boundary }));
 await f.command('unmute', f.request({ boundary }));
 assert.equal(f.registry.getAllSubscriptions().length, 0);
});

test('restart discards expired routes and old wildcard subscriptions', async t => {
 const f = fixture(t);
 f.registry.createProxy({ requestedBy: 'mute', payload: { source: { boundary: 'old-wa', chats: '*' } } });
 await f.command('default', f.request({ boundary: 'new-wa' }));
 await f.config.socket.receive('disconnect');
 f.advance(300_000);
 const restarted = f.restart();
 await restarted.socket.receive('introduction_ack', { success: true });
 assert.equal(f.registry.getAllSubscriptions().length, 0);
});
