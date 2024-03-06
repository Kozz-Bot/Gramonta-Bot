import { createModule, createMethod } from 'kozz-module-maker';
import OpenAPI from 'src/API/OpenAi';
import { usePremiumCommand } from 'src/Middlewares/Coins';
import { convertB64ToPath } from 'src/Utils/ffmpeg';
import { loadTemplates } from 'kozz-module-maker/dist/Message';

const API = new OpenAPI();

const image = createMethod(
	'image',
	usePremiumCommand(
		10,
		async requester => {
			try {
				const prompt = requester.rawCommand!.immediateArg;

				if (!prompt) {
					requester.reply.withTemplate('EmptyPrompt');
					return false;
				}

				requester.react('⏳');
				const image = await API.createImageFromPrompt(prompt);

				requester.react('🎨');
				requester.reply.withMedia.fromB64(image, 'image');
			} catch (e) {
				requester.reply(`Erro: ${e}`);
				return false;
			}
		},
		'Você não possui CalvoCoins suficientes para usar esse comando'
	)
);

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
					const response = await API.emojify(`${requester.message.quotedMessage.body}`);

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

				const response = await API.emojify(`${requester.message.quotedMessage.body}`);

				requester.reply(response);
			} catch (e) {
				requester.reply(`Erro: ${e}`);
				return false;
			}
		},
		'Você não possui CalvoCoins suficientes para usar esse comando'
	)
);

const fallback = createMethod('fallback', requester => {
	requester.reply.withTemplate('Fallback');
});

const templatePath = './src/Handlers/AI/messages.kozz.md';
export const startAIHandler = () => {
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...image,
				...fallback,
				...transcribe,
				...emojify,
			},
		},
		name: 'ai',
		address: `${process.env.GATEWAY_URL}`,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
};
