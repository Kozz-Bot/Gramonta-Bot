import { createModule, createMethod } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { Media } from 'kozz-types';
import { generateQuote } from 'src/API/QuoteApi';
import { DefaultInstructions, Help, ToImgInstructions } from './messages';

const makeQuote = async (requester: MessageObj, includeQuotedMessage?: boolean) => {
	const { quotedMessage } = requester.message;

	const { full } = requester.rawCommand?.namedArgs || {};

	if (!quotedMessage || !quotedMessage.body) {
		return requester.reply(Help());
	}

	const text = quotedMessage.taggedConctactFriendlyBody;

	const quoteB64 = await generateQuote(requester, includeQuotedMessage ?? !!full);

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

		requester.reply(DefaultInstructions());
	},
	{
		tags: 'string?',
	}
);

const full = createMethod('full', requester => {
	return makeQuote(requester, true);
});

const toImg = createMethod('toimg', message => {
	if (!message.message.quotedMessage?.media) {
		return message.reply(ToImgInstructions());
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

export const startStickerHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
				...full,
				...toImg,
				...fromLink,
			},
		},
		name: 's',
		customSocketPath: process.env.SOCKET_PATH,
		address: `${process.env.GATEWAY_URL}`,
	}).resources.upsertResource('help', () => Help());

	return instance;
};
