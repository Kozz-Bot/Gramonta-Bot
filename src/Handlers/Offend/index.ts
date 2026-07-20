import { createModule, createMethod } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import OffenseAPI from 'src/API/OffendApi';
import { Curse, Help, TagSomeone } from './messages';

const [o, a, os, as] = ['o', 'a', 'os', 'as'].map(name =>
	createMethod(name, requester => {
		try {
			const person =
				requester.rawCommand!.taggedContacts.length > 0
					? requester.rawCommand!.taggedContacts[0].publicName
					: requester.rawCommand!.immediateArg;

			offendPerson(person, requester);
		} catch (e) {
			requester.reply(`${e}`);
		}
	})
);

const offendPerson = async (person: string | null, requester: MessageObj) => {
	const offense = await OffenseAPI.getRandomOffense();

	if (!person) {
		return requester.reply(TagSomeone({ offense: offense?.xingamento }));
	}

	requester.reply(
		Curse({
			contact: person,
			offense: offense?.xingamento,
			variant: Math.round(Math.random() * 2),
		})
	);
};

const fallback = createMethod('fallback', async requester => {
	try {
		const person =
			requester.rawCommand!.taggedContacts.length > 0
				? requester.rawCommand!.taggedContacts[0].publicName
				: requester.rawCommand!.query;

		offendPerson(person, requester);
	} catch (e) {
		requester.reply(`${e}`);
	}
});

export const startOffenseHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...o,
				...a,
				...os,
				...as,
				...fallback,
			},
		},

		name: 'ofenda',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => Help());

	return instance;
};
