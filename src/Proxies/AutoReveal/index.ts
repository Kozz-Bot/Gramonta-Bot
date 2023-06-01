import { createProxyInstance } from 'kozz-handler-maker';
import { MessageObj } from 'kozz-handler-maker/dist/Message';

export const createAutoReveal = (msgObject: MessageObj) => {
	const chatId = msgObject.rawCommand.message.fromHostAccount
		? msgObject.rawCommand.message.to
		: msgObject.rawCommand.message.from;

	const instance = createProxyInstance({
		address: `${process.env.GATEWAY_URL}`,
		source: `${msgObject.rawCommand.boundaryId}/${chatId}`,
		name: `auto-reveal-${msgObject.rawCommand.message.to}`,
		onMessage: msg => {
			if (msg.rawCommand.message.fromHostAccount && msg.body == '!reveal stop') {
				msg.reply('Podem continuar com seus segredos agora...');
				msg.revoke();
			}

			if (msg.isViewOnce) {
				msg.reply('Nada de segredos por aqui');
				msg.reply.withMedia(msg.media!);
			}
		},
	});

	return instance;
};
