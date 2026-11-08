import axios from 'axios';
import fs from 'fs';
import FormData = require('form-data');
import sharp from 'sharp';
import { Media } from 'kozz-types';
import { logAiUsage, normalizeAiError } from './AiObservability';
import { getTemporaryCdnMediaUrl } from './TemporaryCdnMedia';

export type ChatGPTResponse = {
	id: string;
	object: 'chat.completion';
	created: number;
	model: string;
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
		},
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
	finish_reason?: string;
	message: {
		role: 'assistant';
		content: string | null;
		tool_calls?: ChatCompletionToolCall[];
	};
};

type RawChatCompletionResponse = {
	id?: string;
	model?: string;
	choices: ChatCompletionChoice[];
	usage?: Record<string, unknown>;
	service_tier?: string;
};

export type ChatCompletionPayload = {
	messages: Array<Record<string, unknown>>;
	tools?: ChatCompletionTool[];
	tool_choice?: 'auto' | 'none' | Record<string, unknown>;
	temperature?: number;
	metadata?: Record<string, unknown>;
};

export type ResponseTool = ChatCompletionTool | { type: 'web_search' };

type FuelIXResponseOutput = {
	type: string;
	call_id?: string;
	name?: string;
	arguments?: string;
	content?: Array<{
		type: string;
		text?: string;
		annotations?: Array<{ type: string; url?: string; title?: string }>;
	}>;
};

type FuelIXResponse = {
	id: string;
	model?: string;
	output: FuelIXResponseOutput[];
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	};
};

type ToolResponsePayload = {
	messages: Array<Record<string, unknown>>;
	tools: ResponseTool[];
	previousResponseId?: string;
	timeoutMs?: number;
	metadata?: Record<string, unknown>;
};

type FuelIXGeneratedImage = {
	url?: string;
	b64_json?: string;
};

type FuelIXImageGenerationResponse = {
	data: FuelIXGeneratedImage[];
};

type FuelIXTranscriptionResponse = {
	text?: string;
};

type TranscriptionChannel = {
	alternatives: [
		{
			transcript: string;
		},
	];
};

export const speechVoices = [
	'alloy',
	'ash',
	'ballad',
	'coral',
	'echo',
	'fable',
	'nova',
	'onyx',
	'sage',
	'shimmer',
	'verse',
	'marin',
	'cedar',
] as const;

export type SpeechVoice = (typeof speechVoices)[number];

const DEFAULT_SPEECH_VOICE: SpeechVoice = 'alloy';

const getImageBytes = async (media: Media): Promise<Buffer> => {
	if (media.transportType === 'url') {
		const { data } = await axios.get<ArrayBuffer>(media.data, {
			responseType: 'arraybuffer',
		});
		return Buffer.from(data);
	}

	return Buffer.from(media.data, 'base64url');
};

const toResponseInput = (message: Record<string, unknown>) => {
	if (message.type === 'function_call')
		return {
			type: 'function_call',
			call_id: message.call_id,
			name: message.name,
			arguments: message.arguments,
		};
	if (message.role === 'tool') {
		return {
			type: 'function_call_output',
			call_id: message.tool_call_id,
			output: message.content,
		};
	}

	if (Array.isArray(message.content)) {
		return {
			role: message.role === 'assistant' ? 'user' : message.role,
			content: message.content.map((part: LlmContentPart) =>
				part.type === 'image_url'
					? { type: 'input_image', image_url: part.image_url }
					: { type: 'input_text', text: part.text }
			),
		};
	}

	return { role: message.role, content: message.content };
};

const getTextLength = (content: unknown): number => {
	if (typeof content === 'string') {
		return content.length;
	}

	if (!Array.isArray(content)) {
		return 0;
	}

	return content.reduce((total, part) => {
		if (
			part &&
			typeof part === 'object' &&
			'type' in part &&
			part.type === 'text' &&
			'text' in part &&
			typeof part.text === 'string'
		) {
			return total + part.text.length;
		}

		return total;
	}, 0);
};

const getImagePartCount = (content: unknown): number => {
	if (!Array.isArray(content)) {
		return 0;
	}

	return content.filter(
		part =>
			part && typeof part === 'object' && 'type' in part && part.type === 'image_url'
	).length;
};

const summarizeMessages = (messages: Array<Record<string, unknown>>) => {
	return messages.reduce(
		(
			summary: {
				count: number;
				roles: Record<string, number>;
				textChars: number;
				imageParts: number;
			},
			message
		) => {
			const role = typeof message.role === 'string' ? message.role : 'unknown';
			summary.roles[role] = (summary.roles[role] ?? 0) + 1;
			summary.textChars += getTextLength(message.content);
			summary.imageParts += getImagePartCount(message.content);

			return summary;
		},
		{
			count: messages.length,
			roles: {} as Record<string, number>,
			textChars: 0,
			imageParts: 0,
		}
	);
};

