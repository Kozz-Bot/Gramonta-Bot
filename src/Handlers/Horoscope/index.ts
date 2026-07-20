import { createModule, createMethod } from 'kozz-module-maker';
import HoroscopeApi from 'src/API/HoroscopeAPI';
import { normalizeString } from 'src/Utils/strings';
import { Help, Horoscope, NotFound } from './messages';

const defaultMethod = createMethod('default', requester =>
	requester.reply(Help())
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
	const sign = normalizeString(requester.rawCommand!.method);
	if (!signs.includes(sign)) {
		return requester.reply(NotFound());
	}

	const horoscope = await HoroscopeApi.getDaily(sign);
	if (!horoscope) {
		return requester.reply(NotFound());
	}

	return requester.reply(Horoscope({ horoscope }));
});

export const startHoroscopeHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
				...getSign,
			},
		},
		name: 'horoscopo',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => Help());
	return instance;
};
