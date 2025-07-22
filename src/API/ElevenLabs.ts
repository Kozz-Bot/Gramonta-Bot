import axios, { isAxiosError } from 'axios';

const API = axios.create({
	baseURL: 'https://api.elevenlabs.io/v1/',
	headers: {
		'Content-Type': 'application/json',
		'xi-api-key': process.env.ELEVENLABS_API_KEY,
	},
});

export const generateTTS = async (text: string) => {
	try {
		const { data } = await API.post(
			'/text-to-speech/nPczCjzI2devNBz1zQrb?output_format=mp3_44100_128',
			{
				text,
				model_id: 'eleven_multilingual_v2',
				voice_settings: {
					stability: 0.35,
					similarity_boost: 0.75,
					style: 0.45,
					speaker_boost: true,
				},
			},
			{
				responseType: 'arraybuffer',
			}
		);

		const base64Audio = Buffer.from(data, 'binary').toString('base64');
		return base64Audio;
	} catch (e) {
		console.warn('Error in generating TTS', e);
		if (isAxiosError(e)) {
			console.warn(e.response?.data);
		}
	}
};
