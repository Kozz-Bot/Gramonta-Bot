import axios from 'axios';
import fs from 'fs';
import FormData = require('form-data');

type FuelIxTranscriptionResponse = {
	text?: string;
};

type TranscriptionChannel = {
	alternatives: [
		{
			transcript: string;
		}
	];
};

const api = axios.create({
	baseURL: process.env.FUELIX_BASE_URL ?? process.env.LLM_BASE_URL ?? 'https://api.fuelix.ai/v1',
	headers: {
		Authorization: `Bearer ${
			process.env.FUELIX_API_KEY ??
			process.env.LLM_API_KEY ??
			process.env.OPENAI_API_KEY
		}`,
	},
});

const toTranscriptionChannel = (text = ''): TranscriptionChannel => ({
	alternatives: [
		{
			transcript: text,
		},
	],
});

const transcribeForm = async (form: FormData) => {
	const { data } = await api.post<FuelIxTranscriptionResponse>(
		'/audio/transcriptions',
		form,
		{
			headers: form.getHeaders(),
		}
	);

	return toTranscriptionChannel(data.text?.trim() ?? '');
};

export const transcribeFile = async (filePath: string) => {
	const form = new FormData();
	form.append('file', fs.createReadStream(filePath));
	form.append('model', process.env.TRANSCRIPTION_MODEL ?? 'whisper-1');

	return transcribeForm(form);
};

export const transcribeUrl = async (url: string) => {
	const response = await axios.get<ArrayBuffer>(url, {
		responseType: 'arraybuffer',
	});
	const form = new FormData();
	form.append(
		'file',
		Buffer.from(response.data),
		{
			filename: 'audio.mp3',
		}
	);
	form.append('model', process.env.TRANSCRIPTION_MODEL ?? 'whisper-1');

	return transcribeForm(form);
};
