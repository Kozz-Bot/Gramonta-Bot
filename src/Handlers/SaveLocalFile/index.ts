import { createMethod, createModule } from 'kozz-module-maker';
import mime from 'mime-types';
import fs from 'fs/promises';

/**
 * This breaks if the transport type is url. Not that it's gonna happen for now
 * but better fix that when i have time
 */
const saveFile = createMethod('fallback', async requester => {
	if (!requester.message.quotedMessage) {
		return requester.reply('quote a media message');
	}

	if (!requester.message.quotedMessage.media) {
		return requester.reply('no media');
	}

	const extension = mime.extension(requester.message.quotedMessage.media.mimeType);

	if (!extension) {
		return requester.reply('could not find extension for this file');
	}

	const fileName = requester.rawCommand?.query;

	await fs.writeFile(
		`./media/saved/${fileName}.${extension}`,
		requester.message.quotedMessage.media.data,
		{
			encoding: 'base64url',
		}
	);

	requester.reply('ok');
});

export const createSaveModule = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...saveFile,
			},
		},
		name: 'save',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});

	return instance;
};
