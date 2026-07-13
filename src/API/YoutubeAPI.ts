import axios, { AxiosResponse } from 'axios';
import oldFs from 'fs';
import path from 'path';

type DownloadType = 'video' | 'audio';
type HttpMethod = 'GET' | 'POST';

export type YoutubeSearchResult = {
	link: string;
	title: string;
	thumbnail?: string;
};

export type YoutubeSearchResponse = {
	results: YoutubeSearchResult[];
};

type YoutubeApiSearchResult = {
	link?: string;
	url?: string;
	videoUrl?: string;
	watchUrl?: string;
	title?: string;
	name?: string;
	thumbnail?: string;
	thumbnailUrl?: string;
	thumbnails?: {
		high?: { url?: string };
		default?: { url?: string };
		medium?: { url?: string };
	};
};

const normalizeBaseURL = (baseURL: string) =>
	baseURL.endsWith('/') ? baseURL : `${baseURL}/`;

const API = axios.create({
	baseURL: normalizeBaseURL(
		process.env.YOUTUBE_API_BASE_URL || 'https://dev.gramont.digital/ytb'
	),
	timeout: Number(process.env.YOUTUBE_API_TIMEOUT_MS || 120000),
});

const getMethod = (method: string | undefined, fallback: HttpMethod): HttpMethod =>
	method?.toUpperCase() === 'GET' ? 'GET' : fallback;

const searchPath = process.env.YOUTUBE_API_SEARCH_PATH || 'youtube/search';
const audioPath = process.env.YOUTUBE_API_AUDIO_PATH || 'youtube/download';
const videoPath = process.env.YOUTUBE_API_VIDEO_PATH || 'youtube/download';
const searchMethod = getMethod(process.env.YOUTUBE_API_SEARCH_METHOD, 'GET');
const downloadMethod = getMethod(process.env.YOUTUBE_API_DOWNLOAD_METHOD, 'POST');

const warnRequestError = (context: string, error: unknown) => {
	if (axios.isAxiosError(error)) {
		const responseData = Buffer.isBuffer(error.response?.data)
			? error.response?.data.toString('utf8')
			: error.response?.data;
		console.warn(context, {
			status: error.response?.status,
			message: error.message,
			response: responseData,
		});
		return;
	}

	console.warn(context, error);
};

/**
 * Downloads mp3 from a youtube video
 * @param {string} id
 * @returns {string} mp3 path
 */
export const downloadMp3FromId = async (id: string): Promise<string | void> => {
	const ytUrl = `https://www.youtube.com/watch?v=${id}`;

	return downloadMp3FromUrl(ytUrl).catch(err => console.warn(err));
};

/**
 * Downloads mp3 from a youtube url
 * @param url
 * @returns {string} mp3 path
 */
export const downloadMp3FromUrl = (url: string): Promise<string | undefined> => {
	const mediaPath = './media/ytSongs/song';
	return ytDownload('audio', url, mediaPath);
};

/**
 * Downloads mp4 from a youtube url
 * @param {string} id
 * @returns {string} mp4 path
 */
export const downloadVideoFromId = (id: string): Promise<string | undefined> => {
	const ytUrl = `https://www.youtube.com/watch?v=${id}`;
	return downloadVideoFromUrl(ytUrl);
};

/**
 * Downloads mp4 from a youtube url
 * @param url
 * @returns {string} mp4 path
 */
export const downloadVideoFromUrl = (url: string): Promise<string | undefined> => {
	const mediaPath = './media/ytVideos/video';
	return ytDownload('video', url, mediaPath);
};

const writeFile = (filePath: string, data: Buffer) => {
	oldFs.mkdirSync(path.dirname(filePath), { recursive: true });
	oldFs.writeFileSync(filePath, data);
	return filePath;
};

const extensionFromContentType = (contentType: string | undefined, type: DownloadType) => {
	if (contentType?.includes('ogg')) return 'ogg';
	if (contentType?.includes('webm')) return 'webm';
	if (contentType?.includes('mpeg')) return 'mp3';
	if (contentType?.includes('mp4')) return 'mp4';

	return type === 'audio' ? 'ogg' : 'mp4';
};

const parseJsonBuffer = (response: AxiosResponse<Buffer>) => {
	const contentType = String(response.headers['content-type'] || '');
	if (!contentType.includes('application/json')) return undefined;

	return JSON.parse(response.data.toString('utf8'));
};

