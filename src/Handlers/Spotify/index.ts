import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj, loadTemplates } from 'kozz-module-maker/dist/Message';
import { getPlayerStatus } from 'src/API/SpotifyApi';

const templatePath = 'src/Handlers/Spotify/messages.kozz.md';

const now = createMethod('now', async requester => {
	try {
		const data = await getPlayerStatus();

		if (!data) {
			throw 'empty response';
		}

		const after = 100 - data.percent_played;
		const before = data.percent_played;

		console.log({ after, before });

		const message = [
			`*${data.songName}*`,
			`_${data.artist}_`,
			`${'-'.repeat(before / 3)}⚪${'-'.repeat(after / 3)}`,
			`${data.formattedProgress}                           ${data.formattedDuration}`,
			`     ⏪       ${data.isPlaying ? '⏹️' : '▶️'}      ⏩`,
			'',
			data.songLink,
		].join('\n');

		requester.reply(message);
	} catch (e) {
		console.warn(e);
		return requester.reply(`Error: ${e}`);
	}
});

const sendHelp = createMethod('fallback', requester => {
	requester.reply.withTemplate('Help');
});

export const startSpotifyModule = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...sendHelp,
				...now,
			},
		},
		name: 'spotify',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);

	return instance;
};
