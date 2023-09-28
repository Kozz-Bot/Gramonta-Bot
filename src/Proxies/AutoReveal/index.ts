import { createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';

export const createAutoReveal = (msgObject: MessageObj) => {
	const chatId = msgObject.message.fromHostAccount
		? msgObject.message.to
		: msgObject.message.from;

	const instance = createModule({
		address: `${process.env.GATEWAY_URL}`,
		name: `auto-reveal-${msgObject.message.to}`,
		proxy: {
			source: `${msgObject.rawCommand!.boundaryId}/${chatId}`,
			onMessage: requester => {
				if (requester.message.fromHostAccount && requester.message.body == '!reveal stop') {
					requester.reply('Podem continuar com seus segredos agora...');
					requester.revoke();
				}

				if (requester.message.isViewOnce) {
					requester.reply('Nada de segredos por aqui');
					requester.reply.withMedia(requester.message.media!);
				}
			},
		},
	});
	return instance;
};
