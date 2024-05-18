import { createMethod, createModule } from 'kozz-module-maker';

const tagAll = createMethod('default', async requester => {
	const allMembers = await requester.ask.boundary(
		requester.message.boundaryName,
		'chat_info',
		{
			id: requester.message.to,
		}
	);

	console.log(allMembers);
});

export const startAllModule = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...tagAll,
			},
		},
		name: 'all',
		customSocketPath: process.env.SOCKET_PATH,
		address: `${process.env.GATEWAY_URL}`,
	});
