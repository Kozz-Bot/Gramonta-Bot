import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';
import { makeQuote } from '../Quote';

const defaultMethod = createMethod({
	name: 'default',
	args: {},
	func: message => {
		if (message.quotedMessage?.media) {
			return message.reply.withSticker(message.quotedMessage.media);
		}
		if (message.media) {
			return message.reply.withSticker(message.media);
		}
		if (message.quotedMessage) {
			return makeQuote(message);
		}
		message.reply.withTemplate('instructions_default');
	},
});

const toImg = createMethod({
	name: 'toimg',
	args: {},
	func: message => {
		if (!message.quotedMessage?.media) {
			return message.reply.withTemplate('instructions_toimg');
		}

		return message.reply.withMedia(message.quotedMessage.media);
	},
});

const templatePath = './src/Handlers/Sticker/reply.kozz.md';

export const startStickerHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 's',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
			...toImg,
		},
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
