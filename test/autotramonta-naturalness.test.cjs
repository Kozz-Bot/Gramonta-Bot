const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	chooseParticipation,
	naturalizeReply,
	isAcknowledgement,
} = require('../dist/Services/AutoTramonta/participation');
const { generateAutoReply } = require('../dist/Services/AutoTramonta/ai');
const make = (texts, extra = {}) => {
	const context = texts.map((text, i) => ({
		id: `m${i}`,
		author: i % 2 ? 'Beto' : 'Ana',
		text,
		timestamp: Date.now() + i,
	}));
	return {
		chatId: '123@g.us',
		context,
		newMessageIds: context.map(p => p.id),
		...extra,
	};
};

test('laughs, emoji, confirmations and thanks alone produce silence', () => {
	for (const text of [
		'KKKKKKKK',
		'😎👍',
		'Sim',
		'Blz',
		'Valeu',
		'Obrigado',
		'rsrsrs',
		'Ok',
	]) {
		assert.equal(isAcknowledgement(text), true);
		assert.equal(chooseParticipation(make([text])).kind, 'skip');
	}
	assert.equal(isAcknowledgement('Sim?'), false);
	assert.equal(
		chooseParticipation(make(['Tramonta, vc sabe como faz?'])).kind,
		'generate'
	);
});
test('resolved conversation between others stays silent even without previous AI activity', () => {
	for (const texts of [
		['Beto, me manda o comprovante amanhã', 'Fechou, te mando cedo'],
		['Gente hj mais tarde vou ficar off', 'Beleza, depois a gente se fala'],
	])
		assert.equal(chooseParticipation(make(texts)).kind, 'skip');
	assert.equal(
		chooseParticipation(make(['Tramonta, pode explicar o erro?', 'Beleza'])).kind,
		'generate'
	);
});
test('recent unsolicited participation gives space but direct mentions still work', () => {
	const input = make(['Mais uma coisa sobre o assunto'], {
		recentReplies: [
			{
				id: 'own',
				text: 'Uma contribuição',
				own: true,
				timestamp: Date.now() - 10_000,
			},
		],
	});
	assert.equal(chooseParticipation(input).kind, 'skip');
	input.context[0].mentioned = true;
	assert.equal(chooseParticipation(input).kind, 'generate');
});
test('a follow-up from the person just answered is eligible without repeating the owner name', () => {
	const input = make([
		'Tramonta, pq separar os processos?',
		'Mas como eles se comunicam?',
	]);
	input.context[1].author = 'Ana';
	input.newMessageIds = ['m1'];
	input.recentReplies = [
		{
			id: 'own',
			own: true,
			text: 'Pra não travar',
			respondingToMessageIds: ['m0'],
			timestamp: Date.now() - 10_000,
		},
	];
	assert.equal(chooseParticipation(input).kind, 'generate');
	input.context.push({
		id: 'someone',
		author: 'Clara',
		own: false,
		text: 'Oi',
		timestamp: Date.now(),
	});
	input.context[1].text = 'Clara, vc consegue me ajudar?';
	assert.equal(chooseParticipation(input).kind, 'skip');
});
test('automation and unknown personal schedule get honest responses without an API call', async () => {
	const axios = require('axios');
	const old = axios.post;
	axios.post = async () => {
		throw new Error('Should not call provider');
	};
	try {
		const identity = await generateAutoReply(
			make(['É o Tramonta mesmo digitando ou isso é bot?']),
			new AbortController().signal
		);
		assert.equal(identity.messages[0].text, 'É o AutoTramonta respondendo aqui');
		const personal = await generateAutoReply(
			make(['Tramonta, que horas vc chega no bar hoje?']),
			new AbortController().signal
		);
		assert.equal(personal.messages[0].text, 'Isso o Tramonta precisa confirmar');
		assert.deepEqual(
			await generateAutoReply(make(['KKKKK', 'Sim']), new AbortController().signal),
			{ messages: [] }
		);
	} finally {
		axios.post = old;
	}
});
test('native quote is kept for ambiguity, removed for adjacent replies and later parts', () => {
	const input = make(['Tramonta, qual é o comando?', 'Outra conversa aqui']);
	const reply = {
		respondingToMessageIds: ['m0'],
		messages: [
			{ text: 'Use aquele comando', quoteMessageId: 'm0' },
			{ text: 'E passe o nome', quoteMessageId: 'm0' },
		],
	};
	assert.equal(naturalizeReply(reply, input).messages[0].quoteMessageId, 'm0');
	assert.equal(naturalizeReply(reply, input).messages[1].quoteMessageId, undefined);
	input.context = input.context.slice(0, 1);
	assert.equal(naturalizeReply(reply, input).messages[0].quoteMessageId, undefined);
});
test('output guard suppresses invented presence and commitments but permits explanations', () => {
	const input = make(['Tramonta, explica esse código?']);
	for (const text of [
		'Ainda bem que não tô em reunião agora',
		'Já paguei',
		'Vou mandar o pix',
		'Estou em casa',
	]) {
		assert.deepEqual(
			naturalizeReply(
				{ respondingToMessageIds: ['m0'], messages: [{ text }] },
				input
			),
			{ messages: [] }
		);
	}
	assert.equal(
		naturalizeReply(
			{
				respondingToMessageIds: ['m0'],
				messages: [{ text: 'Vou explicar: o processo fica separado' }],
			},
			input
		).messages.length,
		1
	);
});

test('long laughter and ambiguous acknowledgements never stall the bot event loop', () => {
	const { spawnSync } = require('node:child_process');
	const worker = `
  const assert = require('node:assert/strict');
  const { isAcknowledgement, chooseParticipation } = require('./dist/Services/AutoTramonta/participation');
  for (const text of ['k'.repeat(100000), 'ha'.repeat(50000), 'he'.repeat(50000), 'rs'.repeat(50000), 'simokshow'.repeat(10000)]) assert.equal(isAcknowledgement(text), true);
  for (const text of ['k'.repeat(100000) + 'x', 'ha'.repeat(50000) + 'x', 'he'.repeat(50000) + 'x', 'rs'.repeat(50000) + 'x', 'simokshow'.repeat(10000) + ' outra coisa']) {
   assert.equal(isAcknowledgement(text), false);
   const context = [{ id: 'new', author: 'Example', text, timestamp: Date.now() }];
   assert.equal(chooseParticipation({ chatId: '123@g.us', context, newMessageIds: ['new'] }).kind, 'generate');
  }
 `;
	const child = spawnSync(process.execPath, ['-e', worker], {
		cwd: require('node:path').resolve(__dirname, '..'),
		timeout: 5000,
		encoding: 'utf8',
	});
	assert.equal(
		child.error?.code,
		undefined,
		'acknowledgement classification exceeded its isolated deadline'
	);
	assert.equal(child.status, 0, child.stderr);
});
