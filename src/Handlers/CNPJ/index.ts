import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import APIBrasil from 'src/API/APIBrasil';
import { usePremiumCommand } from 'src/Middlewares/Coins';

const getCnpj = createMethod(
	'fallback',
	usePremiumCommand(
		50,
		async requester => {
			try {
				const num = '[0-9]';
				const cpfRegex = new RegExp(
					`${num}{2}.?${num}{3}.?${num}{3}/?${num}{4}-?${num}{2}`
				);

				const cnpj = requester.rawCommand.method.match(cpfRegex);

				if (!cnpj) {
					requester.reply('Forneça um CNPJ no formato 00.000.000/0000-00');
					return false;
				}

				const response = await APIBrasil.get('/dados/cnpj', {
					params: {
						cnpj: cnpj[0],
					},
				});

				requester.reply(
					'```' + JSON.stringify(response.data.response, undefined, '  ') + '```'
				);
			} catch (e) {
				requester.reply(`${e}`);
			}
		},
		'Você não possui CalvoCoins suficientes para esse comando.'
	)
);

export const startCNPJInstance = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'cnpj',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...getCnpj,
		},
	});