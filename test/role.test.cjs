const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const sharp = require('sharp');
const {
	parseEvent,
	createRoleStore,
	edit,
} = require('../dist/Handlers/Role/events');
const now = Date.parse('2026-10-30T12:00:00Z');
const input = 'Churrasco 🥩 | 07/11/2026 14h | Casa do João';
const owner = {
	id: '5511@s.whatsapp.net',
	aliases: ['5511@s.whatsapp.net', '11@lid'],
};
const other = { id: '5522@s.whatsapp.net', aliases: ['5522@s.whatsapp.net'] };
const tempStore = t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'role-test-'));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return { dir, store: createRoleStore(dir) };
};
test('event dates use Brasilia, validate leap days/past dates, and support overnight end times', () => {
	const e = parseEvent(input, now);
	assert.equal(new Date(e.start).toISOString(), '2026-11-07T17:00:00.000Z');
	assert.equal(e.end - e.start, 7200000);
	assert.equal(
		parseEvent('Festa | 07/11/2026 23:30-01:00 | Aqui', now).end,
		Date.parse('2026-11-08T04:00:00Z')
	);
	for (const date of [
		'31/11/2026 14h',
		'29/02/2027 14h',
		'07/11/2026 24h',
		'07/11/2026 14:60',
		'07/11/2026 14h-25h',
		'01/01/2026 14h',
		'01/01/2029 14h',
	]) {
		assert.throws(() => parseEvent(`Festa | ${date} | Aqui`, now));
	}
	assert.throws(() => parseEvent('Título\nextra | 07/11/2026 14h | Aqui', now));
	assert.throws(() => parseEvent('Festa | sábado | Aqui', now));
	assert.doesNotThrow(() =>
		parseEvent('Festa | 29/02/2028 14h | Aqui', Date.parse('2028-01-01'))
	);
});
test('store survives restart, isolates groups/boundaries, preserves legacy data and restricts edits', t => {
	const { store, dir } = tempStore(t);
	let e = store.create('zapo', '123@g.us', owner, input, now);
	assert.throws(() => store.get('zapo', '456@g.us', e.id));
	assert.throws(() => store.get('other', '123@g.us', e.id));
	e.votes = [{ person: owner, status: 'vou', timestamp: now + 1 }];
	e.reminderSent = true;
	assert.throws(() => edit(e, other, false, input, now));
	e = edit(e, owner, false, 'Jantar | 08/11/2026 20h | Restaurante', now + 3);
	assert.equal(e.revision, 1);
	assert.equal(e.votes.length, 1);
	store.put(e);
	assert.deepEqual(createRoleStore(dir).get('zapo', '123@g.us', e.id), e);
	assert.equal(fs.statSync(path.join(dir, 'events.json')).mode & 0o777, 0o600);
	const copy = store.get('zapo', '123@g.us', e.id);
	copy.title = 'Mutado';
	assert.equal(store.get('zapo', '123@g.us', e.id).title, 'Jantar');
	e = edit(e, other, true, undefined, now + 4);
	store.put(e);
	assert.equal(store.list('zapo', '123@g.us', now).length, 0);
	assert.equal(e.reminderSent, true); // Historical fields are retained, without scheduling reminders.
	assert.throws(() => edit(e, owner, false, input, now + 5));
	fs.writeFileSync(path.join(dir, 'events.json'), '{}');
	assert.throws(() => createRoleStore(dir));
	assert.equal(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'), '{}');
});
test('handler publishes only a native event, rejects invalid artwork and keeps scoped management', async t => {
	const { store } = tempStore(t);
	let captured, runtime;
	const replies = [],
		requests = [];
	let nativeFails = false;
	const original = Module._load;
	const plain = x => (Array.isArray(x) ? x.map(plain).join('') : (x ?? ''));
	Module._load = function (request, parent, isMain) {
		if (request === 'kozz-module-maker')
			return {
				Line: ({ children }) => plain(children) + '\n',
				Bold: ({ children }) => plain(children),
				createMethod: (name, fn) => ({ [name]: fn }),
				createModule: options => {
					captured = options;
					runtime = {
						name: 'role',
						socket: {
							connected: true,
							onAnyOutgoing() {},
							offAnyOutgoing() {},
							removeAllListeners() {},
						},
						ask: {
							boundary: async (_id, name, args) => {
								requests.push([name, args]);
								if (name === 'group_event' && nativeFails) throw Error('uncertain');
								return {
									response: name === 'group_event' ? { submitted: true } : {},
								};
							},
						},
						sendMessage() {},
						resources: { upsertResource: () => runtime },
					};
					return runtime;
				},
			};
		if (request === './events' && parent.filename.endsWith('/Role/index.js'))
			return {
				...require('../dist/Handlers/Role/events'),
				createRoleStore: () => store,
			};
		return original.call(this, request, parent, isMain);
	};
	try {
		require('../dist/Handlers/Role').startRoleHandler();
		const reply = text => replies.push({ text });
		reply.withButtons = (text, options) => replies.push({ text, ...options });
		reply.withMedia = () =>
			assert.fail('No separate media message from the handler');
		const future = new Intl.DateTimeFormat('en-GB', {
			timeZone: 'America/Sao_Paulo',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(Date.now() + 7 * 86400000);
		const query = `Churrasco | ${future} 14h | Casa do João`;
		const run = (method, arg = '', patch = {}, fullQuery = `${method} ${arg}`) =>
			captured.commands.methods[method]({
				reply,
				ask: { boundary: async () => ({ response: undefined }) },
				rawCommand: { immediateArg: arg, query: fullQuery },
				message: {
					chatId: '123@g.us',
					to: '123@g.us',
					from: owner.id,
					contact: { id: owner.id },
					boundaryId: 'kozz-zapo',
					...patch,
				},
			});
		await run('fallback', query.slice(10), {}, query);
		const e = store.list('kozz-zapo', '123@g.us')[0];
		assert.ok(e);
		assert.equal(requests.filter(r => r[0] === 'group_event').length, 1);
		assert.equal(replies.length, 0);
		// Actual gateway alias payloads repeat the first token in query and carry
		// the full alias text in immediateArg. !evento must preserve titles/methods.
		await run('fallback', query, { body: `!evento ${query}` }, `churrasco ${query}`);
		assert.equal(
			requests.filter(r => r[0] === 'group_event').at(-1)[1].title,
			'Churrasco'
		);
		const aliasEvent = store.list('kozz-zapo', '123@g.us').at(-1);
		const mapLink = 'https://maps.example/LocalAbC?Token=XyZ';
		const mapQuery = `Encontro | ${future} 14h | ${mapLink}`;
		await run(
			'fallback',
			mapQuery.toLowerCase().slice(9),
			{ body: `!role ${mapQuery}` },
			mapQuery.toLowerCase()
		);
		assert.equal(
			requests.filter(r => r[0] === 'group_event').at(-1)[1].location,
			mapLink
		);
		await run('editar', `editar ${aliasEvent.id} ${query}`, {
			body: `!evento editar ${aliasEvent.id} ${query}`,
		});
		assert.equal(requests.filter(r => r[0] === 'group_event').at(-1)[1].revision, 1);
		await run('ver', `ver ${aliasEvent.id}`, {
			body: `!evento ver ${aliasEvent.id}`,
		});
		assert.match(replies.at(-1).text, /Churrasco/);
		for (const method of ['vou', 'talvez', 'nao', 'ics', 'agenda'])
			assert.equal(captured.commands.methods[method], undefined);
		const count = requests.length;
		await run('criar', query, { messageType: 'IMAGE' });
		assert.match(replies.at(-1).text, /Reenvie a imagem/);
		assert.equal(requests.length, count);
		const bytes = await sharp({
			create: { width: 16, height: 24, channels: 3, background: '#884422' },
		})
			.png()
			.toBuffer();
		const replyCount = replies.length;
		await run('criar', query, {
			messageType: 'IMAGE',
			media: {
				data: bytes.toString('base64'),
				transportType: 'b64',
				mimeType: 'image/png',
				sizeInBytes: bytes.length,
			},
		});
		assert.equal(replies.length, replyCount);
		assert.deepEqual(
			Buffer.from(
				requests.filter(r => r[0] === 'group_event').at(-1)[1].artwork.data,
				'base64'
			),
			bytes
		);
		nativeFails = true;
		await run('criar', query);
		assert.match(replies.at(-1).text, /Confira a arte e os eventos/);
		nativeFails = false;
		await run('ver', e.id, { chatId: '456@g.us' });
		assert.match(replies.at(-1).text, /não encontrado/);
		await run('cancelar', e.id, { from: other.id, contact: { id: other.id } });
		assert.match(replies.at(-1).text, /Somente/);
		await run('cancelar', e.id);
		assert.equal(store.get('kozz-zapo', '123@g.us', e.id).cancelled, true);
		await run('lista', '', { chatId: owner.id, to: owner.id });
		assert.match(replies.at(-1).text, /grupo/);
	} finally {
		Module._load = original;
	}
});
