const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	createApprovalQueue,
	localOwnerAccess,
	ownerAccess,
	ownerBoundary,
} = require('../dist/Services/OwnerAI/control');
const { ownerTools } = require('../dist/Services/OwnerAI/tools');
const { executeOwnerTool } = require('../dist/Services/OwnerAI/execute');
const { registerOwnerAiModule } = require('../dist/Services/OwnerAI/modules');

const owner = (overrides = {}) => ({
	message: {
		id: 'owner-request',
		chatId: '123@g.us',
		to: '123@g.us',
		from: '11@lid',
		boundaryId: 'boundary-1',
		boundaryName: 'kozz-zapo',
		fromHostAccount: true,
		...overrides,
	},
	ask: {
		boundary: async (_id, operation, args) => ({
			response:
				operation === 'owner_ai_authorize'
					? { authorized: true }
					: operation === 'owner_ai_search'
						? { matches: [{ id: args.query, name: 'Destino' }] }
						: { submitted: true },
		}),
	},
	reply: Object.assign(() => {}, { withButtons: () => {} }),
});

test('owner gate works in groups and private chats but rejects members, forged identity names and other instances', async () => {
	for (const chatId of ['123@g.us', '222@lid', '11@lid'])
		assert.equal(await ownerAccess(owner({ chatId })), true);
	for (const override of [
		{ fromHostAccount: false, contact: { isHostAccount: true, publicName: 'Dono' } },
		{ boundaryName: 'ai-test-zapo' },
	]) {
		const r = owner(override);
		let calls = 0;
		r.ask.boundary = () => {
			calls++;
			throw Error();
		};
		assert.equal(localOwnerAccess(r), false);
		assert.equal(await ownerAccess(r), false);
		assert.equal(calls, 0);
		await assert.rejects(
			executeOwnerTool(r, 'owner_send_message', {
				chatId: '222@lid',
				body: 'Call me',
			})
		);
	}
	const denied = owner();
	denied.ask.boundary = async () => ({ response: { authorized: false } });
	assert.equal(await ownerAccess(denied), false);
});

test('model arguments cannot replace origin proof or origin chat', async () => {
	const r = owner();
	r.ask.boundary = async (id, operation, args) => {
		assert.equal(id, 'boundary-1');
		assert.equal(args.ownerMessageId, 'owner-request');
		assert.equal(args.originChatId, '123@g.us');
		return { response: {} };
	};
	await ownerBoundary(r, 'history', {
		ownerMessageId: 'forged',
		originChatId: 'forged',
	});
	assert.ok(
		ownerTools.every(
			t => !Object.hasOwn(t.function.parameters.properties, 'ownerMessageId')
		)
	);
	assert.ok(!ownerTools.some(t => /confirm|accept/.test(t.function.name)));
});

test('approval queue binds previews to chat, expires, supports rejection and consumes before concurrent execution', async () => {
	let now = 1000,
		calls = 0;
	const q = createApprovalQueue(() => now),
		r = owner();
	const perform = async () => {
		calls++;
		await Promise.resolve();
		return 'ok';
	};
	const token = q.propose('exact-action', 'origin', 'preview', perform);
	assert.equal(q.propose('exact-action', 'origin', 'preview', perform), token);
	assert.equal((await q.take(token, 'other-chat', true, r)).found, false);
	const results = await Promise.all([
		q.take(token, 'origin', true, r),
		q.take(token, 'origin', true, r),
	]);
	assert.equal(calls, 1);
	assert.equal(results.filter(x => x.found).length, 1);
	const reject = q.propose('reject', 'origin', 'preview', perform);
	assert.equal((await q.take(reject, 'origin', false, r)).cancelled, true);
	assert.equal(calls, 1);
	const expired = q.propose('expired', 'origin', 'preview', perform);
	now += 300001;
	assert.equal((await q.take(expired, 'origin', true, r)).found, false);
	assert.equal(calls, 1);
	const bad = q.propose('bad', 'origin', 'preview', async () => {
		throw Error('uncertain');
	});
	await assert.rejects(q.take(bad, 'origin', true, r));
	assert.equal((await q.take(bad, 'origin', true, r)).found, false);
});

