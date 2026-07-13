import axios, { AxiosError, isAxiosError } from 'axios';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { Media, MessageReceived } from 'kozz-types';
import sharp from 'sharp';

type QuoteSuccess = {
	ok: true;
	result: {
		image: string;
		type: string;
		width: number;
		height: number;
	};
};

type QuoteFail = {
	ok: false;
	error: {
		code: number;
		message: string;
	};
};

const mediaToQuoteSrc = async (media?: Media) => {
	if (!media) {
		return undefined;
	}

	if (media.transportType === 'url') {
		return media.data;
	}

	const input = Buffer.from(media.data, 'base64url');

	if (media.mimeType === 'image/webp') {
		const png = await sharp(input).png().toBuffer();
		return `data:image/png;base64,${png.toString('base64')}`;
	}

	return `data:${media.mimeType};base64,${input.toString('base64')}`;
};

const canRenderQuotedMedia = (message?: MessageReceived) => {
	return (
		!!message?.media &&
		['IMAGE', 'STICKER'].includes(message.messageType) &&
		message.media.mimeType.startsWith('image/')
	);
};

const formatMessageTime = (timestamp?: number) => {
	const safeTimestamp =
		Number.isFinite(timestamp) && timestamp! > 0
			? timestamp! < 1e12
				? timestamp! * 1000
				: timestamp!
			: new Date().getTime();

	return new Date(safeTimestamp).toLocaleString('pt-BR', {
		timeZone: 'America/Sao_Paulo',
	});
};

export const extractQuoteInfoFromRequester = async (
	requester: MessageObj,
	full: boolean
) => {
	const { quotedMessage: firstQuote } = requester.message;

	if (!firstQuote || !firstQuote.taggedConctactFriendlyBody) {
		return null;
	}

	const secondQuote = firstQuote.quotedMessage;
	const secondQuoteHasText = !!secondQuote?.taggedConctactFriendlyBody;
	const secondQuoteHasMedia = canRenderQuotedMedia(secondQuote);

	if (secondQuote && (secondQuoteHasText || secondQuoteHasMedia) && full) {
		return {
			mode: 'reply',
			style: 'whatsappDark',
			avatarSize: 100,
			replyAuthor: secondQuote.contact.publicName || 'Sem nome',
			replySnippet: secondQuote.taggedConctactFriendlyBody || undefined,
			replyMediaSrc: await mediaToQuoteSrc(secondQuote.media),
			bodyText: firstQuote.taggedConctactFriendlyBody,
			timeText: formatMessageTime(firstQuote.timestamp),
			msgAuthor: firstQuote.contact.publicName || 'Sem nome',
			avatarSrc: (
				await requester.ask.boundary(
					requester.message.boundaryName,
					'contact_profile_pic',
					{ id: firstQuote.from }
				)
			).response,
		};
	} else {
		return {
			avatarSize: 100,
			mode: 'normal',
			style: 'whatsappDark',
			bodyText: firstQuote.taggedConctactFriendlyBody,
			timeText: formatMessageTime(firstQuote.timestamp),
			msgAuthor: firstQuote.contact.publicName || 'Sem nome',
			avatarSrc: (
				await requester.ask.boundary(
					requester.message.boundaryName,
					'contact_profile_pic',
					{ id: firstQuote.from }
				)
			).response,
		};
	}
};

export const generateQuote = async (requester: MessageObj, full: boolean) => {
	try {
		const json = await extractQuoteInfoFromRequester(requester, full);

		const response = await axios.post('https://gramont.digital/quote/render', json, {
			responseType: 'arraybuffer',
		});

		const base64 = Buffer.from(response.data, 'binary').toString('base64');

		return base64;
	} catch (e) {
		// console.warn(e);
		if (isAxiosError(e)) {
			console.warn('Erro no axios', e.response?.data, (e as AxiosError).code);
		}
	}
};
