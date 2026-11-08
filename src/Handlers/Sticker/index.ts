import { createModule, createMethod } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { Media } from 'kozz-types';
import { generateQuote } from 'src/API/QuoteApi';
import {
	DefaultInstructions,
	Help,
	ToImgInstructions,
	BackgroundError,
} from './messages';
import { stickerPhoto } from './background';
import {
	backgroundRemover,
	BackgroundRemovalError,
} from '../../Services/BackgroundRemoval';
import { registerStickerContract } from './ai';
import { reportCommandOutcome } from '../../Services/OwnerAI/contracts';
import { originalCommandQuery } from '../../Utils/commandText';

const activeBackgroundRequests = new Set<string>();
const withoutBackground = async (r: MessageObj, tags?: string) => {
	const key = `${r.message.boundaryId}:${r.message.from}`;
	if (activeBackgroundRequests.has(key)) {
		const error =
			'Você já tem uma foto em processamento. Aguarde a figurinha antes de enviar outra.';
		reportCommandOutcome(r.rawCommand, { success: false, error });
		return r.reply(BackgroundError({ message: error }));
	}
	if (activeBackgroundRequests.size >= 4) {
		const error =
			'Tem algumas fotos na fila. Aguarde um pouco antes de enviar outra.';
		reportCommandOutcome(r.rawCommand, { success: false, error });
		return r.reply(BackgroundError({ message: error }));
	}
	activeBackgroundRequests.add(key);
	try {
		const bytes = await stickerPhoto(r);
		r.react('✂️');
		const result = await backgroundRemover.remove(bytes);
		r.reply.withSticker(
			{
				data: result.bytes.toString('base64'),
				transportType: 'b64',
				mimeType: 'image/png',
				fileName: 'figurinha-sem-fundo.png',
				sizeInBytes: result.bytes.length,
				duration: null,
				stickerTags: tags?.split('') || [],
			},
			tags?.split('') || []
		);
		reportCommandOutcome(r.rawCommand, { success: true, status: 'submitted' });
	} catch (error) {
		const message =
			error instanceof BackgroundRemovalError
				? error.message
				: 'Não consegui acessar ou processar essa foto agora. Reenvie a imagem e tente novamente.';
		reportCommandOutcome(r.rawCommand, { success: false, error: message });
		return r.reply(BackgroundError({ message }));
	} finally {
		activeBackgroundRequests.delete(key);
	}
};

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
	(requester, { tags, 'sem-fundo': semFundo, sf }) => {
		if (semFundo || sf) return withoutBackground(requester, tags);
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
		'sem-fundo': 'boolean?',
		sf: 'boolean?',
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
	const link = originalCommandQuery(requester, 's', 'from-link');
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
	registerStickerContract();
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
				...full,
				...toImg,
				...fromLink,
				...createMethod('help', requester => requester.reply(Help())),
			},
		},
		name: 's',
		customSocketPath: process.env.SOCKET_PATH,
		address: `${process.env.GATEWAY_URL}`,
	}).resources.upsertResource('help', () => Help());

	return instance;
};
