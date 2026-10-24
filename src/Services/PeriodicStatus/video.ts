import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Creates a separate MP4 with the beginning of the video; never changes source. */
export const firstSeconds = async (source: string, seconds: number): Promise<Buffer> => {
	if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 90) throw new Error('Duração do recorte inválida');
	const directory = await mkdtemp(path.join(os.tmpdir(), 'kozz-status-video-'));
	try {
		const output = path.join(directory, 'status.mp4');
		await run('ffmpeg', [
			'-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
			'-protocol_whitelist', 'file,pipe', '-i', source,
			'-t', String(seconds), '-map', '0:v:0', '-map', '0:a:0?',
			'-map_metadata', '-1', '-c:v', 'libx264', '-preset', 'veryfast',
			'-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
			'-threads', '1', '-movflags', '+faststart', output,
		], { timeout: 120_000, maxBuffer: 1024 * 1024 });
		const info = await stat(output);
		if (!info.size || info.size > 64 * 1024 * 1024) throw new Error('Recorte de status vazio ou maior que 64 MB');
		return await readFile(output);
	} catch {
		throw new Error('Não foi possível preparar o recorte de vídeo do Status');
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};
