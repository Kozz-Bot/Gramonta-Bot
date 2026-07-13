import { randomBytes } from 'crypto';
import { isAxiosError } from 'axios';
import { createMethod, createModule } from 'kozz-module-maker';
import type { CommandAlias } from 'kozz-types';
import ChatRPGApi, {
	ChatRPGBaitShopItem,
	ChatRPGInventoryItem,
	ChatRPGItem,
} from 'src/API/ChatRPGApi';
import { useJsonDB } from 'src/Utils/StaticJsonDb';
import {
	AlreadyRegistered,
	AttributesMessage,
	BaitShop,
	BuySuccess,
	BuyUsage,
	ChancesUsage,
	ChatRPGHelp,
	FishingNoCatch,
	FishingProbabilitiesMessage,
	FishingSuccess,
	GoldMessage,
	InventoryMessage,
	MissingBaitForFishing,
	MultipleBaitsForFishing,
	NoBaitForFishing,
	RegisterSuccess,
	RegisterUsage,
	RpgError,
	SellSuccess,
	SellUsage,
	SkillsMessage,
	StatusMessage,
} from './messages';
import {
	formatErrorMessage,
	formatItemName,
} from './formatters';

type RegisteredPlayer = {
	id: string;
	playerId: number;
	username: string;
	password: string;
	createdAt: number;
};

type BaitShopItem = ChatRPGBaitShopItem;

const playerDB = useJsonDB<RegisteredPlayer, 'players'>(
	'players',
	'./src/Handlers/ChatRPG/playerDB.json'
);

const aliases: CommandAlias[] = [
	{ name: 'ajuda', target: { method: 'help' } },
	{ name: 'comandos', target: { method: 'help' } },
	{ name: 'registro', target: { method: 'register' } },
	{ name: 'loja', target: { method: 'shop' } },
	{ name: 'comprar', target: { method: 'buy' } },
	{ name: 'pescar', target: { method: 'fish' } },
	{ name: 'chances', target: { method: 'chances' } },
	{ name: 'status', target: { method: 'status' } },
	{ name: 'inventario', target: { method: 'inventory' } },
	{ name: 'skills', target: { method: 'skills' } },
	{ name: 'atributos', target: { method: 'attributes' } },
	{ name: 'gold', target: { method: 'gold' } },
	{ name: 'vender', target: { method: 'sell' } },
];

const normalize = (value: string) =>
	value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();

const randomPassword = () => randomBytes(16).toString('base64url').slice(0, 12);

const getArgText = (requester: { rawCommand?: { immediateArg: string | null } }) =>
	requester.rawCommand?.immediateArg?.trim() || '';

const getFriendlyErrorMessage = (error: unknown) => {
	if (isAxiosError(error)) {
		const message = error.response?.data?.message;

		if (typeof message === 'string') {
			return formatErrorMessage(message);
		}

		return formatErrorMessage(error.message);
	}

	if (error instanceof Error) {
		return formatErrorMessage(error.message);
	}

	return formatErrorMessage(`${error}`);
};

const getMessageGroupId = (message: { chatId: string; to: string }) => {
	if (message.chatId.endsWith('@g.us')) {
		return message.chatId;
	}

	if (message.to.endsWith('@g.us')) {
		return message.to;
	}

	return null;
};

const getRegisteredPlayer = (contactId: string) =>
	playerDB.getEntityById(contactId);

const requireRegisteredPlayer = (contactId: string) => {
	const player = getRegisteredPlayer(contactId);

	if (!player) {
		throw new Error('Voce ainda nao esta registrado. Use !registro {nome}.');
	}

	return player;
};

const help = createMethod('help', async requester => requester.reply(ChatRPGHelp()));

const findBait = (baits: BaitShopItem[], query: string) => {
	const normalizedQuery = normalize(query);

	return baits.find(
		bait =>
			normalize(bait.id) === normalizedQuery ||
			normalize(bait.name) === normalizedQuery
	);
};

const listPlayerBaits = (
	inventory: ChatRPGInventoryItem[],
	baits: BaitShopItem[]
) =>
	baits
		.map(bait => ({
			...bait,
			quantity:
				inventory.find(slot => slot.itemId === bait.id && slot.quantity > 0)
					?.quantity ?? 0,
		}))
		.filter(bait => bait.quantity > 0);

const findInventorySlot = (
	inventory: ChatRPGInventoryItem[],
	items: ChatRPGItem[],
	query: string
) => {
	const numericSlot = Number(query.replace(/^slot\s+/i, '').trim());
	if (Number.isInteger(numericSlot) && numericSlot > 0) {
		return inventory.find((slot, index) => (slot.slotNumber ?? index + 1) === numericSlot);
	}

	const normalizedQuery = normalize(query);

	return inventory.find(slot => {
		const item = items.find(candidate => candidate.id === slot.itemId);
		const itemName = formatItemName(item, slot.itemId);

		return (
			normalize(slot.itemId) === normalizedQuery ||
			normalize(itemName).includes(normalizedQuery)
		);
	});
};

