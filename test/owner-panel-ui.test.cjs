const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const publicDir = path.resolve(__dirname, '../dist/Services/OwnerPanel/public');
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() {
	for (let i = 0; i < 8; i++) await tick();
}
const makeDom = t => {
	const dom = new JSDOM(html, {
		url: 'https://panel.example/wpp/',
		runScripts: 'outside-only',
		pretendToBeVisual: true,
	});
	const { window } = dom;
	window.HTMLDialogElement.prototype.showModal = function () {
		this.open = true;
	};
	window.HTMLDialogElement.prototype.close = function () {
		this.open = false;
	};
	const errors = [];
	window.addEventListener('error', event => errors.push(event.error));
	t.after(() => {
		window.close();
		assert.deepEqual(errors, []);
	});
	return dom;
};

test('login does not display private data and provides a WhatsApp code without putting it in a URL', async t => {
	const dom = makeDom(t),
		{ window } = dom;
	const routes = [];
	window.fetch = async (url, options) => {
		const route = new URL(url).pathname;
		routes.push({ route, options });
		return new Response(
			JSON.stringify(
				route.endsWith('/pair')
					? {
							code: 'ABCDEF123456',
							command: '!ai painel ABCDEF123456',
							expiresAt: Date.now() + 300000,
						}
					: { authenticated: false }
			)
		);
	};
	window.eval(script);
	await settle();
	assert.equal(window.document.querySelector('#workspace').hidden, true);
	assert.match(
		window.document.querySelector('#login-controls').textContent,
		/30 dias/
	);
	window.document.querySelector('#start-login').click();
	await settle();
	assert.match(
		window.document.querySelector('.pair-command').textContent,
		/!ai painel ABCDEF123456/
	);
	assert.ok(routes.every(({ route }) => !route.includes('ABCDEF123456')));
	assert.equal(window.document.querySelector('#main-content').textContent, '');
});

test('panel navigates, searches safely, consults history, prepares previews and requires explicit approval', async t => {
	const dom = makeDom(t),
		{ window } = dom,
		document = window.document;
	let authenticated = true,
		submitted = 0,
		approved = 0;
	const calls = [],
		pending = [],
		maliciousName = '<img src=x onerror=alert(1)>Contato';
	const data = {
		modules: [{ name: 'ping', methods: [{ method: 'default', args: {} }] }],
		posts: { enabled: false, groups: [] },
		pending,
		activity: [],
		usage: { calls: 0, errors: 0, tokens: 0 },
		selfChatId: '11@lid',
		history: [],
	};
	window.fetch = async (url, options) => {
		const route = new URL(url).pathname.split('/api/')[1],
			body = options.body ? JSON.parse(options.body) : undefined;
		calls.push({ route, body });
		let response;
		switch (route) {
			case 'auth':
				response = {
					authenticated,
					csrf: 'test-csrf-placeholder',
					expiresAt: Date.now() + 30 * 86400000,
				};
				break;
			case 'state':
				response = data;
				break;
			case 'whatsapp':
				response = { ready: true, connected: true, registered: true, hasQr: false };
				break;
			case 'search':
				response = {
					matches: [{ id: '22@lid', name: maliciousName }],
					truncated: false,
				};
				break;
			case 'history':
				response = {
					messages: [
						{
							id: 'm',
							timestamp: Date.now(),
							author: maliciousName,
							body: '<script>bad()</script>',
						},
					],
					totalStored: 1,
					nextOffset: null,
				};
				break;
			case 'tool':
				submitted++;
				data.pending = [
					{
						id: 'aabbccddeeff0011',
						preview: 'Enviar mensagem para Contato:\nTexto exato',
						expiresAt: Date.now() + 300000,
					},
				];
				response = { text: 'Revisar', pending: data.pending };
				break;
			case 'approve':
				assert.equal(body.accept, true);
				approved++;
				data.pending = [];
				response = { text: 'Mensagem enviada ao WhatsApp.', pending: [] };
				break;
			case 'chat':
				data.history = [
					{ role: 'user', content: body.input },
					{ role: 'assistant', content: 'Resposta do assistente' },
				];
				response = { text: 'Resposta do assistente', pending: [] };
				break;
			case 'logout':
				authenticated = false;
				response = { ok: true };
				break;
			default:
				throw Error('Unexpected route ' + route);
		}
		return new Response(JSON.stringify(response));
	};
	window.eval(script);
	await settle();
	assert.equal(document.querySelector('#workspace').hidden, false);
	assert.match(document.querySelector('#main-content').textContent, /tudo sob/);
	for (const page of ['assistant', 'automations', 'commands', 'activity', 'chats']) {
		document.querySelector(`[data-page="${page}"]`).click();
		assert.ok(document.querySelector('#main-content').textContent.trim());
	}
	document.querySelector('#search-input').value = 'Contato';
	document
		.querySelector('#search-form')
		.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	await settle();
	assert.equal(document.querySelectorAll('#search-results img').length, 0);
	document.querySelector('[data-result]').click();
	assert.equal(document.querySelectorAll('#chat-detail img').length, 0);
	document
		.querySelector('#history-form')
		.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	await settle();
	assert.match(
		document.querySelector('#history-results').textContent,
		/<script>bad\(\)<\/script>/
	);
	assert.equal(document.querySelectorAll('#history-results script').length, 0);
	document.querySelector('#message-body').value = 'Texto exato';
	document
		.querySelector('#send-form')
		.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	await settle();
	assert.equal(submitted, 1);
	assert.equal(approved, 0);
	assert.equal(document.querySelector('#confirmation-dialog').open, true);
	assert.match(
		document.querySelector('#confirmation-preview').textContent,
		/Texto exato/
	);
	document.querySelector('#accept-action').click();
	await settle();
	assert.equal(approved, 1);
	document.querySelector('[data-page="assistant"]').click();
	document.querySelector('#chat-input').value = 'Me ajude';
	document
		.querySelector('#chat-form')
		.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
	await settle();
	assert.match(
		document.querySelector('#chat-log').textContent,
		/Resposta do assistente/
	);
	assert.ok(
		calls
			.filter(call =>
				['tool', 'chat', 'search', 'history', 'approve'].includes(call.route)
			)
			.every(call => call.body)
	);
	document.querySelector('#logout').click();
	await settle();
	assert.equal(document.querySelector('#workspace').hidden, true);
	assert.equal(document.querySelector('#main-content').textContent, '');
});
