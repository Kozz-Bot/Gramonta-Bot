import { createMethod, createModule } from 'kozz-module-maker';
import { monospace } from 'kozz-module-maker/dist/Message';
import { imageToAsciiString } from 'src/misc/AsciiImageRenderer';

const convertImage = createMethod(
	'default',
	async (requester, { width, height }) => {
		const quotedMessage = requester.message.quotedMessage;
		if (!quotedMessage) {
			return requester.reply(
				'Responda uma imagem ou uma figurinha com esse comando'
			);
		}

		const { messageType, media } = quotedMessage;

		if (!media || !['STICKER', 'IMAGE'].includes(messageType)) {
			return requester.reply(
				'Responda uma imagem ou uma figurinha com esse comando'
			);
		}

		const asciiImage = await imageToAsciiString(media, width, height);
		requester.reply(monospace(asciiImage));
	},
	{
		width: 'number?',
		height: 'number?',
	}
);

export const startAsciiImageInstance = () =>
	createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...convertImage,
			},
		},
		name: 'ascii',
		customSocketPath: process.env.SOCKET_PATH,
		address: `${process.env.GATEWAY_URL}`,
	});
