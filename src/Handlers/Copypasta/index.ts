import { MethodMap, createMethod, createModule } from 'kozz-module-maker';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import {
	addCopypasta,
	deleteCopypastaById,
	getCopypastaById,
	getCopypastaByIndex,
	getCopypastasList,
	searchCopypastaByContent,
	searchCopypastaByName,
} from './CopypastaManager';
import { makeAccentsInsensitiveRegex, queryText } from 'src/Utils/strings';

const templatePath = './src/Handlers/Copypasta/messages.kozz.md';
const templatesHelper = loadTemplates(templatePath);

const idCompare = (idA: string, idB: string) => {
	const sanitizedIdA = idA.match(/^(\d)+/)![0];
	const sanitizedIdB = idB.match(/^(\d)+/)![0];
	return sanitizedIdA === sanitizedIdB;
};

const help = createMethod('default', requester =>
	requester.reply.withTemplate('Help')
);

const list = createMethod('list', async requester => {
	const copypastaList = getCopypastasList();
	const responsePromises = copypastaList.map(copypasta =>
		templatesHelper.getTextFromTemplate('CopypastaListItem', {
			number: copypasta.index,
			name: copypasta.id,
		})
	);

	const response = await Promise.all(responsePromises);

	requester.reply(response.join(''));
});

const add = createMethod('add', requester => {
	if (!requester.message.quotedMessage) {
		return requester.reply.withTemplate('NeedsQuote');
	}
	if (requester.message.quotedMessage.messageType !== 'TEXT') {
		return requester.reply.withTemplate('NeedsBody');
	}
	if (!requester.rawCommand!.immediateArg) {
		return requester.reply.withTemplate('NeedsName');
	}

	const contact = requester.rawCommand!.message.contact;
	const name = requester.rawCommand!.immediateArg;

	addCopypasta({
		id: name,
		text: requester.message.quotedMessage.body,
		userIdWhoAdded: contact.id,
		chatId: requester.message.to,
	});

	requester.reply.withTemplate('CopypastaAdded', { name });
});

const search = createMethod(
	'search',
	async (requester, args) => {
		const query = requester.rawCommand!.immediateArg;

		if (!query) {
			return requester.reply.withTemplate('NeedsQuery');
		}

		if (args.deep) {
			const found = searchCopypastaByContent(query);
			const message = await Promise.all(
				found.map(copy => {
					const part = queryText(copy.text, query, 15).replace(
						makeAccentsInsensitiveRegex(query),
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
	{
		deep: 'boolean?',
	}
);

const get = createMethod('fallback', requester => {
	const query = `${requester.rawCommand!.method} ${
		requester.rawCommand!.immediateArg || ''
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
});

const del = createMethod('delete', requester => {
	if (!requester.rawCommand!.immediateArg) {
		return requester.reply.withTemplate('NeedsNameOrNumber');
	}

	const isNumber = requester.rawCommand!.immediateArg.match(/^(\d)+/);

	const copypasta = (() => {
		if (isNumber) {
			return getCopypastaByIndex(Number(requester.rawCommand!.immediateArg));
		} else {
			return getCopypastaById(requester.rawCommand!.immediateArg);
		}
	})();

	if (!copypasta) {
		return requester.reply.withTemplate('InvalidCopypasta');
	}

	if (
		!idCompare(copypasta.userIdWhoAdded, requester.rawCommand!.message.from) &&
		!requester.rawCommand!.message.fromHostAccount
	) {
		return requester.reply.withTemplate('NotCopypastaOwner');
	}

	deleteCopypastaById(copypasta.id);

	return requester.reply.withTemplate('CopypastaDeleted', copypasta);
});

export const startCopypastaHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...help,
				...list,
				...add,
				...get,
				...del,
				...search,
			},
		},
		name: 'copypasta',
		address: `${process.env.GATEWAY_URL}`,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);
