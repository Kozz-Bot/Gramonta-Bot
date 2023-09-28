import { createModule } from 'kozz-module-maker';
import { bold } from 'kozz-module-maker/dist/Message';

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
		proxy: {
			source: `${boundaryId}/${from}`,
			onMessage: requester => {
				if (requester.message.isViewOnce) {
					const { contact, body, groupName } = requester.message;

					const caption = [
						`Quem enviou: ${bold(`${contact.publicName} / ${contact.privateName}`)}`,
						`Nome do chat: ${groupName}`,
						``,
						`Legenda: ${body}`,
					].join('\n');

					instance.sendMessage.withMedia(to, caption, boundaryId, requester.message.media!);
				}
			},
		},
	});
	return instance;
};
