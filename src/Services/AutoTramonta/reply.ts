import { stripAutoMarker } from './identity';

export type AutoPart = { text: string; quoteMessageId?: string };
export type AutoReply = { messages: AutoPart[]; respondingToMessageIds?: string[] };

export const replyFingerprint = (text: string) =>
	stripAutoMarker(text)
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();

export const validateAutoReply = (value: unknown): AutoReply => {
	if (
		!value ||
		typeof value !== 'object' ||
		!('messages' in value) ||
		!Array.isArray(value.messages) ||
		value.messages.length > 3
	)
		throw new Error('Plano de resposta inválido');
	const messages = value.messages.map((part: unknown): AutoPart => {
		if (
			!part ||
			typeof part !== 'object' ||
			!('text' in part) ||
			typeof part.text !== 'string'
		)
			throw new Error('Mensagem inválida');
		const text = stripAutoMarker(part.text).trim();
		if (
			!text ||
			text.length > 400 ||
			/^[!./]/.test(text) ||
			/<\/?(?:think|analysis)>/i.test(text)
		)
			throw new Error('Texto inválido');
		const quoteMessageId =
			'quoteMessageId' in part ? part.quoteMessageId : undefined;
		if (
			quoteMessageId != null &&
			(typeof quoteMessageId !== 'string' ||
				!quoteMessageId.trim() ||
				quoteMessageId.length > 200)
		)
			throw new Error('Citação inválida');
		return {
			text,
			...(quoteMessageId ? { quoteMessageId: quoteMessageId as string } : {}),
		};
	});
	if (messages.reduce((n, part) => n + part.text.length, 0) > 800)
		throw new Error('Resposta longa demais');
	const targets =
		'respondingToMessageIds' in value ? value.respondingToMessageIds : undefined;
	if (
		targets !== undefined &&
		(!Array.isArray(targets) ||
			targets.length > 40 ||
			targets.some(id => typeof id !== 'string' || !id || id.length > 200))
	)
		throw new Error('Alvos inválidos');
	return {
		messages,
		...(targets
			? { respondingToMessageIds: [...new Set(targets as string[])] }
			: {}),
	};
};
