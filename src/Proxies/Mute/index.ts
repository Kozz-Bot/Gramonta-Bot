import { createMethod, createModule } from 'kozz-module-maker';
import { MessageObj } from 'kozz-module-maker/dist/Message';
import {
	getMuteRegister,
	isUserMutted,
	MutedPerson,
	mutePerson,
	unmutePerson,
	updateWhenMutedSendsMessage,
} from './mutedDB';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';

const feedbackIntervalTime = 60 * 1000; // 60 seconds

const mute = createMethod(
	'fallback',
	hostAccountOnly(async (requester, { reason, time }) => {
		const taggedPeople = requester.message.taggedContacts;
		taggedPeople.forEach(person => {
			// Default time = 1h;
			mutePerson(
				person,
				requester.message.to,
				reason || 'no reason',
				(time ?? 60) * 1000 * 60
			);
		});
		requester.reply('Ok');
	}),
	{
		reason: 'string?',
		time: 'number?',
	}
);

const unmute = createMethod(
	'unmute',
	hostAccountOnly(async requester => {
		const taggedPeople = requester.message.taggedContacts;
		taggedPeople.forEach(person => {
			// Default time = 1h;
			unmutePerson(person, requester.message.to);
		});
		requester.reply('Ok');
	})
);

const shouldReply = (muteRegister: MutedPerson['mutes'][number]) => {
	const lastMessageASNumber = muteRegister.lastMessageSent;

	return new Date().getTime() > lastMessageASNumber + feedbackIntervalTime;
};

const onUserMessage = (requester: MessageObj) => {
	const { contact, to: chat } = requester.message;
	if (isUserMutted(contact, chat)) {
		const muteRegister = getMuteRegister(contact, chat)!;

		const shouldSendMessage = shouldReply(muteRegister);

		if (shouldSendMessage) {
			requester.sendMessage(
				chat,
				`${tagMember(requester.message.from)}, você está silenciado do grupo até ${
					muteRegister.prettyExpiration
				}. Motivo: ${muteRegister.reason}`
			);
			updateWhenMutedSendsMessage(contact, chat);
		}

		requester.message.delete();
	}
};

const templatePath = './src/Handlers/Mute/messages.kozz.md';
export const startMuteHandler = () => {
	console.log('Starting Mute Handler');

	const instance = createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...mute,
				...unmute,
			},
		},
		proxy: {
			source: 'Gramonta-Wa/*',
			onMessage: onUserMessage,
		},
		name: 'mute',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		templatePath,
	});

	return instance;
};
