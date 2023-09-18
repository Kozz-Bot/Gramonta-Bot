import { createModule, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';
import HoroscopeApi from 'src/API/HoroscopeAPI';
import { normalizeString } from 'src/Utils/strings';

const defaultMethod = createMethod('default', requester =>
	requester.reply.withTemplate('Help')
);

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

const getSign = createMethod('fallback', async requester => {
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
});

const templatePath = './src/Handlers/Horoscope/reply.kozz.md';

export const startHoroscopeHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...defaultMethod,
				...getSign,
			},
		},
		name: 'horoscopo',
		address: `${process.env.GATEWAY_URL}`,

		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
