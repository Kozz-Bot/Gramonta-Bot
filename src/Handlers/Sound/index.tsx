import { createMethod, createModule } from 'kozz-module-maker';
import * as MyInstantsApi from 'src/API/MyInstantsApi';
import { EmptyQuery, Help, NoResults, SearchError } from './messages';

const search = createMethod('fallback', async requester => {
	const query = requester.rawCommand?.query?.trim();

	if (!query) {
		return requester.reply(<EmptyQuery />);
	}

	try {
		requester.react('⏳');
		const [sound] = await MyInstantsApi.searchSounds(query);

		if (!sound) {
			return requester.reply(<NoResults />);
		}

		requester.reply.withMedia(
			{
				data: sound.mp3,
				fileName: `${sound.id}.mp3`,
				mimeType: 'audio/mpeg',
				sizeInBytes: null,
				transportType: 'url',
				stickerTags: undefined,
				duration: 0,
			},
			`🔊 ${sound.title}`
		);
		requester.react('🔊');
	} catch (error) {
		console.warn('MyInstants search failed', error);
		return requester.reply(<SearchError />);
	}
});

export const startSoundHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...search,
			},
		},
		name: 'som',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => <Help />);

	return instance;
};
