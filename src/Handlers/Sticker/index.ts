import { createModule, createMethod } from 'kozz-module-maker';
import { MessageObj, loadTemplates } from 'kozz-module-maker/dist/Message';
import { Media } from 'kozz-types';
import { generateQuote } from 'src/API/QuoteApi';

const makeQuote = async (requester: MessageObj) => {
	const { quotedMessage } = requester.message;

	if (!quotedMessage || !quotedMessage.body) {
		return requester.reply.withTemplate('Help');
	}

	const text = quotedMessage.taggedConctactFriendlyBody;

	const quoteB64 = await generateQuote(requester);

	if (!quoteB64) {
		return requester.reply('erro');
	}

	const stickerMedia: Media = {
		data: quoteB64,
		fileName: `${text}.png`,
		mimeType: 'image/png',
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
			if (quotedMessage.messageType === 'STICKER') {
				return requester.reply.withSticker(quotedMessage.media);
			}

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

const fromLink = createMethod('from-link', requester => {
	const link = requester.rawCommand?.immediateArg;
	if (!link) {
		return requester.reply('Por favor envie um link');
	}
	try {
		const url = new URL(link);
		return requester.reply.withSticker({
			data: url.href,
			duration: 0,
			fileName: 'sticker',
			mimeType: 'image/jpeg',
			sizeInBytes: 0,
			stickerTags: [],
			transportType: 'url',
		});
	} catch (_) {
		return requester.reply('The provided link is not valid.');
	}
});

const templatePath = './src/Handlers/Sticker/reply.kozz.md';

export const startStickerHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
				...toImg,
				...fromLink,
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