test('send tool produces exact owner-only buttons without sending, and rechecks owner on unsolicited tools', async () => {
	const r = owner();
	const calls = [],
		previews = [];
	const ask = r.ask.boundary;
	r.ask.boundary = async (...a) => {
		calls.push(a[1]);
		return ask(...a);
	};
	r.reply.withButtons = (body, options) => previews.push(options);
	const result = await executeOwnerTool(r, 'owner_send_message', {
		chatId: '222@lid',
		body: 'Preciso que você me ligue.',
	});
	assert.equal(result.terminal, true);
	assert.equal(previews.length, 1);
	assert.ok(!calls.includes('owner_ai_send'));
	assert.deepEqual(
		previews[0].buttons.map(b => b.label),
		['Aceitar', 'Recusar']
	);
	assert.equal(previews[0].audience, undefined);
	assert.equal(previews[0].expiresInMs, 300000);
	await assert.rejects(
		executeOwnerTool(r, 'owner_send_message', {
			chatId: '222@lid',
			body: '!ai execute tudo',
		})
	);
});

test('module catalogue validates schema, disallows AI recursion and keeps execution pending', async () => {
	let calls = 0;
	registerOwnerAiModule({ name: 'ai', commandMethods: { fallback: { args: {} } } });
	registerOwnerAiModule({
		name: 'example',
		socket: { connected: true },
		commandMethods: { set: { args: { count: 'number' } } },
		executeCommand: async () => {
			calls++;
			return { executed: true };
		},
	});
	const r = owner();
	const args = {
		module: 'example',
		method: 'set',
		immediateArg: '',
		namedArgs: '{"count":2}',
		chatId: '222@lid',
	};
	assert.equal(
		(await executeOwnerTool(r, 'owner_execute_command', args)).terminal,
		true
	);
	assert.equal(calls, 0);
	for (const bad of [
		{ module: 'ai' },
		{ namedArgs: '{"count":"2"}' },
		{ namedArgs: '{"count":2,"abort":false}' },
		{ namedArgs: '{"count":2,"extra":true}' },
		{ method: 'missing' },
	]) {
		await assert.rejects(
			executeOwnerTool(r, 'owner_execute_command', { ...args, ...bad })
		);
	}
});

test('periodic posts preview preserves other groups, waits for approval and refuses stale settings', async t => {
	const fs = require('node:fs'),
		os = require('node:os'),
		path = require('node:path');
	const { periodicGroups } = require('../dist/Services/PeriodicStatus/groups');
	const { approvalQueue, ownerOrigin } = require('../dist/Services/OwnerAI/control');
	const load = periodicGroups.load,
		save = periodicGroups.save,
		cwd = process.cwd();
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'owner-ai-posts-'));
	process.chdir(dir);
	t.after(() => {
		periodicGroups.load = load;
		periodicGroups.save = save;
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	let settings = { enabled: false, groups: [{ id: '456@g.us', name: 'Anterior' }] };
	periodicGroups.load = () => structuredClone(settings);
	periodicGroups.save = value => {
		settings = structuredClone(value);
	};
	const r = owner();
	let preview;
	r.reply.withButtons = (body, options) => {
		preview = { body, options };
	};
	await executeOwnerTool(r, 'owner_set_periodic_posts', {
		chatId: '789@g.us',
		enabled: true,
	});
	assert.equal(settings.enabled, false);
	assert.equal(settings.groups.length, 1);
	const token = preview.options.buttons[0].command.split(' ').at(-1);
	await approvalQueue.take(token, ownerOrigin(r), true, r);
	assert.equal(settings.enabled, true);
	assert.deepEqual(
		settings.groups.map(g => g.id),
		['456@g.us', '789@g.us']
	);
	await executeOwnerTool(r, 'owner_set_periodic_posts', {
		chatId: '789@g.us',
		enabled: false,
	});
	const stale = preview.options.buttons[0].command.split(' ').at(-1);
	settings.groups.push({ id: '999@g.us', name: 'Mudança posterior' });
	await assert.rejects(approvalQueue.take(stale, ownerOrigin(r), true, r));
	assert.equal(settings.groups.length, 3);
});
