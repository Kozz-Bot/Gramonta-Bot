import axios from 'axios';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { downloadProxy, fetchPublicMedia } from './network';
import { DownloadError, DownloadMode, MAX_BYTES } from './urls';

const run = promisify(execFile);
export const downloadWithYtDlp = async (
	url: string,
	mode: DownloadMode
): Promise<Buffer> => {
	const proxy = await downloadProxy();
	try {
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
				'--proxy',
				proxy.url,
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
				mode === 'audio'
					? 'bestaudio[protocol=https][filesize<=?33554432]/best[protocol=https][filesize<=?33554432]'
					: 'best[ext=mp4][protocol=https][filesize<=?33554432]/best[protocol=https][filesize<=?33554432]',
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
		return stdout;
	} finally {
		proxy.close();
	}
};

export const downloadWithCobalt = async (
	url: string,
	mode: DownloadMode
): Promise<Buffer> => {
	const base = new URL(process.env.COBALT_API_URL || 'http://127.0.0.1:9011/');
	const response = await axios.post(
		base.href,
		{
			url,
			downloadMode: mode === 'audio' ? 'audio' : 'auto',
			audioFormat: 'opus',
			audioBitrate: '64',
			videoQuality: '720',
			localProcessing: 'disabled',
			disableMetadata: true,
		},
		{
			proxy: false,
			timeout: 30000,
			maxRedirects: 0,
			maxContentLength: 1024 * 1024,
			headers: {
				Accept: 'application/json',
				...(process.env.COBALT_API_KEY
					? { Authorization: `Api-Key ${process.env.COBALT_API_KEY}` }
					: {}),
			},
		}
	);
	const result = response.data;
	let mediaUrl = result.url;
	if (result.status === 'picker')
		mediaUrl = result.picker?.find((item: any) => item.type === 'video')?.url;
	if (
		typeof mediaUrl !== 'string' ||
		!['redirect', 'tunnel', 'picker'].includes(result.status)
	)
		throw new DownloadError(
			'A segunda tentativa também não encontrou mídia disponível nesse link.'
		);
	const target = new URL(mediaUrl);
	// Only our configured Cobalt tunnel may address a local service.
	if (target.origin === base.origin && target.pathname === '/tunnel') {
		const media = await axios.get(target.href, {
			proxy: false,
			responseType: 'arraybuffer',
			timeout: 120000,
			maxRedirects: 0,
			maxContentLength: MAX_BYTES,
		});
		return Buffer.from(media.data);
	}
	return fetchPublicMedia(target.href, MAX_BYTES);
};
