import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import OpenAPI from 'src/API/OpenAi';
import { usePremiumCommand } from 'src/Middlewares/Coins';
import fs from 'fs/promises';
import { convertB64ToB64, convertB64ToPath } from 'src/Utils/ffmpeg';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';

const API = new OpenAPI();

const image = createMethod({
	name: 'image',
	args: {},
	func: usePremiumCommand(
		10,
		async requester => {
			try {
				const prompt = requester.rawCommand.immediateArg;

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
			}
		},
		'Você não possui CalvoCoins suficientes para usar esse comando'
	),
});

const transcribe = createMethod({
	name: 'transcribe',
	args: {},
	func: usePremiumCommand(
		5,
		async requester => {
			try {
				if (!requester.quotedMessage?.media) {
					requester.reply.withTemplate('TranscribeNeedsQuote');
					return false;
				}

				requester.react('⏳');
				const tempFilepath = await convertB64ToPath(
					requester.quotedMessage.media.data,
					'opus',
					'mp3'
				);

				const transcription = await API.transcribeAudioFromPath(tempFilepath);
				requester.react('✏');
				requester.reply(transcription.text);
			} catch (e) {
				requester.reply(`Erro: ${e}`);
			}
		},
		'Você não possui CalvoCoins suficientes para usar esse comando'
	),
});

const fallbakck = createMethod({
	name: 'fallback',
	args: {},
	func: async requester => {
		requester.reply.withTemplate('Fallback');
	},
});

const help = createMethod({
	name: 'help',
	args: {},
	func: async requester => {
		requester.reply.withTemplate('Fallback');
	},
});

const templatePath = './src/Handlers/AI/messages.kozz.md';
export const startAIHandler = () => {
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],

		name: 'ai',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...image,
			...fallbakck,
			...help,
			...transcribe,
		},
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
};
