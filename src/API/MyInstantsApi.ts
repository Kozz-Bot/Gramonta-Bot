import axios from 'axios';
import { JSDOM } from 'jsdom';
import { createMemoService } from 'yasms';

export type MyInstantsSound = {
	id: string;
	title: string;
	mp3: string;
};

const api = axios.create({
	baseURL: 'https://www.myinstants.com',
	headers: {
		// MyInstants' Cloudflare protection can reject the default Axios user agent.
		'User-Agent':
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
		Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	},
	timeout: Number(process.env.MYINSTANTS_API_TIMEOUT_MS || 15_000),
});

const searchCache = createMemoService<MyInstantsSound | null>(undefined, 60_000);

const isHttpUrl = (value: unknown): value is string => {
	if (typeof value !== 'string') return false;

	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
};

export const parseFirstSound = (html: string): MyInstantsSound | null => {
	const dom = new JSDOM(html);
	const document = dom.window.document;
	const firstResult = document.querySelector('#instants_container .instant');
	const title = firstResult?.querySelector('.instant-link')?.textContent?.trim();
	const playHandler =
		firstResult?.querySelector('.small-button')?.getAttribute('onclick') ||
		firstResult?.querySelector('.small-button')?.getAttribute('onmousedown');
	const soundPath = playHandler?.match(/play\(\s*['"]([^'"]+)['"]/i)?.[1];
	if (!title || !soundPath) {
		dom.window.close();
		return null;
	}

	const mp3 = new URL(soundPath, 'https://www.myinstants.com').toString();
	if (!isHttpUrl(mp3) || new URL(mp3).hostname !== 'www.myinstants.com') {
		dom.window.close();
		return null;
	}

	const instantPath = firstResult?.querySelector('a[href*="/instant/"]')?.getAttribute('href');
	const id = instantPath?.match(/\/instant\/([^/]+)/)?.[1] || mp3.split('/').pop() || 'sound';
	dom.window.close();

	return {
		id,
		title,
		mp3,
	};
};

const scrapeFirstSound = async (query: string): Promise<MyInstantsSound | null> => {
	const { data: html } = await api.get<string>('/en/search/', {
		params: { name: query },
	});
	return parseFirstSound(html);
};

export const searchSounds = async (query: string): Promise<MyInstantsSound[]> => {
	const result = await searchCache.getData(query.trim().toLocaleLowerCase(), () =>
		scrapeFirstSound(query.trim())
	);
	return result.data ? [result.data] : [];
};
