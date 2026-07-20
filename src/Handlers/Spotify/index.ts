import { createMethod, createModule } from 'kozz-module-maker';
import { getPlayerStatus } from 'src/API/SpotifyApi';
import { Help } from './messages';

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
	requester.reply(Help());
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
	}).resources.upsertResource('help', () => Help());

	return instance;
};
