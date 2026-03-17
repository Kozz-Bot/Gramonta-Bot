import { createModule, createMethod } from 'kozz-module-maker';
import OpenAPI, { LlmContentPart, Message } from 'src/API/OpenAi';
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
	ChatCompletionTool,
	ChatCompletionToolCall,
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
import TiApi, { TiaMessage } from 'src/API/TiApi';
import { BotAction } from 'src/Agent/BotAction';
import { executeBotAction } from 'src/Agent/executeBotAction';

const API = new OpenAPI();

const talkCommandRegex = /^!( ){0,1}ai talk\s*/i;

const stripTalkCommand = (text?: string | null) => {
	if (!text) {
		return '';
	}

	return text.replace(talkCommandRegex, '').trim();
};

const mediaToImagePart = (media: Media): LlmContentPart => ({
	type: 'image_url',
	image_url:
		media.transportType === 'url'
			? media.data
			: `data:${media.mimeType};base64,${media.data}`,
});

const mediaCaptionToText = (message: MessageReceived) => {
	const caption = stripTalkCommand(message.santizedBody || message.body);
	return caption
		? `Legenda da imagem: "${caption}". Considere tambem a imagem anexada.`
		: 'Considere a imagem anexada e responda com base nela.';
};

const transcribeAudioContext = async (media: Media) => {
	const sourceFormat = media.mimeType.includes('mpeg') ? 'mp3' : 'opus';
	const tempFilepath = await convertB64ToPath(media.data, sourceFormat, 'mp3');
	const transcription = await transcribeFile(tempFilepath);
	return transcription.alternatives[0].transcript.trim();
};

const formatMessageForLlm = async (message: MessageReceived): Promise<Message> => {
	const role = message.body.includes('#CalvoGPT') ? 'assistant' : 'user';
	const media = message.media;

	if (!media) {
		const text = stripTalkCommand(message.body);
		return {
			role,
			content: text || '(mensagem sem texto)',
		};
	}

	if (media.mimeType.startsWith('image')) {
		const content: LlmContentPart[] = [
			{
				type: 'text',
				text: mediaCaptionToText(message),
			},
			mediaToImagePart(media),
		];

		return {
			role,
			content,
		};
	}

	if (media.mimeType.startsWith('audio')) {
		const transcript = await transcribeAudioContext(media);
		const prefix = stripTalkCommand(message.body || message.santizedBody);

		return {
			role,
			content: prefix
				? `${prefix}\n\nTranscricao do audio: "${transcript}"`
				: `Transcricao do audio: "${transcript}"`,
		};
	}

	const caption = stripTalkCommand(message.santizedBody || message.body);
	return {
		role,
		content: caption
			? `{Mensagem em midia, formato ${media.mimeType}}, legenda da midia: "${caption}"`
			: `{Mensagem em midia, formato ${media.mimeType}}`,
	};
};

const talkTools: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'get_tia_message',
			description:
				'Busca uma mensagem estilo tia do zap, incluindo texto, titulo, fonte e imagem opcional. Use quando o usuario pedir mensagem de bom dia, boa tarde, boa noite, parabens, reflexao, motivacional ou algo parecido.',
			parameters: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description:
							'Consulta curta em portugues descrevendo o tipo de mensagem desejada, por exemplo: bom dia, feliz aniversario, mensagem motivacional.',
					},
				},
				required: ['query'],
				additionalProperties: false,
			},
		},
	},
];

const baseTalkSystemPrompt =
	'Você é um chatbot chamado CalvoGPT e está em um grupo de whatsapp conversando com várias pessoas. Em determinado momento você decide participar da conversa. Suas respostas seguem o formato `[#CalvoGPT]:{Resposta}`. É IMPORTANTISSIMO que você inicie sua resposta com "[#CalvoGPT]:" para garantir o funcionamento do bot';

const toolTalkSystemPrompt = `${baseTalkSystemPrompt}

Você também pode usar ferramentas locais quando isso ajudar. Se o usuário pedir uma mensagem pronta estilo "tia do zap", bom dia, boa tarde, boa noite, parabéns, reflexão, mensagem motivacional ou algo equivalente, use a ferramenta get_tia_message em vez de inventar o conteúdo do zero.

Ao chamar get_tia_message, envie uma query bem curta com 2 ou 3 palavras-chave em português, sem frase completa, sem pontuação e sem palavras desnecessárias.

Quando receber o resultado da ferramenta:
- se houver imagem, responda com uma frase curta apresentando a mensagem e mencionando o título;
- se não houver imagem, responda normalmente com o texto fornecido;
- mantenha o formato [#CalvoGPT]: no início.`;

