const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const {
	createGroupSettingsStore,
} = require('../dist/Services/PeriodicStatus/groups');

test('group settings persist, reject corruption and do not expose mutable cached state', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autostatus-'));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const store = createGroupSettingsStore(dir);
	assert.deepEqual(store.load(), { enabled: false, groups: [] });
	assert.throws(() => store.save({ enabled: true, groups: [] }));
	const settings = { enabled: true, groups: [{ id: '123@g.us', name: 'Grupo' }] };
	store.save(settings);
	settings.groups.length = 0;
	assert.equal(store.load().groups.length, 1);
	assert.deepEqual(createGroupSettingsStore(dir).load(), store.load());
	assert.equal(fs.statSync(path.join(dir, 'groups.json')).mode & 0o777, 0o600);
	fs.writeFileSync(path.join(dir, 'groups.json'), '{}');
	assert.throws(() => createGroupSettingsStore(dir).load());
	assert.equal(fs.readFileSync(path.join(dir, 'groups.json'), 'utf8'), '{}');
});

test('private controls select current groups, search, start, stop and reject unauthorized chats', async () => {
	const owner = '5511000000000@s.whatsapp.net';
	let saved = { enabled: false, groups: [] },
		captured,
		runtime;
	let groups = [
		{ id: '123@g.us', name: 'Café' },
		{ id: '456@g.us', name: 'Outro' },
	];
	const replies = [],
		socket = new EventEmitter();
	socket.connected = true;
	socket.onAnyOutgoing = () => {};
	socket.offAnyOutgoing = () => {};
	const original = Module._load;
	const text = c => (Array.isArray(c) ? c.map(text).join('') : (c ?? ''));
	Module._load = function (request, parent, isMain) {
		if (request === 'kozz-module-maker')
			return {
				Line: ({ children }) => text(children) + '\n',
				Bold: ({ children }) => text(children),
				createMethod: (name, callback) => ({ [name]: callback }),
				createModule: options => {
					captured = options;
					runtime = {
						socket,
						ask: { boundary: async () => ({ response: groups }) },
						resources: { upsertResource: () => runtime },
					};
					return runtime;
				},
			};
		if (request.endsWith('/Services/AutoTramonta/store'))
			return { createAutoStore: () => ({ load: () => ({ ownerIds: [owner] }) }) };
		if (request.endsWith('/Services/PeriodicStatus/groups'))
			return {
				periodicGroups: {
					load: () => structuredClone(saved),
					save: value => {
						saved = structuredClone(value);
					},
				},
			};
		return original.call(this, request, parent, isMain);
	};
	try {
		require('../dist/Handlers/AutoStatus').startAutoStatusHandler();
		const reply = body => replies.push({ body });
		reply.withButtons = (body, options) => {
			assert.ok(options.buttons.length <= 3);
			for (const b of options.buttons) assert.ok(b.label.length <= 20);
			replies.push({ body, ...options });
		};
		const run = (method, immediateArg = '', patch = {}) =>
			captured.commands.methods[method]({
				reply,
				rawCommand: { immediateArg },
				message: {
					boundaryName: 'kozz-zapo',
					fromHostAccount: true,
					chatId: owner,
					...patch,
				},
			});
		for (const patch of [
			{ fromHostAccount: false },
			{ chatId: '123@g.us' },
			{ chatId: '777@lid' },
			{ boundaryName: 'ai-test-zapo' },
		])
			await run('iniciar', '', patch);
		assert.equal(replies.length, 0);
		await run('iniciar');
		assert.equal(saved.enabled, false);
		assert.match(replies.at(-1).body, /pelo menos um/);
		await run('buscar', 'cafe');
		assert.match(replies.at(-1).body, /Café/);
		assert.equal(
			replies.at(-1).buttons[0].command,
			'!autostatus adicionar 123@g.us'
		);
		await run('adicionar', '123@g.us');
		await run('adicionar', '123@g.us');
		assert.equal(saved.groups.length, 1);
		await run('adicionar', '999@g.us');
		assert.equal(saved.groups.length, 1);
		await run('iniciar');
		assert.equal(saved.enabled, true);
		await run('parar');
		assert.equal(saved.enabled, false);
		assert.equal(saved.groups.length, 1);
		await run('iniciar');
		groups = [];
		await run('adicionar', '456@g.us');
		assert.equal(saved.groups.length, 1);
		await run('selecionados');
		assert.match(replies.at(-1).body, /Café/);
		await run('remover', '123@g.us');
		assert.deepEqual(saved, { enabled: false, groups: [] });
		for (const method of ['default', 'status', 'agenda', 'help', 'fallback'])
			await run(method);
		await run('pagina', '-1');
		assert.match(replies.at(-1).body, /NUMERO/);
	} finally {
		Module._load = original;
	}
});
