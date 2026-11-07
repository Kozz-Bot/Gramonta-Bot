import axios from 'axios';
import sharp from 'sharp';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import type { Media, MessageReceived } from 'kozz-types';
import { RoleError } from './events';

const LIMIT = 8_000_000;
export const roleArtwork = async (r: MessageObj): Promise<Media | undefined> => {
	const source = [r.message, r.message.quotedMessage].find(
		message =>
			message &&
			(message.messageType === 'IMAGE' ||
				message.media?.mimeType?.startsWith('image/'))
	);
	if (!source) return undefined;
	let media = source.media;
	if (!media?.data) {
		for (const resource of ['cached_message_by_id', 'message_by_id']) {
			try {
				const result = await r.ask.boundary(r.message.boundaryId, resource, {
					messageId: source.id,
					chatId: r.message.chatId || r.message.to,
				});
				media = (result.response as MessageReceived | undefined)?.media;
			} catch {
				/* Try the other media source before asking the user to resend. */
			}
			if (media?.data) break;
		}
	}
	if (!media?.data)
		throw new RoleError(
			'Não consegui acessar a arte. Reenvie a imagem e use !evento na legenda ou respondendo à foto.'
		);
	try {
		if (
			(media.sizeInBytes || 0) > LIMIT ||
			(media.transportType === 'b64' && media.data.length > Math.ceil(LIMIT / 3) * 4)
		)
			throw new Error('size');
		const bytes =
			media.transportType === 'url'
				? Buffer.from(
						(
							await axios.get(media.data, {
								responseType: 'arraybuffer',
								timeout: 30000,
								maxContentLength: LIMIT,
								maxBodyLength: LIMIT,
							})
						).data
					)
				: media.transportType === 'b64'
					? Buffer.from(media.data, 'base64')
					: Buffer.alloc(0);
		if (!bytes.length || bytes.length > LIMIT) throw new Error('size');
		const image = sharp(bytes, { limitInputPixels: 16_000_000 });
		const info = await image.metadata();
		if ((info.pages || 1) > 1) throw new Error('animation');
		// Bind a byte snapshot to approval; signed URLs are never persisted.
		const output = ['jpeg', 'png'].includes(info.format || '')
			? bytes
			: await image.png().toBuffer();
		if (output.length > LIMIT) throw new Error('size');
		return {
			data: output.toString('base64'),
			transportType: 'b64',
			mimeType: info.format === 'jpeg' ? 'image/jpeg' : 'image/png',
			fileName: info.format === 'jpeg' ? 'divulgacao.jpg' : 'divulgacao.png',
			sizeInBytes: output.length,
			duration: 0,
			stickerTags: undefined,
		};
	} catch {
		throw new RoleError(
			'Envie uma arte estática válida de até 8 MB e 16 megapixels. Reenvie a imagem com o comando na legenda ou respondendo à foto.'
		);
	}
};
