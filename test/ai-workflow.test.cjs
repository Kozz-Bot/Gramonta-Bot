const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const maker = require('kozz-module-maker');
const { onCommand } = require('kozz-module-maker/dist/Socket/Events/Handle/Command');
const {
	createAskResource,
} = require('kozz-module-maker/dist/Message/RoutineCreation/AskResource');
const { registerOwnerAiModule } = require('../dist/Services/OwnerAI/modules');
const { createReminderStore } = require('../dist/Handlers/Lembrete/store');
const { closeMemoryStores } = require('../dist/Services/AiMemory/store');
const Fuel = require('../dist/API/FuelIXApi').default;
const { executeChatTool } = require('../dist/Services/ChatCommands/execute');
const { generatedImage } = require('../dist/Services/AiExecution');
const call = (id, name, args) => ({
	id,
	function: { name, arguments: JSON.stringify(args) },
});
const fixture = t => {
	const cwd = process.cwd(),
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-workflow-'));
	process.chdir(dir);
	const store = createReminderStore(path.join(dir, 'reminders')),
		socket = new EventEmitter(),
		incoming = socket.emit.bind(socket),
		outgoing = new Set();
	socket.connected = true;
	socket.onAnyOutgoing = fn => outgoing.add(fn);
	socket.offAnyOutgoing = fn => outgoing.delete(fn);
	socket.emit = (name, payload) => {
		outgoing.forEach(fn => fn(name, payload));
		return incoming(name, payload);
	};
	const state = { nativeSubmitted: true, events: [], texts: [], media: [] };
	const resource = (name, data = {}) =>
		state.resources?.(name, data) ??
		(name === 'group_members'
			? {
					matches: [
						{ id: '11@lid', name: 'Ana', aliases: ['11@lid', '111@s.whatsapp.net'] },
					],
				}
			: name === 'group_chat_info'
				? { participants: [{ id: '11@lid' }] }
				: name === 'lid_from_jid'
					? { lid: '11@lid' }
					: name === 'jid_from_lid'
						? { jid: '111@s.whatsapp.net' }
						: name === 'group_event'
							? (state.events.push(data), { submitted: state.nativeSubmitted })
							: []);
	socket.on('ask_resource', payload =>
		queueMicrotask(() =>
			incoming(`reply_resource/${payload.request.id}`, {
				...payload,
				response: resource(payload.request.resource, payload.request.data),
			})
		)
	);
	socket.on('reply_with_text', p => state.texts.push(p.body));
	const original = Module._load,
		interval = global.setInterval,
		restored = [];
	const files = ['Role', 'Lembrete', 'AI'].map(name =>
		require.resolve('../dist/Handlers/' + name)
	);
	for (const file of files) {
		restored.push([file, require.cache[file]]);
		delete require.cache[file];
	}
	global.setInterval = () => ({ unref() {} });
	Module._load = function (request, parent, main) {
		if (request === 'kozz-module-maker')
			return {
				...maker,
				createModule: options => {
					const runtime = {
						name: options.name,
						socket,
						commandMethods: options.commands.methods,
						executeCommand: onCommand(
							socket,
							options.commands.methods,
							[],
							options.name,
							'',
							['kozz-zapo']
						),
						ask: createAskResource(socket, {
							requester: { id: options.name, type: 'Handler', namespace: 'default' },
						}),
						resources: { upsertResource: () => runtime },
					};
					return runtime;
				},
			};
		if (request === './store' && parent.filename.endsWith('/Lembrete/index.js'))
			return {
				...require('../dist/Handlers/Lembrete/store'),
				createReminderStore: () => store,
			};
		return original.call(this, request, parent, main);
	};
	let ai;
	try {
		registerOwnerAiModule(require(files[0]).startRoleHandler());
		registerOwnerAiModule(require(files[1]).startLembreteHandler());
		ai = require(files[2]).startAIHandler();
		registerOwnerAiModule(ai);
	} finally {
		Module._load = original;
		global.setInterval = interval;
		for (const [file, cached] of restored) {
			if (cached) require.cache[file] = cached;
			else delete require.cache[file];
		}
	}
	const reply = text => state.texts.push(text);
	reply.withButtons = () => assert.fail('No extra WhatsApp confirmations');
	reply.withMedia = (media, caption) => state.media.push({ media, caption });
	reply.withMedia.fromB64 = (data, type) => state.media.push({ data, type });
	reply.withMedia.fromUrl = (data, type) => state.media.push({ data, type });
	const r = {
		message: {
			id: 'request',
			chatId: '123@g.us',
			to: '123@g.us',
			from: '111@s.whatsapp.net',
			contact: { id: '111@s.whatsapp.net', publicName: 'Ana' },
			boundaryId: 'b',
			boundaryName: 'kozz-zapo',
			namespace: 'default',
			fromHostAccount: false,
			taggedContacts: [],
			body: '!ai gere uma arte, crie um evento e me lembre depois',
			timestamp: Date.now(),
		},
		rawCommand: { query: 'gere uma arte, crie um evento e me lembre depois' },
		reply,
		react() {},
		ask: {
			boundary: async (_b, name, data) => ({ response: resource(name, data) }),
		},
	};
	const day = new Date(Date.now() + 3 * 86400000),
		dateTime = `${String(day.getUTCDate()).padStart(2, '0')}/${String(day.getUTCMonth() + 1).padStart(2, '0')}/${day.getUTCFullYear()} 19:00`;
	const event = { title: 'Futebol', dateTime, location: 'Quadra' },
		reminder = { duration: '2h', text: 'Conferir o futebol', recipientIds: [] };
	const provider = Fuel.createToolResponseCompletion,
		image = Fuel.generateImage,
		audio = Fuel.generateSpeech;
	t.after(() => {
		Fuel.createToolResponseCompletion = provider;
		Fuel.generateImage = image;
		Fuel.generateSpeech = audio;
		closeMemoryStores();
		process.chdir(cwd);
		fs.rmSync(dir, { recursive: true, force: true });
	});
	return {
		state,
		r,
		store,
		event,
		reminder,
		run: () => ai.commandMethods.fallback.func(r),
	};
};
test('one request generates image+audio, feeds generated artwork to a real event and schedules a real reminder; retries/aliases do not duplicate', async t => {
	const f = fixture(t);
	const bytes = await require('sharp')({
		create: { width: 8, height: 8, channels: 3, background: 'red' },
	})
		.png()
		.toBuffer();
	let generated = 0,
		spoken = 0,
		round = 0;
	Fuel.generateImage = async () => {
		generated++;
		return { b64_json: bytes.toString('base64') };
	};
	Fuel.generateSpeech = async () => {
		spoken++;
		return 'YXVkaW8=';
	};
	Fuel.createToolResponseCompletion = async options => {
		round++;
		if (round === 1)
			return {
				responseId: 'r1',
				tool_calls: [
					call('image', 'generate_image', { prompt: 'Arte de futebol' }),
					call('audio', 'generate_speech', { input: 'Vai ter futebol' }),
				],
			};
		const results = options.messages
			.filter(m => m.role === 'tool')
			.map(m => JSON.parse(m.content));
		if (round === 2) {
			assert.equal(results.length, 2);
			assert.ok(results.every(r => r.success));
			return {
				responseId: 'r2',
				tool_calls: [
					call('event', 'chat_create_event', {
						...f.event,
						imageRef: results[0].imageRef,
					}),
					call('reminder', 'chat_create_reminder', f.reminder),
				],
			};
		}
		if (round === 3) {
			assert.deepEqual(
				results.map(r => r.status),
				['submitted', 'scheduled']
			);
			assert.match(results[0].outcome.eventId, /^[a-f0-9]+$/);
			assert.match(results[1].outcome.reminderId, /^[a-f0-9]+$/);
			return {
				responseId: 'r3',
				tool_calls: [
					call('event-retry', 'chat_execute_command', {
						module: 'evento',
						method: 'criar',
						immediateArg: Object.values(f.event).join(' | '),
						namedArgs: '{}',
						recipientIds: [],
					}),
					call('reminder-retry', 'chat_execute_command', {
						module: 'lembrete',
						method: 'criar',
						immediateArg: '2h Conferir o futebol',
						namedArgs: '{}',
						recipientIds: [],
					}),
					call('image-retry', 'generate_image', { prompt: 'Arte de futebol' }),
				],
			};
		}
		assert.ok(results.every(r => r.reused === true));
		return {
			content: 'Arte e áudio enviados, evento publicado e lembrete agendado.',
			tool_calls: [],
		};
	};
	await f.run();
	assert.equal(round, 4);
	assert.equal(generated, 1);
	assert.equal(spoken, 1);
	assert.equal(f.state.events.length, 1);
	assert.equal(f.state.events[0].chatId, '123@g.us');
	assert.equal(f.state.events[0].artwork.data, bytes.toString('base64'));
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 1);
	assert.equal(f.state.media.length, 2);
	assert.match(f.state.texts.at(-1), /lembrete agendado/);
	await assert.rejects(
		executeChatTool({ ...f.r }, 'chat_create_event', {
			...f.event,
			imageRef: 'generated-image-1',
		}),
		/neste mesmo pedido/
	);
	assert.throws(() => generatedImage({}, 'generated-image-1'));
});
test('uncertain event does not repeat; independent reminder continues and provider outage produces an accurate partial summary', async t => {
	const f = fixture(t);
	f.state.nativeSubmitted = false;
	let round = 0;
	Fuel.createToolResponseCompletion = async options => {
		if (!round++)
			return {
				responseId: 'partial',
				tool_calls: [
					call('event', 'chat_create_event', f.event),
					call('reminder', 'chat_create_reminder', f.reminder),
				],
			};
		const results = options.messages
			.filter(m => m.role === 'tool')
			.map(m => JSON.parse(m.content));
		if (round === 2) {
			assert.equal(results[0].status, 'uncertain');
			assert.equal(results[1].status, 'scheduled');
			return {
				responseId: 'retry',
				tool_calls: [call('again', 'chat_create_event', f.event)],
			};
		}
		assert.equal(results[0].reused, true);
		throw Error('Provider unavailable');
	};
	await f.run();
	assert.equal(f.state.events.length, 1);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 1);
	assert.match(f.state.texts.at(-1), /resultado incerto/);
	assert.match(f.state.texts.at(-1), /agendado/);
});
test('round limit reports completed work rather than claiming nothing happened, and preserves context if provider omits response IDs', async t => {
	const f = fixture(t);
	let calls = 0;
	Fuel.createToolResponseCompletion = async options => {
		calls++;
		if (calls > 1) {
			assert.equal(options.previousResponseId, undefined);
			assert.ok(options.messages.some(m => m.role === 'system'));
			assert.ok(options.messages.some(m => m.type === 'function_call'));
		}
		return {
			tool_calls: [call('call-' + calls, 'chat_create_reminder', f.reminder)],
		};
	};
	await f.run();
	assert.equal(calls, 10);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 1);
	assert.match(f.state.texts.at(-1), /limite de etapas/);
	assert.match(f.state.texts.at(-1), /agendado/);
});

