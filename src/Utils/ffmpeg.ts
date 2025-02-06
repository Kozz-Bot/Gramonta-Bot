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

	//@ts-ignore

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
	const outFilePath = `${__TEMP_AUDIO_PATH__}.${toFormat}`;
	return new Promise((resolve, reject) => {
		ffmpeg(inFilePath)
			.saveToFile(outFilePath)
			.audioCodec('libopus')
			.audioChannels(1)
			.format('ogg')
			.outputOptions('-avoid_negative_ts', 'make_zero')

			.on('end', () => {
				console.log('Endded');
				resolve(outFilePath);
			})

			.on('progress', progress => console.log({ progress }))

			.on('error', err => {
				console.warn(err);
				reject(err);
			});
	});
};

export const convertB64ToB64 = async (
	inB64: string,
	fromFormat: string,
	toFormat: `${string}`
): Promise<string> => {
	const outFilePath = `${__TEMP_AUDIO_PATH__}/temp.${toFormat}`;
	const inFilePath = `${__TEMP_AUDIO_PATH__}/tempFile.${fromFormat}`;

	const buffer = Buffer.from(inB64, 'base64');

	//@ts-ignore
	await fs.writeFile(inFilePath, buffer);

	return new Promise((resolve, reject) => {
		ffmpeg(inFilePath)
			.output(outFilePath)

			.saveToFile(outFilePath)

			.on('end', async () => {
				const buffer = await fs.readFile(outFilePath);
				//@ts-ignore

				resolve(Buffer.from(buffer).toString('base64'));
			})

			.on('error', err => {
				reject(err);
			});
	});
};

export const convertB64ToPath = async (
	inB64: string,
	fromFormat: string,
	toFormat: `${string}`
): Promise<string> => {
	const outFilePath = `${__TEMP_AUDIO_PATH__}/temp.${toFormat}`;
	const inFilePath = `${__TEMP_AUDIO_PATH__}/tempFile.${fromFormat}`;

	const buffer = Buffer.from(inB64, 'base64');

	//@ts-ignore

	await fs.writeFile(inFilePath, buffer);

	return new Promise((resolve, reject) => {
		ffmpeg(inFilePath)
			.output(outFilePath)

			.saveToFile(outFilePath)

			.on('end', async () => {
				resolve(outFilePath);
			})

			.on('error', err => {
				reject(err);
			});
	});
};
