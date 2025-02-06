import { createClient } from '@deepgram/sdk';
import fs from 'fs';

export const transcribeFile = async (filePath: string) => {
	const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

	const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
		fs.readFileSync(filePath),
		{
			model: 'nova-3',
			smart_format: true,
			detect_language: true,
		}
	);

	if (error) throw error;

	return result.results.channels[0];
};
