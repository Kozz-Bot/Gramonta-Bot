import axios from 'axios';

const APIBrasil = axios.create({
	baseURL: 'https://cluster.apigratis.com/api/v2/',
	headers: {
		Authorization: `Bearer ${process.env.API_BRASIL_BEARER}`,
		DeviceToken: `${process.env.API_BRASIL_DEVICE_TOKEN}`,
	},
});

export default APIBrasil;
