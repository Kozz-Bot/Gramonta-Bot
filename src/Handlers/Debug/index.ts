import {
	createHandlerInstance,
	createMethod,
	createProxyInstance,
} from 'kozz-handler-maker';
import { ContactPayload } from 'kozz-types';

const defaultMethod = createMethod({
	name: 'default',
	args: {},
	func: async requester => {
		if (!requester.rawCommand.message.fromHostAccount) {
			return;
		}

		const contactList = await requester.ask.boundary('Gramonta-Wa', {
			resource: 'all_contacts',
			data: {},
		});

		const contactListString = contactList.response
			.filter((c: ContactPayload) => !c.isGroup)
			.reduce((string: string, contact: ContactPayload) => {
				return (string += `${contact.publicName || contact.privateName}\n`);
			}, '');
		requester.reply(contactListString);
	},
});

const proxy = createMethod({
	name: 'proxy',
	args: {},
	func: requester => {
		if (!requester.rawCommand.message.fromHostAccount) {
			return;
		}

		const chatId = requester.rawCommand.message.fromHostAccount
			? requester.rawCommand.message.to
			: requester.rawCommand.message.from;

		//Create proxy to my chat. Still need to create onProxiedMessage event handler in WA boundary
		//This is a hack, the message should be proxied directly to Gramonta-Wa boundary;
		createProxyInstance({
			address: `${process.env.GATEWAY_URL}`,
			name: `proxy-${requester}`,
			source: `${requester.rawCommand.boundaryId}/${chatId}`,
			onMessage: requester => {
				const rawMessage = requester.rawCommand.message;

				requester.sendMessage(
					'5511947952409@c.us',
					[
						`Nome: ${rawMessage.contact.publicName}`,
						`${rawMessage.groupName}`,
						`${rawMessage.body}`,
					].join('\n')
				);

				if (rawMessage.fromHostAccount && rawMessage.body === '!debug stop') {
					requester.revoke();
				}
			},
		});
	},
});

export const startDebugHandler = () =>
	createHandlerInstance({
		name: 'debug',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
			...proxy,
		},
	});
