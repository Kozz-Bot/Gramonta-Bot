import { MethodMap, createMethod, createModule } from 'kozz-module-maker';
import {
	Copypasta,
	CopypastaAdded,
	CopypastaDeleted,
	CopypastaSearchResult,
	CopypastaSearchResultDeep,
	CopypastaListItem,
	InvalidCopypasta,
	NeedsQuote,
	NeedsQuery,
	NeedsBody,
	NeedsName,
	NeedsNameOrNumber,
	NotCopypastaOwner,
	Help,
} from './messages';
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

const idCompare = (idA: string, idB: string) => {
	const sanitizedIdA = idA.match(/^(\d)+/)![0];
	const sanitizedIdB = idB.match(/^(\d)+/)![0];
	return sanitizedIdA === sanitizedIdB;
};

const help = createMethod('default', requester => <Help />);

const list = createMethod('list', async requester => {
	const copypastaList = getCopypastasList();
	const responsePromises = copypastaList.map(copypasta => (
		<CopypastaListItem number={copypasta.index} name={copypasta.id} />
	));

	const response = await Promise.all(responsePromises);

	requester.reply(response.join(''));
});

const add = createMethod('add', requester => {
	if (!requester.message.quotedMessage) {
		return <NeedsQuote />;
	}
	if (requester.message.quotedMessage.messageType !== 'TEXT') {
		return <NeedsBody />;
	}
	if (!requester.rawCommand!.immediateArg) {
		return requester.reply(<NeedsName />);
	}

	const contact = requester.rawCommand!.message.contact;
	const name = requester.rawCommand!.immediateArg;

	addCopypasta({
		id: name,
		text: requester.message.quotedMessage.body,
		userIdWhoAdded: contact.id,
		chatId: requester.message.to,
	});

	requester.reply(<CopypastaAdded name={name} />);
});

const search = createMethod(
	'search',
	async (requester, args) => {
		const query = requester.rawCommand!.immediateArg;

		if (!query) {
			return <NeedsQuery />;
		}

		if (args.deep) {
			const found = searchCopypastaByContent(query);
			const message = await Promise.all(
				found.map(copy => {
					const part = queryText(copy.text, query, 15).replace(
						makeAccentsInsensitiveRegex(query),
						`*--> ${query.toUpperCase()} <--*`
					);
					return <CopypastaSearchResultDeep number={copy.index} name={copy.id} part={part} />;
				})
			);

			return requester.reply(message.join('') || 'Nenhum resultado');
		} else {
			const found = searchCopypastaByName(query);

			const message = await Promise.all(
				found.map(copy => {
					return <CopypastaSearchResult number={copy.index} name={copy.id} />;
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
	const query = `${requester.rawCommand!.method} ${requester.rawCommand!.immediateArg || ''}`.trim();

	if (!query) {
		return requester.reply(<NeedsNameOrNumber />);
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
		return requester.reply(<InvalidCopypasta />);
	}

	return requester.reply(<Copypasta id={copypasta.id} text={copypasta.text} />);
});

const del = createMethod('delete', requester => {
	if (!requester.rawCommand!.immediateArg) {
		return requester.reply(<NeedsNameOrNumber />);
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
		return requester.reply(<InvalidCopypasta />);
	}

	if (
		!idCompare(copypasta.userIdWhoAdded, requester.rawCommand!.message.from) &&
		!requester.rawCommand!.message.fromHostAccount
	) {
		return requester.reply(<NotCopypastaOwner />);
	}

	deleteCopypastaById(copypasta.id);

	return requester.reply(<CopypastaDeleted />);
});

export const startCopypastaHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
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
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => <Help />);

	return instance;
};
