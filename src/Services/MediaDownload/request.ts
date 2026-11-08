import type { MessageObj } from 'kozz-module-maker/dist/Message';
import type { MessageReceived } from 'kozz-types';
import { originalCommandQuery } from '../../Utils/commandText';
import { DownloadError, extractDownloadUrl } from './urls';

export const downloadQuery = async (
	requester: MessageObj,
	command: string,
	method?: string
) => {
	let query = originalCommandQuery(requester, command, method);
	if (!query) {
		const quote = requester.message.quotedMessage;
		if (!quote) return undefined;
		query = quote.body || '';
		if (!query.trim() && quote.id) {
			const recovered = await requester.ask.boundary(
				requester.message.boundaryId,
				'message_by_id',
				{
					messageId: quote.id,
					chatId: requester.message.chatId || requester.message.to,
				}
			);
			query = (recovered.response as MessageReceived | undefined)?.body || '';
		}
		const link = extractDownloadUrl(query);
		if (!link)
			throw new DownloadError(
				'Não encontrei um link na mensagem citada. Cole o link depois do comando.'
			);
		return link;
	}
	const link = extractDownloadUrl(query);
	if (link) return link;
	if (/(?:\w+:\/\/|www\.)/i.test(query))
		throw new DownloadError('Envie um link HTTPS de um site público.');
	return query;
};
