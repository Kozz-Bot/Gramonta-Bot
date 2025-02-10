import axios from 'axios';
import { ChatGPTResponse, PreviousMessages } from './OpenAi';
import { Media } from 'kozz-types';
import { uploadMedia } from './Firebase';
import CDNApi from './CDNApi';
import mime from 'mime-types';
import { convertToJpeg } from 'src/Utils/ImageConverter';

const API = axios.create({
	baseURL: 'https://api.mistral.ai/v1/',
	headers: {
		Authorization: `Bearer ${process.env.MISTRAL_TOKEN}`,
	},
});

export const fromPrompt = async (context: PreviousMessages) => {
	const response = await API.post<ChatGPTResponse>('/chat/completions', {
		model: 'mistral-small-latest',
		messages: [
			{
				role: 'system',
				content:
					'Você é um chatbot chamado CalvoGPT e está em um grupo de whatsapp conversando com várias pessoas. Em determinado momento você decide participar da conversa. Suas respostas seguem o formato `[#CalvoGPT]:{Resposta}`. É IMPORTANTISSIMO que você inicie sua resposta com "[#CalvoGPT]:" para garantir o funcionamento do bot',
			},
			...context.flat(1),
		],
	});

	return response.data.choices[0].message.content;
};

export const summary = async (
	context: PreviousMessages,
	question?: string | null
) => {
	const response = await API.post<ChatGPTResponse>('/chat/completions', {
		model: 'mistral-small-latest',
		messages: [
			{
				role: 'system',
				content:
					'Você é um chatbot chamado CalvoGPT e está em um grupo de whatsapp com várias pessoas. Sua função é resumir toda a conversa ou responder perguntas.',
			},
			...context.flat(1),
			{
				role: 'user',
				content: question
					? 'Dada a conversa acima, responda: ' + question
					: 'Resuma tudo que foi dito de modo sucinto, em tópicos resumidos.',
			},
		],
	});

	return response.data.choices[0].message.content;
};

export const interpretImage = async (media: Media) => {
	const imgUrl = await (async () => {
		if (media.transportType === 'url') {
			return media.data;
		} else {
			const jpegImage = await convertToJpeg(media.data);

			if (!jpegImage) {
				return undefined;
			}

			const url = await CDNApi.uploadPublicFile('temp_image.jpg', jpegImage);

			return url;
		}
	})();

	console.log({ imgUrl });

	const response = await API.post<ChatGPTResponse>('/chat/completions', {
		model: 'pixtral-12b-2409',
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: 'Por favor, descreva essa imagem e extraia os textos, caso houver.',
					},
					{
						type: 'image_url',
						image_url: imgUrl,
					},
				],
			},
		],
	});

	return response.data.choices[0].message.content;
};
