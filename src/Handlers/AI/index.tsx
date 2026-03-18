import { createModule, createMethod } from 'kozz-module-maker';
import OpenAPI, { Message } from 'src/API/OpenAi';
import { usePremiumCommand } from 'src/Middlewares/Coins';
import { convertB64ToPath } from 'src/Utils/ffmpeg';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
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
	summary,
} from 'src/API/MistralApi';
import { transcribeFile } from 'src/API/Deepgram';
import fs from 'fs/promises';
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

const talk = createMethod('talk', async requester => {
	try {
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

		// ── plain response ──────────────────────────────────────────────────
		const response =
			firstResponse.content ??
			(await fromPrompt(messages, requester.message.fromHostAccount));

		requester.reply(response.replace(/(.*)]:/, '[#CalvoGpt]:'));
	} catch (e) {
		console.warn('AI talk failed:', e);
		return requester.reply(
			'[#CalvoGPT]: Tive um problema ao processar sua mensagem agora. Tente novamente em instantes.'
		);
	}
});

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
	async (requester, { context }) => {
		const message = requester.message;
		const question = requester.rawCommand!.immediateArg;
		console.log({ question });

		const filePath = `./conversation/${message.boundaryName}/${message.chatId}.txt`;
		const chat = await fs.readFile(filePath, { encoding: 'utf-8' });

		const messages = chat
			.split('\n')
			.map(line => ({ role: 'user', content: line }) as const)
			.slice(context ? context * -1 : -200);

		const response = await summary(messages, question);
		requester.reply('[Calvo GPT]: ' + response);
	},
	{ context: 'number?' }
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

const fallback = createMethod('fallback', requester => {
	requester.reply.withTemplate('Help');
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
