import type { Media } from 'kozz-types';
import type { MessageObj } from 'kozz-module-maker/dist/Message';

/** Resolve through the same boundary that received the message. */
export const recoverViewOnceMedia = async (
	requester: MessageObj,
	message = requester.message,
): Promise<Media | undefined> => {
	if (message.media) return message.media;
	const boundaryId = requester.message.boundaryId;
	const args = { messageId: message.id, chatId: message.chatId || message.to };
	for (const resource of ['cached_message_by_id', 'message_by_id']) {
		try {
			const result = await requester.ask.boundary(boundaryId, resource, args);
			const recovered = result?.response as typeof message | undefined;
			if (recovered?.media) return recovered.media;
		} catch {
			console.warn(`[ViewOnceMedia] lookup failed resource=${resource} messageId=${message.id}`);
		}
	}
	return undefined;
};
