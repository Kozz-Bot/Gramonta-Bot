import { MessageObj } from 'kozz-module-maker/dist/Message';
import { MessageReceived } from 'kozz-types';
import { extractSocialUrl, Platform, platforms, SocialVideoError } from './urls';
import { originalCommandQuery } from '../../Utils/commandText';

export const videoUrlFromRequest = async (
	requester: MessageObj,
	platform: Platform
): Promise<string | undefined> => {
	const config = platforms[platform];
	const query = originalCommandQuery(requester, config.command);
	// An explicit argument takes priority; a bad argument must not silently
	// download a different link from the quote.
	if (query) {
		const url = extractSocialUrl(query, platform);
		if (url) return url;
		throw new SocialVideoError(
			`Não encontrei um link de vídeo do ${config.label} no comando. Cole o link compartilhado ou responda à mensagem que contém o link com !${config.command}.`
		);
	}
	const quoted = requester.message.quotedMessage;
	if (!quoted) return undefined;
	let body = quoted.body;
	if (!body?.trim() && quoted.id) {
		try {
			const recovered = await requester.ask.boundary(
				requester.message.boundaryId,
				'message_by_id',
				{
					messageId: quoted.id,
					chatId: requester.message.chatId || requester.message.to,
				}
			);
			body = (recovered.response as MessageReceived | undefined)?.body || '';
		} catch {
			throw new SocialVideoError(
				`Não consegui ler a mensagem citada. Cole o link depois de !${config.command}.`
			);
		}
	}
	const url = extractSocialUrl(body || '', platform);
	if (url) return url;
	throw new SocialVideoError(
		`Não encontrei um link de vídeo do ${config.label} na mensagem citada. Responda à mensagem que contém o link ou cole-o depois de !${config.command}.`
	);
};
