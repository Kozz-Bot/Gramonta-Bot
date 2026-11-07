const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const originalCwd = process.cwd(),
	testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-panel-suite-'));
process.chdir(testRoot);
after(() => {
	process.chdir(originalCwd);
	fs.rmSync(testRoot, { recursive: true, force: true });
});
const SESSION_MS = 30 * 86400000;
const delegation = (now = Date.now()) => ({
	token: require('node:crypto').randomBytes(32).toString('hex'),
	expiresAt: now + SESSION_MS,
});
const {
	createPanelAuth,
	panelAuth,
	approvePanelBrowser,
} = require('../dist/Services/OwnerPanel/auth');
const { createOwnerPanelApp } = require('../dist/Services/OwnerPanel/server');
const {
	ownerOrigin,
	bindPanelOrigin,
	approvalQueue,
} = require('../dist/Services/OwnerAI/control');
const { registerOwnerAiModule } = require('../dist/Services/OwnerAI/modules');
const { periodicGroups } = require('../dist/Services/PeriodicStatus/groups');
const autoStore = require('../dist/Services/AutoTramonta/store');
const observability = require('../dist/API/AiObservability');
const { setPanelAiRunner } = require('../dist/Services/OwnerPanel/bridge');
const SELF = '11@lid';
const source = (overrides = {}) => ({
	message: {
		id: 'live-phone-id',
		chatId: SELF,
		to: SELF,
		from: SELF,
		fromHostAccount: true,
		boundaryName: 'kozz-zapo',
		boundaryId: 'boundary',
		timestamp: Date.now(),
		body: '!ai painel EXAMPLE',
		santizedBody: '!ai painel example',
		...overrides,
	},
	rawCommand: { query: 'painel EXAMPLE' },
	reply: () => {},
	ask: {
		boundary: async (_id, operation) => ({
			response:
				operation === 'owner_ai_create_session'
					? { authorized: true, ...delegation() }
					: { authorized: true, revoked: true },
		}),
	},
});

test('browser grants require matching origin and browser secret, rotate tokens, expire and revoke', () => {
	let now = Date.now();
	const auth = createPanelAuth(() => now),
		origin = 'https://panel.example';
	const challenge = auth.challenge(origin);
	assert.equal(auth.claim('unknown', origin), undefined);
	assert.equal(auth.claim(challenge.token, origin), undefined);
	assert.equal(
		auth.approve(challenge.code, source(), delegation(now)).origin,
		origin
	);
	assert.equal(auth.approve(challenge.code, source(), delegation(now)), undefined);
	assert.equal(auth.claim(challenge.token, 'https://evil.example'), undefined);
	const grant = auth.claim(challenge.token, origin);
	assert.ok(grant.token !== challenge.token);
	assert.ok(grant.session.csrf !== grant.token);
	assert.equal(auth.claim(challenge.token, origin), undefined);
	assert.equal(auth.get(grant.token, 'https://evil.example'), undefined);
	assert.equal(auth.get(grant.token, origin), grant.session);
	now += SESSION_MS + 1;
	assert.equal(auth.get(grant.token, origin), undefined);
	const expiring = auth.challenge(origin);
	now += 5 * 60000 + 1;
	assert.equal(auth.approve(expiring.code, source()), undefined);
	const next = auth.challenge(origin);
	auth.approve(next.code, source({ timestamp: now }), delegation(now));
	const revoked = auth.claim(next.token, origin);
	auth.revoke(revoked.token);
	assert.equal(auth.get(revoked.token, origin), undefined);
});

test('web approval origin cannot reuse a WhatsApp or different browser pending action', async () => {
	const r = source(),
		second = source();
	const original = ownerOrigin(r);
	bindPanelOrigin(r, 'first');
	bindPanelOrigin(second, 'second');
	const token = approvalQueue.propose(
		'specific-action',
		ownerOrigin(r),
		'preview',
		async () => 'done'
	);
	assert.notEqual(ownerOrigin(r), original);
	assert.equal(
		(await approvalQueue.take(token, original, true, source())).found,
		false
	);
	assert.equal(
		(await approvalQueue.take(token, ownerOrigin(second), true, second)).found,
		false
	);
	assert.equal(
		(await approvalQueue.take(token, ownerOrigin(r), false, r)).cancelled,
		true
	);
});

