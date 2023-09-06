import { MethodMap, createHandlerInstance, createMethod } from 'kozz-handler-maker';
import { loadTemplates } from 'kozz-handler-maker/dist/Message';
import {
	addCopypasta,
	deleteCopypastaById,
	getCopypastaById,
	getCopypastaByIndex,
	getCopypastasList,
	searchCopypastaByContent,
	searchCopypastaByName,
} from './CopypastaManager';
import { queryText } from 'src/Utils/strings';

const templatePath = './src/Handlers/Copypasta/messages.kozz.md';
const templatesHelper = loadTemplates(templatePath);

const idCompare = (idA: string, idB: string) => {
	const sanitizedIdA = idA.match(/^(\d)+/)![0];
	const sanitizedIdB = idB.match(/^(\d)+/)![0];
	return sanitizedIdA === sanitizedIdB;
};

const defaultMethod = createMethod({
	name: 'default',
	args: {},
	func: requester => {
		requester.reply.withTemplate('Help');
	},
});

const list = createMethod({
	name: 'list',
	args: {},
	func: async requester => {
		const copypastaList = getCopypastasList();
		const responsePromises = copypastaList.map(copypasta =>
			templatesHelper.getTextFromTemplate('CopypastaListItem', {
				number: copypasta.index,
				name: copypasta.id,
			})
		);

		const response = await Promise.all(responsePromises);

		requester.reply(response.join(''));
	},
});

const add = createMethod({
	name: 'add',
	args: {},
	func: requester => {
		if (!requester.quotedMessage) {
			return requester.reply.withTemplate('NeedsQuote');
		}
		if (requester.quotedMessage.messageType !== 'TEXT') {
			return requester.reply.withTemplate('NeedsBody');
		}
		if (!requester.rawCommand.immediateArg) {
			return requester.reply.withTemplate('NeedsName');
		}

		const contact = requester.rawCommand.message.contact;
		const name = requester.rawCommand.immediateArg;

		addCopypasta({
			id: name,
			text: requester.quotedMessage.body,
			userIdWhoAdded: contact.id,
			chatId: requester.rawCommand.message.to,
		});

		requester.reply.withTemplate('CopypastaAdded', { name });
	},
});

const search = createMethod({
	name: 'search',
	args: {},
	func: async requester => {
		const query = requester.rawCommand.immediateArg;

		if (!query) {
			return requester.reply.withTemplate('NeedsQuery');
		}

		if (requester.rawCommand.namedArgs?.deep) {
			const found = searchCopypastaByContent(query);
			const message = await Promise.all(
				found.map(copy => {
					const part = queryText(copy.text, query, 15).replace(
						query,
						`*--> ${query.toUpperCase()} <--*`
					);
					return templatesHelper.getTextFromTemplate('CopypastaSearchResultDeep', {
						number: copy.index,
						name: copy.id,
						part,
					});
				})
			);

			return requester.reply(message.join('') || 'Nenhum resultado');
		} else {
			const found = searchCopypastaByName(query);

			const message = await Promise.all(
				found.map(copy => {
					return templatesHelper.getTextFromTemplate('CopypastaSearchResult', {
						number: copy.index,
						name: copy.id,
					});
				})
			);

			return requester.reply(message.join('') || 'Nenhum resultado');
		}
	},
	// This is a bug in the library that I need to fix.
}) as unknown as MethodMap<'search', {}>;

const get = createMethod({
	name: 'fallback',
	args: {},
	func: requester => {
		const query = `${requester.rawCommand.method} ${
			requester.rawCommand.immediateArg || ''
		}`.trim();

		if (!query) {
			return requester.reply.withTemplate('NeedsNameOrNumber');
		}

		const isNumber = query.match(/^(\d)+/);

		const copypasta = (() => {
			if (isNumber) {
				return getCopypastaByIndex(Number(query));
			} else {
				return getCopypastaById(query);
			}
		})();

		if (!copypasta) {
			return requester.reply.withTemplate('InvalidCopypasta');
		}

		return requester.reply.withTemplate('Copypasta', copypasta);
	},
});

const del = createMethod({
	name: 'delete',
	args: {},
	func: requester => {
		if (!requester.rawCommand.immediateArg) {
			return requester.reply.withTemplate('NeedsNameOrNumber');
		}

		const isNumber = requester.rawCommand.immediateArg.match(/^(\d)+/);

		const copypasta = (() => {
			if (isNumber) {
				return getCopypastaByIndex(Number(requester.rawCommand.immediateArg));
			} else {
				return getCopypastaById(requester.rawCommand.immediateArg);
			}
		})();

		if (!copypasta) {
			return requester.reply.withTemplate('InvalidCopypasta');
		}

		if (
			!idCompare(copypasta.userIdWhoAdded, requester.rawCommand.message.from) &&
			!requester.rawCommand.message.fromHostAccount
		) {
			return requester.reply.withTemplate('NotCopypastaOwner');
		}

		deleteCopypastaById(copypasta.id);

		return requester.reply.withTemplate('CopypastaDeleted', copypasta);
	},
});

export const startCopypastaHandler = () =>
	createHandlerInstance({
		boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
		name: 'copypasta',
		address: `${process.env.GATEWAY_URL}`,
		methods: {
			...defaultMethod,
			...list,
			...add,
			...get,
			...del,
			...search,
		},
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
