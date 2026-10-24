import { createModule, createMethod } from 'kozz-module-maker';
import path from 'path';
import * as YoutubeApi from 'src/API/YoutubeAPI';
import { rateLimit } from 'src/Middlewares/RateLimit';
import { EmptyQuery, ErrorMessage, Help, NoResults } from './messages';

const audioMimeTypeForPath = (mediaPath: string) => {
	switch (path.extname(mediaPath).toLowerCase()) {
		case '.mp3': return 'audio/mpeg' as const;
		case '.m4a':
		case '.mp4': return 'audio/mp4' as const;
		case '.webm': return 'audio/webm' as const;
		case '.wav': return 'audio/wav' as const;
		case '.ogg':
		default: return 'audio/ogg; codecs=opus' as const;
	}
};

const isUrl = (value: string) => {
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
};

const getVideo = async (query: string) => {
	if (isUrl(query)) {
		return { link: query, title: query };
	}

	const results = await YoutubeApi.searchResults(query);
	return results?.results[0];
};

const firstVideo = createMethod('video', async requester => {
	try {
		const query = requester.rawCommand!.immediateArg;
		if (!query) {
			return requester.reply(EmptyQuery());
		}
		const video = await getVideo(query);
		if (!video) {
			return requester.reply(NoResults());
		}
		requester.react('⏳');
		console.log(video.link);
		const mediaPath = await YoutubeApi.downloadVideoFromUrl(video.link);
		if (!mediaPath) {
			return requester.reply('erro');
		}
		requester.react('🎥');
		requester.reply.withMedia.fromPath(
			mediaPath,
			'video',
			`🎥 ${video.title}`
		);
	} catch (e) {
		requester.reply(ErrorMessage({ error: e }));
	}
});

const firstSong = createMethod('song', async requester => {
	try {
		const query = requester.rawCommand!.immediateArg;
		if (!query) {
			return requester.reply(EmptyQuery());
		}
		const video = await getVideo(query);
		if (!video) {
			return requester.reply(NoResults());
		}
		requester.react('⏳');
		const mediaPath = await YoutubeApi.downloadMp3FromUrl(video.link);
		if (!mediaPath) {
			return requester.reply(ErrorMessage({ error: 'Falha ao salvar o arquivo' }));
		}
		console.log(mediaPath);

		requester.react('🎶');
		requester.reply.withMedia.fromPath(
			mediaPath,
			audioMimeTypeForPath(mediaPath),
			`🎥 ${video.title}`
		);
	} catch (e) {
		requester.reply(ErrorMessage({ error: e }));
	}
});

const help = createMethod('fallback', requester =>
	requester.reply(Help())
);

export const startYoutubeHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...firstSong,
				...firstVideo,
				...help,
			},
		},
		name: 'yt',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => Help());

	return instance;
};