const parseSellQuery = (query: string) => {
	const trimmedQuery = query.trim();
	const match = trimmedQuery.match(/^(.*?)(?:\s+([0-9]+))?$/);
	const target = match?.[1]?.trim() || '';
	const quantity = Number(match?.[2] || 1);

	return {
		target,
		quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : null,
	};
};

const upsertGroupGuild = async (groupId: string) => {
	const existingGuild = (await ChatRPGApi.listGuilds()).guilds.find(
		guild => guild.name === groupId
	);

	if (existingGuild) {
		return existingGuild;
	}

	try {
		return (
			await ChatRPGApi.createGuild(groupId, 'Guilda criada automaticamente pelo bot.')
		).guild;
	} catch (error) {
		const guild = (await ChatRPGApi.listGuilds()).guilds.find(
			candidate => candidate.name === groupId
		);

		if (guild) {
			return guild;
		}

		throw error;
	}
};

const ensurePlayerInGroupGuild = async (playerId: number, groupId: string) => {
	const guild = await upsertGroupGuild(groupId);

	try {
		await ChatRPGApi.joinGuild(playerId, guild.id);
	} catch (error) {
		const message = getFriendlyErrorMessage(error);

		if (!/already|exists|unique/i.test(message)) {
			throw error;
		}
	}

	return guild;
};

const register = createMethod('register', async requester => {
	try {
		const username = getArgText(requester);
		const contactId = requester.message.contact.id;
		const groupId = getMessageGroupId(requester.message);

		if (!groupId) {
			return requester.reply(RegisterUsage());
		}

		if (!username) {
			return requester.reply(RegisterUsage());
		}

		const existingPlayer = getRegisteredPlayer(contactId);
		if (existingPlayer) {
			const guild = await ensurePlayerInGroupGuild(existingPlayer.playerId, groupId);

			return requester.reply(
				AlreadyRegistered({
					username: existingPlayer.username,
					playerId: existingPlayer.playerId,
					guildName: guild.name,
				})
			);
		}

		const password = randomPassword();
		const { user } = await ChatRPGApi.createUser({
			username,
			password,
			role: 'player',
		});
		const guild = await ensurePlayerInGroupGuild(user.id, groupId);

		playerDB.addEntity({
			id: contactId,
			playerId: user.id,
			username,
			password,
			createdAt: Date.now(),
		});

		return requester.reply(
			RegisterSuccess({
				username,
				playerId: user.id,
				guildName: guild.name,
			})
		);
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro no registro',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const shop = createMethod('shop', async requester => {
	try {
		const category = normalize(getArgText(requester));

		if (category !== 'iscas') {
			return requester.reply(
				RpgError({
					title: 'Loja indisponivel',
					message: 'Por enquanto a loja disponivel e: !loja iscas',
				})
			);
		}

		const { baits } = await ChatRPGApi.listBaitShop();

		return requester.reply(BaitShop({ baits }));
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao consultar loja',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const buy = createMethod('buy', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const args = getArgText(requester).split(/\s+/).filter(Boolean);
		const category = normalize(args.shift() || '');
		const quantityText = args[args.length - 1];
		const quantity = Number(quantityText);

		if (category !== 'iscas' || !Number.isInteger(quantity) || quantity <= 0) {
			return requester.reply(BuyUsage());
		}

		args.pop();
		const baitName = args.join(' ');
		const { baits } = await ChatRPGApi.listBaitShop();
		const bait = findBait(baits, baitName);

		if (!bait) {
			return requester.reply(
				RpgError({
					title: 'Isca nao encontrada',
					message: 'Use !loja iscas para ver as opcoes disponiveis.',
				})
			);
		}

		const result = await ChatRPGApi.buyBaitFromShop(player.playerId, bait.id, {
			quantity,
		});

		return requester.reply(
			BuySuccess({
				quantity,
				baitName: bait.name,
				goldSpent: result.goldSpent,
				currentGold: result.bank?.gold ?? 'desconhecido',
			})
		);
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro na compra',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const fish = createMethod('fish', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const baitName = getArgText(requester);
		const [{ inventory }, { baits }] = await Promise.all([
			ChatRPGApi.getUser(player.playerId),
			ChatRPGApi.listBaitShop(),
		]);
		const playerBaits = listPlayerBaits(inventory, baits);
		const payload = baitName
			? { baitName }
			: playerBaits.length === 1
				? { baitItemId: playerBaits[0].id }
				: {};

		if (!baitName && playerBaits.length === 0) {
			return requester.reply(NoBaitForFishing());
		}

		if (!baitName && playerBaits.length > 1) {
			return requester.reply(MultipleBaitsForFishing({ baits: playerBaits }));
		}

		if (baitName) {
			const bait = findBait(playerBaits, baitName);

			if (!bait) {
				return requester.reply(MissingBaitForFishing({ baits: playerBaits }));
			}
		}

		const result = await ChatRPGApi.fish(player.playerId, payload);

		if (result.outcome === 'no_catch') {
			return requester.reply(FishingNoCatch());
		}

		const { item, quality, fishWeight, randomEvent } = result;

		return requester.reply(
			FishingSuccess({
				itemName: item?.name ?? 'desconhecido',
				quality: quality?.label ?? 'normal',
				weight: fishWeight ? `${fishWeight.value.toFixed(2)} ${fishWeight.unit}` : '-',
				xp: item?.xpGained ?? 0,
				sellValue: item?.sellValue ?? 0,
				randomEvent: randomEvent.occurred ? randomEvent.event?.name : undefined,
			})
		);
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao pescar',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const chances = createMethod('chances', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const args = getArgText(requester).split(/\s+/).filter(Boolean);
		const action = normalize(args.shift() || '');
		const baitName = args.join(' ');

		if (!['pesca', 'pescar', 'fishing'].includes(action)) {
			return requester.reply(ChancesUsage());
		}

		const [{ inventory }, { baits }] = await Promise.all([
			ChatRPGApi.getUser(player.playerId),
			ChatRPGApi.listBaitShop(),
		]);
		const playerBaits = listPlayerBaits(inventory, baits);
		const params = baitName
			? { baitName }
			: playerBaits.length === 1
				? { baitItemId: playerBaits[0].id }
				: {};

		if (!baitName && playerBaits.length > 1) {
			return requester.reply(
				MultipleBaitsForFishing({
					baits: playerBaits,
					command: '!chances pesca',
				})
			);
		}

		if (baitName) {
			const bait = findBait(playerBaits, baitName);

			if (!bait) {
				return requester.reply(MissingBaitForFishing({ baits: playerBaits }));
			}
		}

		const result = await ChatRPGApi.getFishingProbabilities(
			player.playerId,
			params
		);

		return requester.reply(
			FishingProbabilitiesMessage({ probabilities: result.probabilities })
		);
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao consultar probabilidades',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const status = createMethod('status', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const [{ user, progression, inventory, bank }, { items }] = await Promise.all([
			ChatRPGApi.getUser(player.playerId),
			ChatRPGApi.listItems(),
		]);

		return requester.reply(
			StatusMessage({
				username: user.username,
				playerId: user.id,
				gold: bank.gold,
				attributePoints: progression.attributePoints?.availablePoints ?? 0,
				skills: progression.skills,
				attributes: progression.attributes,
				inventory,
				items,
			})
		);
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao consultar status',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const inventory = createMethod('inventory', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const [{ inventory }, { items }] = await Promise.all([
			ChatRPGApi.getUser(player.playerId),
			ChatRPGApi.listItems(),
		]);

		return requester.reply(InventoryMessage({ inventory, items }));
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao consultar inventario',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const skills = createMethod('skills', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const { progression } = await ChatRPGApi.getUserProgression(player.playerId);

		return requester.reply(
			SkillsMessage({ skills: progression.skills })
		);
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao consultar skills',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const attributes = createMethod('attributes', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const { progression } = await ChatRPGApi.getUserProgression(player.playerId);

		return requester.reply(
			AttributesMessage({
				attributes: progression.attributes,
				points: progression.attributePoints.availablePoints,
			})
		);
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao consultar atributos',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const gold = createMethod('gold', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const { bank } = await ChatRPGApi.getUserBank(player.playerId);

		return requester.reply(GoldMessage({ gold: bank.gold }));
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao consultar gold',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

