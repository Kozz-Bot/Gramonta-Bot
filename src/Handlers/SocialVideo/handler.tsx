import { createMethod, createModule } from 'kozz-module-maker';
import { Platform, platforms } from '../../Services/SocialVideo/urls';
import { executeDownload } from '../MediaDownload/handler';
import { Help, Migration } from '../MediaDownload/messages';

export const createSocialVideoHandler = (
	platform: Platform,
	_oldHelp: () => any
) => {
	const command = platforms[platform].command;
	const download = (requester: Parameters<typeof executeDownload>[0]) =>
		executeDownload(requester, 'video', command, undefined, true, platform);
	return createModule({
		name: command,
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...createMethod('default', download),
				...createMethod('fallback', download),
				...createMethod('help', r =>
					r.reply(
						<>
							<Migration />
							<Help mode="video" />
						</>
					)
				),
			},
		},
	}).resources.upsertResource('help', () => (
		<>
			<Migration />
			<Help mode="video" />
		</>
	));
};
