import dotenv from 'dotenv';
dotenv.config();

import { createHandlerInstance, createMethod } from 'kozz-handler-maker';

createHandlerInstance({
	name: 's',
	address: `${process.env.GATEWAY_URL}`,
	methods: {
		...createMethod({
			name: 'default',
			args: {},
			func: message => {
				if (message.quotedMessage?.media) {
					return message.reply.withSticker(message.quotedMessage.media);
				}
				if (message.media) {
					return message.reply.withSticker(message.media);
				}
				message.reply.withText(
					'Responda uma imagem ou video com "!s" para fazer figurinha, ou envie o comando na legenda da foto/video'
				);
			},
		}),
		...createMethod({
			name: 'toimg',
			args: {},
			func: message => {
				if (!message.quotedMessage?.media) {
					return message.reply.withText(
						'Por favor responda uma figurinha para transforma-la em midia'
					);
				}

				return message.reply.withMedia(message.quotedMessage.media);
			},
		}),
	},
});

createHandlerInstance({
	name: 'ping',
	address: `${process.env.GATEWAY_URL}`,
	methods: {
		...createMethod({
			name: 'default',
			args: {},
			func: requester => {
				const now = new Date().getTime();
				const requestTime = requester.rawCommand.message.timestamp;

				requester.reply.withText(
					`PONG! Tempo de resposta: ${(now - requestTime) / 1000} segundos`
				);
			},
		}),
	},
});

createHandlerInstance({
	name: 'reveal',
	address: `${process.env.GATEWAY_URL}`,
	methods: {
		...createMethod({
			name: 'default',
			args: {},
			func: requester => {
				if (!requester.quotedMessage) {
					return requester.reply.withText(
						'Responda uma mensagem de visualização única para eu revelar seu conteúdo'
					);
				}

				if (!requester.quotedMessage.isViewOnce) {
					return requester.reply.withText(
						'Apenas mensagens de visualização única podem ser reveladas'
					);
				}

				if (
					requester.quotedMessage.messageType === 'IMAGE' ||
					requester.quotedMessage.messageType === 'VIDEO'
				) {
					if (!requester.quotedMessage.media) {
						return requester.reply.withText(
							'Erro: O bot não conseguiu encontrar mídia na mensagem'
						);
					}
					return requester.reply.withMedia(requester.quotedMessage.media);
				}
			},
		}),
	},
});

createHandlerInstance({
	name: 'debug',
	address: `${process.env.GATEWAY_URL}`,
	templatePath: 'test.kozz.md',
	methods: {
		...createMethod({
			name: 'default',
			args: {},
			func: requester => {
				requester.reply.withTemplate('SearchResults', {
					totalResults: 'resultados totais',
				});
			},
		}),
	},
});
