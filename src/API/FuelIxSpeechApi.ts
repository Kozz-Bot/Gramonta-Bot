import axios from 'axios';

export const speechVoices = [
	'alloy',
	'ash',
	'ballad',
	'coral',
	'echo',
	'fable',
	'nova',
	'onyx',
	'sage',
	'shimmer',
	'verse',
	'marin',
	'cedar',
] as const;

export type SpeechVoice = (typeof speechVoices)[number];

const DEFAULT_SPEECH_VOICE: SpeechVoice = 'alloy';

const api = axios.create({
	baseURL: process.env.FUELIX_BASE_URL ?? process.env.LLM_BASE_URL ?? 'https://api.fuelix.ai/v1',
	headers: {
		Authorization: `Bearer ${process.env.FUELIX_API_KEY ??
			process.env.LLM_API_KEY ??
			process.env.OPENAI_API_KEY
			}`,
	},
});

export const normalizeSpeechVoice = (voice: unknown): SpeechVoice =>
	typeof voice === 'string' && speechVoices.includes(voice as SpeechVoice)
		? (voice as SpeechVoice)
		: DEFAULT_SPEECH_VOICE;

export const generateSpeech = async (
	input: string,
	voice: SpeechVoice = DEFAULT_SPEECH_VOICE
) => {
	const { data } = await api.post<ArrayBuffer>(
		'/audio/speech',
		{
			model: process.env.SPEECH_MODEL ?? 'tts-1-hd',
			input,
			voice,
		},
		{
			responseType: 'arraybuffer',
		}
	);

	return Buffer.from(data).toString('base64');
};
