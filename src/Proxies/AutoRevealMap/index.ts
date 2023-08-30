import {
	createBasicController,
	createHandlerInstance,
	createProxyInstance,
} from 'kozz-handler-maker';
import { bold } from 'kozz-handler-maker/dist/Message';

import { Media } from 'kozz-types';

export type RevealMapProxy = {
	id: string;
	from: string;
	to: string;
	boundaryId: string;
};

export const createAutoRevealMap = ({ from, to, boundaryId }: RevealMapProxy) => {
	const instance = createProxyInstance({
		address: `${process.env.GATEWAY_URL}`,
		source: `${boundaryId}/${from}`,
		name: `auto-reveal-map-${from}`,
		onMessage: msg => {
			if (msg.isViewOnce) {
				const { contact, body, groupName } = msg.rawCommand.message;

				const caption = [
					`Quem enviou: ${bold(`${contact.publicName} / ${contact.privateName}`)}`,
					`Nome do chat: ${groupName}`,
					``,
					`Legenda: ${body}`,
				].join('\n');

				forwardMedia(to, caption, boundaryId, msg.media!);
			}
		},
	});
	return instance;
};

const messageSender = createBasicController({
	address: `${process.env.GATEWAY_URL}`,
	name: 'messageSender',
});

const forwardMedia = (
	to: string,
	caption: string,
	boundaryId: string,
	media: Media
) => {
	messageSender.sendMessage.withMedia(to, boundaryId, caption, media);
};
