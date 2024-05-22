import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj, loadTemplates } from 'kozz-module-maker/dist/Message';
import MemeMakerApi from 'src/API/MemeMakerApi';

const templatePath = 'src/Handlers/MemeMaker/messages.kozz.md';

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
				return requester.reply.withTemplate('Help');
			}

			requester.react('⏳');

			console.log(args);

			const memeUrl = await MemeMakerApi.createMemeFromImage(
				requester.message.quotedMessage.media!,
				args['top-text'] ?? '',
				args['bottom-text'] ?? '',
				getMemeId(requester)
			);

			requester.react('✅');

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
	requester.reply.withTemplate('Help');
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
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);

	return instance;
};
