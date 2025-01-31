import axios from 'axios';

const TiApi = axios.create({
	baseURL: 'http://192.168.15.4:8000/tia',
});

export default TiApi;

export type TiaMessage = {
	text: string;
	title: string;
	url: string;
	media: {
		mimetype: string;
		url: string;
	} | null;
};
