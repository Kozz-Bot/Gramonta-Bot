import axios, { AxiosInstance } from 'axios';

type WeatherData = {
	location: {
		name: string;
		region: string;
		country: string;
		localtime: string;
	};
	current: {
		temp_c: number;
		feelslike_c: number;
		humidity: number;
		wind_kph: number;
		condition: {
			text: string;
		};
	};
	forecast: {
		forecastday: {
			date: string;
			day: {
				maxtemp_c: number;
				mintemp_c: number;
				avgtemp_c: number;
				daily_chance_of_rain: number;
				condition: {
					text: string;
				};
			};
		}[];
	};
};

class WeatherAPI {
	API: AxiosInstance;

	constructor() {
		this.API = axios.create({
			baseURL: 'https://api.weatherapi.com/v1',
		});
	}

	async getWeatherFromCity(city: string) {
		const weather = await this.API.get<WeatherData>('forecast.json', {
			params: {
				key: process.env.WEATHERAPI_KEY ?? process.env.WEATHER_TOKEN,
				q: city,
				days: 3,
				lang: 'pt',
				aqi: 'no',
				alerts: 'no',
			},
		});

		return weather.data;
	}
}

export default new WeatherAPI();
