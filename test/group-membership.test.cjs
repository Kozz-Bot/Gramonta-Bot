const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { tagMember } = require('kozz-module-maker/dist/InlineCommands');
const {
	groupMembershipMessages,
} = require('../dist/Services/GroupMembership/messages');
const chatId = '120363411230167560@g.us';

test('JSX welcome uses current group details, mentions the newcomer and preserves the presentation fields', () => {
	const body = groupMembershipMessages[chatId].join({
		group: { id: chatId, name: 'Quarta dos Sem Juízo' },
		member: { id: '11@lid', publicName: 'Ana' },
	});
	assert.match(body, /Seja muito bem-vindo ao Quarta dos Sem Juízo/);
	assert.ok(body.includes(tagMember('11@lid')));
	for (const field of [
		'📷 Foto:',
		'🎂 Idade:',
		'📐 Altura:',
		'📌 Onde mora:',
		'🏳️‍🌈 Orientação sexual:',
		'🎈 Aniversário:',
		'📲 Instagram:',
		'🫂 Quem te recrutou:',
		'💌 PV LIBERADO?',
	])
		assert.ok(body.includes(field));
});
test('active service matches group IDs, fetches details only for configured templates and sends one JSX welcome per member', async t => {
	const file = require.resolve('../dist/Services/GroupMembership'),
		cached = require.cache[file],
		load = Module._load;
	const listeners = {},
		sent = [],
		queries = [];
	const runtime = {
		on: (name, source, cb) => {
			assert.equal(source, 'kozz-zapo');
			listeners[name] = cb;
		},
		sendMessage: (...args) => sent.push(args),
		ask: {
			boundary: async (boundary, resource, args) => {
				queries.push({ boundary, resource, args });
				return { response: { id: chatId, name: 'Nome novo do grupo' } };
			},
		},
	};
	delete require.cache[file];
	Module._load = function (name, parent, main) {
		if (name === 'kozz-module-maker' && parent.filename === file)
			return { createModule: () => runtime };
		return load.call(this, name, parent, main);
	};
	try {
		require(file).startGroupMembershipService();
	} finally {
		Module._load = load;
		if (cached) require.cache[file] = cached;
		else delete require.cache[file];
	}
	const tick = () => new Promise(resolve => setImmediate(resolve));
	listeners.user_joined_group({
		chatId: 'outro@g.us',
		membersAdded: [{ id: '11@lid' }],
	});
	await tick();
	assert.equal(queries.length, 0);
	listeners.user_joined_group({
		chatId,
		membersAdded: [{ id: '11@lid' }, { id: '22@lid' }],
	});
	await tick();
	assert.deepEqual(queries, [
		{ boundary: 'kozz-zapo', resource: 'group_chat_info', args: { chatId } },
	]);
	assert.equal(sent.length, 2);
	assert.equal(sent[0][0], chatId);
	assert.equal(sent[0][1], 'kozz-zapo');
	assert.match(sent[0][2], /Nome novo do grupo/);
	assert.ok(sent[1][2].includes(tagMember('22@lid')));
	listeners.user_left_group({ chatId, contact: { id: '11@lid' } });
	await tick();
	assert.equal(queries.length, 1);
	groupMembershipMessages[chatId].leave = ({ group, member }) =>
		`Saída de ${member.id} de ${group.name}`;
	t.after(() => delete groupMembershipMessages[chatId].leave);
	listeners.user_kicked_from_group({ chatId, contact: { id: '11@lid' } });
	await tick();
	assert.match(sent.at(-1)[2], /Saída de 11@lid de Nome novo/);
});
