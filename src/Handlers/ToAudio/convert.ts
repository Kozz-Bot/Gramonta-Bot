import axios from 'axios';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { type Media } from 'kozz-types';

const run = promisify(execFile);
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_SECONDS = 600;

export class ToAudioError extends Error {}

export const extractAudio = async (media: Media): Promise<Buffer> => {
	if (media.sizeInBytes && media.sizeInBytes > MAX_VIDEO_BYTES) {
		throw new ToAudioError('O vídeo excede o limite de 64 MB. Envie um vídeo menor.');
	}
	if ((media.duration ?? 0) > MAX_SECONDS) {
		throw new ToAudioError('O vídeo excede o limite de 10 minutos. Envie um vídeo mais curto.');
	}
	let input: Buffer;
	if (media.transportType === 'url') {
		try {
			const url = new URL(media.data);
			if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
			const response = await axios.get<ArrayBuffer>(url.href, {
				responseType: 'arraybuffer', timeout: 30000,
				maxContentLength: MAX_VIDEO_BYTES, maxBodyLength: MAX_VIDEO_BYTES,
			});
			input = Buffer.from(response.data);
		} catch {
			throw new ToAudioError('Não consegui baixar o vídeo. Ele pode ter expirado ou exceder 64 MB. Reenvie o vídeo e tente novamente.');
		}
	} else if (media.transportType === 'b64') {
		if (media.data.length > Math.ceil(MAX_VIDEO_BYTES / 3) * 4) {
			throw new ToAudioError('O vídeo excede o limite de 64 MB. Envie um vídeo menor.');
		}
		input = Buffer.from(media.data, 'base64');
	} else {
		throw new ToAudioError('Não consegui ler o vídeo. Reenvie o arquivo e tente novamente.');
	}
	if (!input.length || input.length > MAX_VIDEO_BYTES) {
		throw new ToAudioError('O vídeo está vazio ou excede o limite de 64 MB. Reenvie um vídeo válido.');
	}
	const directory = await mkdtemp(join(tmpdir(), 'kozz-toaudio-'));
	try {
		const source = join(directory, 'video');
		const output = join(directory, 'audio.mp3');
		await writeFile(source, input);
		const { stdout } = await run('ffprobe', [
			'-v', 'error', '-protocol_whitelist', 'file,pipe',
			'-show_entries', 'stream=codec_type,duration:format=duration', '-of', 'json', source,
		], { timeout: 15000, maxBuffer: 1024 * 1024 });
		const info = JSON.parse(stdout);
		if (!info.streams?.some((stream: { codec_type: string }) => stream.codec_type === 'video')) {
			throw new ToAudioError('O arquivo citado não contém um vídeo válido.');
		}
		if (!info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio')) {
			throw new ToAudioError('Esse vídeo não possui faixa de áudio. Envie um vídeo com som.');
		}
		const duration = Math.max(Number(info.format?.duration) || 0,
			...info.streams.map((stream: { duration?: string }) => Number(stream.duration) || 0));
		if (!Number.isFinite(duration) || duration <= 0) {
			throw new ToAudioError('Não consegui verificar a duração desse vídeo. Reenvie um vídeo válido.');
		}
		if (duration > MAX_SECONDS) {
			throw new ToAudioError('O vídeo excede o limite de 10 minutos. Envie um vídeo mais curto.');
		}
		await run('ffmpeg', [
			'-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
			'-protocol_whitelist', 'file,pipe', '-i', source,
			'-map', '0:a:0', '-vn', '-map_metadata', '-1', '-codec:a', 'libmp3lame',
			'-b:a', '128k', '-ac', '2', '-ar', '44100', '-threads', '1',
			'-t', String(MAX_SECONDS + 1), '-fs', String(MAX_AUDIO_BYTES + 1), output,
		], { timeout: 120000, maxBuffer: 1024 * 1024 });
		const { size } = await stat(output);
		if (!size || size > MAX_AUDIO_BYTES) {
			throw new ToAudioError('O áudio está vazio ou excede o limite de 16 MB. Tente um vídeo menor.');
		}
		return await readFile(output);
	} catch (error) {
		if (error instanceof ToAudioError) throw error;
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new ToAudioError('O conversor de áudio está indisponível no momento. Tente novamente mais tarde.');
		}
		if ((error as { killed?: boolean }).killed) {
			throw new ToAudioError('A conversão demorou demais. Tente novamente com um vídeo menor.');
		}
		throw new ToAudioError('Não consegui converter esse vídeo. O arquivo pode estar corrompido ou em formato incompatível. Reenvie o vídeo e tente novamente.');
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};
