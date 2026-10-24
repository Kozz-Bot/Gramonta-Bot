import { recoverViewOnceMedia } from 'src/Utils/ViewOnceMedia';
import { createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';

export const createAutoReveal = (msgObject: MessageObj) => {
	const chatId = msgObject.message.fromHostAccount
		? msgObject.message.to
		: msgObject.message.from;

	const instance = createModule({
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,

		name: `auto-reveal-${msgObject.message.to}`,
		proxy: {
			source: `${msgObject.rawCommand!.boundaryName}/${chatId}`,
			onMessage: async requester => {
				if (
					requester.message.fromHostAccount &&
					requester.message.body == '!reveal stop'
				) {
					requester.reply('Podem continuar com seus segredos agora...');
					requester.revoke();
				}

				if (requester.message.isViewOnce) {
					const media = await recoverViewOnceMedia(requester);
					if (!media) return;
					requester.reply('Nada de segredos por aqui');
					requester.reply.withMedia(media);
				}
			},
		},
	});
	return instance;
};
