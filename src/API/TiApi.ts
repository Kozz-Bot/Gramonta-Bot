import axios from 'axios';

const TiApi = axios.create({
	baseURL: 'http://gramont.ddns.net/tia',
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
