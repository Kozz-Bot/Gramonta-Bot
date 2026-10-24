import { createModule } from 'kozz-module-maker';
import { recoverViewOnceMedia } from 'src/Utils/ViewOnceMedia';

const archiveChatId = '120363410507112099@g.us';

/** Archives view-once media received by the WhatsApp boundary in one group. */
export const createMediaArchive = () => {
	console.info('[MediaTrace]', JSON.stringify({ at: new Date().toISOString(), component: 'media-archive', stage: 'starting', source: 'kozz-zapo/*' }));
	const instance = createModule({
		address: `${process.env.GATEWAY_URL}`,
		name: 'media-archive',
		customSocketPath: process.env.SOCKET_PATH,
		proxy: {
			source: 'kozz-zapo/*',
			onMessage: async requester => {
				const { message } = requester;
				const trace = (stage: string, details: Record<string, unknown> = {}) => console.info('[MediaTrace]', JSON.stringify({
					at: new Date().toISOString(), component: 'media-archive', stage, id: message.id,
					boundary: message.boundaryName, chatId: message.chatId || message.to,
					isViewOnce: message.isViewOnce, hasMedia: Boolean(message.media?.data), ...details,
				}));
				const traceMedia = Boolean(message.media || message.isViewOnce);
				if (traceMedia) trace('received');

				if (message.to === archiveChatId || message.chatId === archiveChatId) {
					if (traceMedia) trace('skipped', { reason: 'archive_chat' });
					return;
				}

				if (!message.isViewOnce) {
					if (traceMedia) trace('skipped', { reason: 'not_view_once' });
					return;
				}

				const media = await recoverViewOnceMedia(requester);
				if (!media) {
					trace('skipped', { reason: 'media_unavailable' });
					console.warn(`[MediaArchive] media unavailable messageId=${message.id}`);
					return;
				}

				const sender = message.contact.publicName || message.contact.id;
				const caption = [
					`Origem: ${message.groupName || message.to}`,
					`Enviado por: ${sender}`,
					message.body,
				].filter(Boolean).join('\n');
				trace('send.start', { targetChatId: archiveChatId, bytes: media.sizeInBytes, mimeType: media.mimeType });
				try {
					await requester.sendMessage.withMedia(archiveChatId, caption, media);
				} catch (error) {
					trace('send.failed', { errorType: error instanceof Error ? error.name : typeof error });
					throw error;
				}
				trace('send.completed');
				console.info(`[MediaArchive] archived ${message.id} from ${message.to}`);
			},
		},
	});
	return instance;
};
