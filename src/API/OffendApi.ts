import axios, { AxiosInstance } from 'axios';

export type OffenseResponse = {
	xingamento: string;
};

class OffenseAPI {
	instance: AxiosInstance;

	constructor() {
		this.instance = axios.create({
			baseURL: 'http://xinga-me.appspot.com/',
		});
	}

	getRandomOffense() {
		return this.instance
			.get<OffenseResponse>('/api')
			.then(resp => resp.data)
			.catch(_ => undefined);
	}
}

export default new OffenseAPI();
