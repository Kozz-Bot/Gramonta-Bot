import fs from 'node:fs/promises';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';
import { verifyModel } from './model';

sharp.cache(false);
sharp.concurrency(1);
const SIDE = 320;
const MAX_BYTES = 8_000_000;
const MAX_PIXELS = 16_000_000;
const acceptedFormats = new Set(['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff']);
class ImageError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

export const createSegmenter = async (file: string) => {
	const bytes = await fs.readFile(file);
	if (!verifyModel(bytes)) throw new Error('Invalid model');
	const session = await ort.InferenceSession.create(bytes, {
		executionProviders: ['cpu'],
		intraOpNumThreads: 1,
		interOpNumThreads: 1,
		executionMode: 'sequential',
		graphOptimizationLevel: 'all',
		logSeverityLevel: 3,
		enableCpuMemArena: false,
		enableMemPattern: false,
	});
	return async (input: Buffer) => {
		if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_BYTES)
			throw new ImageError('INVALID_IMAGE');
		const info = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
		if ((info.pages || 1) > 1 || info.format === 'gif')
			throw new ImageError('ANIMATED_IMAGE');
		if (!acceptedFormats.has(info.format || ''))
			throw new ImageError('INVALID_IMAGE');
		// Bound decoded output memory; orientation is applied before computing the mask.
		const { data: rgba, info: size } = await sharp(input, {
			limitInputPixels: MAX_PIXELS,
		})
			.rotate()
			.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
			.toColourspace('srgb')
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const rgb = await sharp(rgba, {
			raw: { width: size.width, height: size.height, channels: 4 },
		})
			.removeAlpha()
			.resize(SIDE, SIDE, { fit: 'fill', kernel: 'lanczos3' })
			.raw()
			.toBuffer();
		let maxValue = 1;
		for (const value of rgb) maxValue = Math.max(maxValue, value);
		const tensor = new Float32Array(3 * SIDE * SIDE),
			means = [0.485, 0.456, 0.406],
			deviations = [0.229, 0.224, 0.225];
		for (let channel = 0; channel < 3; channel++)
			for (let pixel = 0; pixel < SIDE * SIDE; pixel++) {
				tensor[channel * SIDE * SIDE + pixel] =
					(rgb[3 * pixel + channel] / maxValue - means[channel]) /
					deviations[channel];
			}
		const outputs = await session.run(
			{
				[session.inputNames[0]]: new ort.Tensor('float32', tensor, [
					1,
					3,
					SIDE,
					SIDE,
				]),
			},
			[session.outputNames[0]]
		);
		const prediction = outputs[session.outputNames[0]].data as Float32Array;
		let low = Infinity,
			high = -Infinity;
		for (let i = 0; i < SIDE * SIDE; i++) {
			low = Math.min(low, prediction[i]);
			high = Math.max(high, prediction[i]);
		}
		if (!Number.isFinite(low + high) || high - low < 1e-6)
			throw new ImageError('NO_SUBJECT');
		const smallMask = Buffer.alloc(SIDE * SIDE);
		for (let i = 0; i < smallMask.length; i++)
			smallMask[i] = Math.round(
				255 * Math.max(0, Math.min(1, (prediction[i] - low) / (high - low)))
			);
		const mask = await sharp(smallMask, {
			raw: { width: SIDE, height: SIDE, channels: 1 },
		})
			.resize(size.width, size.height, { fit: 'fill', kernel: 'lanczos3' })
			.greyscale()
			.raw()
			.toBuffer();
		for (let i = 0; i < mask.length; i++)
			rgba[i * 4 + 3] = Math.round((rgba[i * 4 + 3] * mask[i]) / 255);
		return sharp(rgba, {
			raw: { width: size.width, height: size.height, channels: 4 },
		})
			.png()
			.toBuffer();
	};
};

if (require.main === module) {
	let segment: Awaited<ReturnType<typeof createSegmenter>> | undefined;
	let busy = false;
	process.on('disconnect', () => process.exit(0));
	process.on(
		'message',
		async (message: { id: string; modelFile: string; bytes: Buffer }) => {
			if (busy || !message || !Buffer.isBuffer(message.bytes)) return;
			busy = true;
			try {
				segment ||= await createSegmenter(message.modelFile);
				const output = await segment(message.bytes);
				process.send?.({
					id: message.id,
					output,
					rss: process.memoryUsage().rss,
					maxRss: process.resourceUsage().maxRSS * 1024,
				});
			} catch (error) {
				process.send?.({
					id: message.id,
					error: error instanceof ImageError ? error.code : 'PROCESSING_FAILED',
				});
			} finally {
				busy = false;
			}
		}
	);
}
