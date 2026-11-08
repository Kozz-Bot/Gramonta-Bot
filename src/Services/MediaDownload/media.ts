import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DownloadError, DownloadMode, MAX_BYTES, MAX_SECONDS } from './urls';

const run = promisify(execFile);
export const prepareMedia = async (data: Buffer, mode: DownloadMode) => {
	if (!data.length || data.length > MAX_BYTES)
		throw new DownloadError('O arquivo está vazio ou excede o limite de 32 MB.');
	const directory = await mkdtemp(join(tmpdir(), 'kozz-download-'));
	try {
		const input = join(directory, 'source');
		await writeFile(input, data);
		const { stdout } = await run(
			'ffprobe',
			[
				'-v',
				'error',
				'-protocol_whitelist',
				'file,pipe',
				'-show_entries',
				'stream=codec_type,codec_name:format=duration,format_name',
				'-of',
				'json',
				input,
			],
			{ timeout: 15000, maxBuffer: 1024 * 1024 }
		);
		const info = JSON.parse(stdout);
		const duration = Number(info.format?.duration);
		if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS)
			throw new DownloadError('O arquivo precisa ter duração de até 10 minutos.');
		const streams: { codec_type: string; codec_name: string }[] = info.streams || [];
		if (!streams.some(s => s.codec_type === mode))
			throw new DownloadError(
				mode === 'audio'
					? 'Esse conteúdo não possui áudio.'
					: 'Esse conteúdo não possui vídeo.'
			);
		if (
			mode === 'video' &&
			streams.some(s => s.codec_type === 'video' && s.codec_name === 'h264') &&
			info.format?.format_name?.split(',').includes('mp4')
		)
			return { data, duration, mimeType: 'video/mp4' as const };
		const output = join(directory, mode === 'audio' ? 'audio.ogg' : 'video.mp4');
		const limit = mode === 'audio' ? 16 * 1024 * 1024 : MAX_BYTES;
		await run(
			'ffmpeg',
			[
				'-nostdin',
				'-hide_banner',
				'-loglevel',
				'error',
				'-y',
				'-protocol_whitelist',
				'file,pipe',
				'-i',
				input,
				...(mode === 'audio'
					? ['-map', '0:a:0', '-vn', '-c:a', 'libopus', '-b:a', '64k', '-ac', '1']
					: [
							'-map',
							'0:v:0',
							'-map',
							'0:a:0?',
							'-c:v',
							'libx264',
							'-preset',
							'veryfast',
							'-vf',
							'scale=trunc(iw/2)*2:trunc(ih/2)*2',
							'-pix_fmt',
							'yuv420p',
							'-c:a',
							'aac',
							'-movflags',
							'+faststart',
						]),
				'-map_metadata',
				'-1',
				'-threads',
				'1',
				'-t',
				String(MAX_SECONDS + 1),
				'-fs',
				String(limit + 1),
				output,
			],
			{ timeout: 120000, maxBuffer: 1024 * 1024 }
		);
		if ((await stat(output)).size > limit)
			throw new DownloadError(
				`O ${mode === 'audio' ? 'áudio excede 16' : 'vídeo excede 32'} MB.`
			);
		return {
			data: await readFile(output),
			duration,
			mimeType:
				mode === 'audio'
					? ('audio/ogg; codecs=opus' as const)
					: ('video/mp4' as const),
		};
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};
