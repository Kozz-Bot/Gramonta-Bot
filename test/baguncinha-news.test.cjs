const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
	createNewsRunner,
	GROUP_ID,
} = require('../dist/Services/BaguncinhaNews/runner');
const {
	parseNewsIdea,
	generateNewsDraft,
	compareNewsTheme,
} = require('../dist/Services/BaguncinhaNews/content');
const FuelIXApi = require('../dist/API/FuelIXApi').default;
const draft = {
	subject: 'Baguncinha: foguete pediu Uber',
	headline: 'Lançamento adiado',
	publishedDate: '2026-10-27',
	sourceUrls: ['https://example.org/news'],
	imagePrompt: 'Foguete esperando um carro',
	imageBase64: 'aW1hZ2U=',
};

async function fixture(run) {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'baguncinha-news-'));
	let date = new Date('2026-10-27T13:30:00Z');
	const calls = [];
	let generated = 0;
	const opts = {
		directory,
		now: () => date,
		generate: async () => {
			generated++;
			return draft;
		},
		ask: async (resource, args) => {
			calls.push([resource, args]);
			return resource === 'chat_status'
				? { connected: true, registered: true, hasQr: false }
				: resource === 'group_chat_info'
					? { id: GROUP_ID, name: 'Baguncinha: Apuração começou!' }
					: { updated: true };
		},
	};
	try {
		await run({
			opts,
			calls,
			setDate: value => {
				date = new Date(value);
			},
			generated: () => generated,
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

test('uses Brasília slots, fixed group, and persists completion across restarts', () =>
	fixture(async f => {
		const tick = createNewsRunner(f.opts);
		f.setDate('2026-10-27T13:29:59Z');
		await tick();
		assert.equal(f.calls.length, 0);
		f.setDate('2026-10-27T13:30:00Z');
		await tick();
		assert.deepEqual(
			f.calls.map(c => c[0]),
			['chat_status', 'group_chat_info', 'group_set_subject', 'group_set_picture']
		);
		assert.equal(f.calls[2][1].chatId, GROUP_ID);
		assert.equal(f.calls[3][1].chatId, GROUP_ID);
		await createNewsRunner(f.opts)();
		assert.equal(f.calls.length, 4);
		f.setDate('2026-10-27T22:00:00Z');
		await tick();
		assert.equal(f.generated(), 2);
		f.setDate('2026-10-28T13:45:00Z');
		await tick();
		assert.equal(f.generated(), 2);
	}));

test('does not generate or alter groups when WhatsApp is unpaired', () =>
	fixture(async f => {
		f.opts.ask = async () => ({ connected: true, registered: false, hasQr: true });
		await createNewsRunner(f.opts)();
		assert.equal(f.generated(), 0);
	}));

test('photo failure resumes same draft without renaming or regenerating', () =>
	fixture(async f => {
		const ask = f.opts.ask;
		let fail = true;
		f.opts.ask = async (resource, args) => {
			if (resource === 'group_set_picture' && fail) {
				fail = false;
				throw Error('upload failed');
			}
			return ask(resource, args);
		};
		await assert.rejects(createNewsRunner(f.opts)(), /upload failed/);
		await createNewsRunner(f.opts)();
		assert.equal(f.generated(), 1);
		assert.equal(f.calls.filter(c => c[0] === 'group_set_subject').length, 1);
		assert.equal(f.calls.filter(c => c[0] === 'group_set_picture').length, 1);
	}));

test('generation failure preserves group and stops after three attempts', () =>
	fixture(async f => {
		let attempts = 0;
		f.opts.generate = async () => {
			attempts++;
			throw Error('provider unavailable');
		};
		const tick = createNewsRunner(f.opts);
		for (let i = 0; i < 3; i++) await assert.rejects(tick());
		await tick();
		assert.equal(attempts, 3);
		assert.ok(f.calls.every(c => ['chat_status', 'group_chat_info'].includes(c[0])));
	}));

test('slow generation cannot publish outside the slot window', () =>
	fixture(async f => {
		f.opts.generate = async () => {
			f.setDate('2026-10-27T13:46:00Z');
			return draft;
		};
		await createNewsRunner(f.opts)();
		assert.ok(f.calls.every(c => ['chat_status', 'group_chat_info'].includes(c[0])));
	}));

test('rejects invalid names, missing sources and stale news', () => {
	assert.equal(
		parseNewsIdea(JSON.stringify(draft), '2026-10-27').subject,
		draft.subject
	);
	for (const change of [
		{ subject: 'Outro nome' },
		{ subject: 'Baguncinha: ' + 'x'.repeat(100) },
		{ sourceUrls: [] },
		{ publishedDate: '2026-10-24' },
		{ publishedDate: '2026-10-28' },
	]) {
		assert.throws(() =>
			parseNewsIdea(JSON.stringify({ ...draft, ...change }), '2026-10-27')
		);
	}
});

test('refuses to generate an image without confirmed web research', async () => {
	const original = FuelIXApi.createToolResponseCompletion;
	FuelIXApi.createToolResponseCompletion = async () => ({
		text: JSON.stringify(draft),
		webSearchCalls: 0,
	});
	try {
		await assert.rejects(
			generateNewsDraft('2026-10-27', [], { subject: 'Baguncinha: anterior' }),
			/Pesquisa web não confirmada/
		);
	} finally {
		FuelIXApi.createToolResponseCompletion = original;
	}
});

test('same theme is persisted as skipped and never changes name/photo, even after restart', () =>
	fixture(async f => {
		let generations = 0;
		f.opts.generate = async (_date, _previous, current) => {
			generations++;
			assert.equal(current.subject, 'Baguncinha: Apuração começou!');
			return { skipped: true, reason: 'same_theme', idea: draft };
		};
		await createNewsRunner(f.opts)();
		await createNewsRunner(f.opts)();
		assert.equal(generations, 1);
		assert.ok(!f.calls.some(c => c[0].startsWith('group_set_')));
	}));

test('compares actual WhatsApp name using only history that was applied to that name', () =>
	fixture(async f => {
		await writeFile(
			path.join(f.opts.directory, '2026-10-26-1900.json'),
			JSON.stringify({
				attempts: 1,
				draft: {
					...draft,
					subject: 'Baguncinha: Apuração começou!',
					headline: 'Apuração eleitoral',
				},
				subjectUpdated: true,
				pictureUpdated: true,
			})
		);
		await writeFile(
			path.join(f.opts.directory, '2026-10-27-0900.json'),
			JSON.stringify({
				attempts: 1,
				draft: { ...draft, headline: 'Uma notícia que não chegou ao grupo' },
			})
		);
		f.opts.generate = async (_date, _previous, current) => {
			assert.deepEqual(current, {
				subject: 'Baguncinha: Apuração começou!',
				headline: 'Apuração eleitoral',
			});
			return draft;
		};
		await createNewsRunner(f.opts)();
		assert.equal(f.calls.filter(c => c[0] === 'group_set_picture').length, 1);
	}));

test('unavailable current group name blocks generation and changes', () =>
	fixture(async f => {
		const ask = f.opts.ask;
		f.opts.ask = async (resource, args) =>
			resource === 'group_chat_info' ? undefined : ask(resource, args);
		await assert.rejects(createNewsRunner(f.opts)(), /Nome atual/);
		assert.equal(f.generated(), 0);
	}));

test('semantic comparison blocks image generation for same event despite a different joke', async () => {
	const original = FuelIXApi.createToolResponseCompletion,
		originalImage = FuelIXApi.generateImage;
	let comparisons = 0;
	FuelIXApi.createToolResponseCompletion = async payload => {
		if (payload.tools.length)
			return { text: JSON.stringify(draft), webSearchCalls: 1 };
		comparisons++;
		const context = JSON.parse(payload.messages[1].content);
		assert.equal(context.current.headline, 'Missão espacial tem lançamento adiado');
		assert.equal(context.proposed.subject, draft.subject);
		return { text: '{"decision":"same"}' };
	};
	FuelIXApi.generateImage = async () =>
		assert.fail('same theme must not generate an image');
	try {
		const result = await generateNewsDraft('2026-10-27', [], {
			subject: 'Baguncinha: NASA ficou no ponto',
			headline: 'Missão espacial tem lançamento adiado',
		});
		assert.equal(result.skipped, true);
		assert.equal(result.reason, 'same_theme');
		assert.equal(comparisons, 1);
	} finally {
		FuelIXApi.createToolResponseCompletion = original;
		FuelIXApi.generateImage = originalImage;
	}
});

test('different event allows update; uncertain or malformed comparison blocks it', async () => {
	const original = FuelIXApi.createToolResponseCompletion;
	try {
		FuelIXApi.createToolResponseCompletion = async () => ({
			text: '{"decision":"different"}',
		});
		assert.equal(
			await compareNewsTheme(draft, { subject: 'Baguncinha: Apuração começou!' }),
			false
		);
		for (const text of [
			'{"decision":"unknown"}',
			'{}',
			'{"decision":false}',
			'invalid',
		]) {
			FuelIXApi.createToolResponseCompletion = async () => ({ text });
			await assert.rejects(
				compareNewsTheme(draft, { subject: 'Baguncinha: outro tema' })
			);
		}
	} finally {
		FuelIXApi.createToolResponseCompletion = original;
	}
});
