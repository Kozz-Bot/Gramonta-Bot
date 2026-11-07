const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const settle = async () => {
	for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve));
};
const files = service => {
	const dir = path.resolve(__dirname, '../dist/Services/' + service + '/public');
	return {
		html: fs.readFileSync(
			path.join(dir, service === 'OwnerMCP' ? 'connect.html' : 'index.html'),
			'utf8'
		),
		script: fs.readFileSync(
			path.join(dir, service === 'OwnerMCP' ? 'connect.js' : 'app.js'),
			'utf8'
		),
	};
};
test('OAuth consent escapes client/chat data, sends exact selections with CSRF and never authorizes automatically', async t => {
	const { html, script } = files('OwnerMCP'),
		dom = new JSDOM(html, {
			url: 'https://gramont.digital/wpp/oauth/connect',
			runScripts: 'outside-only',
		}),
		{ window } = dom,
		d = window.document;
	t.after(() => window.close());
	const calls = [],
		attack = '<img src=x onerror=alert(1)>',
		errors = [];
	window.addEventListener('error', e => errors.push(e.error));
	window.fetch = async (url, options) => {
		const body = options.body ? JSON.parse(options.body) : undefined;
		calls.push({ url, body, options });
		let value;
		if (url.endsWith('/api/auth'))
			value = { authenticated: true, csrf: 'panel-csrf' };
		else if (url.endsWith('/oauth/request'))
			value = {
				clientName: attack,
				clientId: 'public-id',
				redirect: 'https://client.example/cb',
				requestedScopes: ['whatsapp.read', 'whatsapp.send'],
				csrf: 'oauth-csrf',
				expiresAt: Date.now() + 600000,
				pending: false,
			};
		else if (url.endsWith('/api/search'))
			value = { matches: [{ id: '22@lid', name: attack }] };
		else if (url.endsWith('/oauth/consent'))
			value = { command: '!ai agente ABCDEF123456', expiresAt: Date.now() + 600000 };
		else if (url.endsWith('/oauth/poll')) value = { pending: true };
		else throw Error('Unexpected route');
		return new Response(JSON.stringify(value));
	};
	window.eval(script);
	await settle();
	assert.equal(d.querySelector('#client-name').textContent, attack);
	assert.equal(d.querySelectorAll('img').length, 0);
	assert.equal(
		calls.some(c => c.url.endsWith('/oauth/consent')),
		false
	);
	d.querySelector('#query').value = 'test';
	d.querySelector('#search').click();
	await settle();
	assert.equal(d.querySelectorAll('#matches img').length, 0);
	d.querySelector('#matches button').click();
	d.querySelector('[value="whatsapp.send"]').checked = true;
	const button = d.querySelector('#consent button:not([type=button])');
	d.querySelector('#consent').dispatchEvent(
		new window.SubmitEvent('submit', {
			bubbles: true,
			cancelable: true,
			submitter: button,
		})
	);
	await settle();
	const consent = calls.find(c => c.url.endsWith('/oauth/consent'));
	assert.deepEqual(consent.body, {
		permissions: {
			scopes: ['whatsapp.read', 'whatsapp.send'],
			chats: ['22@lid'],
			commands: [],
		},
		days: 1,
	});
	assert.equal(consent.options.headers['X-CSRF-Token'], 'oauth-csrf');
	assert.equal(d.querySelector('#command').textContent, '!ai agente ABCDEF123456');
	assert.equal(d.querySelector('#phone').hidden, false);
	assert.ok(calls.every(c => !c.url.includes('ABCDEF123456')));
	assert.deepEqual(errors, []);
});

