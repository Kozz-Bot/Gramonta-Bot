import { createSendMessagePayload } from 'kozz-module-maker/dist/Message/PayloadCreation/sendMessage';
import type { SendMessagePayload } from 'kozz-types';

export const sendAutoText = (
	socket: {
		connected: boolean;
		emit: (event: string, payload: SendMessagePayload) => unknown;
	},
	chatId: string,
	text: string,
	quoteMessageId?: string
) => {
	if (!socket.connected) throw new Error('Gateway indisponível');
	const payload = createSendMessagePayload(
		'autotramonta',
		chatId,
		'kozz-zapo',
		text
	);
	payload.quoteId = quoteMessageId;
	// ZAPO's reply path preserves quoteId; plain sends intentionally don't quote.
	socket.emit(quoteMessageId ? 'reply_with_text' : 'send_message', payload);
};
