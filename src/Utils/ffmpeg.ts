import fs from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';

const __TEMP_AUDIO_PATH__ = './media/temp';

export const convertBufferToPath = async (
	buffer: Buffer,
	fromFormat: string,
	toFormat: `${string}`
): Promise<string> => {
	const inFilePath = `${__TEMP_AUDIO_PATH__}/tempFile.${fromFormat}`;
	const outFilePath = `${__TEMP_AUDIO_PATH__}/temp.${toFormat}`;

	await fs.writeFile(inFilePath, buffer);

	return new Promise((resolve, reject) => {
		ffmpeg(inFilePath)
			.output(outFilePath)

			.saveToFile(outFilePath)

			.on('end', () => {
				resolve(outFilePath);
			})

			.on('error', err => {
				reject(err);
			});
	});
};

export const convertPathToPath = async (
	inFilePath: string,
	toFormat: `${string}`
): Promise<string> => {
	const outFilePath = `${__TEMP_AUDIO_PATH__}/temp.${toFormat}`;
	const buffer = await fs.readFile(inFilePath);

	await fs.writeFile(inFilePath, buffer);

	return new Promise((resolve, reject) => {
		ffmpeg(inFilePath)
			.output(outFilePath)

			.saveToFile(outFilePath)

			.on('end', () => {
				resolve(outFilePath);
			})

			.on('error', err => {
				reject(err);
			});
	});
};