const toTranscriptionChannel = (text = ''): TranscriptionChannel => ({
	alternatives: [
		{
			transcript: text,
		},
	],
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const isFuelIXUpstreamError = (e: unknown) => {
	if (!axios.isAxiosError(e) || e.response?.status !== 404) {
		return false;
	}

	const responseText =
		typeof e.response.data === 'string'
			? e.response.data
			: JSON.stringify(e.response.data ?? {});

	return responseText.includes('upstream request failed');
};

export default class FuelIXApi {
	private static get apiKey() {
		const apiKey = process.env.FUELIX_API_KEY;
		if (!apiKey) {
			throw new Error('FUELIX_API_KEY is required for AI commands');
		}
		return apiKey;
	}

	private static get api() {
		return axios.create({
			baseURL: process.env.FUELIX_BASE_URL ?? 'https://api.fuelix.ai/v1',
			headers: {
				Authorization: `Bearer ${FuelIXApi.apiKey}`,
			},
		});
	}

	private static get chatModel() {
		return process.env.LLM_MODEL ?? 'gpt-6.0-sol';
	}

	private static async transcribeForm(form: FormData) {
		const { data } = await FuelIXApi.api.post<FuelIXTranscriptionResponse>(
			'/audio/transcriptions',
			form,
			{
				headers: form.getHeaders(),
				timeout: 60000,
			}
		);

		return toTranscriptionChannel(data.text?.trim() ?? '');
	}

	static normalizeSpeechVoice(voice: unknown): SpeechVoice {
		return typeof voice === 'string' && speechVoices.includes(voice as SpeechVoice)
			? (voice as SpeechVoice)
			: DEFAULT_SPEECH_VOICE;
	}

	static async createChatCompletion(payload: ChatCompletionPayload) {
		const startedAt = Date.now();
		const { metadata, ...requestPayload } = payload;
		const requestMetadata = {
			...metadata,
			messageSummary: summarizeMessages(requestPayload.messages),
			tools: requestPayload.tools?.map(tool => tool.function.name) ?? [],
			toolChoice: requestPayload.tool_choice ?? null,
		};
		const maxAttempts = 3;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				const response = await FuelIXApi.api.post<RawChatCompletionResponse>(
					'/chat/completions',
					{
						model: FuelIXApi.chatModel,
						...requestPayload,
					}
				);

				const message = response.data.choices[0].message;
				await logAiUsage({
					event: 'chat_completion',
					status: 'success',
					provider: 'fuelix',
					model: response.data.model ?? FuelIXApi.chatModel,
					durationMs: Date.now() - startedAt,
					usage: response.data.usage,
					metadata: {
						...requestMetadata,
						id: response.data.id,
						serviceTier: response.data.service_tier,
						finishReason: response.data.choices[0]?.finish_reason,
						attempts: attempt,
						responseToolCalls:
							message.tool_calls?.map(toolCall => toolCall.function.name) ?? [],
						responseTextChars: message.content?.length ?? 0,
					},
				});

				return message;
			} catch (e) {
				if (attempt < maxAttempts && isFuelIXUpstreamError(e)) {
					console.warn('Retrying FuelIX chat completion after upstream 404', {
						attempt,
						nextAttempt: attempt + 1,
						model: FuelIXApi.chatModel,
					});
					await sleep(500 * attempt);
					continue;
				}

				const error = normalizeAiError(e);
				await logAiUsage({
					event: 'chat_completion',
					status: 'error',
					provider: 'fuelix',
					model: FuelIXApi.chatModel,
					durationMs: Date.now() - startedAt,
					error: {
						status: error.response?.status,
						message: error.message,
					},
					metadata: {
						...requestMetadata,
						attempts: attempt,
					},
				});
				throw e;
			}
		}

		throw new Error('FuelIX chat completion failed without an error response');
	}

	static async createToolResponseCompletion({
		messages,
		tools,
		previousResponseId,
		timeoutMs,
		metadata,
	}: ToolResponsePayload) {
		const startedAt = Date.now();
		const model = FuelIXApi.chatModel;
		const requestMetadata = {
			...metadata,
			messageSummary: summarizeMessages(messages),
			tools: tools.map(tool =>
				tool.type === 'function' ? tool.function.name : tool.type
			),
			previousResponseId,
		};

		try {
			const { data } = await FuelIXApi.api.post<FuelIXResponse>(
				'/responses',
				{
					model,
					input: messages.map(toResponseInput),
					tools: tools.map(tool =>
						tool.type === 'function' ? { type: 'function', ...tool.function } : tool
					),
					tool_choice: 'auto',
					...(previousResponseId
						? { previous_response_id: previousResponseId }
						: {}),
					// Always reset the socket timeout when reusing the transcription
					// connection. An omitted Axios timeout inherits the agent's short idle
					// timeout and follow-redirects can destroy that active socket.
				},
				{ timeout: timeoutMs ?? 120000 }
			);
			const toolCalls: ChatCompletionToolCall[] = data.output
				.filter(
					item => item.type === 'function_call' && !!item.call_id && !!item.name
				)
				.map(item => ({
					id: item.call_id!,
					type: 'function',
					function: {
						name: item.name!,
						arguments: item.arguments ?? '{}',
					},
				}));
			const textParts = data.output
				.filter(item => item.type === 'message')
				.flatMap(item => item.content ?? [])
				.filter(part => part.type === 'output_text' && !!part.text);
			const text = textParts.map(part => part.text).join('\n');
			// WhatsApp must receive clickable sources even when the provider only
			// includes citations in annotations instead of writing URLs in the text.
			const sourceUrls = [
				...new Set(
					textParts.flatMap(part =>
						(part.annotations ?? [])
							.filter(
								annotation =>
									annotation.type === 'url_citation' &&
									annotation.url &&
									/^https?:\/\//i.test(annotation.url)
							)
							.map(annotation => annotation.url!)
					)
				),
			].filter(url => !text.includes(url));
			const content = sourceUrls.length
				? `${text}\n\nFontes:\n${sourceUrls.join('\n')}`
				: text;

			await logAiUsage({
				event: 'chat_completion',
				status: 'success',
				provider: 'fuelix',
				model: data.model ?? model,
				durationMs: Date.now() - startedAt,
				usage: {
					prompt_tokens: data.usage?.input_tokens,
					completion_tokens: data.usage?.output_tokens,
					total_tokens: data.usage?.total_tokens,
				},
				metadata: {
					...requestMetadata,
					id: data.id,
					responseToolCalls: toolCalls.map(call => call.function.name),
					webSearchCalls: data.output.filter(item => item.type === 'web_search_call')
						.length,
					responseTextChars: content.length,
				},
			});

			return {
				responseId: data.id,
				content,
				tool_calls: toolCalls,
				text,
				webSearchCalls: data.output.filter(
					item =>
						item.type === 'web_search_call' &&
						(item as { status?: string }).status === 'completed'
				).length,
			};
		} catch (e) {
			const error = normalizeAiError(e);
			await logAiUsage({
				event: 'chat_completion',
				status: 'error',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				error: { status: error.response?.status, message: error.message },
				metadata: requestMetadata,
			});
			throw e;
		}
	}

	static async fromPrompt(context: PreviousMessages, bigModel?: boolean) {
		const response = await FuelIXApi.createChatCompletion({
			messages: [
				{
					role: 'system',
					content:
						'Você é um chatbot chamado CalvoGPT e está em um grupo de whatsapp conversando com várias pessoas. Em determinado momento você decide participar da conversa. Suas respostas seguem o formato `[#CalvoGPT]:{Resposta}`. É IMPORTANTISSIMO que você inicie sua resposta com "[#CalvoGPT]:" para garantir o funcionamento do bot',
				},
				...context.flat(1),
			],
			metadata: {
				feature: 'from_prompt',
				contextMessages: context.length,
				bigModel: !!bigModel,
			},
		});

		return response.content ?? '';
	}

	static async summary(context: PreviousMessages, question?: string | null) {
		const response = await FuelIXApi.createChatCompletion({
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
			metadata: {
				feature: 'summary',
				contextMessages: context.length,
				hasQuestion: !!question,
			},
		});

		return response.content ?? '';
	}

	static async interpretImage(media: Media, prompt?: string) {
		const imgUrl = await getTemporaryCdnMediaUrl(media, 'ai-read-image');

		const response = await FuelIXApi.createChatCompletion({
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
			metadata: {
				feature: 'interpret_image',
				hasPrompt: !!prompt,
			},
		});

		return response.content ?? '';
	}

	static async generateImage(
		prompt: string,
		referenceImages: Media[] = [],
		timeoutMs = 240_000
	) {
		const startedAt = Date.now();
		const model = process.env.IMAGE_GENERATION_MODEL ?? 'gemini-3.1-flash-image';
		const size = '1024x1024';
		const isEdit = referenceImages.length > 0;

		try {
			let data: FuelIXImageGenerationResponse;

			if (isEdit) {
				const form = new FormData();
				form.append('model', model);
				form.append('prompt', prompt);
				form.append('n', '1');
				form.append('size', size);

				for (const [index, media] of referenceImages.entries()) {
					const bytes = await getImageBytes(media);
					form.append('image', await sharp(bytes).png().toBuffer(), {
						filename: `reference-${index + 1}.png`,
						contentType: 'image/png',
					});
				}

				({ data } = await FuelIXApi.api.post<FuelIXImageGenerationResponse>(
					'/images/edits',
					form,
					{ headers: form.getHeaders(), timeout: timeoutMs }
				));
			} else {
				({ data } = await FuelIXApi.api.post<FuelIXImageGenerationResponse>(
					'/images/generations',
					{ model, prompt, n: 1, size },
					{ timeout: timeoutMs }
				));
			}

			const image = data.data[0];

			if (!image?.url && !image?.b64_json) {
				throw new Error('FuelIX image request returned no image data');
			}

			await logAiUsage({
				event: isEdit ? 'image_edit' : 'image_generation',
				status: 'success',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				metadata: {
					promptChars: prompt.length,
					size,
					referenceImages: referenceImages.length,
					hasUrl: !!image.url,
					hasB64: !!image.b64_json,
				},
			});

			return image;
		} catch (e) {
			const error = normalizeAiError(e);
			await logAiUsage({
				event: isEdit ? 'image_edit' : 'image_generation',
				status: 'error',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				error: {
					status: error.response?.status,
					message: error.message,
				},
				metadata: {
					promptChars: prompt.length,
					size,
					referenceImages: referenceImages.length,
				},
			});
			throw e;
		}
	}

	static async generateSpeech(
		input: string,
		voice: SpeechVoice = DEFAULT_SPEECH_VOICE
	) {
		const startedAt = Date.now();
		const model = process.env.SPEECH_MODEL ?? 'tts-1';

		try {
			const { data } = await FuelIXApi.api.post<ArrayBuffer>(
				'/audio/speech',
				{
					model,
					input,
					voice,
				},
				{
					responseType: 'arraybuffer',
				}
			);

			const audio = Buffer.from(data).toString('base64');
			await logAiUsage({
				event: 'speech_generation',
				status: 'success',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				metadata: {
					inputChars: input.length,
					voice,
					outputBytes: Buffer.from(data).length,
				},
			});

			return audio;
		} catch (e) {
			const error = normalizeAiError(e);
			await logAiUsage({
				event: 'speech_generation',
				status: 'error',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				error: {
					status: error.response?.status,
					message: error.message,
				},
				metadata: {
					inputChars: input.length,
					voice,
				},
			});
			throw e;
		}
	}

	static async transcribeFile(filePath: string) {
		const startedAt = Date.now();
		const model = process.env.TRANSCRIPTION_MODEL ?? 'whisper-1';
		const form = new FormData();
		form.append('file', fs.createReadStream(filePath));
		form.append('model', model);

		try {
			const result = await FuelIXApi.transcribeForm(form);
			await logAiUsage({
				event: 'audio_transcription',
				status: 'success',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				metadata: {
					source: 'file',
					inputBytes: fs.statSync(filePath).size,
					transcriptChars: result.alternatives[0].transcript.length,
				},
			});
			return result;
		} catch (e) {
			const error = normalizeAiError(e);
			await logAiUsage({
				event: 'audio_transcription',
				status: 'error',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				error: {
					status: error.response?.status,
					message: error.message,
				},
				metadata: {
					source: 'file',
					inputBytes: fs.existsSync(filePath) ? fs.statSync(filePath).size : null,
				},
			});
			throw e;
		}
	}

	static async transcribeUrl(url: string) {
		const startedAt = Date.now();
		const model = process.env.TRANSCRIPTION_MODEL ?? 'whisper-1';
		const response = await axios.get<ArrayBuffer>(url, {
			responseType: 'arraybuffer',
		});
		const form = new FormData();
		form.append('file', Buffer.from(response.data), {
			filename: 'audio.mp3',
		});
		form.append('model', model);

		try {
			const result = await FuelIXApi.transcribeForm(form);
			await logAiUsage({
				event: 'audio_transcription',
				status: 'success',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				metadata: {
					source: 'url',
					inputBytes: response.data.byteLength,
					transcriptChars: result.alternatives[0].transcript.length,
				},
			});
			return result;
		} catch (e) {
			const error = normalizeAiError(e);
			await logAiUsage({
				event: 'audio_transcription',
				status: 'error',
				provider: 'fuelix',
				model,
				durationMs: Date.now() - startedAt,
				error: {
					status: error.response?.status,
					message: error.message,
				},
				metadata: {
					source: 'url',
					inputBytes: response.data.byteLength,
				},
			});
			throw e;
		}
	}
}
