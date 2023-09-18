import { createModule, createMethod } from 'kozz-handler-maker';
import { MessageObj, loadTemplates } from 'kozz-handler-maker/dist/Message';
import { Media } from 'kozz-types';
import { generateQuote } from 'src/API/QuoteApi';

const makeQuote = async (requester: MessageObj) => {
	if (!requester.quotedMessage || !requester.quotedMessage.body) {
		return requester.reply.withTemplate('Help');
	}

	const text = requester.quotedMessage.body;
	const name = requester.quotedMessage.contact.publicName;
	const profilePicUrl = await requester.ask.boundary(
		'Gramonta-Wa',
		'contact_profile_pic',
		{
			id: requester.quotedMessage.from,
		}
	);

	const quoteB64 = await generateQuote(text, name, profilePicUrl.response);

	const stickerMedia: Media = {
		data: quoteB64,
		fileName: `${text}.png`,
		mimeType: 'image',
		sizeInBytes: null,
		transportType: 'b64',
	};

	requester.reply.withSticker(stickerMedia);
};

const defaultMethod = createMethod('default', message => {
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
});

const toImg = createMethod('toimg', message => {
	if (!message.quotedMessage?.media) {
		return message.reply.withTemplate('instructions_toimg');
	}

	return message.reply.withMedia(message.quotedMessage.media);
});

const templatePath = './src/Handlers/Sticker/reply.kozz.md';

export const startStickerHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...defaultMethod,
				...toImg,
			},
		},
		name: 's',
		address: `${process.env.GATEWAY_URL}`,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
