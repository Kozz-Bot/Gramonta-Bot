import { createModule, createMethod } from 'kozz-module-maker';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import TiApi, { TiaMessage } from 'src/API/TiApi';

const queryMessage = createMethod('fallback', async requester => {
	try {
		const query = requester.rawCommand!.query;

		if (!query) {
			return requester.reply.withTemplate('Help');
		}

		const { data: randomMesage } = await TiApi.get<TiaMessage>('/random', {
			params: {
				query,
			},
		});

		if (randomMesage.media) {
			requester.reply.withMedia.fromUrl(randomMesage.media.url, 'image');
		} else {
			requester.reply.withTemplate('TextMessage', {
				title: `*${randomMesage.title.toUpperCase()}*`,
				text: randomMesage.text,
			});
		}
	} catch (e) {
		console.log(e);
		return requester.reply.withTemplate('Error', {
			error: e,
		});
	}
});

const help = createMethod('help', requester => {
	requester.reply.withTemplate('Help');
});

const templatePath = 'src/Handlers/Tia/messages.kozz.md';

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
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);

	return instance;
};
