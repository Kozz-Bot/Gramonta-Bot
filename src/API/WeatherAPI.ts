import axios, { AxiosInstance } from 'axios';

type WeatherData = {
	coord: {
		lon: number;
		lat: number;
	};
	weather: [
		{
			id: number;
			main: string;
			description: string;
			icon: string;
		}
	];
	base: string;
	main: {
		temp: number;
		feels_like: number;
		temp_min: number;
		temp_max: number;
		pressure: number;
		humidity: number;
	};
	visibility: number;
	wind: {
		speed: number;
		deg: number;
	};
	sys: {
		type: number;
		id: number;
		country: string;
		sunrise: number;
		sunset: number;
	};
	timezone: number;
	id: number;
	name: string;
	dt: number;
	cod: number;
};

class WeatherAPI {
	API: AxiosInstance;

	constructor() {
		this.API = axios.create({
			baseURL: 'https://weather.contrateumdev.com.br',
		});
	}

	async getWeatherFromCity(city: string) {
		const weather = await this.API.get<WeatherData>('api/weather/city', {
			params: {
				city,
			},
			headers: {
				token: process.env.WEATHER_TOKEN
			}
		});
		return weather.data;
	}
}

export default new WeatherAPI();
