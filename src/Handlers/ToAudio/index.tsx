import { createMethod, createModule } from 'kozz-module-maker';
import { type MessageReceived } from 'kozz-types';
import { extractAudio, ToAudioError } from './convert';
import { ErrorMessage, Help, Processing } from './messages';

let activeConversions = 0;
const activeRequests = new Set<string>();

const convert = createMethod('default', async requester => {
	const quoted = requester.message.quotedMessage;
	if (!quoted) return requester.reply(<Help />);
	if (quoted.messageType !== 'VIDEO' && !quoted.media?.mimeType?.startsWith('video/')) {
		return requester.reply(<ErrorMessage message="Responda (cite) uma mensagem de vídeo com !toaudio. Fotos, áudios e textos não são aceitos." />);
	}
	const requestKey = `${requester.message.boundaryId}:${requester.message.from}`;
	if (activeRequests.has(requestKey)) {
		return requester.reply(<ErrorMessage message="Você já tem um vídeo em conversão. Aguarde a conclusão antes de enviar outro." />);
	}
	if (activeConversions >= 2) {
		return requester.reply(<ErrorMessage message="O conversor está ocupado. Aguarde um pouco e tente novamente." />);
	}
	activeRequests.add(requestKey);
	activeConversions++;
	try {
		let media = quoted.media;
		if (!media?.data) {
			const recovered = await requester.ask.boundary(requester.message.boundaryId, 'message_by_id', {
				messageId: quoted.id, chatId: requester.message.chatId || requester.message.to,
			});
			media = (recovered.response as MessageReceived | undefined)?.media;
		}
		if (!media?.data) {
			return requester.reply(<ErrorMessage message="Não consegui acessar o vídeo citado. Ele pode ter expirado. Reenvie o vídeo e responda a ele com !toaudio." />);
		}
		requester.reply(<Processing />);
		const audio = await extractAudio(media);
		return requester.reply.withMedia({
			data: audio.toString('base64'), transportType: 'b64',
			mimeType: 'audio/mpeg', fileName: 'audio.mp3', sizeInBytes: audio.length,
			duration: 0, stickerTags: undefined,
		});
	} catch (error) {
		return requester.reply(<ErrorMessage message={error instanceof ToAudioError ? error.message : 'Não consegui acessar ou processar o vídeo agora. Reenvie o vídeo e tente novamente.'} />);
	} finally {
		activeRequests.delete(requestKey);
		activeConversions--;
	}
});

export const startToAudioHandler = () => createModule({
	name: 'toaudio',
	address: `${process.env.GATEWAY_URL}`,
	customSocketPath: process.env.SOCKET_PATH,
	commands: {
		boundariesToHandle: ['*'],
		methods: {
			...convert,
			...createMethod('help', requester => requester.reply(<Help />)),
			...createMethod('fallback', requester => requester.reply(<Help />)),
		},
	},
}).resources.upsertResource('help', () => <Help />);
