import { createModule } from 'kozz-module-maker';
import { bold } from 'kozz-module-maker/dist/Message';
import { isUserMutted } from '../Mute/mutedDB';

export type RevealMapProxy = {
	id: string;
	from: string;
	to: string;
	boundaryId: string;
};

export const createAutoRevealMap = ({ from, to, boundaryId }: RevealMapProxy) => {
	const instance = createModule({
		address: `${process.env.GATEWAY_URL}`,
		name: `auto-reveal-map-${from}`,
		customSocketPath: process.env.SOCKET_PATH,

		proxy: {
			source: `${boundaryId}/${from}`,
			onMessage: requester => {
				if (isUserMutted(requester.message.contact, requester.message.to)) {
					return;
				}

				if (requester.message.isViewOnce) {
					const { contact, body, groupName } = requester.message;

					const caption = [
						`Quem enviou: ${bold(`${contact.publicName} / ${contact.privateName}`)}`,
						`Nome do chat: ${groupName}`,
						``,
						`Legenda: ${body}`,
					].join('\n');
					if (!groupName) {
						return requester.sendMessage.withMedia(
							'120363262672708597@g.us',
							caption,
							requester.message.media!
						);
					} else {
						return requester.sendMessage.withMedia(
							to,
							caption,
							requester.message.media!
						);
					}
				}
			},
		},
	});
	return instance;
};
