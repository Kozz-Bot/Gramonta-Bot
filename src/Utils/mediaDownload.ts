import axios from 'axios';

export const downladToB64 = async (url: string) => {
	return axios
		.get(url, {
			responseType: 'arraybuffer',
		})
		.then(result => Buffer.from(result.data, 'binary').toString('base64'));
};
