import { createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';
import { Media } from 'kozz-types';
import { generateQuote } from 'src/API/QuoteApi';

const quote = createMethod({
	name: 'default',
	args: {},
	func: async requester => {
		if (!requester.quotedMessage || !requester.quotedMessage.body) {
			return requester.reply.withTemplate('Help');
		}

		const text = requester.quotedMessage.body;
		const name = requester.quotedMessage.contact.publicName;
		const profilePicUrl = await requester.ask.boundary(
			'Gramonta-Wa',
			'contact_profile_pic',
			{
				id: requester.quotedMessage.from,
			}
		);

		const quoteB64 = await generateQuote(text, name, profilePicUrl.response);

		const stickerMedia: Media = {
			data: quoteB64,
			fileName: `${quote}.png`,
			mimeType: 'image',
			sizeInBytes: null,
		};

		requester.reply.withSticker(stickerMedia);
	},
});

const templatePath = './src/Handlers/Quote/messages.kozz.md';
export const startQuoteHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'quote',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...quote,
		},
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
