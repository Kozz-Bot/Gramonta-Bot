import { Message } from 'src/API/FuelIXApi';
import { MessageReceived } from 'kozz-types';
import { interpretMedia } from '../../../Services/MediaUnderstanding/interpret';
import { formatConversationMessage } from './conversationContext';

const talkCommandRegex = /^[!/]\s*ai(?:\s+talk)?\s*/i;

type FormatMessageOptions = {
	includeContextHeader?: boolean;
	includeMedia?: boolean;
};

export const stripTalkCommand = (text?: string | null): string => {
	if (!text) return '';
	return text
		.replace(talkCommandRegex, '')
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
		.replace(/\r\n?/g, '\n')
		.trim();
};

const getSafeBody = (message: MessageReceived) =>
	message.taggedConctactFriendlyBody || message.body || message.santizedBody || '';

const withContextHeader = (
	message: MessageReceived,
	text: string,
	{ includeContextHeader }: FormatMessageOptions
) => (includeContextHeader ? formatConversationMessage(message, text) : text);

export const formatMessageForLlm = async (
	message: MessageReceived,
	options: FormatMessageOptions = {}
): Promise<Message> => {
	const role = getSafeBody(message).includes('#CalvoGPT') ? 'assistant' : 'user';
	const media = message.media;

	if (!media) {
		const text = stripTalkCommand(getSafeBody(message));
		return {
			role,
			content: withContextHeader(message, text || '(mensagem sem texto)', options),
		};
	}

	if (
		options.includeMedia !== false &&
		/^(image|audio|video)\//.test(media.mimeType)
	) {
		const prepared = await interpretMedia(media);
		return {
			role,
			content: [
				{
					type: 'text',
					text: withContextHeader(
						message,
						`${stripTalkCommand(getSafeBody(message))}\nMídia analisada: ${JSON.stringify(prepared.summary)}`,
						options
					),
				},
				...prepared.parts,
			],
		};
	}

	const caption = stripTalkCommand(getSafeBody(message));
	const text = caption
		? `{Mensagem em midia, formato ${media.mimeType}}, legenda da midia: "${caption}"`
		: `{Mensagem em midia, formato ${media.mimeType}}`;

	return {
		role,
		content: withContextHeader(message, text, options),
	};
};
