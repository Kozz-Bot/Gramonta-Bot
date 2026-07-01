import { createModule, createMethod } from 'kozz-module-maker';
import OpenAPI, { Message } from 'src/API/OpenAi';
import { usePremiumCommand } from 'src/Middlewares/Coins';
import { convertB64ToPath } from 'src/Utils/ffmpeg';
import { loadTemplates, MessageObj } from 'kozz-module-maker/dist/Message';
import { Media, MessageReceived } from 'kozz-types';
import {
	StylePreset,
	availableStyles,
	isStabilityError,
	isValidStyle,
	textToImage,
} from 'src/API/StabiliyApi';
import { randomItem } from 'src/Utils/arrays';
import {
	createChatCompletion,
	fromPrompt,
	interpretImage,
} from 'src/API/MistralApi';
import { transcribeFile } from 'src/API/Deepgram';
import { isAxiosError } from 'axios';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import { generateTTS } from 'src/API/ElevenLabs';
import { ImageStyleUnsupported } from './messages';
import { executeBotAction } from 'src/Agent/executeBotAction';

import { toolTalkSystemPrompt } from './prompts';
import { talkTools, extractToolArgs, findToolCall } from './tools';
import { formatMessageForLlm } from './talk/formatMessage';
import {
	extractTiaQuery,
	getTiaMessage,
	createTiaBotAction,
} from './talk/tiaHandler';
import { handleWebSearch } from './talk/webSearchHandler';

const API = new OpenAPI();

// ─── image ───────────────────────────────────────────────────────────────────

const image = createMethod(
	'image',
	usePremiumCommand(
		5,
		async (requester, { style }) => {
			try {
				const prompt = requester.rawCommand!.immediateArg;

				if (!prompt) {
					requester.reply.withTemplate('EmptyPrompt');
					return false;
				}

				requester.react('⏳');

				if (!isValidStyle(style)) {
					style = randomItem(availableStyles);
					requester.reply(<ImageStyleUnsupported style={style} />);
				}

				const response = await textToImage(prompt, {
					style_preset: style as StylePreset,
				});

				if (isStabilityError(response)) {
					requester.react('❌');
					requester.reply(`Error: ${response.message}`);
					return false;
				}

				requester.react('🎨');
				requester.reply.withMedia.fromB64(response.image, 'image');
			} catch (e) {
				requester.reply(`Erro: ${e}`);
				return false;
			}
		},
		'Você não possui CalvoCoins suficientes para usar esse comando'
	),
	{ style: 'string?' }
);

// ─── image-styles ─────────────────────────────────────────────────────────────

const imageStyleList = createMethod('image-styles', requester => {
	requester.reply(availableStyles.join('\n'));
});

// ─── transcribe ───────────────────────────────────────────────────────────────

const transcribe = createMethod('transcribe', async requester => {
	try {
		if (!requester.message.quotedMessage?.media) {
			requester.reply.withTemplate('TranscribeNeedsQuote');
			return false;
		}

		requester.react('⏳');
		const tempFilepath = await convertB64ToPath(
			requester.message.quotedMessage.media.data,
			'opus',
			'mp3'
		);

		const transcription = await transcribeFile(tempFilepath);

		requester.react('✏');
		return requester.reply(
			`Transcrição do audio de ${tagMember(
				requester.message.quotedMessage.contact.id
			)}:\n"${transcription.alternatives[0].transcript}"`
		);
	} catch (e) {
		requester.reply(`Erro: ${e}`);
		return false;
	}
});

// ─── emojify ──────────────────────────────────────────────────────────────────

const emojify = createMethod('emojify', async requester => {
	try {
		if (!requester.message.quotedMessage?.body) {
			requester.reply.withTemplate('EmojifyNeedsQute');
			return false;
		}

		requester.react('⏳');
		const response = await API.emojify(`${requester.message.quotedMessage.body}`);
		requester.reply(response);
	} catch (e) {
		requester.reply(`Erro: ${e}`);
		return false;
	}
});

// ─── talk ─────────────────────────────────────────────────────────────────────

