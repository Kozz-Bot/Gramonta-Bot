import { createModule, createMethod } from 'kozz-module-maker';
import { MessageObj, loadTemplates } from 'kozz-module-maker/dist/Message';
import { Media } from 'kozz-types';
import { generateQuote } from 'src/API/QuoteApi';

const makeQuote = async (requester: MessageObj) => {
	const {quotedMessage} = requester.message;
	
	if (!quotedMessage || !quotedMessage.body) {
		return requester.reply.withTemplate('Help');
	}

	const text = quotedMessage.body;
	const name = quotedMessage.contact.publicName;

	const profilePicUrl = await requester.ask.boundary(
		'Gramonta-Wa',
		'contact_profile_pic',
		{
			id: quotedMessage.from,
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

const defaultMethod = createMethod('default', (requester) => {
	const {quotedMessage, media} = requester.message

	if (quotedMessage?.media) {
		return requester.reply.withSticker(quotedMessage.media);
	}
	if (media) {
		return requester.reply.withSticker(media);
	}
	if (quotedMessage) {
		return makeQuote(requester);
	}

	requester.reply.withTemplate('instructions_default');
});

const toImg = createMethod('toimg', message => {
	if (!message.message.quotedMessage?.media) {
		return message.reply.withTemplate('instructions_toimg');
	}

	return message.reply.withMedia(message.message.quotedMessage.media);
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
