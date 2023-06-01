import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import * as YoutubeApi from 'src/API/YoutubeAPI';

const firstVideo = createMethod({
	name: 'first-video',
	args: {},
	func: async requester => {
		const query = requester.rawCommand.immediateArg;

		if (!query) {
			return requester.reply('No immediate arg');
		}

		const results = await YoutubeApi.searchResults(query);

		if (!results) {
			return requester.reply('No results');
		}

		const mediaPath = await YoutubeApi.downloadVideoFromUrl(results.results[0].link);

		if (!mediaPath) {
			return requester.reply('erro');
		}

		requester.reply.withMedia.fromPath(
			mediaPath,
			'video',
			`🎥 ${results.results[0].title}`
		);
	},
});

const firstSong = createMethod({
	name: 'first-song',
	args: {},
	func: async requester => {
		const query = requester.rawCommand.immediateArg;

		console.log(query);

		if (!query) {
			return requester.reply('No immediate arg');
		}

		const results = await YoutubeApi.searchResults(query);

		if (!results) {
			return requester.reply('No results');
		}

		const mediaPath = await YoutubeApi.downloadMp3FromUrl(results.results[0].link);

		if (!mediaPath) {
			return requester.reply('erro');
		}

		requester.reply.withMedia.fromPath(
			mediaPath,
			'audio/webm',
			`🎥 ${results.results[0].title}`
		);
	},
});

export const startYoutubeHandler = () =>
	createHandlerInstance({
		name: 'yt',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...firstSong,
			...firstVideo,
		},
	});
