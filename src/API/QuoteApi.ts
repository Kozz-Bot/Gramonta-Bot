import axios, { AxiosError } from 'axios';

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

export const generateQuote = async (
	quote: string,
	name: string,
	imageUrl: string,
	customColor?: string
) => {
	try {
		const json = {
			type: 'quote',
			format: 'png',
			backgroundColor: customColor || '#353535',
			width: 512,
			height: 768,
			scale: 2,
			messages: [
				{
					entities: [],
					avatar: true,
					from: {
						id: 1,
						name: name,
						photo: {
							url: imageUrl,
						},
					},
					text: quote,
					replyMessage: {},
				},
			],
		};

		const result = await axios
			.post<QuoteSuccess>('https://bot.lyo.su/quote/generate', json)
			.then(resp => resp.data);

		return result.result.image;
	} catch (e) {
		throw e;
	}
};
