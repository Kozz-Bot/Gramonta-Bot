import { createHandlerInstance, createMethod } from 'kozz-handler-maker';

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

export const startStickerHandler = () =>
	createHandlerInstance({
		name: 's',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
			...toImg,
		},
		templatePath: './src/Handlers/Sticker/reply.kozz.md',
	});
