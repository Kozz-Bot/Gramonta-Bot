import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import OffenseAPI from 'src/API/OffendApi';

const [o, a] = ['o', 'a'].map(name =>
	createMethod({
		name,
		args: {},
		func: async requester => {
			try {
				const offense = await OffenseAPI.getRandomOffense();

				const person = requester.rawCommand.immediateArg;
				if (!person) {
					return requester.reply.withTemplate('tagSomeone', {
						offense: offense?.xingamento,
					});
				}

				const curseVariant = ['curse1', 'curse2', 'curse3'].at(
					Math.round(Math.random() * 2)
				);

				requester.reply.withTemplate(curseVariant!, {
					contact: person,
					offense: offense?.xingamento,
				});
			} catch (e) {
				requester.reply(`${e}`);
			}
		},
	})
);

export const startOffenseHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],

		name: 'ofenda',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...o,
			...a,
		},
		templatePath: './src/Handlers/Offend/reply.kozz.md',
	});
