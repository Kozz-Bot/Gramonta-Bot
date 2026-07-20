import { createModule, createMethod } from 'kozz-module-maker';
import TiApi, { TiaMessage } from 'src/API/TiApi';
import { ErrorMessage, Help, TextMessage } from './messages';

const queryMessage = createMethod('fallback', async requester => {
	try {
		const query = requester.rawCommand!.query;

		if (!query) {
			return requester.reply(Help());
		}

		const { data: randomMesage } = await TiApi.get<TiaMessage>('/random', {
			params: {
				query,
			},
		});

		if (randomMesage.media) {
			requester.reply.withMedia.fromUrl(randomMesage.media.url, 'image');
		} else {
			requester.reply(
				TextMessage({
					title: `*${randomMesage.title.toUpperCase()}*`,
					text: randomMesage.text,
				})
			);
		}
	} catch (e) {
		console.log(e);
		return requester.reply(ErrorMessage({ error: e }));
	}
});

const help = createMethod('help', requester => {
	requester.reply(Help());
});

export const startTiaHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...queryMessage,
				...help,
			},
		},
		name: 'tia',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => Help());

	return instance;
};
