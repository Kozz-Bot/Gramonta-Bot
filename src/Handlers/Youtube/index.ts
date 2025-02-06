import { createModule, createMethod } from 'kozz-module-maker';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import * as YoutubeApi from 'src/API/YoutubeAPI';
import { rateLimit } from 'src/Middlewares/RateLimit';

const firstVideo = createMethod('video', async requester => {
	try {
		const query = requester.rawCommand!.immediateArg;
		if (!query) {
			return requester.reply.withTemplate('EmptyQuery');
		}
		const results = await YoutubeApi.searchResults(query);
		if (!results) {
			return requester.reply.withTemplate('NoResults');
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
		requester.reply.withTemplate('Error', { error: e });
	}
});

const firstSong = createMethod('song', async requester => {
	try {
		const query = requester.rawCommand!.immediateArg;
		if (!query) {
			return requester.reply.withTemplate('EmptyQuery');
		}
		const results = await YoutubeApi.searchResults(query);
		if (!results) {
			return requester.reply.withTemplate('NoResults');
		}
		requester.react('⏳');
		const mediaPath = await YoutubeApi.downloadMp3FromUrl(results.results[0].link);
		if (!mediaPath) {
			return requester.reply.withTemplate('Error', {
				error: 'Falha ao salvar o arquivo',
			});
		}
		console.log(mediaPath);

		requester.react('🎶');
		requester.reply.withMedia.fromPath(
			mediaPath,
			'audio/webm',
			`🎥 ${results.results[0].title}`
		);
	} catch (e) {
		requester.reply.withTemplate('Error', { error: e });
	}
});

const help = createMethod('fallback', requester =>
	requester.reply.withTemplate('Help')
);

const templatePath = 'src/Handlers/Youtube/messages.kozz.md';

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
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);

	return instance;
};
