import axios from 'axios';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import type { Media } from 'kozz-types';
import { AiToolInputError } from '../OwnerAI/contracts';

const run = promisify(execFile);
export const MAX_MEDIA_BYTES = 32 * 1024 * 1024;
export const MAX_WINDOW_SECONDS = 180;
export type MediaWindow = { startSeconds?: number; endSeconds?: number };
export type PreparedMedia = {
	kind: 'image' | 'video' | 'audio';
	duration?: number;
	start: number;
	end?: number;
	partial: boolean;
	frames: { seconds: number; bytes: Buffer }[];
	audioPath?: string;
	noAudio?: boolean;
	cleanup: () => Promise<void>;
};
let active = false;
const queue: (() => void)[] = [];
const acquire = async () => {
	if (active) {
		if (queue.length >= 3)
			throw new AiToolInputError(
				'O leitor de mídias está ocupado. Tente novamente em instantes.'
			);
		await new Promise<void>(resolve => queue.push(resolve));
	} else active = true;
	return () => {
		const next = queue.shift();
		if (next) next();
		else active = false;
	};
};
const mediaBytes = async (media: Media) => {
	if (
		!media?.data ||
		(media.sizeInBytes || 0) > MAX_MEDIA_BYTES ||
		(media.transportType === 'b64' &&
			media.data.length > Math.ceil(MAX_MEDIA_BYTES / 3) * 4)
	)
		throw new AiToolInputError('Envie uma mídia válida de até 32 MB.');
	let bytes: Buffer;
	if (media.transportType === 'b64') bytes = Buffer.from(media.data, 'base64');
	else if (media.transportType === 'url') {
		const url = new URL(media.data);
		if (!['http:', 'https:'].includes(url.protocol))
			throw new AiToolInputError(
				'Não consegui acessar a mídia. Reenvie pelo WhatsApp.'
			);
		try {
			bytes = Buffer.from(
				(
					await axios.get(url.href, {
						responseType: 'arraybuffer',
						timeout: 20000,
						maxContentLength: MAX_MEDIA_BYTES,
						maxBodyLength: MAX_MEDIA_BYTES,
						maxRedirects: 3,
					})
				).data
			);
		} catch {
			throw new AiToolInputError(
				'Não consegui baixar a mídia. Ela pode ter expirado ou exceder 32 MB.'
			);
		}
	} else
		throw new AiToolInputError(
			'Formato de transporte da mídia indisponível. Reenvie pelo WhatsApp.'
		);
	if (!bytes.length || bytes.length > MAX_MEDIA_BYTES)
		throw new AiToolInputError('Envie uma mídia válida de até 32 MB.');
	return bytes;
};
const FORMATS =
	'mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,avi,ogg,mp3,aac,flac,wav,gif,apng';
const inputOptions = [
	'-protocol_whitelist',
	'file,pipe',
	'-format_whitelist',
	FORMATS,
];

