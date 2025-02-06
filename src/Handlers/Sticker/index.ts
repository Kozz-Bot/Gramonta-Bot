import { createModule, createMethod } from 'kozz-module-maker';
import { MessageObj, loadTemplates } from 'kozz-module-maker/dist/Message';
import { Media } from 'kozz-types';
import { generateQuote } from 'src/API/QuoteApi';

const makeQuote = async (requester: MessageObj) => {
	console.log('making quote');

	const { quotedMessage } = requester.message;

	if (!quotedMessage || !quotedMessage.body) {
		return requester.reply.withTemplate('Help');
	}

	const text = quotedMessage.taggedConctactFriendlyBody;
	const name = quotedMessage.contact.publicName;

	console.log(quotedMessage);

	const profilePicUrl = await requester.ask.boundary(
		requester.message.boundaryName,
		'contact_profile_pic',
		{
			id: quotedMessage.from,
		}
	);
	const quoteB64 = await generateQuote(text, name, profilePicUrl.response);

	if (!quoteB64) {
		return requester.reply('erro');
	}

	const stickerMedia: Media = {
		data: quoteB64,
		fileName: `${text}.png`,
		mimeType: 'image',
		sizeInBytes: null,
		transportType: 'b64',
		stickerTags: ['💬', '🗯', '💭'],
		duration: null,
	};

	requester.reply.withSticker(stickerMedia);
};

const defaultMethod = createMethod(
	'default',
	(requester, { tags }) => {
		const { quotedMessage, media } = requester.message;

		if (media) {
			return requester.reply.withSticker({
				...media,
				stickerTags: tags?.split('') ?? [],
			});
		}

		if (quotedMessage?.media) {
			if (
				quotedMessage?.media &&
				!['IMAGE', 'VIDEO', 'TEXT'].includes(quotedMessage.messageType)
			) {
				console.log('Entrou');
				return requester.reply('Não sei como fazer figurinha desse tipo de mídia');
			} else {
				return requester.reply.withSticker(quotedMessage.media);
			}
		}

		if (quotedMessage) {
			return makeQuote(requester);
		}

		requester.reply.withTemplate('instructions_default');
	},
	{
		tags: 'string?',
	}
);

const toImg = createMethod('toimg', message => {
	if (!message.message.quotedMessage?.media) {
		return message.reply.withTemplate('instructions_toimg');
	}

	return message.reply.withMedia(message.message.quotedMessage.media);
});

const templatePath = './src/Handlers/Sticker/reply.kozz.md';

export const startStickerHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
				...toImg,
			},
		},
		name: 's',
		customSocketPath: process.env.SOCKET_PATH,
		address: `${process.env.GATEWAY_URL}`,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);

	return instance;
};
