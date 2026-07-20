import { createModule, createMethod } from 'kozz-module-maker';
import WeatherAPI from 'src/API/WeatherAPI';
import {
	EmptyQuery,
	ErrorMessage,
	Help,
	NotFound,
	Weather,
	WeatherForecast,
} from './messages';

const formatTemperature = (temperature: number) =>
	temperature.toFixed(1).replace('.', ',') + 'ºC';

const formatDate = (date: string) =>
	new Intl.DateTimeFormat('pt-BR', {
		weekday: 'short',
		day: '2-digit',
		month: '2-digit',
	}).format(new Date(`${date}T12:00:00`));

const queryWeather = createMethod('fallback', async requester => {
	try {
		const query = requester.rawCommand!.query?.trim();

		if (!query) {
			return requester.reply(<EmptyQuery />);
		}

		const weather = await WeatherAPI.getWeatherFromCity(query);
		const today = weather.forecast.forecastday[0]?.day;
		const forecast: WeatherForecast[] = weather.forecast.forecastday.map(day => ({
			date: formatDate(day.date),
			description: day.day.condition.text,
			minimum: formatTemperature(day.day.mintemp_c),
			maximum: formatTemperature(day.day.maxtemp_c),
			rainChance: day.day.daily_chance_of_rain,
		}));

		return requester.reply(
			<Weather
				location={[weather.location.name, weather.location.region, weather.location.country]
					.filter(Boolean)
					.join(', ')}
				description={weather.current.condition.text}
				temperature={formatTemperature(weather.current.temp_c)}
				minimum={today ? formatTemperature(today.mintemp_c) : 'N/A'}
				maximum={today ? formatTemperature(today.maxtemp_c) : 'N/A'}
				feelsLike={formatTemperature(weather.current.feelslike_c)}
				humidity={weather.current.humidity.toString().replace('.', ',') + '%'}
				wind={weather.current.wind_kph.toString().replace('.', ',') + ' km/h'}
				localtime={weather.location.localtime}
				forecast={forecast}
			/>
		);
	} catch (e) {
		if (e && typeof e === 'object' && 'response' in e) {
			const response = e.response as {
				status?: number;
				data?: { error?: { code?: number; message?: string } };
			};
			const apiError = response.data?.error;
			if (response.status === 400 && response.data?.error?.code === 1006) {
				return requester.reply(<NotFound />);
			}
			if (apiError?.code === 1002 || apiError?.code === 2006) {
				return requester.reply(
					<ErrorMessage error="Chave da WeatherAPI ausente ou inválida." />
				);
			}
			if (apiError?.message) {
				return requester.reply(<ErrorMessage error={apiError.message} />);
			}
		}

		return requester.reply(<ErrorMessage error={String(e)} />);
	}
});

export const startWeatherHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...queryWeather,
			},
		},
		name: 'clima',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => <Help />);

	return instance;
};
