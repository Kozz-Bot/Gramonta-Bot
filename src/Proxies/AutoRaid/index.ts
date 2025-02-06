import { createModule } from 'kozz-module-maker';
import fs from 'fs/promises';

export const createAutoRaid = () => {
	const instance = createModule({
		address: `${process.env.GATEWAY_URL}`,
		name: `auto-raid`,
		customSocketPath: process.env.SOCKET_PATH,

		proxy: {
			source: `${'Gramonta-Wa'}/${'*'}`,
			onMessage: async requester => {
				const mySticker = await fs.readFile('./media/tempFile.webp', {
					encoding: 'base64',
				});
				// if (requester.message.contact.id.startsWith("5511947952409")) {
				if (requester.message.contact.id.startsWith('5521973522937')) {
					let delay = 0;
					let delayIncrement = 500;
					console.log('attacking');

					for (let i = 0; i < 10; i++) {
						setTimeout(() => {
							requester.reply.withSticker({
								data: mySticker,
								fileName: 'test',
								mimeType: 'image/webp',
								sizeInBytes: null,
								transportType: 'b64',
								stickerTags: [],
								duration: null,
							});

							delay += delayIncrement + Math.random() * 1500;
						}, delay);
					}
				}
			},
		},
	});
	return instance;
};
