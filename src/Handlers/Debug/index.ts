import { createModule, createMethod } from 'kozz-module-maker';

const messageInfo = createMethod('default', requester => {
	const {
		boundaryName,
		contact,
		from,
		id,
		messageType,
		groupName,
		fromHostAccount,
		to,
	} = requester.rawCommand.message.quotedMessage || requester.rawCommand.message;
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
		address: `${process.env.GATEWAY_URL}`,
	});
