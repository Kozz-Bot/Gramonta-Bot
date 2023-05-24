import { createHandlerInstance, createMethod } from 'kozz-handler-maker';

const defaultMethod = createMethod({
	name: 'default',
	args: {},
	func: requester => {
		if (!requester.quotedMessage) {
			return requester.reply.withTemplate('instructions');
		}

		if (!requester.quotedMessage.isViewOnce) {
			return requester.reply.withTemplate('error', {
				error: 'Apenas mensagens de visualização única podem ser reveladas',
			});
		}

		if (
			requester.quotedMessage.messageType === 'IMAGE' ||
			requester.quotedMessage.messageType === 'VIDEO'
		) {
			if (!requester.quotedMessage.media) {
				return requester.reply.withTemplate('error', {
					error: 'Erro: O bot não conseguiu encontrar mídia na mensagem',
				});
			}
			return requester.reply.withMedia(requester.quotedMessage.media);
		}
	},
});

export const startRevealHandler = () =>
	createHandlerInstance({
		name: 'reveal',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
		},
		templatePath: './src/Handlers/Reveal/reply.kozz.md',
	});
