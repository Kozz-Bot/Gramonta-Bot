import sharp from 'sharp';

export const convertToJpeg = async (base64: string) => {
	try {
		const buffer = Buffer.from(base64, 'base64url');
		const image = await sharp(buffer)
			.toFormat('jpeg')
			.resize({ width: 512, height: 512, fit: 'inside' })
			.toBuffer();

		return image.toString('base64url');
	} catch (e) {
		console.warn(e);
		console.trace();
	}
};
