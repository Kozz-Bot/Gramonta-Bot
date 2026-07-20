import { LlmContentPart, Message } from 'src/API/OpenAi';
import { Media, MessageReceived } from 'kozz-types';
import { convertB64ToPath } from 'src/Utils/ffmpeg';
import { transcribeFile } from 'src/API/Deepgram';
import { getTemporaryCdnMediaUrl } from 'src/API/TemporaryCdnMedia';

const talkCommandRegex = /^[!/]\s*ai(?:\s+talk)?\s*/i;

type FormatMessageOptions = {
	includeContextHeader?: boolean;
};

export const stripTalkCommand = (text?: string | null): string => {
	if (!text) return '';
	return text.replace(talkCommandRegex, '').trim();
};

const mediaToImagePart = async (media: Media): Promise<LlmContentPart> => ({
	type: 'image_url',
	image_url: await getTemporaryCdnMediaUrl(media, 'ai-context-image'),
});

const mediaCaptionToText = (message: MessageReceived): string => {
	const caption = stripTalkCommand(message.santizedBody || message.body);
	return caption
		? `Legenda da imagem: "${caption}". Considere tambem a imagem anexada.`
		: 'Considere a imagem anexada e responda com base nela.';
};

const transcribeAudioContext = async (media: Media): Promise<string> => {
	const sourceFormat = media.mimeType.includes('mpeg') ? 'mp3' : 'opus';
	const tempFilepath = await convertB64ToPath(media.data, sourceFormat, 'mp3');
	const transcription = await transcribeFile(tempFilepath);
	return transcription.alternatives[0].transcript.trim();
};

const normalizeTimestamp = (timestamp?: number) =>
	timestamp && timestamp > 0 && timestamp < 1e12 ? timestamp * 1000 : timestamp;

const getMessageAuthor = (message: MessageReceived) =>
	message.contact?.publicName ||
	(message.fromHostAccount ? 'Dono do bot' : message.from);

const getContextHeader = (message: MessageReceived) => {
	const timestamp = normalizeTimestamp(message.timestamp);
	const date = timestamp ? new Date(timestamp).toISOString() : 'sem-data';
	return `[${date}] ${getMessageAuthor(message)}: `;
};

const withContextHeader = (
	message: MessageReceived,
	text: string,
	{ includeContextHeader }: FormatMessageOptions
) => (includeContextHeader ? `${getContextHeader(message)}${text}` : text);

export const formatMessageForLlm = async (
	message: MessageReceived,
	options: FormatMessageOptions = {}
): Promise<Message> => {
	const role = message.body.includes('#CalvoGPT') ? 'assistant' : 'user';
	const media = message.media;

	if (!media) {
		const text = stripTalkCommand(message.body);
		return {
			role,
			content: withContextHeader(
				message,
				text || '(mensagem sem texto)',
				options
			),
		};
	}

	if (media.mimeType.startsWith('image')) {
		const content: LlmContentPart[] = [
			{ type: 'text', text: withContextHeader(message, mediaCaptionToText(message), options) },
			await mediaToImagePart(media),
		];
		return { role, content };
	}

	if (media.mimeType.startsWith('audio')) {
		const transcript = await transcribeAudioContext(media);
		const prefix = stripTalkCommand(message.body || message.santizedBody);
		const text = prefix
			? `${prefix}\n\nTranscricao do audio: "${transcript}"`
			: `Transcricao do audio: "${transcript}"`;
		return {
			role,
			content: [{ type: 'text', text: withContextHeader(message, text, options) }],
		};
	}

	const caption = stripTalkCommand(message.santizedBody || message.body);
	const text = caption
		? `{Mensagem em midia, formato ${media.mimeType}}, legenda da midia: "${caption}"`
		: `{Mensagem em midia, formato ${media.mimeType}}`;

	return {
		role,
		content: withContextHeader(message, text, options),
	};
};
