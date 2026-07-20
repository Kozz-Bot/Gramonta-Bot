import axios from 'axios';
import { ChatGPTResponse, PreviousMessages } from './OpenAi';
import { Media } from 'kozz-types';
import { getTemporaryCdnMediaUrl } from './TemporaryCdnMedia';

const API = axios.create({
	baseURL: process.env.LLM_BASE_URL ?? 'https://api.fuelix.ai/v1/',
	headers: {
		Authorization: `Bearer ${
			process.env.LLM_API_KEY ??
			process.env.OPENAI_API_KEY
		}`,
	},
});

const CHAT_MODEL = process.env.LLM_MODEL ?? 'gpt-5.4';

export type ChatCompletionTool = {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
};

export type ChatCompletionToolCall = {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
};

type ChatCompletionChoice = {
	message: {
		role: 'assistant';
		content: string | null;
		tool_calls?: ChatCompletionToolCall[];
	};
};

type RawChatCompletionResponse = {
	choices: ChatCompletionChoice[];
};

export const createChatCompletion = async (payload: {
	messages: Array<Record<string, unknown>>;
	tools?: ChatCompletionTool[];
	tool_choice?: 'auto' | 'none' | Record<string, unknown>;
	temperature?: number;
}) => {
	const response = await API.post<RawChatCompletionResponse>('/chat/completions', {
		model: CHAT_MODEL,
		...payload,
	});

	return response.data.choices[0].message;
};

const getImageUrl = async (media: Media) => {
	return getTemporaryCdnMediaUrl(media, 'ai-read-image');
};

export const fromPrompt = async (context: PreviousMessages, bigModel?: boolean) => {
	const response = await createChatCompletion({
		messages: [
			{
				role: 'system',
				content:
					'Você é um chatbot chamado CalvoGPT e está em um grupo de whatsapp conversando com várias pessoas. Em determinado momento você decide participar da conversa. Suas respostas seguem o formato `[#CalvoGPT]:{Resposta}`. É IMPORTANTISSIMO que você inicie sua resposta com "[#CalvoGPT]:" para garantir o funcionamento do bot',
			},
			...context.flat(1),
		],
	});

	return response.content ?? '';
};

export const summary = async (
	context: PreviousMessages,
	question?: string | null
) => {
	const response = await createChatCompletion({
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

	return response.content ?? '';
};

export const interpretImage = async (media: Media, prompt?: string) => {
	const imgUrl = await getImageUrl(media);

	const response = await createChatCompletion({
		messages: [
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text:
							prompt ??
							'Por favor, descreva essa imagem e extraia os textos, caso houver.',
					},
					{
						type: 'image_url',
						image_url: imgUrl,
					},
				],
			},
		],
	});

	return response.content ?? '';
};
