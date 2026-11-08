import { createMethod, createModule } from 'kozz-module-maker';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import { downloadMedia } from '../../Services/MediaDownload/download';
import { downloadQuery } from '../../Services/MediaDownload/request';
import { videoUrlFromRequest } from '../../Services/SocialVideo/request';
import { Platform, SocialVideoError } from '../../Services/SocialVideo/urls';
import { DownloadError, DownloadMode } from '../../Services/MediaDownload/urls';
import {
	AiToolInputError,
	registerAiContract,
	reportCommandOutcome,
} from '../../Services/OwnerAI/contracts';
import { ErrorMessage, Help, Migration, Processing } from './messages';

const active = new Set<string>();
export const executeDownload = async (
	requester: MessageObj,
	mode: DownloadMode,
	command: string,
	method?: string,
	legacy = false,
	platform?: Platform
) => {
	const key = `${requester.message.boundaryId}:${requester.message.from}`;
	let claimed = false;
	try {
		if (legacy) requester.reply(<Migration />);
		const query = platform
			? await videoUrlFromRequest(requester, platform)
			: await downloadQuery(requester, command, method);
		if (!query) {
			reportCommandOutcome(requester.rawCommand, {
				success: false,
				error:
					'Informe um link, cite uma mensagem com link ou escreva uma busca do YouTube.',
			});
			return requester.reply(<Help mode={mode} />);
		}
		if (active.has(key))
			throw new DownloadError(
				'Você já tem um download em andamento. Aguarde a conclusão.'
			);
		if (active.size >= 2)
			throw new DownloadError(
				'O serviço de download está ocupado. Tente novamente em instantes.'
			);
		active.add(key);
		claimed = true;
		requester.reply(<Processing mode={mode} />);
		const media = await downloadMedia(query, mode);
		const result = requester.reply.withMedia({
			data: media.data.toString('base64'),
			transportType: 'b64',
			mimeType: media.mimeType,
			fileName: mode === 'audio' ? 'audio.ogg' : 'video.mp4',
			sizeInBytes: media.data.length,
			duration: media.duration,
			stickerTags: undefined,
			...(mode === 'audio' ? { asVoiceNote: true } : {}),
		});
		reportCommandOutcome(requester.rawCommand, {
			success: true,
			status: 'submitted',
		});
		return result;
	} catch (error) {
		const message =
			error instanceof DownloadError || error instanceof SocialVideoError
				? error.message
				: 'Não consegui baixar esse conteúdo. Confira se o link é público e tente novamente mais tarde.';
		reportCommandOutcome(requester.rawCommand, { success: false, error: message });
		return requester.reply(<ErrorMessage message={message} />);
	} finally {
		if (claimed) active.delete(key);
	}
};

export const createDownloadHandler = (mode: DownloadMode) => {
	registerAiContract(mode, {
		description: `Baixa ${mode === 'audio' ? 'áudio' : 'vídeo'} de link público ou de busca no YouTube, somente neste chat. Substitui os antigos yt/tw/ig/fb/tt.`,
		methods: {
			default: {
				syntax: `!${mode} LINK_OU_BUSCA`,
				examples: [
					`!${mode} https://www.youtube.com/watch?v=dQw4w9WgXc`,
					`!${mode} Beethoven Moonlight Sonata`,
				],
				description:
					'Coloque o link completo (preservando maiúsculas) ou os termos de busca em immediateArg. Sem argumento, usa o link citado.',
			},
			help: { syntax: `!${mode} help`, examples: [`!${mode} help`] },
		},
		validate: (method, input) => {
			if (input.length > 4000)
				throw new AiToolInputError('Link ou busca muito longa.');
		},
	});
	const execute = (r: MessageObj) => executeDownload(r, mode, mode);
	return createModule({
		name: mode,
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...createMethod('default', execute),
				...createMethod('fallback', execute),
				...createMethod('help', r => r.reply(<Help mode={mode} />)),
			},
		},
	}).resources.upsertResource('help', () => <Help mode={mode} />);
};
