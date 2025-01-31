import { Media } from 'kozz-types';
import sharp from 'sharp';

// This was shamelessly copied and adapted from Terminal Tools library
// I had to do this because this is not supposed to run on terminal
// https://tt.js.org/image.js.html

/**
 *
 * @param r
 * @param g
 * @param b
 * @returns  the ANSI color code
 * @example rgbToAnsi256(255, 255, 255);
 */
function rgbToAnsi256(r: number, g: number, b: number) {
	if (r === g && g === b) {
		if (r < 8) {
			return 16;
		}
		if (r > 248) {
			return 231;
		}
		return Math.round(((r - 8) / 247) * 24) + 232;
	}
	return (
		16 +
		36 * Math.round((r / 255) * 5) +
		6 * Math.round((g / 255) * 5) +
		Math.round((b / 255) * 5)
	);
}

/**
 * Copied from https://stackoverflow.com/questions/596216/formula-to-determine-perceived-brightness-of-rgb-color
 * @param r
 * @param g
 * @param b
 * @returns Brightness
 */
const getBrightness = (r: number, g: number, b: number) => {
	return 0.299 * r + 0.587 * g + 0.114 * b;
};

const brightnessToCharacter = (brightness: number) => {
	const pixelAsciiMap = ' .:-=+*#%@';

	const numAvailableChars = pixelAsciiMap.length;
	const index = Math.floor((brightness / 255) * numAvailableChars);
	return pixelAsciiMap[index];
};

export const imageToAsciiString = async (
	media: Media,
	width: number = 25,
	height: number = 25
) => {
	console.log(media.mimeType);
	const data = await sharp(Buffer.from(media.data, 'base64'))
		.toFormat('jpeg')
		.resize(width, height, {
			fit: 'contain',
		})
		.resize(width, Math.round(height / 2), {
			fit: 'fill',
		})
		.raw()
		.toBuffer();

	const pixels = [];
	for (let i = 0; i < data.length; i += 3) {
		const red = data[i];
		const green = data[i + 1];
		const blue = data[i + 2];
		pixels.push(getBrightness(red, green, blue));
	}
	return pixels
		.map(brightnessToCharacter)
		.join('')
		.match(new RegExp(`.{1,${width}}`, 'g'))!
		.join('\n');

	return pixels.map(item => `\x1B[38;5;${item}m\u2588\x1B[0;00m`).join('');
};