test('validation failure does not skip the remaining batch and submitted reminders are not repeated after it', async t => {
	const f = fixture(t);
	let round = 0;
	Fuel.createToolResponseCompletion = async options => {
		if (!round++)
			return {
				responseId: 'validation',
				tool_calls: [
					call('bad-event', 'chat_create_event', {
						...f.event,
						dateTime: 'data inválida',
					}),
					call('ok-reminder', 'chat_create_reminder', f.reminder),
				],
			};
		const outputs = options.messages.filter(m => m.role === 'tool');
		assert.equal(outputs.length, 2);
		assert.match(outputs[0].content, /data|formato|DD\/MM/i);
		assert.equal(JSON.parse(outputs[1].content).status, 'scheduled');
		return {
			content: 'O lembrete foi agendado. Preciso de uma data válida para o evento.',
			tool_calls: [],
		};
	};
	await f.run();
	assert.equal(f.state.events.length, 0);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 1);
	assert.match(f.state.texts.at(-1), /data válida/);
});

test('read commands stay fresh between writes while identical mutations are coalesced concurrently', async t => {
	const f = fixture(t),
		listing = {
			module: 'lembrete',
			method: 'lista',
			immediateArg: '',
			namedArgs: '{}',
			recipientIds: [],
		};
	await executeChatTool(f.r, 'chat_execute_command', listing);
	const first = f.state.texts.at(-1);
	const [a, b] = await Promise.all([
		executeChatTool(f.r, 'chat_create_reminder', f.reminder),
		executeChatTool(f.r, 'chat_create_reminder', f.reminder),
	]);
	assert.equal(
		JSON.parse(a.content).outcome.reminderId,
		JSON.parse(b.content).outcome.reminderId
	);
	assert.ok(
		[JSON.parse(a.content).reused, JSON.parse(b.content).reused].includes(true)
	);
	await executeChatTool(f.r, 'chat_execute_command', listing);
	assert.notEqual(f.state.texts.at(-1), first);
	assert.match(f.state.texts.at(-1), /Conferir o futebol/);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 1);
});

