import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import MemeMakerApi from 'src/API/MemeMakerApi';
import { Help } from './messages';

const getMemeId = (requester: MessageObj) => {
	const whoRequestedTheMeme = requester.message.from;
	const chatId = requester.message.to;
	const datetime = new Date().toLocaleString('BR').replace(/[ \/]/g, '-');
	const id = `timestamp=${datetime}_userId=${whoRequestedTheMeme}_chatId=${chatId}`;
	return id;
};

const createMeme = createMethod(
	'create',
	async (requester, args) => {
		try {
			if (
				(!args['bottom-text'] && !args['top-text']) ||
				requester.message.quotedMessage?.messageType !== 'IMAGE'
			) {
				return requester.reply(Help());
			}

			requester.react('⏳');

			const memeUrl = await MemeMakerApi.createMemeFromImage(
				requester.message.quotedMessage.media!,
				args['top-text'] ?? '',
				args['bottom-text'] ?? '',
				getMemeId(requester)
			);

			requester.react('✅');

			console.log(memeUrl);

			return requester.reply.withMedia.fromUrl(
				memeUrl,
				'image',
				'Aqui está seu meme: ' + memeUrl
			);
		} catch (e) {
			console.warn(e);
			return requester.reply(`Error: ${e}`);
		}
	},
	{
		['top-text']: 'string?',
		['bottom-text']: 'string?',
	}
);

const sendHelp = createMethod('fallback', requester => {
	requester.reply(Help());
});

export const startMemesModule = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...sendHelp,
				...createMeme,
			},
		},
		name: 'meme',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => Help());

	return instance;
};
