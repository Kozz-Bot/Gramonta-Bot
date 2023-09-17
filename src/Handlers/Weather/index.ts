import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';
import WeatherAPI from 'src/API/WeatherAPI';

const queryWeather = createMethod('fallback', async requester => {
	try {
		const query = requester.rawCommand.query;

		if (!query) {
			requester.reply.withTemplate('Help');
		}

		const weather = await WeatherAPI.getWeatherFromCity(query);
		if (weather.cod == 404) return requester.reply.withTemplate('NotFound');
		if (weather.cod != 200)
			return requester.reply.withTemplate('Error', {
				error:
					'Não consegui efetuar a consulta do clima. Tente novamente mais tarde. ReqStatus:' +
					weather.cod,
			});

		return requester.reply.withTemplate('Weather', {
			location: query,
			description: weather.weather[0].description,
			temperature: weather.main.temp.toString().replace('.', ',') + 'ºC',
			minimum: weather.main.temp_min.toString().replace('.', ',') + 'ºC',
			maximum: weather.main.temp_max.toString().replace('.', ',') + 'ºC',
			feelsLike: weather.main.feels_like.toString().replace('.', ',') + 'ºC',
			humidity: weather.main.humidity.toString().replace('.', ',') + '%',
		});
	} catch (e) {
		return requester.reply.withTemplate('Error', {
			error: e,
		});
	}
});

const templatePath = 'src/Handlers/Weather/messages.kozz.md';

export const startWeatherHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'clima',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...queryWeather,
		},
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
