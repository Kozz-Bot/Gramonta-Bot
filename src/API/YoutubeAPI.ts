import ytdl from '@distube/ytdl-core';
import oldFs from 'fs';
import YTSearch, { YouTubeSearchOptions } from 'youtube-search';
import he from 'he';
import { convertPathToPath } from 'src/Utils/ffmpeg';

const agent = ytdl.createAgent(
	JSON.parse(oldFs.readFileSync('./src/API/ytCookies.json', { encoding: 'utf-8' }))
);

console.log(agent);

type DownloadType = 'video' | 'audio';

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
		const filePath: string = await new Promise(async (resolve, reject) => {
			let info = await ytdl.getInfo(url.split('=')[1], { agent });
			let format = ytdl.filterFormats(info.formats, 'audioandvideo')[0];
			console.log('Format found!', format);
			const videoPath = savePath + '.' + format.container;

			const download = ytdl(url, {
				format,
				agent,
			}).pipe(oldFs.createWriteStream(videoPath));

			download.once('close', () => {
				resolve(videoPath);
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
		console.warn(e);
		return undefined;
	}
};

export const searchResults = async (
	query: string,
	token?: string,
	maxResults = 1
) => {
	try {
		const options: YouTubeSearchOptions = {
			maxResults,
			key: process.env.YOUTUBE_KEY,
		};

		const response = await YTSearch(query, options, err => {
			console.warn(err);
		});

		return {
			...response,
			results: response.results
				.filter(result => result.kind === 'youtube#video')
				.map(result => ({
					link: result.link,
					title: he.decode(result.title),
					thumbnail: result.thumbnails.high?.url,
				})),
		};
	} catch (e) {
		return undefined;
	}
};
