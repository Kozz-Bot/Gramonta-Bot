import axios from 'axios';

type FuelIxGeneratedImage = {
	url?: string;
	b64_json?: string;
};

type FuelIxImageGenerationResponse = {
	data: FuelIxGeneratedImage[];
};

const api = axios.create({
	baseURL: process.env.FUELIX_BASE_URL ?? process.env.LLM_BASE_URL ?? 'https://api.fuelix.ai/v1',
	headers: {
		Authorization: `Bearer ${process.env.FUELIX_API_KEY ??
			process.env.LLM_API_KEY ??
			process.env.OPENAI_API_KEY
			}`,
	},
});

export const generateImage = async (prompt: string) => {
	const { data } = await api.post<FuelIxImageGenerationResponse>(
		'/images/generations',
		{
			model: process.env.IMAGE_GENERATION_MODEL ?? 'imagen-4-ultra',
			prompt,
			n: 1,
			size: '1024x1024',
		}
	);

	const image = data.data[0];

	if (!image?.url && !image?.b64_json) {
		throw new Error('FuelIX image generation returned no image data');
	}

	return image;
};
