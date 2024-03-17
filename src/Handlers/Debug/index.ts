import { createModule, createMethod } from 'kozz-module-maker';

const messageInfo = createMethod('default', async requester => {
	const {
		boundaryName,
		contact,
		from,
		id,
		messageType,
		groupName,
		fromHostAccount,
		to,
		media,
	} = requester.rawCommand!.message.quotedMessage || requester.message;
	const response = [
		`Contact Info: \`\`\`${JSON.stringify(contact, undefined, '  ')}\`\`\``,
		``,
		`Boundary Name: ${boundaryName}`,
		`Message ID: ${id}`,
		`From (requester ID): ${from}`,
		`To (receiver ID): ${to}`,
		`From host account: ${fromHostAccount}`,
		``,
		`Message Type: ${messageType}`,
		`Group Name: ${groupName}`,
		`hasMedia: ${!!media?.data}`,
	].join('\n');

	requester.reply(response);
});

export const startDebugHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...messageInfo,
			},
		},
		name: 'debug',
		customSocketPath: process.env.SOCKET_PATH,
		address: `${process.env.GATEWAY_URL}`,
	});