test('agent management renders previews safely and requires a deliberate approval/revocation click', async t => {
	const { html, script } = files('OwnerPanel'),
		dom = new JSDOM(html, {
			url: 'https://gramont.digital/wpp/',
			runScripts: 'outside-only',
		}),
		{ window } = dom,
		d = window.document;
	t.after(() => window.close());
	window.HTMLDialogElement.prototype.showModal = function () {
		this.open = true;
	};
	window.HTMLDialogElement.prototype.close = function () {
		this.open = false;
	};
	const attack = '<img src=x onerror=alert(1)>',
		calls = [];
	const agent = {
		id: 'agent-id',
		clientId: 'client-id',
		name: attack,
		approvalMode: 'manual',
		policyVersion: 0,
		permissions: {
			scopes: ['whatsapp.commands', 'whatsapp.send'],
			chats: ['*'],
			commands: ['ping.default'],
		},
		expiresAt: Date.now() + 86400000,
	};
	window.fetch = async (url, options) => {
		const route = new URL(url).pathname.split('/api/')[1],
			body = options.body ? JSON.parse(options.body) : undefined;
		calls.push({ route, body });
		let value;
		if (route === 'auth')
			value = {
				authenticated: true,
				csrf: 'panel-csrf',
				expiresAt: Date.now() + 86400000,
			};
		else if (route === 'state')
			value = {
				modules: [],
				posts: { groups: [], enabled: false },
				pending: [],
				activity: [],
				usage: {},
				history: [],
				selfChatId: '11@lid',
			};
		else if (route === 'whatsapp') value = { ready: true };
		else if (route === 'agents')
			value = {
				endpoint: 'https://gramont.digital/wpp/mcp',
				agents: [agent],
				pending: [
					{
						id: 'action-id',
						agentName: attack,
						preview: 'Exact message\n' + attack,
						expiresAt: Date.now() + 300000,
					},
				],
			};
		else if (route === 'agents/policy') {
			agent.approvalMode = body.approvalMode;
			agent.permissions.commands = body.allCommands ? ['*'] : body.commands;
			agent.policyVersion++;
			value = { updated: true };
		} else if (route === 'agents/approve') value = { status: 'completed' };
		else if (route === 'agents/revoke') value = { ok: true };
		else throw Error('Unexpected route ' + route);
		return new Response(JSON.stringify(value));
	};
	window.eval(script);
	await settle();
	d.querySelector('[data-page=agents]').click();
	await settle();
	assert.equal(d.querySelectorAll('#agents-content img').length, 0);
	assert.match(d.querySelector('#agents-content').textContent, /Exact message/);
	assert.ok(!calls.some(c => c.route === 'agents/approve'));
	d.querySelector('[data-policy-agent]').click();
	assert.equal(d.querySelector('#agent-policy-dialog').open, true);
	assert.equal(d.querySelector('#agent-all-commands').checked, false);
	assert.equal(d.querySelectorAll('#agent-policy-dialog img').length, 0);
	assert.equal(d.querySelector('#agent-policy-name').textContent, attack);
	d.querySelector('#agent-all-commands').click();
	assert.equal(d.querySelector('#agent-commands-list').hidden, true);
	d.querySelector('#agent-approval-mode').value = 'automatic';
	d.querySelector('#agent-approval-mode').dispatchEvent(new window.Event('change'));
	const submitPolicy = () =>
		d.querySelector('#agent-policy-form').dispatchEvent(
			new window.SubmitEvent('submit', {
				bubbles: true,
				cancelable: true,
				submitter: d.querySelector('#save-agent-policy'),
			})
		);
	submitPolicy();
	await settle();
	assert.equal(
		calls.some(c => c.route === 'agents/policy'),
		false
	);
	d.querySelector('#agent-policy-understood').checked = true;
	d.querySelector('#agent-policy-confirmation').value = 'AUTORIZAR';
	submitPolicy();
	await settle();
	const granted = calls.find(c => c.route === 'agents/policy');
	assert.equal(granted.body.allCommands, true);
	assert.equal(granted.body.approvalMode, 'automatic');
	assert.equal(granted.body.understood, true);
	assert.equal(granted.body.expectedVersion, 0);
	assert.match(d.querySelector('#agents-content').textContent, /AUTÔNOMO/);
	assert.match(
		d.querySelector('#agents-content').textContent,
		/Todos os métodos, atuais e futuros/
	);
	d.querySelector('[data-policy-agent]').click();
	assert.equal(d.querySelector('#agent-all-commands').checked, true);
	d.querySelector('#agent-all-commands').click();
	d.querySelector('#agent-methods').value = 'ping.default';
	d.querySelector('#agent-approval-mode').value = 'manual';
	d.querySelector('#agent-approval-mode').dispatchEvent(new window.Event('change'));
	assert.equal(d.querySelector('#agent-policy-consent').hidden, true);
	submitPolicy();
	await settle();
	const reduced = calls.filter(c => c.route === 'agents/policy').at(-1);
	assert.equal(reduced.body.allCommands, false);
	assert.deepEqual(reduced.body.commands, ['ping.default']);
	assert.equal(reduced.body.approvalMode, 'manual');
	d.querySelector('[data-agent-action][data-accept=true]').click();
	await settle();
	assert.deepEqual(calls.find(c => c.route === 'agents/approve').body, {
		id: 'action-id',
		accept: true,
	});
	d.querySelector('[data-revoke-agent]').click();
	await settle();
	assert.deepEqual(calls.find(c => c.route === 'agents/revoke').body, {
		id: 'agent-id',
	});
});

test('OAuth checkbox authorizes all current and future methods without requiring a typed list', async t => {
	const { html, script } = files('OwnerMCP'),
		dom = new JSDOM(html, {
			url: 'https://gramont.digital/wpp/oauth/connect',
			runScripts: 'outside-only',
		}),
		{ window } = dom,
		d = window.document;
	t.after(() => window.close());
	let consent;
	window.fetch = async (url, options) => {
		let value;
		if (url.endsWith('/api/auth'))
			value = { authenticated: true, csrf: 'panel-csrf' };
		else if (url.endsWith('/oauth/request'))
			value = {
				clientName: 'Agent',
				clientId: 'id',
				redirect: 'https://client.example/cb',
				requestedScopes: ['whatsapp.commands'],
				csrf: 'oauth-csrf',
				expiresAt: Date.now() + 600000,
				pending: false,
			};
		else if (url.endsWith('/oauth/consent')) {
			consent = JSON.parse(options.body);
			value = { command: '!ai agente ABCDEF123456' };
		} else if (url.endsWith('/oauth/poll')) value = { pending: true };
		else throw Error('Unexpected route');
		return new Response(JSON.stringify(value));
	};
	window.eval(script);
	await settle();
	const scope = d.querySelector('[value="whatsapp.commands"]');
	scope.checked = true;
	scope.dispatchEvent(new window.Event('change'));
	assert.equal(d.querySelector('#all-commands').checked, false);
	assert.equal(d.querySelector('#command-area').hidden, false);
	d.querySelector('#all-chats').click();
	d.querySelector('#all-commands').click();
	assert.equal(d.querySelector('#command-list').hidden, true);
	assert.equal(d.querySelector('#commands').value, '');
	d.querySelector('#consent').dispatchEvent(
		new window.SubmitEvent('submit', {
			bubbles: true,
			cancelable: true,
			submitter: d.querySelector('#consent button:not([type=button])'),
		})
	);
	await settle();
	assert.deepEqual(consent.permissions, {
		scopes: ['whatsapp.commands'],
		chats: ['*'],
		commands: ['*'],
	});
	assert.equal(consent.approvalMode, undefined);
});
