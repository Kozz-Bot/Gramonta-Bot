export type ConversationMessage = {
	id?: string;
	chatId?: string;
	to?: string;
	timestamp?: number;
	from?: string;
	author?: string;
	authorId?: string;
	body?: string;
	santizedBody?: string;
	taggedConctactFriendlyBody?: string;
	messageType?: string;
	fromHostAccount?: boolean;
	hasMedia?: boolean;
	media?: unknown;
	contact?: { id?: string; publicName?: string } | null;
	availability?: string;
	bodyTruncated?: boolean;
	truncated?: boolean;
	replyTo?: ConversationMessage;
	quotedMessage?: ConversationMessage;
};
const clean = (text: unknown, limit: number) =>
	typeof text === 'string'
		? text
				.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
				.slice(0, limit)
		: '';
const date = (timestamp?: number) => {
	const ms =
		timestamp && timestamp > 0 && timestamp < 1e12 ? timestamp * 1000 : timestamp;
	return ms && Number.isFinite(ms) && !Number.isNaN(new Date(ms).getTime())
		? new Date(ms).toISOString()
		: null;
};
const record = (
	message: ConversationMessage,
	text: string | undefined,
	depth: number,
	seen: Set<string>,
	chat?: string
): Record<string, unknown> => {
	const body =
		text ??
		(message.taggedConctactFriendlyBody ||
			message.body ||
			message.santizedBody ||
			(message.hasMedia || message.media
				? `{mídia ${message.messageType || 'sem tipo'}}`
				: '(mensagem sem texto disponível)'));
	const result: Record<string, unknown> = {
		id: clean(message.id, 200) || null,
		date: date(message.timestamp),
		author: {
			id:
				clean(message.from || message.authorId || message.contact?.id, 200) || null,
			name: clean(
				message.contact?.publicName ||
					message.author ||
					message.from ||
					'autor não identificado',
				150
			),
		},
		body: clean(body, depth ? 1200 : 12000),
		messageType: message.messageType || null,
		hasMedia: Boolean(message.hasMedia || message.media),
	};
	if (message.availability) result.availability = message.availability;
	if (
		message.bodyTruncated ||
		message.truncated ||
		body.length > (depth ? 1200 : 12000)
	)
		result.truncated = true;
	const quoted = message.replyTo || message.quotedMessage;
	if (quoted) {
		if (
			chat &&
			(quoted.chatId || quoted.to) &&
			(quoted.chatId || quoted.to) !== chat
		)
			result.replyTo = {
				id: clean(quoted.id, 200) || null,
				availability: 'unavailable',
			};
		else if (depth >= 2 || (quoted.id && seen.has(quoted.id)))
			result.replyTo = {
				id: clean(quoted.id, 200) || null,
				availability: 'unavailable',
				truncated: true,
			};
		else {
			const next = new Set(seen);
			if (quoted.id) next.add(quoted.id);
			result.replyTo = record(quoted, undefined, depth + 1, next, chat);
		}
	}
	return result;
};
export const formatConversationMessage = (
	message: ConversationMessage,
	body?: string
) =>
	JSON.stringify(
		record(
			message,
			body,
			0,
			new Set(message.id ? [message.id] : []),
			message.chatId || message.to
		)
	);

export const formatChatContextForLlm = (messages: ConversationMessage[]) => {
	if (!messages.length)
		return '(nenhuma mensagem anterior encontrada no chat atual)';
	const lines: string[] = [];
	let size = 0;
	// Prefer the most recent messages if the requested history is too large.
	for (const message of [...messages].reverse()) {
		const line = formatConversationMessage(message);
		if (size + line.length > 60000) break;
		size += line.length;
		lines.unshift(line);
	}
	if (lines.length < messages.length)
		lines.unshift(
			JSON.stringify({
				contextTruncated: true,
				omittedMessages: messages.length - lines.length,
			})
		);
	return lines.join('\n');
};
