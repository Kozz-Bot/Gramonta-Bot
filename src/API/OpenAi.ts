import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import FormData = require('form-data');

export type ChatGPTResponse = {
	id: string;
	object: 'chat.completion';
	created: number;
	model: 'gpt-3.5-turbo-0301';
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	choices: [
		{
			message: {
				role: 'assistant';
				content: string;
			};
			finish_reason: 'stop';
			index: 0;
		}
	];
};

export type LlmContentPart =
	| {
			type: 'text';
			text: string;
	  }
	| {
			type: 'image_url';
			image_url: string;
	  };

type AssistantMessage = {
	role: 'assistant';
	content: string | LlmContentPart[];
};
type UserMessage = { role: 'user'; content: string | LlmContentPart[] };
type SystemMessage = { role: 'system'; content: string };

export type Message = UserMessage | AssistantMessage | SystemMessage;

export type PreviousMessages = Message[];

export type OpenAiImage = {
	url: string;
};
export type ImageGenerationResponse = {
	created: number;
	data: OpenAiImage[];
};

export default class OpenAPI {
	static APIInstance: OpenAPI;
	axiosInstance: AxiosInstance;
	model: string;

	constructor() {
		const apiKey =
			process.env.LLM_API_KEY ??
			process.env.OPENAI_API_KEY 
		this.model = process.env.LLM_MODEL ?? 'gpt-5.4';
		this.axiosInstance = axios.create({
			baseURL: process.env.LLM_BASE_URL ?? 'https://api.fuelix.ai/v1/',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});
	}

	/**
	 * This is using a standard axios request because
	 * the openAI module does not export a method for
	 * moderation
	 * @param prompt
	 */
	private async isSafe(input: string) {
		try {
			const response = await this.axiosInstance.post('/moderations', {
				input,
			});
			return response.data.results[0].flagged !== 1;
		} catch {
			return true;
		}
	}

	async emojify(prompt: string) {
		const isSafe = await this.isSafe(prompt);
		if (!isSafe) throw 'Bad Language';

		const response = await this.axiosInstance.post<ChatGPTResponse>(
			'/chat/completions',
			{
				model: this.model,
				temperature: 0.25,
				messages: [
					{
						role: 'system',
						content:
							'Você é uma ferramenta de emojificação. Todos os textos que você recebe, você deve reenvia-los cheio de emojis que se adequem ao texto.',
					},
					{
						role: 'user',
						content: 'Eu to pensando em jogar com outro personagem agora',
					},
					{
						role: 'assistant',
						content:
							'🤔🎮 Eu estou pensando 🧠 em jogar 🕹🎮 com um outro personagem agora!',
					},
					{
						role: 'user',
						content: 'Nossa, por favor, vai ser muito engraçado',
					},
					{
						role: 'assistant',
						content: '😂😂😂 Nossa, por favor 🙏, vai ser muito engraçado! 🤣🤣🤣',
					},
					{
						role: 'user',
						content:
							'Esse bot só não lava, passa e faz a comida porque ainda não existe tecnologia pra isso. Porque se dependesse do Tramonta, o bot faria de tudo!',
					},
					{
						role: 'assistant',
						content:
							'🤖💪 Esse bot 🤖 só não lava 👕, passa 👖 e faz a comida 🍔😋🍗🍴 porque ainda não existe tecnologia 💻🖥 pra isso. Porque 🤔 se dependesse do Tramonta 💡, o bot 🤖 faria de tudo! 😄',
					},
					{ role: 'user', content: prompt },
				],
			}
		);

		return response.data.choices[0].message.content;
	}

	async fromPrompt(context: PreviousMessages) {
		const safeMessages = await Promise.all(
			context.map(message => this.isSafe(message.content as string))
		);

		const allSafe = safeMessages.reduce((allSafe, msgIsSafe) => {
			return allSafe && msgIsSafe;
		}, true);

		if (!allSafe) throw 'Bad Language';

		const response = await this.axiosInstance.post<ChatGPTResponse>(
			'/chat/completions',
			{
				model: this.model,
				temperature: 0.25,
				messages: [
					{
						role: 'system',
						content:
							'Você é um chatbot chamado CalvoGPT e está em um grupo de whatsapp conversando com várias pessoas. Em determinado momento você decide participar da conversa. Suas respostas seguem o formato `[#CalvoGPT]:{Resposta}`. É IMPORTANTISSIMO que você inicie sua resposta com "[#CalvoGPT]:" para garantir o funcionamento do bot',
					},
					...context.flat(1),
				],
			}
		);

		return response.data.choices[0].message.content;
	}

	async createImageFromPrompt(prompt: string) {
		const isSafe = await this.isSafe(prompt);
		if (!isSafe) throw 'Bad Language';

		const img = await this.axiosInstance.post<ImageGenerationResponse>(
			'/images/generations',
			{
				model: this.model,
				prompt,
				n: 1,
				size: '1024x1024',
			}
		);

		// Get b64 from image url
		const b64 = await axios
			.get(img.data.data[0].url, {
				responseType: 'arraybuffer',
			})
			.then(result => Buffer.from(result.data, 'binary').toString('base64'));

		return b64;
	}

	/**
	 *
	 * @param audioPath
	 * @returns
	 */
	async transcribeAudioFromPath(audioPath: string) {
		try {
			const data = new FormData();
			data.append('model', 'whisper-1');
			data.append('file', fs.createReadStream(audioPath));
			data.append('response_format', 'verbose_json');

			const response = await this.axiosInstance.post('/audio/transcriptions', data, {
				headers: data.getHeaders(),
			});

			return response.data;
		} catch (e) {
			if (!axios.isAxiosError(e)) {
				throw e;
			}
			console.warn(e.response?.data);
		}
	}

	/**
	 *
	 * @param audioPath
	 * @returns
	 */
	async transcribeAudioFromB64(audio: string) {
		try {
			const data = new FormData();
			data.append('model', 'whisper-1');
			data.append('file', audio);
			data.append('response_format', 'verbose_json');

			const response = await this.axiosInstance.post('/audio/transcriptions', data);

			return response.data;
		} catch (e) {
			if (!axios.isAxiosError(e)) {
				throw e;
			}
			console.warn(e.response?.data);
		}
	}
}
