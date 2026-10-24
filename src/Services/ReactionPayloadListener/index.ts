import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';
import { createModule } from 'kozz-module-maker';
import { createMessageObject } from 'kozz-module-maker/dist/Message';
import { reactionActionForEmoji, readReactionPayload, type ReactionAction } from 'src/Utils/ReactionPayload';

type ReactionEvent = {
	boundaryName?: string;
	chatId?: string;
	messageId?: string;
	emoji?: string;
	from?: string;
	fromHostAccount?: boolean;
	timestamp?: number;
	message?: any;
};

type ReactionActionContext = {
	action: ReactionAction;
	reaction: ReactionEvent;
	requester: ReturnType<typeof createMessageObject>;
};

type ReactionActionHandler = (context: ReactionActionContext) => unknown | Promise<unknown>;

const actionHandlers = new Map<string, ReactionActionHandler>();
const savedMediaDirectory = path.resolve(process.cwd(), 'media', 'saved');

const saveFireMedia = async (message: any) => {
	if (!message?.media?.data || message.media.transportType !== 'b64') {
		throw new Error('Target media is not available as base64 data');
	}
	const extension = mime.extension(message.media.mimeType || '') || 'bin';
	const fileName = `${message.id}.${extension}`;
	await mkdir(savedMediaDirectory, { recursive: true });
	await writeFile(path.join(savedMediaDirectory, fileName), Buffer.from(message.media.data, 'base64'));
	return fileName;
};

/** Registers an action that a zero-width reaction payload may invoke. */
export const registerReactionAction = (name: string, handler: ReactionActionHandler) => {
	if (!/^[a-zA-Z0-9._:-]{1,96}$/.test(name)) throw new Error(`Invalid reaction action name: ${name}`);
	if (actionHandlers.has(name)) throw new Error(`Reaction action already registered: ${name}`);
	actionHandlers.set(name, handler);
};

// A useful built-in action, while feature handlers can register richer actions
// with registerReactionAction during their startup.
registerReactionAction('reply', ({ action, requester }) => {
	if (!action.data || typeof action.data !== 'object' || typeof (action.data as { body?: unknown }).body !== 'string') {
		throw new Error('Reaction action "reply" requires data.body');
	}
	requester.reply((action.data as { body: string }).body);
});

export const startReactionPayloadListener = () => {
	const instance = createModule({
		name: 'reaction-payload-listener',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
	const recentlyHandled = new Map<string, number>();

	const handleReaction = async (reaction: ReactionEvent) => {
		if (!reaction.messageId || !reaction.chatId || !reaction.emoji) return;
		if (reaction.emoji === '🔥') {
			console.info('[ReactionPayload] 🔥 event', JSON.stringify({ messageId: reaction.messageId, chatId: reaction.chatId, hasMedia: Boolean(reaction.message?.media) }));
		}
		const now = Date.now();
		const dedupeKey = `${reaction.messageId}:${reaction.from || ''}:${reaction.emoji}`;
		if (recentlyHandled.has(dedupeKey)) {
			if (reaction.emoji === '🔥') {
				console.info(`[ReactionPayload] 🔥 ignored as duplicate: ${dedupeKey}`);
			}
			return;
		}
		recentlyHandled.set(dedupeKey, now);
		for (const [key, timestamp] of recentlyHandled) {
			if (timestamp < now - 60_000) recentlyHandled.delete(key);
		}

		const boundaryName = reaction.boundaryName || 'kozz-zapo';
		try {
			const needsMedia = reaction.fromHostAccount && reaction.emoji === '🔥' && !reaction.message?.media;
			const result = reaction.message && !needsMedia
				? undefined
				: await instance.ask.boundary(boundaryName, 'message_by_id', {
					messageId: reaction.messageId,
					chatId: reaction.chatId,
				});
			const message = (result as any)?.response || reaction.message;
			if (!message) {
				recentlyHandled.delete(dedupeKey);
				console.warn(`[ReactionPayload] target message not found for reaction: ${reaction.messageId}`);
				return;
			}
			if (reaction.emoji === '🔥') {
				// Waiting
			}
			const requester = createMessageObject(
				instance.socket,
				{
					...message,
					boundaryId: boundaryName,
					boundaryName,
					namespace: process.env.KOZZ_NAMESPACE || process.env.NAMESPACE || 'default',
				},
				'reaction-payload-listener',
			);

			if (reaction.fromHostAccount && reaction.emoji === '🔥') {
				// A 🔥 from the connected account replies with the photo itself.
				// This includes view-once media and ordinary photos from the chat.
				if (message.media) {
					const fileName = await saveFireMedia(message);
					console.info(`[ReactionPayload] 🔥 saved media: ${fileName}`);
					await requester.reply.withMedia(message.media);
					console.info(`[ReactionPayload] 🔥 reveal sent for: ${reaction.messageId}`);
				} else {
					recentlyHandled.delete(dedupeKey);
					console.warn(
						`[ReactionPayload] 🔥 target has no revealable media: ${reaction.messageId}`
					);
				}
				return;
			}
			// Only messages sent by the bot/host can activate actions. The invisible
			// encoding is a transport format, not an authorization mechanism.
			if (!message?.fromHostAccount || typeof message.body !== 'string') return;
			const payload = readReactionPayload(message.body);
			if (!payload) return;
			const action = reactionActionForEmoji(payload, reaction.emoji);
			if (!action) return;
			const handler = actionHandlers.get(action.action);
			if (!handler) {
				console.warn(`[ReactionPayload] action is not registered: ${action.action}`);
				return;
			}
			await handler({
				action,
				reaction,
				requester,
			});
		} catch (error) {
			console.error('[ReactionPayload] failed to handle reaction', error);
		}
	};

	instance.on('chat_message_reaction', 'kozz-zapo', reaction => {
		void handleReaction(reaction as ReactionEvent);
	});

	return instance;
};