test('tia message continues to the following action instead of ending the workflow', async t => {
	const f = fixture(t),
		tia = require('../dist/Handlers/AI/talk/tiaHandler'),
		original = tia.getTiaMessage;
	let requests = 0,
		round = 0;
	tia.getTiaMessage = async () => {
		requests++;
		return { title: 'Bom dia', text: 'Tenha um bom dia!', url: '' };
	};
	t.after(() => {
		tia.getTiaMessage = original;
	});
	Fuel.createToolResponseCompletion = async options => {
		if (!round++)
			return {
				responseId: 'tia',
				tool_calls: [
					call('tia', 'get_tia_message', { query: 'bom dia' }),
					call('reminder', 'chat_create_reminder', f.reminder),
				],
			};
		const results = options.messages
			.filter(m => m.role === 'tool')
			.map(m => JSON.parse(m.content));
		assert.deepEqual(
			results.map(r => r.status),
			['submitted', 'scheduled']
		);
		return { content: 'Mensagem enviada e lembrete agendado.', tool_calls: [] };
	};
	await f.run();
	assert.equal(requests, 1);
	assert.equal(f.store.list('kozz-zapo', '123@g.us').length, 1);
	assert.match(f.state.texts.at(-1), /Mensagem enviada e lembrete/);
});

