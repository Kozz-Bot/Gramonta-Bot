import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import * as YoutubeApi from 'src/API/YoutubeAPI';

const firstVideo = createMethod({
	name: 'video',
	args: {},
	func: async requester => {
		try {
			const query = requester.rawCommand.immediateArg;
			if (!query) {
				return requester.reply('No immediate arg');
			}

			const results = await YoutubeApi.searchResults(query);
			if (!results) {
				return requester.reply('No results');
			}

			requester.react('⏳');
			const mediaPath = await YoutubeApi.downloadVideoFromUrl(
				results.results[0].link
			);
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
	},
});

const firstSong = createMethod({
	name: 'song',
	args: {},
	func: async requester => {
		try {
			const query = requester.rawCommand.immediateArg;
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

			requester.react('🎶');
			requester.reply.withMedia.fromPath(
				mediaPath,
				'audio/webm',
				`🎥 ${results.results[0].title}`
			);
		} catch (e) {
			requester.reply.withTemplate('Error', { error: e });
		}
	},
});

const help = createMethod({
	name: 'fallback',
	args: {},
	func: async requester => {
		requester.reply.withTemplate('Help');
	},
});

export const startYoutubeHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'yt',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...firstSong,
			...firstVideo,
			...help,
		},
		templatePath: 'src/Handlers/Youtube/messages.kozz.md',
	});
