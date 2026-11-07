import axios from 'axios';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import type { Media, MessageReceived } from 'kozz-types';
import { BackgroundRemovalError } from '../../Services/BackgroundRemoval';

const LIMIT = 8_000_000;
export const stickerPhoto = async (r: MessageObj): Promise<Buffer> => {
	const chatId = r.message.chatId || r.message.to;
	const source = [r.message, r.message.quotedMessage].find(
		message =>
			message &&
			(message.media || ['IMAGE', 'STICKER', 'VIDEO'].includes(message.messageType))
	);
	if (!source)
		throw new BackgroundRemovalError(
			'Envie uma foto com !s --sem-fundo na legenda ou responda à foto com esse comando.'
		);
	if ((source.chatId || source.to) !== chatId)
		throw new BackgroundRemovalError('Responda a uma foto deste mesmo chat.');
	if (source.messageType === 'VIDEO' || source.media?.mimeType?.startsWith('video/'))
		throw new BackgroundRemovalError(
			'A remoção de fundo funciona com fotos estáticas. Para GIFs e vídeos, use !s sem --sem-fundo.'
		);
	let media: Media | undefined = source.media;
	if (!media?.data) {
		for (const resource of ['cached_message_by_id', 'message_by_id']) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const result = await Promise.race([
					r.ask.boundary(r.message.boundaryId, resource, {
						messageId: source.id,
						chatId,
					}),
					new Promise<never>((_, reject) => {
						timer = setTimeout(() => reject(new Error('Media timeout')), 10000);
					}),
				]);
				media = (result.response as MessageReceived | undefined)?.media;
			} catch {
				/* Try the other source. */
			} finally {
				if (timer) clearTimeout(timer);
			}
			if (media?.data) break;
		}
	}
	if (!media?.data)
		throw new BackgroundRemovalError(
			'Não consegui acessar essa foto. Ela pode ter expirado. Reenvie a imagem com !s --sem-fundo na legenda.'
		);
	if (
		!/^image\/(jpeg|jpg|png|webp|avif|heic|heif|tiff)$/i.test(media.mimeType || '')
	)
		throw new BackgroundRemovalError(
			'Envie uma foto estática em JPG, PNG ou WebP. GIFs e vídeos não são aceitos com --sem-fundo.'
		);
	if (
		(media.sizeInBytes || 0) > LIMIT ||
		(media.transportType === 'b64' && media.data.length > Math.ceil(LIMIT / 3) * 4)
	)
		throw new BackgroundRemovalError(
			'Essa imagem é grande demais. Envie uma foto de até 8 MB.'
		);
	let bytes: Buffer;
	if (media.transportType === 'b64') bytes = Buffer.from(media.data, 'base64');
	else if (media.transportType === 'url') {
		const url = new URL(media.data);
		if (!['https:', 'http:'].includes(url.protocol))
			throw new BackgroundRemovalError(
				'Não consegui acessar essa foto. Reenvie a imagem pelo WhatsApp.'
			);
		bytes = Buffer.from(
			(
				await axios.get(url.href, {
					responseType: 'arraybuffer',
					timeout: 15000,
					maxContentLength: LIMIT,
					maxBodyLength: LIMIT,
					maxRedirects: 3,
				})
			).data
		);
	} else
		throw new BackgroundRemovalError(
			'Não consegui ler essa foto. Reenvie a imagem pelo WhatsApp.'
		);
	if (!bytes.length || bytes.length > LIMIT)
		throw new BackgroundRemovalError('Envie uma foto válida de até 8 MB.');
	return bytes;
};
