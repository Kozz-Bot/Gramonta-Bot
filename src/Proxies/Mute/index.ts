import { createMethod, createModule } from 'kozz-module-maker';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import { useJsonDB } from 'src/Utils/StaticJsonDb';
import { MutedPerson, mutePerson, unmutePerson, isUserMutted } from './mutedDB';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { UseFn } from 'kozz-module-maker/dist/Instance/Common';

const MutedDB = useJsonDB<MutedPerson, 'muted'>(
	'muted',
	'./src/Proxies/Mute/muted.json'
);

const mute = createMethod(
	'add',
	hostAccountOnly(async (requester, { reason, time }) => {
		const taggedPeople = requester.message.taggedContacts;
		taggedPeople.forEach(person => {
			// Default time = 1h;
			mutePerson(person, requester.message.to, reason, (time ?? 60) * 1000 * 60);
		});
		requester.reply('Ok');
	}),
	{
		reason: 'string',
		time: 'number?',
	}
);

const unmute = createMethod(
	'add',
	hostAccountOnly(async requester => {
		const taggedPeople = requester.message.taggedContacts;
		taggedPeople.forEach(person => {
			// Default time = 1h;
			unmutePerson(person, requester.message.to);
		});
		requester.reply('Ok');
	})
);

export const useMute: UseFn = command => {
	const abort = isUserMutted(command.message.contact, command.message.to);
	if (abort) {
		if (!command.namedArgs) {
			command.namedArgs = {};
		}
		command.namedArgs.abort = true;
	}

	return command;
};

const templatePath = './src/Handlers/Mute/messages.kozz.md';
export const startCopypastaHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...mute,
				...unmute,
			},
		},
		name: 'mute',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);

	return instance;
};
