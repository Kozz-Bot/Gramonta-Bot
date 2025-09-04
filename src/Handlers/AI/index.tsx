import { createModule, createMethod } from 'kozz-module-maker';
import OpenAPI from 'src/API/OpenAi';
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
import { fromPrompt, interpretImage, summary } from 'src/API/MistralApi';
import { transcribeFile } from 'src/API/Deepgram';
import fs from 'fs/promises';
import { isAxiosError } from 'axios';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import { generateTTS } from 'src/API/ElevenLabs';
import { ImageStyleUnsupported } from './messages';

const API = new OpenAPI();

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
	const messages: string[] = [];
	let currMessage: MessageReceived | undefined = requester.message;

	while (currMessage) {
		const hasMedia = !!currMessage.media;

		const messageBody = hasMedia
			? `{Mensagem em mídia, formato ${
					currMessage.media!.mimeType
			  }}, legenda da mídia: = "${currMessage.santizedBody}"`
			: `"${currMessage.body}"`;

		messages.unshift(
			`[${
				currMessage.body.includes('#CalvoGPT')
					? '#CalvoGPT'
					: currMessage.contact.publicName
			}]: ${messageBody.replace(/^!( ){0,1}ai talk /i, '')}`
		);
		currMessage = currMessage.quotedMessage;
	}

	const formattedMessages = messages.map(message => {
		const botMessage = message.includes('#CalvoGPT');
		return {
			role: botMessage ? 'assistant' : 'user',
			content: message.replace('#CalvoGPT', ''),
		} as const;
	});

	const response = await fromPrompt(
		formattedMessages,
		requester.message.fromHostAccount
	);

	requester.reply(response.replace(/(.*)]:/, '[#CalvoGpt]:'));
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
