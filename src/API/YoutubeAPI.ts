import ytdl from 'ytdl-core';
import oldFs from 'fs';
import YTSearch, { YouTubeSearchOptions } from 'youtube-search';
import he from 'he';
import { convertPathToPath } from 'src/Utils/ffmpeg';

type DownloadType = 'video' | 'audio';

/**
 * Downloads mp3 from a youtube video
 * @param {string} id
 * @returns {string} mp3 path
 */
export const downloadMp3FromId = async (id: string): Promise<string | undefined> => {
	const ytUrl = `https://www.youtube.com/watch?v=${id}`;

	return downloadMp3FromUrl(ytUrl);
};

/**
 * Downloads mp3 from a youtube url
 * @param url
 * @param savePath
 * @returns {string} mp3 path
 */
export const downloadMp3FromUrl = (url: string): Promise<string | undefined> => {
	const path = './media/ytSongs/song.webm';
	return ytDownload('audio', url, path);
};

/**
 * Downloads mp4 from a youtube url
 * @param {string} id
 * @param savePath
 * @returns {string} mp4 path
 */
export const downloadVideoFromId = (id: string): Promise<string | undefined> => {
	const path = './media/ytVideos/video.mp4';

	const ytUrl = `https://www.youtube.com/watch?v=${id}`;
	return ytDownload('video', ytUrl, path);
};

/**
 * Downloads mp4 from a youtube url
 * @param url
 * @param savePath
 * @returns {string} mp4 path
 */
export const downloadVideoFromUrl = (url: string): Promise<string | undefined> => {
	const path = './media/ytVideos/video.mp4';
	return ytDownload('video', url, path);
};

/**
 * Downloads video or audio from youtube
 * @param {DownloadType} type
 * @param {string} url
 * @param {string} savePath
 * @returns {string} mp3 path
 */
const ytDownload = async (
	type: DownloadType,
	url: string,
	savePath: string
): Promise<string | undefined> => {
	try {
		const quality = type === 'video' ? '18' : 'highestaudio';

		const filePath: string = await new Promise((resolve, reject) => {
			const download = ytdl(url, {
				quality,
				requestOptions: {
					headers: {
						cookie: process.env.YT_COOKIE,
					},
				},
			}).pipe(oldFs.createWriteStream(savePath));

			download.once('close', () => {
				resolve(savePath);
			});

			download.once('error', err => {
				reject(err);
			});
		});

		if (type === 'video') {
			return filePath;
		}

		return convertPathToPath(filePath, 'mp3');
	} catch (e) {
		return undefined;
	}
};

export const searchResults = async (
	query: string,
	token?: string,
	maxResults = 3
) => {
	try {
		const options: YouTubeSearchOptions = {
			maxResults,
			key: process.env.YOUTUBE_KEY,
			pageToken: token,
		};
		const response = await YTSearch(query, options);

		return {
			...response,
			results: response.results
				.filter(result => result.kind === 'youtube#video')
				.map((result, index) => ({
					link: result.link,
					title: he.decode(result.title),
					thumbnail: result.thumbnails.high?.url,
				})),
		};
	} catch (e) {
		return undefined;
	}
};