test('AI discovers old media from text context, requests only relevant IDs and receives actual multimodal evidence for the next round', async t => {
	const f = fixture(t),
		interpret = require('../dist/Services/MediaUnderstanding/interpret'),
		original = interpret.interpretMedia;
	t.after(() => (interpret.interpretMedia = original));
	let interpreted = 0,
		reads = 0,
		round = 0;
	interpret.interpretMedia = async () => {
		interpreted++;
		return {
			summary: { transcript: 'O encontro será às sete.' },
			parts: [{ type: 'image_url', image_url: 'https://example.invalid/frame.jpg' }],
		};
	};
	const pic = {
		id: 'old-photo',
		chatId: '123@g.us',
		from: '11@lid',
		contact: { publicName: 'Ana' },
		body: 'O cartaz',
		hasMedia: true,
		messageType: 'IMAGE',
		replyTo: { id: 'question', body: 'Qual horário?' },
	};
	f.state.resources = (name, data) => {
		if (name === 'chat_media_message') {
			reads++;
			assert.deepEqual(data, { chatId: '123@g.us', messageId: 'old-photo' });
			return { ...pic, media: { data: 'mock', mimeType: 'image/png' } };
		}
		if (name === 'recent_chat_messages') return round ? [pic] : [];
	};
	Fuel.createToolResponseCompletion = async options => {
		round++;
		assert.ok(
			options.tools.some(
				t => t.type === 'function' && t.function.name === 'get_chat_media'
			)
		);
		if (round === 1) {
			assert.equal(reads, 0);
			return {
				responseId: 'first',
				tool_calls: [call('context', 'get_chat_context', { limit: 50 })],
			};
		}
		if (round === 2) {
			assert.match(
				options.messages.find(m => m.role === 'tool').content,
				/old-photo/
			);
			assert.equal(reads, 0);
			return {
				responseId: 'second',
				tool_calls: [call('media', 'get_chat_media', { messageIds: ['old-photo'] })],
			};
		}
		assert.equal(options.previousResponseId, 'second');
		assert.equal(JSON.parse(options.messages[0].content).results[0].success, true);
		const evidence = options.messages.find(m => Array.isArray(m.content));
		assert.equal(evidence.content[1].type, 'image_url');
		assert.match(evidence.content[0].text, /Ana/);
		assert.match(evidence.content[0].text, /question/);
		assert.match(evidence.content[0].text, /sete/);
		return { content: 'O encontro é às sete, conforme o cartaz.', tool_calls: [] };
	};
	await f.run();
	assert.equal(round, 3);
	assert.equal(reads, 1);
	assert.equal(interpreted, 1);
	assert.match(f.state.texts.at(-1), /sete/);
});
test('direct quoted video is interpreted before provider call and replay retains media when response IDs are absent', async t => {
	const f = fixture(t),
		interpret = require('../dist/Services/MediaUnderstanding/interpret'),
		original = interpret.interpretMedia;
	t.after(() => (interpret.interpretMedia = original));
	let round = 0,
		interpreted = 0;
	interpret.interpretMedia = async () => {
		interpreted++;
		return {
			summary: { kind: 'video', transcript: 'Olá do vídeo' },
			parts: [{ type: 'image_url', image_url: 'https://example.invalid/video.jpg' }],
		};
	};
	f.r.message.quotedMessage = {
		id: 'video',
		chatId: '123@g.us',
		to: '123@g.us',
		from: '11@lid',
		contact: { publicName: 'Ana' },
		messageType: 'VIDEO',
		hasMedia: true,
		media: { data: 'mock', mimeType: 'video/mp4' },
	};
	Fuel.createToolResponseCompletion = async options => {
		round++;
		assert.ok(
			options.messages.some(
				m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
			)
		);
		if (round === 1)
			return {
				tool_calls: [call('again', 'get_chat_media', { messageIds: ['video'] })],
			};
		assert.ok(
			options.messages.some(
				m => m.type === 'function_call' && m.name === 'get_chat_media'
			)
		);
		return { content: 'O vídeo diz olá.', tool_calls: [] };
	};
	await f.run();
	assert.equal(interpreted, 1);
	assert.equal(round, 2);
});
