import { createModule, createMethod } from 'kozz-module-maker';
import FuelIXApi, {
	ChatCompletionToolCall,
	Message,
} from 'src/API/FuelIXApi';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { Media, MessageReceived } from 'kozz-types';
import { isAxiosError } from 'axios';
import { Help } from './messages';
import { executeBotAction } from 'src/Agent/executeBotAction';

import { toolTalkSystemPrompt } from './prompts';
import { talkTools, extractToolArgs } from './tools';
import { formatMessageForLlm } from './talk/formatMessage';
import {
	extractTiaQuery,
	getTiaMessage,
	createTiaBotAction,
} from './talk/tiaHandler';
import { webSearchFull, webSearchSummaries } from 'src/Agent/Tools/WebSearch';
import { summarizeAiUsage } from 'src/API/AiObservability';

// ─── talk ─────────────────────────────────────────────────────────────────────

type ChatContextMessage = {
	id: string;
	timestamp: number;
	from: string;
	body: string;
	taggedConctactFriendlyBody?: string;
	messageType: MessageReceived['messageType'];
	fromHostAccount: boolean;
	contact: {
		id: string;
		publicName: string;
		isHostAccount: boolean;
	} | null;
	hasMedia: boolean;
};

const parsePositiveIntEnv = (value: string | undefined, fallback: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const DEFAULT_CHAT_CONTEXT_LIMIT = parsePositiveIntEnv(
	process.env.AI_DEFAULT_CHAT_CONTEXT_LIMIT,
	8
);
const MAX_CHAT_CONTEXT_LIMIT = parsePositiveIntEnv(
	process.env.AI_MAX_CHAT_CONTEXT_LIMIT,
	300
);
const MAX_TOOL_ROUNDS = parsePositiveIntEnv(process.env.AI_MAX_TOOL_ROUNDS, 3);
const MAX_AI_INPUT_CHARS = parsePositiveIntEnv(
	process.env.AI_MAX_INPUT_CHARS,
	12000
);

const sanitizeAiText = (value: unknown, limit = MAX_AI_INPUT_CHARS) =>
	typeof value === 'string'
		? value
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
				.replace(/\r\n?/g, '\n')
				.trim()
				.slice(0, limit)
		: '';

const getSanitizedMessageBody = (message: MessageReceived) =>
	sanitizeAiText(message.santizedBody || message.body);

const getAiCommandQuery = (requester: MessageObj) =>
	sanitizeAiText(
		requester.rawCommand?.query || getSanitizedMessageBody(requester.message)
	);

const normalizeContextLimit = (limit: unknown, fallback = 50) => {
	const numericLimit = typeof limit === 'number' ? limit : Number(limit);

	if (!Number.isFinite(numericLimit)) {
		return fallback;
	}

	return Math.max(1, Math.min(Math.floor(numericLimit), MAX_CHAT_CONTEXT_LIMIT));
};

const fetchCurrentChatContext = async (
	requester: MessageObj,
	limit: number
): Promise<ChatContextMessage[]> => {
	const { response } = await requester.ask.boundary(
		requester.message.boundaryName,
		'recent_chat_messages',
		{
			chatId: requester.message.to,
			limit,
			excludeMessageId: requester.message.id,
		}
	);

	return Array.isArray(response) ? (response as ChatContextMessage[]) : [];
};

const normalizeContextTimestamp = (timestamp: number) =>
	timestamp > 0 && timestamp < 1e12 ? timestamp * 1000 : timestamp;

const formatChatContextForLlm = (contextMessages: ChatContextMessage[]) => {
	if (!contextMessages.length) {
		return '(nenhuma mensagem anterior encontrada no chat atual)';
	}

	return contextMessages
		.map(message => {
			const author =
				message.contact?.publicName ||
				(message.fromHostAccount ? 'Dono do bot' : message.from);
			const content =
				message.taggedConctactFriendlyBody ||
				sanitizeAiText(message.body) ||
				(message.hasMedia
					? `{enviou uma mídia do tipo ${message.messageType}}`
					: '(mensagem sem texto)');

			return `[${new Date(
				normalizeContextTimestamp(message.timestamp)
			).toISOString()}] ${author}: ${content}`;
		})
		.join('\n');
};

const logAiTalkError = (e: unknown) => {
	if (isAxiosError(e)) {
		console.warn('AI fallback talk failed:', {
			status: e.response?.status,
			method: e.config?.method,
			url: `${e.config?.baseURL ?? ''}${e.config?.url ?? ''}`,
			response: e.response?.data,
			requestDataLength:
				typeof e.config?.data === 'string' ? e.config.data.length : undefined,
		});
		return;
	}

	console.warn('AI fallback talk failed:', e);
};

const formatContextAuthor = (message: MessageReceived) =>
	message.contact?.publicName ||
	(message.fromHostAccount ? 'Dono do bot' : message.from);

const fallbackContextMessageForLlm = (message: MessageReceived): Message => {
	const timestamp = message.timestamp
		? normalizeContextTimestamp(message.timestamp)
		: Date.now();
	const body =
		message.taggedConctactFriendlyBody ||
		getSanitizedMessageBody(message) ||
		(message.media
			? `{midia ${message.messageType}, formato ${message.media.mimeType}}`
			: '(mensagem sem texto)');

	return {
		role: getSanitizedMessageBody(message).includes('#CalvoGPT')
			? 'assistant'
			: 'user',
		content: `[${new Date(timestamp).toISOString()}] ${formatContextAuthor(
			message
		)}: ${body}`,
	};
};

const formatContextMessageForLlm = async (
	message: MessageReceived
): Promise<Message> => {
	try {
		return await formatMessageForLlm(message, { includeContextHeader: true });
	} catch (e) {
		console.warn('Failed to format AI context message:', {
			messageId: message.id,
			messageType: message.messageType,
			mimeType: message.media?.mimeType,
			error: isAxiosError(e) ? e.response?.data ?? e.message : e,
		});
		return fallbackContextMessageForLlm(message);
	}
};

type ChatRuntimeMessage = Record<string, unknown>;

type ToolExecutionResult =
	| {
			terminal: true;
	  }
	| {
			terminal: false;
			content: string;
	  };

const createGeneratedAudio = (b64: string): Media => ({
	data: b64,
	duration: null,
	fileName: 'calvogpt-tts.mp3',
	mimeType: 'audio/mpeg',
	sizeInBytes: Buffer.from(b64, 'base64').length,
	stickerTags: [],
	transportType: 'b64',
});

const executeToolCall = async (
	requester: MessageObj,
	toolCall: ChatCompletionToolCall,
	referenceImages: Media[]
): Promise<ToolExecutionResult> => {
	if (toolCall.function.name === 'get_tia_message') {
		const toolArgs = extractTiaQuery(toolCall);
		if (!toolArgs?.query) {
			requester.reply(
				'[#CalvoGPT]: Não consegui entender qual mensagem você queria pesquisar.'
			);
			return { terminal: true };
		}

		console.log(`[AI:tool] get_tia_message → query="${toolArgs.query}"`);
		const tiaMessage = await getTiaMessage(toolArgs.query);
		await executeBotAction(requester, createTiaBotAction(tiaMessage));
		return { terminal: true };
	}

	if (toolCall.function.name === 'generate_image') {
		const args = extractToolArgs(toolCall);
		const prompt = sanitizeAiText(args?.prompt, 4000);

		if (!prompt) {
			requester.reply(
				'[#CalvoGPT]: Não consegui montar o prompt da imagem. Tente descrever de novo o que você quer.'
			);
			return { terminal: true };
		}

		console.log(`[AI:tool] generate_image → prompt="${prompt}"`);
		requester.react('🎨');
		let image;
		try {
			image = await FuelIXApi.generateImage(prompt, referenceImages);
		} catch (e) {
			console.warn('AI image generation failed:', {
				name: e instanceof Error ? e.name : undefined,
				message: e instanceof Error ? e.message : String(e),
				status: isAxiosError(e) ? e.response?.status : undefined,
			});
			requester.react('❌');
			requester.reply(
				'[#CalvoGPT]: Não consegui gerar essa imagem agora. Tenta mudar um pouco o pedido ou tentar de novo em instantes.'
			);
			return { terminal: true };
		}

		if (image.url) {
			requester.reply.withMedia.fromUrl(
				image.url,
				'image',
				referenceImages.length
					? '[#CalvoGPT]: imagem editada'
					: '[#CalvoGPT]: imagem gerada'
			);
			return { terminal: true };
		}

		requester.reply.withMedia.fromB64(
			image.b64_json!,
			'image',
			referenceImages.length
				? '[#CalvoGPT]: imagem editada'
				: '[#CalvoGPT]: imagem gerada'
		);
		return { terminal: true };
	}

	if (toolCall.function.name === 'generate_speech') {
		const args = extractToolArgs(toolCall);
		const input = sanitizeAiText(args?.input, 4000);
		const voice = FuelIXApi.normalizeSpeechVoice(args?.voice);

		if (!input) {
			requester.reply(
				'[#CalvoGPT]: Não consegui montar o texto do áudio. Tente mandar de novo o que você quer que eu fale.'
			);
			return { terminal: true };
		}

		console.log(`[AI:tool] generate_speech → voice="${voice}"`);
		requester.react('🔊');
		let b64;
		try {
			b64 = await FuelIXApi.generateSpeech(input, voice);
		} catch (e) {
			const errorData = isAxiosError(e) ? e.response?.data : e;
			console.warn(
				'AI speech generation failed:',
				Buffer.isBuffer(errorData)
					? errorData.toString('utf8')
					: JSON.stringify(errorData, null, 2)
			);
			requester.react('❌');
			requester.reply(
				'[#CalvoGPT]: Não consegui gerar esse áudio agora. Tenta de novo em instantes.'
			);
			return { terminal: true };
		}

		requester.reply.withMedia(createGeneratedAudio(b64), '[#CalvoGPT]: áudio gerado');
		return { terminal: true };
	}

	if (toolCall.function.name === 'search_web') {
		const args = extractToolArgs(toolCall);
		const query = sanitizeAiText(args?.query, 500);
		const mode = args?.mode === 'full' ? 'full' : 'summary';

		if (!query) {
			return {
				terminal: false,
				content: 'Erro: consulta de busca vazia.',
			};
		}

		console.log(`[AI:tool] search_web → query="${query}" mode="${mode}"`);
		requester.react('🔍');
		const { rawText } =
			mode === 'full'
				? await webSearchFull(query)
				: await webSearchSummaries(query);
		console.log(
			`[AI:tool] search_web result length=${rawText.length} chars (mode=${mode})`
		);

		return {
			terminal: false,
			content: `[Resultado da pesquisa por "${query}"]\n\n${rawText}`,
		};
	}

	if (toolCall.function.name === 'get_chat_context') {
		const args = extractToolArgs(toolCall);
		const limit = normalizeContextLimit(args?.limit);

		console.log(`[AI:tool] get_chat_context → limit=${limit}`);
		requester.react('📚');
		const contextMessages = await fetchCurrentChatContext(requester, limit);

		return {
			terminal: false,
			content: formatChatContextForLlm(contextMessages),
		};
	}

	return {
		terminal: false,
		content: `Erro: ferramenta desconhecida "${toolCall.function.name}".`,
	};
};

const runTalk = async (requester: MessageObj) => {
	let currMessage: MessageReceived | undefined = requester.message;
	const currentThread: MessageReceived[] = [];

	while (currMessage) {
		currentThread.unshift(currMessage);
		currMessage = currMessage.quotedMessage;
	}

	let recentContext: ChatContextMessage[] = [];
	try {
		recentContext = await fetchCurrentChatContext(
			requester,
			normalizeContextLimit(DEFAULT_CHAT_CONTEXT_LIMIT, 8)
		);
	} catch (e) {
		console.warn('Failed to fetch default AI chat context:', e);
	}

	const currentThreadIds = new Set(currentThread.map(message => message.id));
	const recentContextText = formatChatContextForLlm(
		recentContext.filter(message => !currentThreadIds.has(message.id))
	);
	const currentMessages = await Promise.all(
		currentThread.map(message => formatMessageForLlm(message))
	);
	const referenceImages = currentThread
		.map(message => message.media)
		.filter((media): media is Media => !!media?.mimeType.startsWith('image/'))
		.slice(-4);
	let messages: ChatRuntimeMessage[] = [
		{ role: 'system', content: toolTalkSystemPrompt },
		{
			role: 'user',
			content: `Contexto textual recente do chat atual:\n${recentContextText}`,
		},
		...currentMessages,
	];
	let previousResponseId: string | undefined;

	for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
		const response = await FuelIXApi.createToolResponseCompletion({
			messages,
			tools: talkTools,
			previousResponseId,
			metadata: {
				feature: 'ai_talk',
				round,
				boundaryName: requester.message.boundaryName,
				chatId: requester.message.to,
				messageId: requester.message.id,
				from: requester.message.from,
				currentThreadMessages: currentThread.length,
				defaultContextMessages: recentContext.length,
			},
		});
		previousResponseId = response.responseId;

		if (!response.tool_calls?.length) {
			const content =
				response.content ??
				'[#CalvoGPT]: Não consegui montar uma resposta agora.';
			return requester.reply(content.replace(/(.*)]:/, '[#CalvoGpt]:'));
		}

		messages = [];

		for (const toolCall of response.tool_calls) {
			const result = await executeToolCall(requester, toolCall, referenceImages);

			if (result.terminal) {
				return;
			}

			messages.push({
				role: 'tool',
				tool_call_id: toolCall.id,
				name: toolCall.function.name,
				content: result.content,
			});
		}
	}

	return requester.reply(
		'[#CalvoGPT]: Precisei chamar ferramentas demais pra responder isso. Tenta dividir o pedido em partes menores.'
	);
};

