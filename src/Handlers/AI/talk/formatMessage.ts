import { LlmContentPart, Message } from 'src/API/OpenAi';
import { Media, MessageReceived } from 'kozz-types';
import { convertB64ToPath } from 'src/Utils/ffmpeg';
import { transcribeFile } from 'src/API/Deepgram';

const talkCommandRegex = /^!( ){0,1}ai talk\s*/i;

export const stripTalkCommand = (text?: string | null): string => {
	if (!text) return '';
	return text.replace(talkCommandRegex, '').trim();
};

const mediaToImagePart = (media: Media): LlmContentPart => ({
	type: 'image_url',
	image_url:
		media.transportType === 'url'
			? media.data
			: `data:${media.mimeType};base64,${media.data}`,
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

export const formatMessageForLlm = async (
	message: MessageReceived
): Promise<Message> => {
	const role = message.body.includes('#CalvoGPT') ? 'assistant' : 'user';
	const media = message.media;

	if (!media) {
		const text = stripTalkCommand(message.body);
		return { role, content: text || '(mensagem sem texto)' };
	}

	if (media.mimeType.startsWith('image')) {
		const content: LlmContentPart[] = [
			{ type: 'text', text: mediaCaptionToText(message) },
			mediaToImagePart(media),
		];
		return { role, content };
	}

	if (media.mimeType.startsWith('audio')) {
		const transcript = await transcribeAudioContext(media);
		const prefix = stripTalkCommand(message.body || message.santizedBody);
		return {
			role,
			content: prefix
				? `${prefix}\n\nTranscricao do audio: "${transcript}"`
				: `Transcricao do audio: "${transcript}"`,
		};
	}

	const caption = stripTalkCommand(message.santizedBody || message.body);
	return {
		role,
		content: caption
			? `{Mensagem em midia, formato ${media.mimeType}}, legenda da midia: "${caption}"`
			: `{Mensagem em midia, formato ${media.mimeType}}`,
	};
};
