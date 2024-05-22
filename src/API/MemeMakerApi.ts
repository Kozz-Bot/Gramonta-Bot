import axios from 'axios';
import CDNApi from './CDNApi';
import { Media } from 'kozz-types';

const api = axios.create({
	baseURL: 'https://api.memegen.link',
});

type MemegenApiResponse = {
	url: string;
};

const instance = () => {
	const createMemeFromImage = async (
		media: Media,
		topText: string,
		bottomText: string,
		memeId: string
	) => {
		// I unfortunately have to upload to my bucket because Memegen Api doesnt support
		// custom images as b64 encoded strings.
		const mediaUrlInBucket = await CDNApi.uploadPublicFile(
			`ZapMeme-${memeId}.png`,
			media.data
		);

		const { data } = await api.post<MemegenApiResponse>('/templates/custom', {
			background: mediaUrlInBucket,
			text: [topText, bottomText],
			extension: 'png',
		});

		// And here I overwrite the file in my bucket.
		const memeUrl = await CDNApi.uploadFileFromUrl(
			'public',
			`ZapMeme-${memeId}.png`,
			data.url
		);

		return memeUrl;
	};

	return {
		createMemeFromImage,
	};
};

export default instance();
