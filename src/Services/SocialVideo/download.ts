import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
	Platform,
	SocialVideoError,
	normalizeSocialUrl,
	resolveSocialUrl,
} from './urls';

const run = promisify(execFile);
export const MAX_BYTES = 32 * 1024 * 1024;

export const downloadSocialVideo = async (
	input: string,
	platform: Platform
): Promise<{ data: Buffer; duration: number }> => {
	const normalized = normalizeSocialUrl(input, platform);
	let directory: string | undefined;
	try {
		const url = await resolveSocialUrl(normalized, platform);
		// Buffer stdout directly: maxBuffer also stops downloads with unknown file size.
		// Select direct MP4 so yt-dlp does not launch an external HLS downloader.
		const { stdout } = await run(
			process.env.YT_DLP_PATH || join(homedir(), '.local/bin/yt-dlp'),
			[
				'--ignore-config',
				'--no-plugin-dirs',
				'--no-cache-dir',
				'--quiet',
				'--no-warnings',
				'--no-progress',
				'--no-playlist',
				'--playlist-items',
				'1',
				'--socket-timeout',
				'15',
				'--retries',
				'1',
				'--extractor-retries',
				'1',
				'--max-filesize',
				String(MAX_BYTES),
				'--match-filters',
				'!is_live & duration <=? 600 & availability !=? private & availability !=? needs_auth & availability !=? subscriber_only & availability !=? premium_only',
				'-S',
				'vcodec:h264,res:720',
				'-f',
				'best[ext=mp4][protocol=https][filesize<=?33554432]',
				'-o',
				'-',
				'--',
				url,
			],
			{
				encoding: 'buffer',
				timeout: 120000,
				killSignal: 'SIGKILL',
				maxBuffer: MAX_BYTES,
			}
		);
		if (!stdout.length)
			throw new SocialVideoError(
				'Nenhum vídeo disponível dentro dos limites de 32 MB e 10 minutos.'
			);
		directory = await mkdtemp(join(tmpdir(), 'kozz-social-video-'));
		const source = join(directory, 'video.mp4');
		await writeFile(source, stdout);
		const probe = await run(
			'ffprobe',
			[
				'-v',
				'error',
				'-protocol_whitelist',
				'file,pipe',
				'-show_entries',
				'stream=codec_type,codec_name:format=duration',
				'-of',
				'json',
				source,
			],
			{ timeout: 15000, maxBuffer: 1024 * 1024 }
		);
		const info = JSON.parse(probe.stdout);
		const duration = Number(info.format?.duration);
		if (
			!info.streams?.some(
				(s: { codec_type: string; codec_name: string }) =>
					s.codec_type === 'video' && s.codec_name === 'h264'
			)
		) {
			throw new SocialVideoError(
				'Esse post não contém um vídeo MP4 compatível com o WhatsApp.'
			);
		}
		if (!Number.isFinite(duration) || duration <= 0 || duration > 600) {
			throw new SocialVideoError('O vídeo precisa ter duração de até 10 minutos.');
		}
		return { data: stdout, duration };
	} catch (error) {
		if (error instanceof SocialVideoError) throw error;
		const failure = error as NodeJS.ErrnoException & { killed?: boolean };
		if (failure.code === 'ENOENT')
			throw new SocialVideoError(
				'O serviço de download está indisponível. Tente novamente mais tarde.'
			);
		if (failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
			throw new SocialVideoError('O vídeo excede o limite de 32 MB.');
		if (failure.killed)
			throw new SocialVideoError(
				'O download demorou demais. Tente novamente com um vídeo menor.'
			);
		throw new SocialVideoError(
			'Não consegui baixar esse vídeo. Confira se o post é público e contém um vídeo. A plataforma também pode exigir login ou estar indisponível; tente novamente mais tarde.'
		);
	} finally {
		if (directory) await rm(directory, { recursive: true, force: true });
	}
};
