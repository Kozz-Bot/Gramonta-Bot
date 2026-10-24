import { createMethod, createModule } from 'kozz-module-maker';

// `message.delete()` is the module-maker convenience method for revoking a
// message on the originating WhatsApp boundary. Its default is
// `localDelete = false`, which means delete for everyone.
const deleteCommand = createMethod('default', requester => {
	const target = requester.message.quotedMessage ?? requester.message;
	console.log(
		`[DeleteTest] Revoking messageId=${target.id} requestedBy=${requester.message.id}`
	);
	return target.delete();
});

export const startDeleteTestHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...deleteCommand,
			},
		},
		name: 'del',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});
