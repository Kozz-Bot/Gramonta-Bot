import TiApi, { TiaMessage } from 'src/API/TiApi';
import { BotAction } from 'src/Agent/BotAction';
import { ChatCompletionToolCall } from 'src/API/MistralApi';
import { extractToolArgs } from 'src/Handlers/AI/tools';

const stopWords = new Set([
	'me',
	'manda',
	'quero',
	'uma',
	'um',
	'de',
	'do',
	'da',
	'das',
	'dos',
	'pra',
	'para',
	'por',
	'favor',
	'com',
	'sobre',
	'que',
	'tipo',
	'estilo',
	'mensagem',
	'frase',
]);

export const shortenTiaQuery = (query: string): string => {
	const keywords = query
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.filter(word => !stopWords.has(word))
		.slice(0, 3);

	return keywords.join(' ');
};

export const extractTiaQuery = (
	toolCall: ChatCompletionToolCall
): { query: string } | undefined => {
	const args = extractToolArgs(toolCall);
	if (typeof args?.query !== 'string') return undefined;
	return { query: shortenTiaQuery(args.query.trim()) };
};

export const getTiaMessage = async (query: string): Promise<TiaMessage> => {
	const { data } = await TiApi.get<TiaMessage>('/random', { params: { query } });
	return data;
};

export const createTiaBotAction = (tiaMessage: TiaMessage): BotAction => {
	const caption = [
		`*${tiaMessage.title.toUpperCase()}*`,
		tiaMessage.text.trim(),
		tiaMessage.url,
	]
		.filter(Boolean)
		.join('\n');

	if (tiaMessage.media?.url) {
		return {
			type: 'reply_media',
			mediaUrl: tiaMessage.media.url,
			mediaType: 'image',
			caption,
		};
	}

	return { type: 'reply_text', text: caption };
};
