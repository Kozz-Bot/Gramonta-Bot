import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import fs from 'fs/promises';
import path from 'path';
import { checkAndCreateFile } from 'src/Utils/Files';
import { Media } from 'kozz-types';
import { convertB64ToPath } from 'src/Utils/ffmpeg';
import { transcribeFile } from 'src/API/Deepgram';

const transcribeAutdioToText = async (media: Media) => {
	const tempFilepath = await convertB64ToPath(media.data, 'opus', 'mp3');
	const transcription = await transcribeFile(tempFilepath);
	return transcription;
};

const onUserMessage = async (requester: MessageObj) => {
	try {
		const { message } = requester;
		const messageAuthor = message.contact.publicName;
		const messageContent = await (async () => {
			if (message.messageType === 'TEXT' && message.body) {
				return message.taggedConctactFriendlyBody;
			}
			if (message.media && message.messageType === 'AUDIO') {
				return transcribeAutdioToText(message.media).then(
					transcription => transcription.alternatives[0].transcript
				);
			}
			return `{Enviou uma mídia do tipo ${message.messageType} e legenda ${
				'"' + message.body + '"' || 'vazia'
			}}`;
		})();

		const filePath = `./conversation/${message.boundaryName}/${message.chatId}.txt`;

		const messageToAppend = `${messageAuthor}: ${messageContent}`;

		await checkAndCreateFile(filePath);

		const file = await fs.readFile(filePath, { encoding: 'utf-8' });
		const lines = file.split('\n');

		const newDocument = [...lines, `${messageToAppend.replaceAll('\n', '<br>')}`]
			.slice(-1000)
			.join('\n');

		await fs.writeFile(filePath, newDocument, {
			encoding: 'utf-8',
		});
	} catch (appendErr) {
		console.error(`Error appending to file: ${appendErr}`);
	}
};

export const startResumeHandler = () => {
	const instance = createModule({
		proxy: {
			source: 'kozz-baileys/*',
			onMessage: onUserMessage,
		},
		name: 'mute',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});

	return instance;
};
