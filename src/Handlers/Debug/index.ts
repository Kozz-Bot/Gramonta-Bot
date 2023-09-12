import { createHandlerInstance, createMethod } from 'kozz-handler-maker';

const messageInfo = createMethod('default', requester => {
	const {
		boundaryId,
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
		`Boundary ID: ${boundaryId}`,
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
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'debug',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...messageInfo,
		},
	});
