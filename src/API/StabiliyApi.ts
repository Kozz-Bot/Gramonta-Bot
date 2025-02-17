import axios from 'axios';
import qs from 'qs';
export type StylePreset = (typeof availableStyles)[number];

export const availableStyles = [
	'3d-model',
	'analog-film',
	'anime',
	'cinematic',
	'comic-book',
	'digital-art',
	'enhance',
	'fantasy-art',
	'isometric',
	'line-art',
	'low-poly',
	'modeling-compound',
	'neon-punk',
	'origami',
	'photographic',
	'pixel-art',
	'tile-texture',
] as const;

export const isValidStyle = (style?: string): style is StylePreset => {
	return availableStyles.includes(style as StylePreset);
};

const Api = axios.create({
	baseURL: 'https://api.stability.ai',
	headers: {
		Authorization: `Bearer ${process.env.STABILITY_TOKEN}`,
		Accept: 'application/json',
		'Content-Type': 'multipart/form-data',
	},
});

export type ApiRequestError = {
	id: string;
	name: string;
	message: string;
};

export type TextToImageResponse = {
	image: string;
	finish_reason: string;
	seed: number;
};

export type TextToImageGenerationOptions = {
	steps: number;
	style_preset: StylePreset;
};

export const isStabilityError = (e: any): e is ApiRequestError => {
	return e.id && e.name && e.message && typeof e.message === 'string';
};

export const textToImage = async (
	prompt: string,
	options: Partial<TextToImageGenerationOptions> = {}
) => {
	try {
		const response = await Api.post<TextToImageResponse>(
			`/v2beta/stable-image/generate/core`,
			axios.toFormData({
				prompt,
				style_preset: options.style_preset ?? 'digital-art',
			})
		);

		return response.data;
	} catch (e) {
		console.log(e);
		if (axios.isAxiosError(e)) {
			return e.response!.data as ApiRequestError;
		}
		return {
			id: '',
			name: 'unknown-error',
			message: `${e}`,
		} as ApiRequestError;
	}
};