export const prepareMedia = async (
	media: Media,
	window: MediaWindow = {}
): Promise<PreparedMedia> => {
	const release = await acquire();
	const deadline = Date.now() + 60000;
	const processFile = (program: string, args: string[], timeout: number) => {
		const remaining = deadline - Date.now();
		if (remaining <= 0)
			throw new AiToolInputError(
				'A preparação da mídia demorou demais. Tente um arquivo menor.'
			);
		return run(program, args, {
			timeout: Math.min(timeout, remaining),
			maxBuffer: 1024 * 1024,
		});
	};
	let directory: string | undefined;
	let finished = false;
	const cleanup = async () => {
		if (finished) return;
		finished = true;
		try {
			if (directory) await rm(directory, { recursive: true, force: true });
		} finally {
			release();
		}
	};
	try {
		const bytes = await mediaBytes(media);
		if (media.mimeType?.startsWith('image/') && media.mimeType !== 'image/gif') {
			const info = await sharp(bytes, { limitInputPixels: 16_000_000 }).metadata();
			if (
				!['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff'].includes(info.format || '')
			)
				throw new AiToolInputError(
					'Essa imagem não é compatível. Envie JPG, PNG ou WebP.'
				);
			if ((info.pages || 1) <= 1) {
				const output = await sharp(bytes, { limitInputPixels: 16_000_000 })
					.rotate()
					.resize({
						width: 1024,
						height: 1024,
						fit: 'inside',
						withoutEnlargement: true,
					})
					.flatten({ background: 'white' })
					.jpeg({ quality: 82 })
					.toBuffer();
				return {
					kind: 'image',
					frames: [{ seconds: 0, bytes: output }],
					start: 0,
					partial: false,
					cleanup,
				};
			}
		}
		if (!/^(?:video\/|audio\/|image\/(?:gif|webp))/.test(media.mimeType || ''))
			throw new AiToolInputError(
				'Posso interpretar fotos, figurinhas, vídeos e áudios. Esse tipo de arquivo ainda não é compatível.'
			);
		directory = await mkdtemp(join(tmpdir(), 'gramonta-ai-media-'));
		const source = join(directory, 'source');
		await writeFile(source, bytes, { mode: 0o600 });
		const { stdout } = await processFile(
			'ffprobe',
			[
				'-v',
				'error',
				...inputOptions,
				'-show_entries',
				'stream=codec_type,width,height,duration,avg_frame_rate:format=duration',
				'-of',
				'json',
				source,
			],
			10000
		);
		const info = JSON.parse(stdout),
			streams = info.streams || [];
		const video = streams.find((s: any) => s.codec_type === 'video'),
			audio = streams.find((s: any) => s.codec_type === 'audio');
		if (!video && !audio)
			throw new AiToolInputError('O arquivo não contém áudio ou vídeo legível.');
		if (
			video &&
			(!video.width || !video.height || video.width * video.height > 16_000_000)
		)
			throw new AiToolInputError(
				'Esse vídeo tem resolução grande demais. Envie uma versão de até 16 megapixels por quadro.'
			);
		const duration = Math.max(
			Number(info.format?.duration) || 0,
			...streams.map((s: any) => Number(s.duration) || 0)
		);
		if (!Number.isFinite(duration) || duration <= 0 || duration > 3600)
			throw new AiToolInputError(
				'Não consegui verificar uma duração válida. Envie uma mídia de até uma hora.'
			);
		const start = window.startSeconds ?? 0,
			end = Math.min(window.endSeconds ?? start + MAX_WINDOW_SECONDS, duration);
		if (
			!Number.isFinite(start) ||
			!Number.isFinite(end) ||
			start < 0 ||
			start >= duration ||
			end <= start ||
			end - start > MAX_WINDOW_SECONDS
		)
			throw new AiToolInputError(
				'Escolha um trecho válido de até 180 segundos, dentro da duração da mídia.'
			);
		const frames: PreparedMedia['frames'] = [];
		if (video) {
			const count = Math.min(8, Math.max(1, Math.ceil(end - start)));
			const [rate, divisor] = String(video.avg_frame_rate || '30/1')
				.split('/')
				.map(Number);
			const frameInterval = rate > 0 && divisor > 0 ? divisor / rate : 0.1;
			const lastFrame = Math.max(
				start,
				Math.min(end, Number(video.duration) || duration) -
					Math.max(0.1, frameInterval)
			);
			for (let i = 0; i < count; i++) {
				const seconds =
						count === 1 ? start : start + ((lastFrame - start) * i) / (count - 1),
					output = join(directory, `frame-${i}.jpg`);
				await processFile(
					'ffmpeg',
					[
						'-nostdin',
						'-v',
						'error',
						'-y',
						...inputOptions,
						'-threads',
						'1',
						'-ss',
						String(seconds),
						'-i',
						source,
						'-an',
						'-frames:v',
						'1',
						'-vf',
						'scale=768:768:force_original_aspect_ratio=decrease',
						'-filter_threads',
						'1',
						'-threads',
						'1',
						'-q:v',
						'4',
						'-fs',
						'1000000',
						output,
					],
					10000
				);
				const frame = await readFile(output);
				if (!frame.length || frame.length > 1_000_000)
					throw new AiToolInputError(
						'Não consegui preparar os quadros desse vídeo.'
					);
				frames.push({ seconds: Math.round(seconds * 1000) / 1000, bytes: frame });
			}
		}
		let audioPath: string | undefined;
		if (audio) {
			audioPath = join(directory, 'audio.mp3');
			await processFile(
				'ffmpeg',
				[
					'-nostdin',
					'-v',
					'error',
					'-y',
					...inputOptions,
					'-threads',
					'1',
					'-ss',
					String(start),
					'-i',
					source,
					'-map',
					'0:a:0',
					'-vn',
					'-t',
					String(end - start),
					'-map_metadata',
					'-1',
					'-ac',
					'1',
					'-ar',
					'16000',
					'-codec:a',
					'libmp3lame',
					'-b:a',
					'48k',
					'-threads',
					'1',
					'-fs',
					'4000000',
					audioPath,
				],
				30000
			);
			if (!(await stat(audioPath)).size)
				throw new AiToolInputError('A faixa de áudio ficou vazia.');
		}
		return {
			kind: video ? 'video' : 'audio',
			duration,
			start,
			end,
			partial: start > 0 || end < duration,
			frames,
			audioPath,
			noAudio: !audio,
			cleanup,
		};
	} catch (error) {
		await cleanup();
		if (error instanceof AiToolInputError) throw error;
		throw new AiToolInputError(
			'Não consegui ler essa mídia. Ela pode estar corrompida ou em formato incompatível. Reenvie uma versão menor.'
		);
	}
};
