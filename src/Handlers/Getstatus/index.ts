import { createModule, createMethod } from 'kozz-module-maker';
import { ErrorMessage, Instructions } from './messages';

const defaultMethod = createMethod('default', requester => {
	if (!requester.message.quotedMessage) {
		return requester.reply(Instructions());
	}

	if (!requester.message.quotedMessage.media) {
		return requester.reply(
			ErrorMessage({
				error: 'Erro: O bot não conseguiu encontrar mídia na mensagem',
			})
		);
	}
	return requester.reply.withMedia(requester.message.quotedMessage.media);
});

export const startGetStatusHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
			},
		},
		name: 'getstatus',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
