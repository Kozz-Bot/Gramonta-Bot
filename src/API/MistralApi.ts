import axios from 'axios';
import { ChatGPTResponse, PreviousMessages } from './OpenAi';

const API = axios.create({
	baseURL: 'https://api.mistral.ai/v1/',
	headers: {
		Authorization: `Bearer ${process.env.MISTRAL_TOKEN}`,
	},
});

export const fromPrompt = async (context: PreviousMessages) => {
	const response = await API.post<ChatGPTResponse>('/chat/completions', {
		model: 'open-mixtral-8x7b',
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
