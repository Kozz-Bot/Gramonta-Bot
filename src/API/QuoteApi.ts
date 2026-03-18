import axios, { AxiosError, isAxiosError } from 'axios';
import { MessageObj } from 'kozz-module-maker/dist/Message';

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

export const extractQuoteInfoFromRequester = async (
	requester: MessageObj,
	full: boolean
) => {
	const { quotedMessage: firstQuote } = requester.message;

	if (!firstQuote || !firstQuote.taggedConctactFriendlyBody) {
		return null;
	}

	const secondQuote = firstQuote.quotedMessage;

	if (secondQuote && secondQuote.taggedConctactFriendlyBody && full) {
		return {
			mode: 'reply',
			style: 'whatsappDark',
			avatarSize: 100,
			replyAuthor: secondQuote.contact.publicName || 'Sem nome',
			replySnippet: secondQuote.taggedConctactFriendlyBody,
			bodyText: firstQuote.taggedConctactFriendlyBody,
			timeText: new Date(firstQuote.timestamp * 1000).toLocaleString('pt-BR'),
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
			timeText: new Date(firstQuote.timestamp * 1000).toLocaleString('pt-BR'),
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

		const response = await axios.post('http://localhost:3699/render', json, {
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
