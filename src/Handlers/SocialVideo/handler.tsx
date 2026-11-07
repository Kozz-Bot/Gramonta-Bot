import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import { downloadSocialVideo } from '../../Services/SocialVideo/download';
import {
	Platform,
	platforms,
	SocialVideoError,
} from '../../Services/SocialVideo/urls';
import { videoUrlFromRequest } from '../../Services/SocialVideo/request';
import { ErrorMessage, Processing } from './messages';

// Shared across all four commands, including /tw.
const activeRequests = new Set<string>();

export const createSocialVideoHandler = (platform: Platform, Help: () => any) => {
	const config = platforms[platform];
	const download = async (requester: MessageObj) => {
		let url: string | undefined;
		try {
			url = await videoUrlFromRequest(requester, platform);
		} catch (error) {
			return requester.reply(<ErrorMessage message={(error as Error).message} />);
		}
		if (!url) return requester.reply(<Help />);
		const key = `${requester.message.boundaryId}:${requester.message.from}`;
		if (activeRequests.has(key))
			return requester.reply(
				<ErrorMessage message="Você já tem um download em andamento. Aguarde a conclusão." />
			);
		if (activeRequests.size >= 2)
			return requester.reply(
				<ErrorMessage message="O serviço de download está ocupado. Tente novamente em instantes." />
			);
		activeRequests.add(key);
		try {
			requester.reply(<Processing label={config.label} />);
			const video = await downloadSocialVideo(url, platform);
			return requester.reply.withMedia({
				data: video.data.toString('base64'),
				transportType: 'b64',
				mimeType: 'video/mp4',
				fileName: `${platform}.mp4`,
				sizeInBytes: video.data.length,
				duration: video.duration,
				stickerTags: undefined,
			});
		} catch (error) {
			return requester.reply(
				<ErrorMessage
					message={
						error instanceof SocialVideoError
							? error.message
							: 'Não consegui processar o vídeo agora. Tente novamente mais tarde.'
					}
				/>
			);
		} finally {
			activeRequests.delete(key);
		}
	};
	return createModule({
		name: config.command,
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...createMethod('default', download),
				...createMethod('fallback', download),
				...createMethod('help', requester => requester.reply(<Help />)),
			},
		},
	}).resources.upsertResource('help', () => <Help />);
};
