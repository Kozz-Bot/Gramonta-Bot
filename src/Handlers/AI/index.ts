import { createModule, createMethod } from 'kozz-module-maker';
import OpenAPI from 'src/API/OpenAi';
import { usePremiumCommand } from 'src/Middlewares/Coins';
import { convertB64ToPath } from 'src/Utils/ffmpeg';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import { MessageReceived } from 'kozz-types';
import {
	StylePreset,
	availableStyles,
	isStabilityError,
	isValidStyle,
	textToImage,
} from 'src/API/StabiliyApi';
import { randomItem } from 'src/Utils/arrays';
import { fromPrompt } from 'src/API/MistralApi';

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
					requester.reply.withTemplate('Image-Style-Unsupported', {
						style,
					});
				}

				const response = await textToImage(prompt, 'stable-diffusion-xl-1024-v1-0', {
					style_preset: style as StylePreset,
				});

				if (isStabilityError(response)) {
					requester.react('❌');
					requester.reply(`Error: ${response.message}`);
					return false;
				}

				requester.react('🎨');
				requester.reply.withMedia.fromB64(response.base64, 'image');
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

const transcribe = createMethod(
	'transcribe',
	usePremiumCommand(
		5,
		async requester => {
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

				const transcription = await API.transcribeAudioFromPath(tempFilepath);

				requester.react('✏');

				if (requester.rawCommand!.namedArgs?.emoji) {
					const response = await API.emojify(
						`${requester.message.quotedMessage.body}`
					);

					return requester.reply(response);
				}
				return requester.reply(transcription.text);
			} catch (e) {
				requester.reply(`Erro: ${e}`);
				return false;
			}
		},
		'Você não possui CalvoCoins suficientes para usar esse comando'
	)
);

const emojify = createMethod(
	'emojify',
	usePremiumCommand(
		2,
		async requester => {
			try {
				if (!requester.message.quotedMessage?.body) {
					requester.reply.withTemplate('TranscribeNeedsQuote');
					return false;
				}

				requester.react('⏳');

				const response = await API.emojify(
					`${requester.message.quotedMessage.body}`
				);

				requester.reply(response);
			} catch (e) {
				requester.reply(`Erro: ${e}`);
				return false;
			}
		},
		'Você não possui CalvoCoins suficientes para usar esse comando'
	)
);

const talk = createMethod(
	'talk',
	usePremiumCommand(
		3,
		async requester => {
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

			const response = await fromPrompt(formattedMessages);

			requester.reply(response.replace(/(.*)]:/, '[#CalvoGpt]:'));
		},
		'Você não possui CalvoCoins suficientes para usar esse comando'
	)
);

const fallback = createMethod('fallback', requester => {
	requester.reply.withTemplate('Help');
});

const templatePath = './src/Handlers/AI/messages.kozz.md';
export const startAIHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...image,
				...fallback,
				...transcribe,
				...emojify,
				...talk,
				...imageStyleList,
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
