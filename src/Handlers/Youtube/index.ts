import { createModule, createMethod } from 'kozz-module-maker';
import { executeDownload } from '../MediaDownload/handler';
import { Help } from './messages';

// Compatibility routes use the same service as !video and !audio.
// Original URL case and signatures are recovered by downloadQuery.
export const startYoutubeHandler = () =>
	createModule({
		name: 'yt',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...createMethod('video', r =>
					executeDownload(r, 'video', 'yt', 'video', true)
				),
				...createMethod('song', r =>
					executeDownload(r, 'audio', 'yt', 'song', true)
				),
				...createMethod('default', r =>
					executeDownload(r, 'video', 'yt', undefined, true)
				),
				...createMethod('fallback', r =>
					executeDownload(r, 'video', 'yt', undefined, true)
				),
				...createMethod('help', r => r.reply(Help())),
			},
		},
	}).resources.upsertResource('help', () => Help());
