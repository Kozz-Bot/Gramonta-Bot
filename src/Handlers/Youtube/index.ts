import { createModule, createMethod } from 'kozz-module-maker';
import * as YoutubeApi from 'src/API/YoutubeAPI';
import { rateLimit } from 'src/Middlewares/RateLimit';
import { EmptyQuery, ErrorMessage, Help, NoResults } from './messages';

const firstVideo = createMethod('video', async requester => {
	try {
		const query = requester.rawCommand!.immediateArg;
		if (!query) {
			return requester.reply(EmptyQuery());
		}
		const results = await YoutubeApi.searchResults(query);
		if (!results?.results.length) {
			return requester.reply(NoResults());
		}
		requester.react('⏳');
		console.log(results.results[0].link);
		const mediaPath = await YoutubeApi.downloadVideoFromUrl(results.results[0].link);
		if (!mediaPath) {
			return requester.reply('erro');
		}
		requester.react('🎥');
		requester.reply.withMedia.fromPath(
			mediaPath,
			'video',
			`🎥 ${results.results[0].title}`
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
		const results = await YoutubeApi.searchResults(query);
		if (!results?.results.length) {
			return requester.reply(NoResults());
		}
		requester.react('⏳');
		const mediaPath = await YoutubeApi.downloadMp3FromUrl(results.results[0].link);
		if (!mediaPath) {
			return requester.reply(ErrorMessage({ error: 'Falha ao salvar o arquivo' }));
		}
		console.log(mediaPath);

		requester.react('🎶');
		requester.reply.withMedia.fromPath(
			mediaPath,
			'audio/webm',
			`🎥 ${results.results[0].title}`
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
