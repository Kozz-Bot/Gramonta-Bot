import { createHandlerInstance, createMethod } from 'kozz-handler-maker';

const defaultMethod = createMethod({
	name: 'default',
	args: {},
	func: requester => {
		if (!requester.quotedMessage) {
			return requester.reply.withTemplate('instructions');
		}

		if (!requester.quotedMessage.media) {
			return requester.reply.withTemplate('error', {
				error: 'Erro: O bot não conseguiu encontrar mídia na mensagem',
			});
		}
		return requester.reply.withMedia(requester.quotedMessage.media);
	},
});

export const startGetStatusHandler = () =>
	createHandlerInstance({
		name: 'getstatus',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
		},
		templatePath: './src/Handlers/Getstatus/reply.kozz.md',
	});