const shortenTiaQuery = (query: string) => {
	const stopWords = new Set([
		'me',
		'manda',
		'manda',
		'quero',
		'uma',
		'um',
		'de',
		'do',
		'da',
		'das',
		'dos',
		'pra',
		'para',
		'por',
		'favor',
		'com',
		'sobre',
		'que',
		'tipo',
		'estilo',
		'mensagem',
		'frase',
	]);

	const keywords = query
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.filter(word => !stopWords.has(word))
		.slice(0, 3);

	return keywords.join(' ');
};

const extractToolQuery = (
	toolCall: ChatCompletionToolCall
): { query: string } | undefined => {
	try {
		const args = JSON.parse(toolCall.function.arguments);
		if (typeof args?.query !== 'string') {
			return undefined;
		}

		return {
			query: shortenTiaQuery(args.query.trim()),
		};
	} catch {
		return undefined;
	}
};

const getTiaMessage = async (query: string) => {
	const { data } = await TiApi.get<TiaMessage>('/random', {
		params: {
			query,
		},
	});

	return data;
};

const createTiaBotAction = (tiaMessage: TiaMessage): BotAction => {
	const caption = [
		`*${tiaMessage.title.toUpperCase()}*`,
		tiaMessage.text.trim(),
		tiaMessage.url,
	]
		.filter(Boolean)
		.join('\n');

	if (tiaMessage.media?.url) {
		return {
			type: 'reply_media',
			mediaUrl: tiaMessage.media.url,
			mediaType: 'image',
			caption,
		};
	}

	return {
		type: 'reply_text',
		text: caption,
	};
};

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
	{
		style: 'string?',
	}
);

const imageStyleList = createMethod('image-styles', requester => {
	requester.reply(availableStyles.join('\n'));
});

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
			)}:\n` +
				'"' +
				transcription.alternatives[0].transcript +
				'"'
		);
	} catch (e) {
		requester.reply(`Erro: ${e}`);
		return false;
	}
});

const emojify = createMethod(
	'emojify',

	async requester => {
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
	}
);

const talk = createMethod('talk', async requester => {
	try {
		const messages: Message[] = [];
		let currMessage: MessageReceived | undefined = requester.message;

		while (currMessage) {
			messages.unshift(await formatMessageForLlm(currMessage));
			currMessage = currMessage.quotedMessage;
		}

		const firstResponse = await createChatCompletion({
			messages: [
				{
					role: 'system',
					content: toolTalkSystemPrompt,
				},
				...messages,
			],
			tools: talkTools,
			tool_choice: 'auto',
		});

		const toolCall = firstResponse.tool_calls?.find(
			({ function: toolFunction }) => toolFunction.name === 'get_tia_message'
		);

		if (toolCall) {
			const toolArgs = extractToolQuery(toolCall);

			if (!toolArgs?.query) {
				return requester.reply(
					'[#CalvoGPT]: Não consegui entender qual mensagem você queria pesquisar.'
				);
			}

			const tiaMessage = await getTiaMessage(toolArgs.query);
			const action = createTiaBotAction(tiaMessage);
			return executeBotAction(requester, action);
		}

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

const speak = createMethod(
	'speak',
	usePremiumCommand(
		5,
		async requester => {
			const targetMessage = requester.message.quotedMessage;
			if (!targetMessage || !targetMessage.body) {
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

const askSummary = createMethod(
	'summary',
	async (requester, { context }) => {
		const message = requester.message;
		const question = requester.rawCommand!.immediateArg;
		console.log({ question });

		const filePath = `./conversation/${message.boundaryName}/${message.chatId}.txt`;
		const chat = await fs.readFile(filePath, {
			encoding: 'utf-8',
		});

		const messages = chat
			.split('\n')
			.map(
				message =>
					({
						role: 'user',
						content: message,
					} as const)
			)
			.slice(context ? context * -1 : -200);

		const response = await summary(messages, question);

		requester.reply('[Calvo GPT]: ' + response);
	},
	{
		context: 'number?',
	}
);

const readImage = createMethod('read-image', async requester => {
	try {
		const media = requester.message.media || requester.message.quotedMessage?.media;

		if (!media || !media.mimeType.startsWith('image')) {
			return requester.reply('Por favor, envie ou marque uma imagem para a IA ler');
		}

		requester.react('⏳');
		const interpreation = await interpretImage(media);
		requester.react('✅');

		requester.reply(interpreation);
	} catch (e) {
		console.log(e);
		const errorMessage = isAxiosError(e) ? e.response?.data.message : e;
		requester.reply(`Erro ao interpretar imagem: ${errorMessage}`);
	}
});

const fallback = createMethod('fallback', requester => {
	requester.reply.withTemplate('Help');
});

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
