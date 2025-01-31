import { createModule, createMethod } from 'kozz-module-maker';
import fs from 'fs/promises';

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
	} = requester.message.quotedMessage || requester.message;

	console.log(requester.message.quotedMessage ?? requester.message);

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

	const recebaGnoseSticker = await fs.readFile(
		'./media/saved/receba-gnose.webp',
		'base64url'
	);

	requester.reply.withSticker({
		data: recebaGnoseSticker,
		fileName: 'receba-gnose.webp',
		mimeType: 'image/webp',
		sizeInBytes: recebaGnoseSticker.length,
		stickerTags: [],
		transportType: 'b64',
	});
});

export const startDebugHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...messageInfo,
			},
		},
		name: 'debug',
		customSocketPath: process.env.SOCKET_PATH,
		address: `${process.env.GATEWAY_URL}`,
	});