const getString = (value: unknown) => (typeof value === 'string' ? value : undefined);

const getMediaUrl = (data: any) =>
	getString(data?.url) ||
	getString(data?.downloadUrl) ||
	getString(data?.mediaUrl) ||
	getString(data?.fileUrl) ||
	getString(data?.link) ||
	getString(data?.data?.url) ||
	getString(data?.data?.downloadUrl) ||
	getString(data?.data?.mediaUrl) ||
	getString(data?.data?.fileUrl) ||
	getString(data?.data?.link);

const getBase64 = (data: any) =>
	getString(data?.base64) ||
	getString(data?.data) ||
	getString(data?.media) ||
	getString(data?.file) ||
	getString(data?.data?.base64);

const downloadFileFromUrl = async (
	url: string,
	savePath: string,
	type: DownloadType
) => {
	const { data, headers } = await axios.get<Buffer>(url, {
		responseType: 'arraybuffer',
		timeout: Number(process.env.YOUTUBE_API_TIMEOUT_MS || 120000),
	});
	const extension = extensionFromContentType(headers['content-type'], type);

	return writeFile(`${savePath}.${extension}`, Buffer.from(data));
};

/**
 * Downloads video or audio from the external youtube API.
 * The API may return the media directly, or JSON containing a URL/base64 payload.
 */
const ytDownload = async (
	type: DownloadType,
	url: string,
	savePath: string
): Promise<string | undefined> => {
	try {
		const endpoint = type === 'audio' ? audioPath : videoPath;
		const response = await API.request<Buffer>({
			url: endpoint,
			method: downloadMethod,
			params: downloadMethod === 'GET' ? { url, type } : undefined,
			data: downloadMethod === 'POST' ? { url, type } : undefined,
			responseType: 'arraybuffer',
		});

		const json = parseJsonBuffer(response);
		if (json) {
			const mediaUrl = getMediaUrl(json);
			if (mediaUrl) {
				return downloadFileFromUrl(mediaUrl, savePath, type);
			}

			const base64 = getBase64(json);
			if (base64) {
				const extension = getString(json.extension) || getString(json.ext);
				return writeFile(
					`${savePath}.${extension || (type === 'audio' ? 'ogg' : 'mp4')}`,
					Buffer.from(base64, 'base64')
				);
			}

			const filePath = getString(json.path) || getString(json.filePath);
			return filePath;
		}

		const extension = extensionFromContentType(
			response.headers['content-type'],
			type
		);
		return writeFile(`${savePath}.${extension}`, Buffer.from(response.data));
	} catch (e) {
		warnRequestError('Youtube download failed', e);
		return undefined;
	}
};

const normalizeResult = (result: YoutubeApiSearchResult): YoutubeSearchResult | null => {
	const link = result.link || result.url || result.videoUrl || result.watchUrl;
	if (!link) return null;

	return {
		link,
		title: result.title || result.name || link,
		thumbnail:
			result.thumbnail ||
			result.thumbnailUrl ||
			result.thumbnails?.high?.url ||
			result.thumbnails?.medium?.url ||
			result.thumbnails?.default?.url,
	};
};

const normalizeSearchResponse = (data: any): YoutubeSearchResponse => {
	const rawResults =
		(data?.results as YoutubeApiSearchResult[] | undefined) ||
		(data?.items as YoutubeApiSearchResult[] | undefined) ||
		(data?.videos as YoutubeApiSearchResult[] | undefined) ||
		(data?.data?.results as YoutubeApiSearchResult[] | undefined) ||
		(data?.data?.items as YoutubeApiSearchResult[] | undefined) ||
		(data?.data?.videos as YoutubeApiSearchResult[] | undefined) ||
		(Array.isArray(data) ? (data as YoutubeApiSearchResult[]) : undefined) ||
		[];

	return {
		results: rawResults
			.map(normalizeResult)
			.filter((result): result is YoutubeSearchResult => !!result),
	};
};

export const searchResults = async (query: string, _?: string, maxResults = 1) => {
	try {
		const { data } = await API.request({
			url: searchPath,
			method: searchMethod,
			params: searchMethod === 'GET' ? { q: query, maxResults } : undefined,
			data: searchMethod === 'POST' ? { query, q: query, maxResults } : undefined,
		});

		return normalizeSearchResponse(data);
	} catch (e) {
		warnRequestError('Youtube search failed', e);
		return undefined;
	}
};