type ChatContextMessage = {
	id: string;
	timestamp: number;
	from: string;
	body: string;
	taggedConctactFriendlyBody?: string;
	messageType: MessageReceived['messageType'];
	fromHostAccount: boolean;
	contact: {
		id: string;
		publicName: string;
		isHostAccount: boolean;
	} | null;
	hasMedia: boolean;
};

const normalizeContextLimit = (limit: unknown, fallback = 200) => {
	const numericLimit = typeof limit === 'number' ? limit : Number(limit);

	if (!Number.isFinite(numericLimit)) {
		return fallback;
	}

	return Math.max(1, Math.min(Math.floor(numericLimit), 1000));
};

const fetchCurrentChatContext = async (
	requester: MessageObj,
	limit: number
): Promise<ChatContextMessage[]> => {
	const { response } = await requester.ask.boundary(
		requester.message.boundaryName,
		'recent_chat_messages',
		{
			chatId: requester.message.to,
			limit,
			excludeMessageId: requester.message.id,
		}
	);

	return Array.isArray(response) ? (response as ChatContextMessage[]) : [];
};

const normalizeContextTimestamp = (timestamp: number) =>
	timestamp > 0 && timestamp < 1e12 ? timestamp * 1000 : timestamp;

const formatChatContextForLlm = (contextMessages: ChatContextMessage[]) => {
	if (!contextMessages.length) {
		return '(nenhuma mensagem anterior encontrada no chat atual)';
	}

	return contextMessages
		.map(message => {
			const author =
				message.contact?.publicName ||
				(message.fromHostAccount ? 'Dono do bot' : message.from);
			const content =
				message.taggedConctactFriendlyBody ||
				message.body ||
				(message.hasMedia
					? `{enviou uma mídia do tipo ${message.messageType}}`
					: '(mensagem sem texto)');

			return `[${new Date(
				normalizeContextTimestamp(message.timestamp)
			).toISOString()}] ${author}: ${content}`;
		})
		.join('\n');
};

const runTalk = async (requester: MessageObj) => {
	const messages: Message[] = [];
	let currMessage: MessageReceived | undefined = requester.message;

	while (currMessage) {
		messages.unshift(await formatMessageForLlm(currMessage));
		currMessage = currMessage.quotedMessage;
	}

	const firstResponse = await createChatCompletion({
		messages: [{ role: 'system', content: toolTalkSystemPrompt }, ...messages],
		tools: talkTools,
		tool_choice: 'auto',
	});

	// ── get_tia_message ─────────────────────────────────────────────────
	const tiaTool = findToolCall(firstResponse.tool_calls, 'get_tia_message');
	if (tiaTool) {
		const toolArgs = extractTiaQuery(tiaTool);
		if (!toolArgs?.query) {
			return requester.reply(
				'[#CalvoGPT]: Não consegui entender qual mensagem você queria pesquisar.'
			);
		}

		console.log(`[AI:tool] get_tia_message → query="${toolArgs.query}"`);
		const tiaMessage = await getTiaMessage(toolArgs.query);
		return executeBotAction(requester, createTiaBotAction(tiaMessage));
	}

	// ── search_web ──────────────────────────────────────────────────────
	const searchTool = findToolCall(firstResponse.tool_calls, 'search_web');
	if (searchTool) {
		const args = extractToolArgs(searchTool);
		const query = typeof args?.query === 'string' ? args.query.trim() : '';
		const mode = args?.mode === 'full' ? 'full' : 'summary';

		if (!query) {
			return requester.reply(
				'[#CalvoGPT]: Não consegui montar a consulta de busca. Tente reformular sua pergunta.'
			);
		}

		requester.react('🔍');
		requester.reply(
			'[#CalvoGPT]: Deixa eu pesquisar isso rapidinho na web pra você! 🔎'
		);

		const synthesized = await handleWebSearch(query, mode, messages);
		return requester.reply(synthesized.replace(/(.*)]:/, '[#CalvoGpt]:'));
	}

	// ── get_chat_context ────────────────────────────────────────────────
	const chatContextTool = findToolCall(firstResponse.tool_calls, 'get_chat_context');
	if (chatContextTool) {
		const args = extractToolArgs(chatContextTool);
		const limit = normalizeContextLimit(args?.limit);

		console.log(`[AI:tool] get_chat_context → limit=${limit}`);
		requester.react('📚');

		const contextMessages = await fetchCurrentChatContext(requester, limit);
		const finalResponse = await createChatCompletion({
			messages: [
				{ role: 'system', content: toolTalkSystemPrompt },
				...messages,
				{
					role: 'assistant',
					content: firstResponse.content ?? '',
					tool_calls: [chatContextTool],
				},
				{
					role: 'tool',
					tool_call_id: chatContextTool.id,
					name: 'get_chat_context',
					content: formatChatContextForLlm(contextMessages),
				},
			],
			tools: talkTools,
			tool_choice: 'none',
		});

		const response =
			finalResponse.content ??
			'[#CalvoGPT]: Não consegui responder com o contexto da conversa agora.';

		return requester.reply(response.replace(/(.*)]:/, '[#CalvoGpt]:'));
	}

	// ── plain response ──────────────────────────────────────────────────
	const response =
		firstResponse.content ??
		(await fromPrompt(messages, requester.message.fromHostAccount));

	requester.reply(response.replace(/(.*)]:/, '[#CalvoGpt]:'));
};

