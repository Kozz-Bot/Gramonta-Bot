import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import HoroscopeApi from 'src/API/HoroscopeAPI';
import { normalizeString } from 'src/Utils/strings';

const defaultMethod = createMethod({
	name: 'default',
	args: {},
	func: async requester => {
		requester.reply.withTemplate('Help');
	},
});

const signs = [
	'aries',
	'touro',
	'gemeos',
	'libra',
	'cancer',
	'capricornio',
	'aquario',
	'peixes',
	'leao',
	'virgem',
	'escorpiao',
	'sagitario',
];

const getSign = createMethod({
	name: 'fallback',
	args: {},
	func: async requester => {
		const sign = normalizeString(requester.rawCommand.method);
		if (!signs.includes(sign)) {
			return requester.reply.withTemplate('NotFound');
		}

		const horoscope = await HoroscopeApi.getDaily(sign);
		if (!horoscope) {
			return requester.reply.withTemplate('NotFound');
		}

		return requester.reply.withTemplate('Horoscope', {
			horoscope,
		});
	},
});

export const startHoroscopeHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'horoscopo',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
			...getSign,
		},
		templatePath: './src/Handlers/Horoscope/reply.kozz.md',
	});