// ─── fallback ─────────────────────────────────────────────────────────────────

const fallback = createMethod('fallback', async requester => {
	if (getAiCommandQuery(requester)) {
		try {
			return await runTalk(requester);
		} catch (e) {
			logAiTalkError(e);
			return requester.reply(
				'[#CalvoGPT]: Tive um problema ao processar sua mensagem agora. Tente novamente em instantes.'
			);
		}
	}

	return requester.reply(<Help />);
});

const formatNumber = (value: number) => value.toLocaleString('pt-BR');

const usage = createMethod('usage', async requester => {
	const requestedLimit = Number(requester.rawCommand?.query);
	const limit =
		Number.isFinite(requestedLimit) && requestedLimit > 0
			? Math.min(Math.floor(requestedLimit), 1000)
			: 200;
	const summary = await summarizeAiUsage(limit);
	const totalDurationSeconds = Math.round(summary.totals.durationMs / 1000);
	const modelLines = Object.entries(summary.totals.byModel)
		.sort(([, a], [, b]) => b.totalTokens - a.totalTokens || b.count - a.count)
		.slice(0, 8)
		.map(([key, item]) => {
			const avgMs = item.count ? Math.round(item.durationMs / item.count) : 0;
			return `- ${key}: ${item.count} chamadas, ${formatNumber(
				item.totalTokens
			)} tokens, ${item.errors} erros, media ${avgMs}ms`;
		});

	return requester.reply(
		[
			'[#CalvoGPT]: Uso recente de IA',
			`Eventos analisados: ${summary.totals.count} (ultimos ${limit})`,
			`Erros: ${summary.totals.errors}`,
			`Tokens prompt: ${formatNumber(summary.totals.promptTokens)}`,
			`Tokens resposta: ${formatNumber(summary.totals.completionTokens)}`,
			`Tokens totais: ${formatNumber(summary.totals.totalTokens)}`,
			`Duracao somada: ${totalDurationSeconds}s`,
			'',
			'Por evento/modelo:',
			...(modelLines.length ? modelLines : ['- sem eventos ainda']),
		].join('\n')
	);
});

// ─── module ───────────────────────────────────────────────────────────────────

export const startAIHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...usage,
				...fallback,
			},
		},
		name: 'ai',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => <Help />);
	return instance;
};
