const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMemoryStore } = require('../dist/Services/AiMemory/store');
const scope = { namespace: 'default', boundary: 'kozz-zapo', chatId: '123@g.us' };
const ana = {
	id: '111@s.whatsapp.net',
	aliases: ['111@s.whatsapp.net', '11@lid'],
	name: 'Ana',
	type: 'person',
};
const actor = { id: '111@s.whatsapp.net', aliases: ana.aliases, host: false };
const source = {
	messageId: 'original',
	authorId: '11@lid',
	excerpt: 'Eu gosto de pizza sem cebola',
	sentAt: Date.now() - 10000,
};
const setup = t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gramonta-memory-')),
		file = path.join(dir, 'memory.sqlite');
	const store = createMemoryStore(file);
	t.after(() => {
		try {
			store.close();
		} catch {}
		fs.rmSync(dir, { recursive: true, force: true });
	});
	return { store, file };
};
test('CRUD persists across restart, keeps real provenance/revisions, deduplicates PN/LID and isolates all scope fields', t => {
	const { store, file } = setup(t);
	const made = store.create(
		scope,
		ana,
		'comida.preferida',
		'Gosta de pizza sem cebola',
		source,
		actor
	);
	assert.equal(made.created, true);
	assert.equal(made.memory.attribution, 'self_reported');
	assert.deepEqual(made.memory.source, source);
	assert.equal(made.memory.revision, 1);
	assert.equal(
		store.create(
			scope,
			{ ...ana, id: '11@lid' },
			'comida.preferida',
			'Gosta de pizza sem cebola',
			source,
			actor
		).created,
		false
	);
	assert.throws(
		() => store.create(scope, ana, 'comida.preferida', 'Agora sushi', source, actor),
		/atualizar/
	);
	assert.equal(
		store.search(scope, { aliases: ['11@lid'], query: 'CEBÓLA' }).total,
		1
	);
	for (const changed of [
		{ chatId: '456@g.us' },
		{ namespace: 'other' },
		{ boundary: 'other' },
	]) {
		assert.equal(store.search({ ...scope, ...changed }).total, 0);
		assert.throws(
			() => store.get({ ...scope, ...changed }, made.memory.id),
			/não encontrada/
		);
	}
	const other = { id: '22@lid', aliases: ['22@lid'], host: false };
	assert.throws(
		() => store.update(scope, made.memory.id, 1, 'Sushi', source, other),
		/Somente/
	);
	assert.throws(() => store.remove(scope, made.memory.id, 1, other), /Somente/);
	const changed = store.update(
		scope,
		made.memory.id,
		1,
		'Prefere sushi',
		{ ...source, messageId: 'correction' },
		actor
	);
	assert.equal(changed.revision, 2);
	assert.equal(changed.source.messageId, 'correction');
	assert.throws(
		() => store.update(scope, made.memory.id, 1, 'Stale', source, actor),
		/mudou/
	);
	assert.equal(fs.statSync(file).mode & 0o777, 0o600);
	store.close();
	const reopened = createMemoryStore(file);
	t.after(() => reopened.close());
	assert.equal(reopened.get(scope, made.memory.id).text, 'Prefere sushi');
	assert.equal(reopened.remove(scope, made.memory.id, 2, actor).deleted, true);
	assert.equal(reopened.search(scope).total, 0);
});
test('personal subject can correct a reported fact and group memories are collaborative', t => {
	const { store } = setup(t),
		reporter = { id: '22@lid', aliases: ['22@lid'], host: false };
	const personal = store.create(
		scope,
		ana,
		'hobby',
		'Gosta de corrida',
		{ ...source, authorId: '22@lid' },
		reporter
	).memory;
	assert.equal(personal.attribution, 'reported');
	assert.equal(
		store.update(scope, personal.id, 1, 'Gosta de natação', source, actor)
			.attribution,
		'self_reported'
	);
	const group = {
		type: 'group',
		id: scope.chatId,
		aliases: [scope.chatId],
		name: 'Grupo',
	};
	const rule = store.create(
		scope,
		group,
		'encontro',
		'Encontro às quintas',
		source,
		actor
	).memory;
	assert.equal(
		store.update(scope, rule.id, 1, 'Encontro às sextas', source, reporter).revision,
		2
	);
});
test('deleting forgets the text and blocks learning it again from old context, including after restart', t => {
	const { store, file } = setup(t);
	const m = store.create(
		scope,
		ana,
		'comida',
		'Prefere pizza',
		source,
		actor
	).memory;
	store.remove(scope, m.id, 1, actor);
	store.close();
	const reopened = createMemoryStore(file);
	t.after(() => reopened.close());
	assert.throws(
		() => reopened.create(scope, ana, 'comida', 'Prefere pizza', source, actor),
		/esquecida/
	);
	assert.throws(
		() =>
			reopened.create(
				scope,
				ana,
				'outro-topico',
				'Prefere pizza',
				{ ...source, messageId: 'old-duplicate' },
				actor
			),
		/esquecida/
	);
	const later = reopened.create(
		scope,
		ana,
		'comida',
		'Prefere pizza',
		{ ...source, messageId: 'new-statement', sentAt: Date.now() + 1000 },
		actor
	);
	assert.equal(later.created, true);
});
test('pagination is stable and bounds/schema validations do not overwrite data', t => {
	const { store } = setup(t);
	for (let i = 0; i < 5; i++)
		store.create(scope, ana, `fato.${i}`, `Fato número ${i}`, source, actor);
	const first = store.search(scope, { limit: 2 }),
		next = store.search(scope, { limit: 2, offset: first.nextOffset });
	assert.equal(first.total, 5);
	assert.equal(first.nextOffset, 2);
	assert.ok(!first.memories.some(a => next.memories.some(b => a.id === b.id)));
	for (const text of ['', 'x'.repeat(801)])
		assert.throws(() => store.create(scope, ana, 'invalido', text, source, actor));
	assert.throws(() => store.search(scope, { limit: 21 }));
	assert.throws(() => store.get(scope, "' OR 1=1"));
	assert.equal(store.search(scope).total, 5);
});

test('corrupt or unrelated databases fail closed without replacing their data', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-invalid-'));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const file = path.join(dir, 'memory.sqlite');
	fs.writeFileSync(file, 'preserve this invalid file');
	assert.throws(() => createMemoryStore(file));
	assert.equal(fs.readFileSync(file, 'utf8'), 'preserve this invalid file');
});