const sell = createMethod('sell', async requester => {
	try {
		const player = requireRegisteredPlayer(requester.message.contact.id);
		const query = getArgText(requester);

		if (!query) {
			return requester.reply(SellUsage());
		}

		const { target, quantity } = parseSellQuery(query);
		if (!target || !quantity) {
			return requester.reply(SellUsage());
		}

		const [{ inventory }, { items }] = await Promise.all([
			ChatRPGApi.getUser(player.playerId),
			ChatRPGApi.listItems(),
		]);
		const slot = findInventorySlot(inventory, items, target);

		if (!slot) {
			return requester.reply(
				RpgError({
					title: 'Item nao encontrado',
					message: 'Confira seu inventario com !inventario e tente vender pelo slot.',
				})
			);
		}

		if (slot.quantity < quantity) {
			return requester.reply(
				RpgError({
					title: 'Quantidade insuficiente',
					message: `Voce tem ${slot.quantity} nesse slot.`,
				})
			);
		}

		const item = items.find(candidate => candidate.id === slot.itemId);
		const result = await ChatRPGApi.sellInventorySlot(
			player.playerId,
			slot.slotNumber ?? inventory.indexOf(slot) + 1,
			{ quantity }
		);

		return requester.reply(
			SellSuccess({
				quantity,
				item: formatItemName(item, slot.itemId),
				goldGained: result.goldGained ?? 0,
				currentGold: result.bank?.gold ?? 'desconhecido',
			})
		);
	} catch (error) {
		return requester.reply(
			RpgError({
				title: 'Erro ao vender',
				message: getFriendlyErrorMessage(error),
			})
		);
	}
});

export const startChatRPGHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...help,
				...register,
				...shop,
				...buy,
				...fish,
				...chances,
				...status,
				...inventory,
				...skills,
				...attributes,
				...gold,
				...sell,
			},
			aliases,
		},
		name: 'rpg',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});

	return instance;
};
