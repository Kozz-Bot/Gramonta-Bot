import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { createAutoReveal } from 'src/Proxies/AutoReveal';

const autoReveals = [];

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

const autoReveal = createMethod({
	name: 'auto',
	args: {},
	func: requester => {
		if (!requester.rawCommand.message.fromHostAccount) {
			return requester.reply('Apenas o dono do bot pode usar esse comando');
		}

		requester.reply(
			'Revelando mídias de visualização única a partir de agora hehehe'
		);

		createAutoReveal(requester);
	},
});

export const startRevealHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],

		name: 'reveal',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
			...autoReveal,
		},
		templatePath: './src/Handlers/Reveal/reply.kozz.md',
	});
