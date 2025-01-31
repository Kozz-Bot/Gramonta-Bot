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
	imageUrl: string | undefined,
	customColor?: string
) => {
	try {
		const response = imageUrl
			? await axios.get<Buffer>(imageUrl, {
					responseType: 'arraybuffer',
			  })
			: undefined;

		const json = {
			type: 'quote',
			format: 'png',
			backgroundColor: customColor || '#353535',
			width: 384,
			height: 768,
			scale: 2,
			messages: [
				{
					entities: [],
					avatar: true,
					from: {
						id: 1,
						name: name || '__NAME_NOT_FOUND__',
						photo: {
							b64: response?.data.toString('base64'),
						},
					},
					text: quote,
					replyMessage: {},
				},
			],
		};

		const result = await axios
			.post<QuoteSuccess>('http://192.168.15.4:8000/quote/generate', json)
			.then(resp => resp.data);

		return result.result.image;
	} catch (e) {
		console.warn(e);
		throw e;
	}
};
