import type {
	ChatRPGAttribute,
	ChatRPGBaitEffects,
	ChatRPGItem,
	ChatRPGItemCategory,
	ChatRPGItemRarity,
	ChatRPGItemStatus,
	ChatRPGSkill,
} from 'src/API/ChatRPGApi';

const skillLabels: Record<ChatRPGSkill, string> = {
	fishing: 'Pesca',
	woodcutting: 'Lenhador',
	mining: 'Mineracao',
	farming: 'Agricultura',
	cooking: 'Culinaria',
	smithing: 'Forja',
	crafting: 'Artesanato',
	archaeology: 'Arqueologia',
	melee: 'Combate corpo a corpo',
	ranged: 'Combate a distancia',
	magic: 'Magia',
	runemaking: 'Runas',
	alchemy: 'Alquimia',
	potionbrewing: 'Pocoes',
};

const attributeLabels: Record<ChatRPGAttribute, string> = {
	strength: 'Forca',
	vitality: 'Vitalidade',
	dexterity: 'Destreza',
	intelligence: 'Inteligencia',
	luck: 'Sorte',
};

const itemCategoryLabels: Record<ChatRPGItemCategory, string> = {
	equipment: 'Equipamento',
	consumable: 'Consumivel',
	material: 'Material',
	treasure: 'Tesouro',
};

const itemRarityLabels: Record<ChatRPGItemRarity, string> = {
	common: 'Comum',
	uncommon: 'Incomum',
	rare: 'Raro',
	epic: 'Epico',
	legendary: 'Lendario',
};

const itemStatusLabels: Record<ChatRPGItemStatus, string> = {
	active: 'Ativo',
	deprecated: 'Legado',
	disabled: 'Desativado',
};

const effectLabels: Partial<Record<keyof ChatRPGBaitEffects, string>> = {
	treasureChanceBonus: 'chance de tesouro',
	junkChanceReduction: 'menos lixo',
	fishWeightMultiplier: 'peso dos peixes',
	qualityLevelBonus: 'qualidade',
	rareFishWeightBonus: 'peixes raros',
	xpMultiplier: 'XP',
};

const errorMessageLabels: Record<string, string> = {
	'Fishing requires bait.': 'Voce precisa escolher uma isca para pescar.',
	'Multiple bait types found. Specify baitItemId or baitName.':
		'Voce tem mais de um tipo de isca. Informe qual isca quer usar.',
	'Bait not found in player inventory.': 'Essa isca nao esta no seu inventario.',
	'Insufficient gold.': 'Gold insuficiente.',
	'Failed to add bait to inventory.':
		'Nao foi possivel guardar a isca no inventario.',
};

const reasonLabels: Record<string, string> = {
	inventory_full: 'inventario cheio',
	no_catch: 'nada fisgado',
	insufficient_quantity: 'quantidade insuficiente',
	inventory_full_or_insufficient_quantity:
		'inventario cheio ou quantidade insuficiente',
};

const titleCaseWords = (value: string) =>
	value
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b\w/g, letter => letter.toUpperCase());

export const formatSkill = (skill?: ChatRPGSkill | string) => {
	if (!skill) {
		return 'Skill';
	}

	return skillLabels[skill as ChatRPGSkill] ?? titleCaseWords(skill);
};

export const formatAttribute = (attribute?: ChatRPGAttribute | string) => {
	if (!attribute) {
		return 'Atributo';
	}

	return attributeLabels[attribute as ChatRPGAttribute] ?? titleCaseWords(attribute);
};

export const formatItemCategory = (category?: ChatRPGItemCategory | string) => {
	if (!category) {
		return 'Categoria';
	}

	return itemCategoryLabels[category as ChatRPGItemCategory] ?? titleCaseWords(category);
};

export const formatItemRarity = (rarity?: ChatRPGItemRarity | string) => {
	if (!rarity) {
		return 'Raridade';
	}

	return itemRarityLabels[rarity as ChatRPGItemRarity] ?? titleCaseWords(rarity);
};

export const formatItemStatus = (status?: ChatRPGItemStatus | string) => {
	if (!status) {
		return 'Status';
	}

	return itemStatusLabels[status as ChatRPGItemStatus] ?? titleCaseWords(status);
};

export const formatItemName = (item?: Pick<ChatRPGItem, 'name'>, itemId?: string) =>
	item?.name || (itemId ? titleCaseWords(itemId) : 'Item desconhecido');

export const formatEffectName = (effect: string) =>
	effectLabels[effect as keyof ChatRPGBaitEffects] ?? titleCaseWords(effect);

export const formatEffectValue = (effect: string, value: number) => {
	const signedValue = value > 0 ? `+${value}` : `${value}`;

	if (/Chance|Reduction|Bonus/i.test(effect) && Math.abs(value) < 1) {
		const percentValue = `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
		return percentValue.replace('.0%', '%');
	}

	if (/Multiplier/i.test(effect)) {
		const delta = value - 1;
		if (delta === 0) {
			return 'sem alteracao';
		}

		const percentValue = `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
		return percentValue.replace('.0%', '%');
	}

	return signedValue;
};

export const formatErrorMessage = (message: string) => {
	if (errorMessageLabels[message]) {
		return errorMessageLabels[message];
	}

	const reasonMatch = message.match(/reason["']?\s*[:=]\s*["']?([a-z_]+)/i);
	if (reasonMatch?.[1] && reasonLabels[reasonMatch[1]]) {
		return reasonLabels[reasonMatch[1]];
	}

	return reasonLabels[message] ?? message;
};
