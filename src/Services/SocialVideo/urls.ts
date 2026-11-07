import axios from 'axios';

export type Platform = 'twitter' | 'instagram' | 'facebook' | 'tiktok';
export class SocialVideoError extends Error {}
export const platforms = {
	twitter: {
		command: 'tw',
		label: 'Twitter/X',
		example: 'https://x.com/usuario/status/123',
	},
	instagram: {
		command: 'ig',
		label: 'Instagram',
		example: 'https://www.instagram.com/reel/Codigo/',
	},
	facebook: {
		command: 'fb',
		label: 'Facebook',
		example: 'https://www.facebook.com/reel/123',
	},
	tiktok: {
		command: 'tt',
		label: 'TikTok',
		example: 'https://vt.tiktok.com/Codigo/',
	},
};
const hosts: Record<Platform, string[]> = {
	twitter: [
		'twitter.com',
		'www.twitter.com',
		'mobile.twitter.com',
		'x.com',
		'www.x.com',
		'mobile.x.com',
	],
	instagram: ['instagram.com', 'www.instagram.com', 'm.instagram.com'],
	facebook: [
		'facebook.com',
		'www.facebook.com',
		'm.facebook.com',
		'web.facebook.com',
		'fb.watch',
		'www.fb.watch',
	],
	tiktok: [
		'tiktok.com',
		'www.tiktok.com',
		'm.tiktok.com',
		'vm.tiktok.com',
		'vt.tiktok.com',
	],
};

const parseTrustedUrl = (input: string, platform: Platform) => {
	if (/\s/.test(input.trim())) throw new Error();
	const url = new URL(input.trim());
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		url.port ||
		!hosts[platform].includes(url.hostname)
	)
		throw new Error();
	return url;
};
const isShort = (url: URL, platform: Platform) =>
	(platform === 'facebook' &&
		(url.hostname.endsWith('fb.watch') ||
			/^\/share\/[rv]\/[A-Za-z0-9]+\/?$/.test(url.pathname))) ||
	(platform === 'tiktok' &&
		(['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) ||
			/^\/t\/[A-Za-z0-9]+\/?$/.test(url.pathname)));

export const normalizeSocialUrl = (input: string, platform: Platform): string => {
	try {
		const url = parseTrustedUrl(input, platform);
		if (isShort(url, platform)) {
			if (!/^\/(?:t\/|share\/[rv]\/)?[A-Za-z0-9]+\/?$/.test(url.pathname))
				throw new Error();
			return `${url.origin}${url.pathname}`;
		}
		if (platform === 'twitter') {
			const match = url.pathname.match(
				/^\/(?:[a-zA-Z0-9_]+\/status|i\/web\/status|i\/status)\/(\d+)(?:\/video\/\d+)?\/?$/
			);
			if (match) return `https://twitter.com/i/status/${match[1]}`;
		} else if (platform === 'instagram') {
			const match = url.pathname.match(
				/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/
			);
			if (match) return `https://www.instagram.com/${match[1]}/${match[2]}/`;
		} else if (platform === 'tiktok') {
			const match = url.pathname.match(
				/^\/(?:@[\w.-]+\/video|share\/video)\/(\d+)\/?$/
			);
			if (match) return `https://www.tiktok.com${url.pathname.replace(/\/$/, '')}`;
			const embedded = url.pathname.match(
				/^\/(?:v\/(\d+)\.html|(?:embed(?:\/v2)?|player\/v1)\/(\d+))\/?$/
			);
			if (embedded)
				return `https://www.tiktok.com/embed/${embedded[1] || embedded[2]}`;
		} else {
			if (
				/^\/(?:watch\/?|video\.php)$/.test(url.pathname) &&
				/^\d+$/.test(url.searchParams.get('v') || '')
			) {
				return `https://www.facebook.com/watch/?v=${url.searchParams.get('v')}`;
			}
			if (
				/^\/(?:reel\/\d+|[\w.-]+\/(?:videos|posts)\/(?:pfbid[A-Za-z0-9]+|\d+))\/?$/.test(
					url.pathname
				)
			) {
				return `https://www.facebook.com${url.pathname}`;
			}
		}
		throw new Error();
	} catch {
		const config = platforms[platform];
		throw new SocialVideoError(
			`Envie um link válido de vídeo do ${config.label}: /${config.command} ${config.example}`
		);
	}
};

// Shared text can contain a title, punctuation and several links. Only use a
// supported video URL for the command's own platform, preserving URL case.
export const extractSocialUrl = (
	text: string,
	platform: Platform
): string | undefined => {
	const candidates =
		text.match(
			/(?:https?:\/\/|www\.|(?:vm|vt)\.tiktok\.com\/)[^\s<>"'`\u200B-\u200F\uFEFF]+/gi
		) || [];
	for (const candidate of candidates) {
		const value = candidate.replace(/[)\]}.!,;:!?…。、*]+$/, '');
		try {
			return normalizeSocialUrl(
				/^https?:\/\//i.test(value) ? value : `https://${value}`,
				platform
			);
		} catch {
			/* Continue to the next link; never fetch unrelated URLs. */
		}
	}
	return undefined;
};

// Resolve only official short links. Validate every redirect before making a request.
export const resolveSocialUrl = async (
	input: string,
	platform: Platform
): Promise<string> => {
	let current = normalizeSocialUrl(input, platform);
	for (let hop = 0; hop < 5; hop++) {
		const url = parseTrustedUrl(current, platform);
		if (!isShort(url, platform)) return normalizeSocialUrl(current, platform);
		const response = await axios.get(current, {
			maxRedirects: 0,
			responseType: 'stream',
			timeout: 5000,
			validateStatus: status => status >= 200 && status < 400,
			headers: { 'User-Agent': 'Mozilla/5.0' },
		});
		response.data.destroy();
		const location = response.headers.location;
		if (!location || response.status < 300) break;
		const next = new URL(location, current).href;
		parseTrustedUrl(next, platform);
		current = next;
	}
	throw new SocialVideoError(
		'Não consegui abrir esse link curto. Copie o link completo do vídeo e tente novamente.'
	);
};
