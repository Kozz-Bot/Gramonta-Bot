import { createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';

export const createAutoReveal = (msgObject: MessageObj) => {
	const chatId = msgObject.rawCommand.message.fromHostAccount
		? msgObject.rawCommand.message.to
		: msgObject.rawCommand.message.from;

	const instance = createModule({
		address: `${process.env.GATEWAY_URL}`,
		name: `auto-reveal-${msgObject.rawCommand.message.to}`,
		proxy: {
			source: `${msgObject.rawCommand.boundaryId}/${chatId}`,
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
		},
	});
	return instance;
};