test('browser authorization refuses members, groups and unrelated boundaries before creating a session', async t => {
	const original = autoStore.createAutoStore;
	autoStore.createAutoStore = () => ({ load: () => ({ ownerIds: [SELF] }) });
	t.after(() => {
		autoStore.createAutoStore = original;
	});
	for (const patch of [
		{ fromHostAccount: false },
		{ chatId: '123@g.us' },
		{ boundaryName: 'ai-test-zapo' },
	]) {
		const challenge = panelAuth.challenge('https://panel.example');
		await approvePanelBrowser(challenge.code, source(patch));
		assert.equal(
			panelAuth.claim(challenge.token, 'https://panel.example'),
			undefined
		);
	}
	const challenge = panelAuth.challenge('https://panel.example');
	assert.match(
		await approvePanelBrowser(challenge.code, source()),
		/Navegador autorizado/
	);
	assert.ok(panelAuth.claim(challenge.token, 'https://panel.example'));
});

test('panel HTTP flow protects data, cookies, CSRF, previews, browser isolation, repeat clicks and logout', async t => {
	const oldStore = autoStore.createAutoStore,
		oldLoad = periodicGroups.load,
		oldSave = periodicGroups.save,
		oldUsage = observability.summarizeAiUsage;
	autoStore.createAutoStore = () => ({ load: () => ({ ownerIds: [SELF] }) });
	periodicGroups.load = () => ({ enabled: false, groups: [] });
	periodicGroups.save = () => {};
	observability.summarizeAiUsage = async () => ({
		totals: { count: 0, errors: 0, totalTokens: 0 },
	});
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-panel-http-')),
		cwd = process.cwd();
	process.chdir(dir);
	const app = createOwnerPanelApp(),
		server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(async () => {
		await new Promise(resolve => server.close(resolve));
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
		autoStore.createAutoStore = oldStore;
		periodicGroups.load = oldLoad;
		periodicGroups.save = oldSave;
		observability.summarizeAiUsage = oldUsage;
	});
	const origin = `https://127.0.0.1:${server.address().port}`,
		base = `http://127.0.0.1:${server.address().port}`;
	const request = async (
		route,
		body,
		cookie = '',
		csrf = '',
		requestOrigin = origin
	) =>
		fetch(base + route, {
			method: body === undefined ? 'GET' : 'POST',
			headers: {
				Cookie: cookie,
				Origin: requestOrigin,
				...(body === undefined
					? {}
					: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	assert.equal((await request('/api/state')).status, 401);
	assert.equal(
		(await request('/api/search', { query: 'João', kind: 'contact' })).status,
		401
	);
	assert.equal(
		(await request('/api/pair', {}, '', '', 'https://evil.example')).status,
		403
	);
	const publicPage = await request('/');
	assert.equal(publicPage.status, 200);
	assert.match(
		publicPage.headers.get('content-security-policy'),
		/frame-ancestors 'none'/
	);
	assert.match(publicPage.headers.get('cache-control'), /no-store/);
	assert.ok(!(await publicPage.text()).includes('live-phone-id'));
	let sends = 0;
	const phone = source();
	phone.ask.boundary = async (_id, op, args) => ({
		response:
			op === 'owner_ai_create_session'
				? { authorized: true, ...delegation() }
				: op === 'owner_ai_authorize'
					? { authorized: true }
					: op === 'owner_ai_search'
						? { matches: [{ id: args.query, name: 'Contato' }] }
						: op === 'owner_ai_send'
							? (sends++, { submitted: true })
							: [],
	});
	const login = async () => {
		const pairResponse = await request('/api/pair', {}),
			pair = await pairResponse.json();
		const challengeCookie = pairResponse.headers.get('set-cookie');
		assert.match(challengeCookie, /HttpOnly/);
		assert.match(challengeCookie, /Secure/);
		assert.match(challengeCookie, /SameSite=Strict/);
		assert.match(challengeCookie, /Path=\/wpp\//);
		await approvePanelBrowser(pair.code, phone);
		const claim = await request(
			'/api/auth',
			undefined,
			challengeCookie.split(';')[0]
		);
		const auth = await claim.json();
		assert.equal(auth.authenticated, true);
		const sessionCookie = claim.headers.get('set-cookie').split(';')[0];
		assert.ok(!JSON.stringify(auth).includes(sessionCookie.split('=')[1]));
		return { cookie: sessionCookie, csrf: auth.csrf, pair };
	};
	const browser = await login(),
		second = await login();
	assert.equal(
		(
			await request(
				'/api/tool',
				{ name: 'owner_send_message', args: {} },
				browser.cookie,
				''
			)
		).status,
		403
	);
	const target = {
		name: 'owner_send_message',
		args: { chatId: '22@lid', body: 'Me ligue' },
	};
	const prepared = await request('/api/tool', target, browser.cookie, browser.csrf);
	assert.equal(prepared.status, 200);
	const preview = await prepared.json();
	assert.equal(sends, 0);
	assert.equal(preview.pending.length, 1);
	assert.match(preview.pending[0].preview, /Me ligue/);
	const id = preview.pending[0].id;
	assert.equal(
		(await request('/api/approve', { id, accept: true }, second.cookie, second.csrf))
			.status,
		409
	);
	assert.equal(sends, 0);
	assert.equal(
		(
			await request(
				'/api/approve',
				{ id, accept: true },
				browser.cookie,
				browser.csrf
			)
		).status,
		200
	);
	assert.equal(sends, 1);
	assert.equal(
		(
			await request(
				'/api/approve',
				{ id, accept: true },
				browser.cookie,
				browser.csrf
			)
		).status,
		409
	);
	assert.equal(sends, 1);
	assert.equal(
		(
			await request(
				'/api/tool',
				{ name: 'owner_confirm', args: {} },
				browser.cookie,
				browser.csrf
			)
		).status,
		400
	);
	setPanelAiRunner(async (r, history) => {
		assert.equal(history.length, 0);
		assert.notEqual(r.message.body, phone.message.body);
		assert.ok(!r.message.body.includes(browser.pair.code));
		assert.equal(r.message.id, phone.message.id);
		r.reply('Resposta no painel');
	});
	const chat = await request(
		'/api/chat',
		{ input: 'qual é o próximo passo?' },
		browser.cookie,
		browser.csrf
	);
	assert.equal(chat.status, 200);
	assert.equal((await chat.json()).text, 'Resposta no painel');
	const dashboard = await request('/api/state', undefined, browser.cookie);
	assert.equal(dashboard.status, 200);
	assert.equal((await dashboard.json()).history.length, 2);
	const malicious = await request(
		'/api/chat',
		{ input: 'test' },
		browser.cookie,
		browser.csrf,
		'https://evil.example'
	);
	assert.equal(malicious.status, 403);
	assert.equal(
		(await request('/api/logout', {}, browser.cookie, browser.csrf)).status,
		200
	);
	assert.equal((await request('/api/state', undefined, browser.cookie)).status, 401);
	assert.equal(
		(await request('/api/auth', undefined, browser.cookie).then(r => r.json()))
			.authenticated,
		false
	);
	const third = await login();
	assert.equal(
		(await request('/api/logout-all', {}, second.cookie, '')).status,
		403
	);
	assert.equal(
		(await request('/api/logout-all', {}, second.cookie, second.csrf)).status,
		200
	);
	assert.equal((await request('/api/state', undefined, third.cookie)).status, 401);
	assert.equal((await request('/api/state', undefined, second.cookie)).status, 401);
});

test('web AI uses the same owner tools without sending login codes or unsupported media tools to Fuel IX', async t => {
	const Module = require('node:module'),
		previous = Module._load;
	Module._load = function (request, parent, main) {
		const loaded = previous.call(this, request, parent, main);
		if (request === 'kozz-module-maker')
			return {
				...loaded,
				createModule: () => {
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
	const Fuel = require('../dist/API/FuelIXApi').default,
		original = Fuel.createToolResponseCompletion;
	t.after(() => {
		Fuel.createToolResponseCompletion = original;
	});
	const { createPanelRequester } = require('../dist/Services/OwnerPanel/server');
	const { runPanelAi } = require('../dist/Services/OwnerPanel/bridge');
	const phone = source({
		body: '!ai painel ABCDEF123456',
		santizedBody: '!ai painel abcdef123456',
	});
	phone.ask.boundary = async (_id, name) => {
		assert.equal(name, 'owner_ai_authorize');
		return { response: { authorized: true } };
	};
	const { requester, output } = createPanelRequester(
		{ requester: phone, id: 'test-web-session' },
		'Qual é o próximo passo?',
		() => true
	);
	Fuel.createToolResponseCompletion = async payload => {
		const encoded = JSON.stringify(payload.messages);
		assert.ok(!encoded.includes('ABCDEF123456'));
		assert.ok(!encoded.includes('abcdef123456'));
		assert.ok(encoded.includes('Qual é o próximo passo?'));
		assert.ok(
			payload.tools.some(
				tool =>
					tool.type === 'function' && tool.function.name === 'owner_send_message'
			)
		);
		assert.ok(
			!payload.tools.some(
				tool =>
					tool.type === 'function' &&
					['generate_speech', 'generate_image', 'get_tia_message'].includes(
						tool.function.name
					)
			)
		);
		return { content: 'Tudo pronto.', tool_calls: [] };
	};
	await runPanelAi(requester, []);
	assert.equal(output[0], 'Tudo pronto.');
});

test('sessions survive restart for 30 fixed days, restore the live gateway transport and revoke durably', async t => {
	const { createPanelRequester } = require('../dist/Services/OwnerPanel/server');
	const { ownerBoundary } = require('../dist/Services/OwnerAI/control');
	const { ownerAiSocket } = require('../dist/Services/OwnerAI/modules');
	const { EventEmitter } = require('node:events');
	const previousSocket = ownerAiSocket(),
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-panel-persist-'));
	t.after(() => {
		registerOwnerAiModule({
			name: 'ai',
			socket: previousSocket,
			commandMethods: {},
		});
		fs.rmSync(directory, { recursive: true, force: true });
	});
	let now = Date.now(),
		asks = 0;
	const options = { directory: () => directory };
	const first = createPanelAuth(() => now, options),
		origin = 'https://panel.example';
	const challenge = first.challenge(origin),
		grant = delegation(now),
		phone = source({ body: '!ai painel ABCDEF123456' });
	first.approve(challenge.code, phone, grant);
	const login = first.claim(challenge.token, origin);
	login.session.history.push({ role: 'user', content: 'private conversation text' });
	const file = path.join(directory, 'sessions.json'),
		stored = fs.readFileSync(file, 'utf8');
	assert.ok(!stored.includes(login.token));
	assert.ok(!stored.includes('ABCDEF123456'));
	assert.ok(!stored.includes('private conversation text'));
	assert.equal(fs.statSync(file).mode & 0o777, 0o600);
	assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
	now += 20 * 60000;
	const restarted = createPanelAuth(() => now, options),
		restored = restarted.get(login.token, origin);
	assert.ok(restored);
	assert.equal(restored.expiresAt, login.session.expiresAt);
	assert.equal(restored.history.length, 0);
	const socket = new EventEmitter();
	socket.connected = true;
	const outgoing = new Set();
	socket.onAnyOutgoing = fn => outgoing.add(fn);
	socket.offAnyOutgoing = fn => outgoing.delete(fn);
	const originalEmit = socket.emit.bind(socket);
	socket.emit = (event, payload) => {
		outgoing.forEach(fn => fn(event, payload));
		if (event === 'ask_resource') {
			asks++;
			assert.equal(payload.responder.id, 'kozz-zapo');
			assert.equal(payload.request.data.ownerSessionToken, grant.token);
			process.nextTick(() =>
				originalEmit('reply_resource/' + payload.request.id, {
					response: { authorized: true },
				})
			);
			return true;
		}
		return originalEmit(event, payload);
	};
	registerOwnerAiModule({ name: 'ai', socket, commandMethods: {} });
	const { requester } = createPanelRequester(
		restored,
		'web request after restart',
		() => restarted.isActive(restored.id)
	);
	assert.equal(requester.message.id, phone.message.id);
	assert.equal(
		(await ownerBoundary(requester, 'authorize', { ownerSessionToken: 'forged' }))
			.authorized,
		true
	);
	assert.equal(asks, 1);
	now = login.session.expiresAt - 1;
	assert.equal(
		restarted.get(login.token, origin).expiresAt,
		login.session.expiresAt
	);
	restarted.revoke(login.token);
	await assert.rejects(ownerBoundary(requester, 'authorize'));
	assert.equal(asks, 1);
	assert.equal(
		createPanelAuth(() => now, options).get(login.token, origin),
		undefined
	);
	const second = createPanelAuth(() => now, options),
		next = second.challenge(origin);
	second.approve(next.code, source(), delegation(now));
	const other = second.claim(next.token, origin);
	now = other.session.expiresAt;
	assert.equal(
		createPanelAuth(() => now, options).get(other.token, origin),
		undefined
	);
});

test('invalid persistent session files fail closed and are never silently overwritten', t => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-panel-invalid-'));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	const file = path.join(directory, 'sessions.json'),
		content = '{"version":1,"sessions":[{"id":"forged"}]}';
	fs.writeFileSync(file, content);
	const auth = createPanelAuth(Date.now, { directory: () => directory });
	assert.throws(() => auth.get('unknown', 'https://panel.example'));
	assert.equal(fs.readFileSync(file, 'utf8'), content);
});
