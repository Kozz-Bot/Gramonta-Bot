import axios from 'axios';
import sharp from 'sharp';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import FuelIXApi from '../../API/FuelIXApi';

export const prepareGroupPicture = async (
	r: MessageObj,
	source: string,
	prompt: string
) => {
	let bytes: Buffer;
	const download = async (url: string) =>
		Buffer.from(
			(
				await axios.get(url, {
					responseType: 'arraybuffer',
					timeout: 60_000,
					maxContentLength: 8_000_000,
				})
			).data
		);
	if (source === 'attached') {
		const media = [r.message.media, r.message.quotedMessage?.media].find(media =>
			media?.mimeType?.startsWith('image/')
		);
		if (!media)
			throw new Error('Anexe ou cite uma imagem disponível para usar como foto.');
		bytes =
			media.transportType === 'url'
				? await download(media.data)
				: Buffer.from(media.data, 'base64url');
	} else if (source === 'generate' && prompt.trim()) {
		const image = await FuelIXApi.generateImage(prompt, [], 240_000);
		bytes = image.b64_json
			? Buffer.from(image.b64_json, 'base64')
			: await download(image.url!);
	} else throw new Error('Selecione a imagem anexada ou descreva a imagem a gerar.');
	if (bytes.length > 8_000_000)
		throw new Error('Imagem muito grande. Limite: 8 MB.');
	return (
		await sharp(bytes, { limitInputPixels: 16_000_000 })
			.resize(640, 640, { fit: 'cover' })
			.jpeg({ quality: 85 })
			.toBuffer()
	).toString('base64');
};
