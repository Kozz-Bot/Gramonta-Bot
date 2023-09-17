import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';
import TiApi, { TiaMessage } from 'src/API/TiApi';

const queryMessage = createMethod('fallback', async requester => {
	try {
		const query = requester.rawCommand.query;

		if (!query) {
			requester.reply.withTemplate('Help');
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
		return requester.reply.withTemplate('Error', {
			error: e,
		});
	}
});

const help = createMethod('help', requester => {
	requester.reply.withTemplate('Help');
});

const templatePath = 'src/Handlers/Tia/messages.kozz.md';

export const startTiaHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'tia',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...queryMessage,
			...help,
		},
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
