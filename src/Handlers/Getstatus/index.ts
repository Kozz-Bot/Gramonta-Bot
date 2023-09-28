import { createModule, createMethod } from 'kozz-module-maker';

const defaultMethod = createMethod('default', requester => {
	if (!requester.message.quotedMessage) {
		return requester.reply.withTemplate('instructions');
	}

	if (!requester.message.quotedMessage.media) {
		return requester.reply.withTemplate('error', {
			error: 'Erro: O bot não conseguiu encontrar mídia na mensagem',
		});
	}
	return requester.reply.withMedia(requester.message.quotedMessage.media);
});

export const startGetStatusHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...defaultMethod,
			},
		},
		name: 'getstatus',
		address: `${process.env.GATEWAY_URL}`,

		templatePath: './src/Handlers/Getstatus/reply.kozz.md',
	});
