import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { MessageObj, loadTemplates } from 'kozz-handler-maker/dist/Message';
import OffenseAPI, { OffenseResponse } from 'src/API/OffendApi';

const [o, a, os, as] = ['o', 'a', 'os', 'as'].map(name =>
	createMethod(name, requester => {
		try {
			const person =
				requester.rawCommand.taggedContacts.length > 0
					? requester.rawCommand.taggedContacts[0].publicName
					: requester.rawCommand.immediateArg;

			offendPerson(person, requester);
		} catch (e) {
			requester.reply(`${e}`);
		}
	})
);

const offendPerson = async (person: string | null, requester: MessageObj) => {
	const offense = await OffenseAPI.getRandomOffense();

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
};

const fallback = createMethod('fallback', async requester => {
	try {
		const person =
			requester.rawCommand.taggedContacts.length > 0
				? requester.rawCommand.taggedContacts[0].publicName
				: requester.rawCommand.query;

		offendPerson(person, requester);
	} catch (e) {
		requester.reply(`${e}`);
	}
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