const talk = createMethod('talk', requester =>
	requester.reply(
		'[#CalvoGPT]: O comando `!ai talk` foi depreciado. Agora use `!ai` direto, por exemplo: `!ai qual foi a festa que o Pedro foi?` ou `!ai resume a conversa`.'
	)
);

// ─── speak ────────────────────────────────────────────────────────────────────

const speak = createMethod(
	'speak',
	usePremiumCommand(
		5,
		async requester => {
			const targetMessage = requester.message.quotedMessage;
			if (!targetMessage?.body) {
				requester.reply(
					'Responda uma mensagem de texto para a IA transformar em áudio'
				);
				return false;
			}

			const b64 = await generateTTS(targetMessage.body);
			if (!b64) {
				requester.reply('Erro ao tentar transcrever audio.');
				return false;
			}

			const audio: Media = {
				data: b64,
				duration: null,
				fileName: 'tts.mp3',
				mimeType: 'audio/mp3',
				sizeInBytes: null,
				stickerTags: [],
				transportType: 'b64',
			};

			requester.reply.withMedia(audio);
		},
		'Você não possui moedas o suficiente.'
	)
);

// ─── summary ──────────────────────────────────────────────────────────────────

const askSummary = createMethod(
	'summary',
	requester =>
		requester.reply(
			'[#CalvoGPT]: O comando `!ai summary` foi depreciado. Agora é só perguntar direto com `!ai`, por exemplo: `!ai resume a conversa` ou `!ai qual foi a festa que o Pedro foi?`. Quando precisar, eu busco automaticamente o contexto recente deste chat.'
		)
);

// ─── read-image ───────────────────────────────────────────────────────────────

const readImage = createMethod('read-image', async requester => {
	try {
		const media = requester.message.media || requester.message.quotedMessage?.media;

		if (!media || !media.mimeType.startsWith('image')) {
			return requester.reply('Por favor, envie ou marque uma imagem para a IA ler');
		}

		requester.react('⏳');
		const interpretation = await interpretImage(media);
		requester.react('✅');
		requester.reply(interpretation);
	} catch (e) {
		console.log(e);
		const errorMessage = isAxiosError(e) ? e.response?.data.message : e;
		requester.reply(`Erro ao interpretar imagem: ${errorMessage}`);
	}
});

// ─── fallback ─────────────────────────────────────────────────────────────────

const fallback = createMethod('fallback', async requester => {
	if (requester.rawCommand?.query) {
		try {
			return await runTalk(requester);
		} catch (e) {
			console.warn('AI fallback talk failed:', e);
			return requester.reply(
				'[#CalvoGPT]: Tive um problema ao processar sua mensagem agora. Tente novamente em instantes.'
			);
		}
	}

	return requester.reply.withTemplate('Help');
});

// ─── module ───────────────────────────────────────────────────────────────────

const templatePath = './src/Handlers/AI/messages.kozz.md';

export const startAIHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...image,
				...fallback,
				...transcribe,
				...emojify,
				...talk,
				...imageStyleList,
				...askSummary,
				...readImage,
				...speak,
			},
		},
		name: 'ai',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
	return instance;
};
