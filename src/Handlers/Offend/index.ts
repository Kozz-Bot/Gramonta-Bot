import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';
import OffenseAPI from 'src/API/OffendApi';

const [o, a, os, as] = ['o', 'a', 'os', 'as'].map(name =>
	createMethod(name, async requester => {
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
	})
);

const fallback = createMethod('fallback', async requester => {
	const name = `${requester.rawCommand.method} ${
		requester.rawCommand.immediateArg || ''
	}`
		.trim()
		.replace('default', '');

	const offense = await OffenseAPI.getRandomOffense();

	if (!name) {
		return requester.reply.withTemplate('tagSomeone', {
			offense: offense?.xingamento,
		});
	}

	const curseVariant = ['curse1', 'curse2', 'curse3'].at(
		Math.round(Math.random() * 2)
	);

	requester.reply.withTemplate(curseVariant!, {
		contact: name,
		offense: offense?.xingamento,
	});
});

const templatePath = './src/Handlers/Offend/reply.kozz.md';

export const startOffenseHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],

		name: 'ofenda',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...o,
			...a,
			...os,
			...as,
			...fallback,
		},
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
