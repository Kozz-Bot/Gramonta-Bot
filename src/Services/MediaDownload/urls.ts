import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export class DownloadError extends Error {}
export type DownloadMode = 'video' | 'audio';
export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_SECONDS = 600;

export const youtubeUrl = (input: string) => {
	const host = new URL(input).hostname;
	return ['youtube.com', 'youtu.be', 'youtube-nocookie.com'].some(
		domain => host === domain || host.endsWith(`.${domain}`)
	);
};

export const publicUrl = (input: string, allowHttp = false): URL => {
	try {
		const url = new URL(input);
		if (
			/\s/.test(input) ||
			!['https:', ...(allowHttp ? ['http:'] : [])].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.port ||
			!url.hostname.includes('.') ||
			isIP(url.hostname) ||
			/\.(?:localhost|local|internal|lan|home|test|invalid)$/i.test(url.hostname)
		)
			throw new Error();
		return url;
	} catch {
		throw new DownloadError('Envie um link HTTPS de um site público.');
	}
};

const blocked = new BlockList();
for (const [address, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.0.2.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['198.51.100.0', 24],
	['203.0.113.0', 24],
	['224.0.0.0', 3],
] as [string, number][])
	blocked.addSubnet(address, prefix);

export const publicAddress = async (hostname: string): Promise<string> => {
	const addresses = await lookup(hostname, { family: 4, all: true });
	if (!addresses.length || addresses.some(({ address }) => blocked.check(address)))
		throw new DownloadError('Esse endereço não pertence a um site público.');
	return addresses[0].address;
};

export const extractDownloadUrl = (text: string): string | undefined => {
	const candidate = text.match(
		/(?:https?:\/\/|www\.)[^\s<>"'`\u200B-\u200F\uFEFF]+/i
	)?.[0];
	if (!candidate) return undefined;
	const value = candidate.replace(/[)\]}.!,;:!?…。、*]+$/, '');
	return publicUrl(value.startsWith('www.') ? `https://${value}` : value).href;
};
