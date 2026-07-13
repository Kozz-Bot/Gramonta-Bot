import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export type ChatRPGUserRole = 'master' | 'player';
export type ChatRPGItemCategory =
	| 'equipment'
	| 'consumable'
	| 'material'
	| 'treasure';
export type ChatRPGItemRarity =
	| 'common'
	| 'uncommon'
	| 'rare'
	| 'epic'
	| 'legendary';
export type ChatRPGItemStatus = 'active' | 'deprecated' | 'disabled';
export type ChatRPGSkill =
	| 'fishing'
	| 'woodcutting'
	| 'mining'
	| 'farming'
	| 'cooking'
	| 'smithing'
	| 'crafting'
	| 'archaeology'
	| 'melee'
	| 'ranged'
	| 'magic'
	| 'runemaking'
	| 'alchemy'
	| 'potionbrewing';
export type ChatRPGAttribute =
	| 'strength'
	| 'vitality'
	| 'dexterity'
	| 'intelligence'
	| 'luck';

export type ChatRPGBaitEffects = {
	treasureChanceBonus?: number;
	junkChanceReduction?: number;
	fishWeightMultiplier?: number;
	qualityLevelBonus?: number;
	rareFishWeightBonus?: number;
	xpMultiplier?: number;
};

export type ChatRPGUser = {
	id: number;
	username: string;
	role: ChatRPGUserRole;
	createdAt?: string;
	updatedAt?: string;
};

export type ChatRPGAuthResponse = {
	token: string;
	tokenType: 'Bearer';
	expiresAt: null;
	user: ChatRPGUser;
};

export type ChatRPGItem = {
	id: string;
	name: string;
	description: string;
	category: ChatRPGItemCategory;
	type: string;
	rarity: ChatRPGItemRarity;
	stackable: boolean;
	maxStack: number | null;
	baseValue: number;
	metadata: unknown;
	status: ChatRPGItemStatus;
	createdAt?: string;
	updatedAt?: string;
};

export type ChatRPGInventoryItem = {
	id: number;
	slotNumber?: number;
	userId: number;
	itemId: string;
	quantity: number;
	metadata: unknown;
	createdAt?: string;
	updatedAt?: string;
	item?: ChatRPGItem;
};

export type ChatRPGBank = {
	userId: number;
	gold: number;
	createdAt?: string;
	updatedAt?: string;
};

export type ChatRPGBankItem = ChatRPGInventoryItem;

export type ChatRPGGuild = {
	id: number;
	name: string;
	description: string;
	createdAt?: string;
	updatedAt?: string;
};

export type ChatRPGGuildMembership = {
	id: number;
	userId: number;
	guildId: number;
	role: string;
	joinedAt: string;
	createdAt?: string;
	updatedAt?: string;
	guild?: ChatRPGGuild;
	user?: ChatRPGUser;
};

export type ChatRPGProgression = {
	skills: ChatRPGProgressionEntry[];
	attributes: ChatRPGProgressionEntry[];
	attributePoints: {
		userId: number;
		availablePoints: number;
		totalEarned: number;
		totalSpent: number;
		createdAt?: string;
		updatedAt?: string;
	};
	levelRequirements?: unknown[];
};

export type ChatRPGProgressionEntry = {
	id?: number;
	userId?: number;
	attribute?: ChatRPGAttribute;
	skill?: ChatRPGSkill;
	xp: number;
	level: number;
	xpForCurrentLevel?: number;
	xpForNextLevel?: number | null;
	xpRemainingToNextLevel: number | null;
	createdAt?: string;
	updatedAt?: string;
};

export type ChatRPGQuantityPayload = {
	quantity?: number;
};

export type ChatRPGCreateUserPayload = {
	username: string;
	password: string;
	role?: ChatRPGUserRole;
};

export type ChatRPGUpdateUserPayload = Partial<ChatRPGCreateUserPayload>;

export type ChatRPGCreateItemPayload = {
	id: string;
	name: string;
	description?: string;
	category: ChatRPGItemCategory;
	type: string;
	rarity?: ChatRPGItemRarity;
	stackable?: boolean;
	maxStack?: number | null;
	baseValue?: number;
	metadata?: unknown;
	status?: ChatRPGItemStatus;
};

export type ChatRPGUpdateItemPayload = Partial<
	Omit<ChatRPGCreateItemPayload, 'id'>
>;

export type ChatRPGFishingActionPayload = {
	baitItemId?: string;
	baitName?: string;
};

export type ChatRPGFishingActionResponse = {
	actor: string;
	actingAsPlayerId: number;
	action: 'fish';
	status: 'accepted';
	outcome: 'caught' | 'no_catch';
	bait: {
		itemId: string;
		name: string;
		effects: ChatRPGBaitEffects;
		consumed: number;
		gained: number;
	};
	category: 'fish' | 'junk' | 'treasure';
	item: null | {
		id: string;
		name: string;
		targetLevel: number;
		baseXp: number;
		xpGained: number;
		baseSellValue: number;
		sellValue: number;
		baseWeight: number;
		effectiveWeight: number;
	};
	quality: null | {
		value: 'poor' | 'common' | 'good' | 'excellent' | 'perfect' | 'legendary';
		label: string;
		xpMultiplier: number;
		sellMultiplier: number;
	};
	fishWeight: null | {
		value: number;
		unit: 'kg';
		multiplier: number;
	};
	randomEvent:
		| {
				occurred: false;
				event: null;
		  }
		| {
				occurred: true;
				event: {
					id: string;
					name: string;
					type: 'good' | 'bad';
					effect: string;
					baseChance: number;
					luckScaling: number;
					effectiveChance: number;
					rollProbability: number;
					effectApplied: boolean;
				};
		  };
	actionModifiers: unknown;
	inventory:
		| {
				added: true;
				itemId: string;
				quantity: number;
				occupiedSlots: number;
				maxSlots: number;
		  }
		| {
				added: false;
				reason: 'inventory_full' | 'no_catch';
				itemId: string | null;
				quantity: number;
				occupiedSlots: number | null;
				maxSlots: number | null;
		  };
	resultModifiers: {
		fishingLevel: number;
		dexterityLevel: number;
		luckLevel: number;
		categoryProbabilities: {
			fish: number;
			junk: number;
			treasure: number;
		};
		randomEventProbabilities: ChatRPGFishingProbabilitiesResponse['probabilities']['randomEvents'];
		curveWidth: number;
	};
	progression: unknown;
};

export type ChatRPGFishingProbabilitiesResponse = {
	actor: string;
	actingAsPlayerId: number;
	action: 'fish';
	probabilities: {
		levels: {
			fishingLevel: number;
			dexterityLevel: number;
			luckLevel: number;
		};
		activeModifiers: unknown[];
		bait: null | {
			itemId: string;
			name: string;
			effects: ChatRPGBaitEffects;
		};
		categoryProbabilities: {
			fish: number;
			junk: number;
			treasure: number;
		};
		drops: {
			fish: ChatRPGFishingDropProbability[];
			treasure: ChatRPGFishingDropProbability[];
			junk: ChatRPGFishingDropProbability[];
		};
		fishQualities: Array<{
			quality: string;
			label: string;
			probability: number;
		}>;
		randomEvents: {
			none: number;
			events: Array<{
				event: {
					id: string;
					name: string;
					effect: string;
				};
				rollProbability: number;
				effectApplied: boolean;
			}>;
		};
	};
};

export type ChatRPGBaitShopItem = {
	id: string;
	name: string;
	description: string;
	buyPrice: number;
	effects: ChatRPGBaitEffects;
};

export type ChatRPGFishingDropProbability = {
	itemId: string;
	name: string;
	category: 'fish' | 'junk' | 'treasure';
	targetLevel: number;
	baseWeight: number;
	effectiveWeight: number;
	probabilityWithinCategory: number;
	probabilityPerFishingAttempt: number;
};

const normalizeBaseURL = (baseURL: string) =>
	baseURL.endsWith('/') ? baseURL : `${baseURL}/`;

class ChatRPGApi {
	private API: AxiosInstance;
	private token: string | null;

	constructor() {
		this.token = process.env.CHAT_RPG_TOKEN || null;
		this.API = axios.create({
			baseURL: normalizeBaseURL(
				process.env.CHAT_RPG_BASE_URL || 'https://gramont.digital/rpg'
			),
		});
	}

	setToken(token: string) {
		this.token = token;
	}

	async login(
		username = process.env.CHAT_RPG_USERNAME || 'kozz-bot',
		password = process.env.CHAT_RPG_PASSWORD || process.env.MASTER_PASSWORD || ''
	) {
		const { data } = await this.API.post<ChatRPGAuthResponse>('auth/login', {
			username,
			password,
		});

		this.setToken(data.token);
		return data;
	}

	async signup(username: string, password: string) {
		const { data } = await this.API.post<ChatRPGAuthResponse>('auth/signup', {
			username,
			password,
		});

		return data;
	}

	async health() {
		const { data } = await this.API.get<{ ok: true }>('health');
		return data;
	}

	async listUsers() {
		return this.authenticatedRequest<{ users: ChatRPGUser[] }>({
			method: 'GET',
			url: 'admin/users',
		});
	}

	async createUser(payload: ChatRPGCreateUserPayload) {
		return this.authenticatedRequest<{ user: ChatRPGUser }>({
			method: 'POST',
			url: 'admin/users',
			data: payload,
		});
	}

	async getUser(userId: number) {
		return this.authenticatedRequest<{
			user: ChatRPGUser;
			progression: ChatRPGProgression;
			inventory: ChatRPGInventoryItem[];
			bank: ChatRPGBank;
			guilds: ChatRPGGuildMembership[];
		}>({
			method: 'GET',
			url: `admin/users/${userId}`,
		});
	}

	async updateUser(userId: number, payload: ChatRPGUpdateUserPayload) {
		return this.authenticatedRequest<{ user: ChatRPGUser }>({
			method: 'PATCH',
			url: `admin/users/${userId}`,
			data: payload,
		});
	}

	async deleteUser(userId: number) {
		await this.authenticatedRequest<void>({
			method: 'DELETE',
			url: `admin/users/${userId}`,
		});
	}

	async getUserProgression(userId: number) {
		return this.authenticatedRequest<{ progression: ChatRPGProgression }>({
			method: 'GET',
			url: `admin/users/${userId}/progression`,
		});
	}

	async grantSkillXp(userId: number, skill: ChatRPGSkill, xp: number) {
		return this.authenticatedRequest<{
			skill: ChatRPGSkill;
			grant: unknown;
			progression: ChatRPGProgression;
		}>({
			method: 'POST',
			url: `admin/users/${userId}/progression/skills/${skill}/xp`,
			data: { xp },
		});
	}

	async spendAttributePoints(
		userId: number,
		attribute: ChatRPGAttribute,
		levels = 1
	) {
		return this.authenticatedRequest<{
			attribute: ChatRPGAttribute;
			spend: unknown;
			progression: ChatRPGProgression;
		}>({
			method: 'POST',
			url: `admin/users/${userId}/progression/attributes/${attribute}/points`,
			data: { levels },
		});
	}

	async listItems() {
		return this.authenticatedRequest<{ items: ChatRPGItem[] }>({
			method: 'GET',
			url: 'admin/items',
		});
	}

	async createItem(payload: ChatRPGCreateItemPayload) {
		return this.authenticatedRequest<{ item: ChatRPGItem }>({
			method: 'POST',
			url: 'admin/items',
			data: payload,
		});
	}

	async getItem(itemId: string) {
		return this.authenticatedRequest<{ item: ChatRPGItem }>({
			method: 'GET',
			url: `admin/items/${encodeURIComponent(itemId)}`,
		});
	}

	async updateItem(itemId: string, payload: ChatRPGUpdateItemPayload) {
		return this.authenticatedRequest<{ item: ChatRPGItem }>({
			method: 'PATCH',
			url: `admin/items/${encodeURIComponent(itemId)}`,
			data: payload,
		});
	}

	async disableItem(itemId: string) {
		return this.authenticatedRequest<{ item: ChatRPGItem }>({
			method: 'DELETE',
			url: `admin/items/${encodeURIComponent(itemId)}`,
		});
	}

	async addItemToInventory(
		userId: number,
		itemId: string,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.authenticatedRequest<{
			added: boolean;
			inventory: ChatRPGInventoryItem[];
			[key: string]: unknown;
		}>({
			method: 'POST',
			url: `admin/users/${userId}/inventory/items/${encodeURIComponent(itemId)}`,
			data: payload,
		});
	}

	addItemToUserInventory(
		userId: number,
		itemId: string,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.addItemToInventory(userId, itemId, payload);
	}

	async removeItemFromInventory(
		userId: number,
		itemId: string,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.authenticatedRequest<{
			removed: boolean;
			inventory?: ChatRPGInventoryItem[];
			[key: string]: unknown;
		}>({
			method: 'DELETE',
			url: `admin/users/${userId}/inventory/items/${encodeURIComponent(itemId)}`,
			data: payload,
		});
	}

	removeItemFromUserInventory(
		userId: number,
		itemId: string,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.removeItemFromInventory(userId, itemId, payload);
	}

	async sellInventorySlot(
		userId: number,
		inventorySlotId: number,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.authenticatedRequest<{
			sold: boolean;
			userId?: number;
			inventorySlotId?: number;
			itemId?: string;
			quantity?: number;
			unitValue?: number;
			inventory?: ChatRPGInventoryItem[];
			bank?: ChatRPGBank;
			goldGained?: number;
			[key: string]: unknown;
		}>({
			method: 'POST',
			url: `admin/users/${userId}/shop/sell/inventory-slots/${inventorySlotId}`,
			data: payload,
		});
	}

	async listBaits() {
		return this.authenticatedRequest<{ baits: ChatRPGBaitShopItem[] }>({
			method: 'GET',
			url: 'admin/shop/baits',
		});
	}

	listBaitShop() {
		return this.listBaits();
	}

	async buyBait(
		userId: number,
		itemId: string,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.authenticatedRequest<{
			inventory: ChatRPGInventoryItem[];
			bank?: ChatRPGBank;
			bought?: boolean;
			userId?: number;
			itemId?: string;
			quantity?: number;
			unitPrice?: number;
			goldSpent?: number;
			[key: string]: unknown;
		}>({
			method: 'POST',
			url: `admin/users/${userId}/shop/buy/baits/${encodeURIComponent(itemId)}`,
			data: payload,
		});
	}

	buyBaitFromShop(
		userId: number,
		itemId: string,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.buyBait(userId, itemId, payload);
	}

	async getBank(userId: number) {
		return this.authenticatedRequest<{
			bank: ChatRPGBank;
			items: ChatRPGBankItem[];
		}>({
			method: 'GET',
			url: `admin/users/${userId}/bank`,
		});
	}

	getUserBank(userId: number) {
		return this.getBank(userId);
	}

	async depositInventorySlotToBank(
		userId: number,
		inventorySlotId: number,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.authenticatedRequest<{
			deposited: boolean;
			bank?: ChatRPGBank;
			bankItems?: ChatRPGBankItem[];
			inventory?: ChatRPGInventoryItem[];
			[key: string]: unknown;
		}>({
			method: 'POST',
			url: `admin/users/${userId}/bank/deposits/inventory-slots/${inventorySlotId}`,
			data: payload,
		});
	}

	async withdrawBankSlotToInventory(
		userId: number,
		bankSlotId: number,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.authenticatedRequest<{
			withdrawn: boolean;
			bank?: ChatRPGBank;
			bankItems?: ChatRPGBankItem[];
			inventory?: ChatRPGInventoryItem[];
			[key: string]: unknown;
		}>({
			method: 'POST',
			url: `admin/users/${userId}/bank/withdrawals/bank-slots/${bankSlotId}`,
			data: payload,
		});
	}

	async addItemToBank(
		userId: number,
		itemId: string,
		payload: ChatRPGQuantityPayload = {}
	) {
		return this.authenticatedRequest<{
			bank: ChatRPGBank;
			items: ChatRPGBankItem[];
		}>({
			method: 'POST',
			url: `admin/users/${userId}/bank/items/${encodeURIComponent(itemId)}`,
			data: payload,
		});
	}

	async listGuilds() {
		return this.authenticatedRequest<{ guilds: ChatRPGGuild[] }>({
			method: 'GET',
			url: 'admin/guilds',
		});
	}

	async createGuild(name: string, description = '') {
		return this.authenticatedRequest<{ guild: ChatRPGGuild }>({
			method: 'POST',
			url: 'admin/guilds',
			data: { name, description },
		});
	}

	async listGuildMembers(guildId: number) {
		return this.authenticatedRequest<{ members: ChatRPGGuildMembership[] }>({
			method: 'GET',
			url: `admin/guilds/${guildId}/members`,
		});
	}

	async joinGuild(userId: number, guildId: number, role = 'member') {
		return this.authenticatedRequest<{
			membership: ChatRPGGuildMembership;
			guilds: ChatRPGGuildMembership[];
		}>({
			method: 'POST',
			url: `admin/users/${userId}/guilds/${guildId}`,
			data: { role },
		});
	}

	async leaveGuild(userId: number, guildId: number) {
		return this.authenticatedRequest<{
			removed: boolean;
			guilds?: ChatRPGGuildMembership[];
			reason?: string;
		}>({
			method: 'DELETE',
			url: `admin/users/${userId}/guilds/${guildId}`,
		});
	}

	async fish(playerId: number, payload: ChatRPGFishingActionPayload = {}) {
		return this.authenticatedRequest<ChatRPGFishingActionResponse>({
			method: 'POST',
			url: `players/${playerId}/actions/fish`,
			data: payload,
		});
	}

	async getFishingProbabilities(
		playerId: number,
		params: ChatRPGFishingActionPayload = {}
	) {
		return this.authenticatedRequest<ChatRPGFishingProbabilitiesResponse>({
			method: 'GET',
			url: `players/${playerId}/actions/fish/probabilities`,
			params,
		});
	}

	private async authenticatedRequest<T>(config: AxiosRequestConfig) {
		const token = await this.getToken();
		const { data } = await this.API.request<T>({
			...config,
			headers: {
				...config.headers,
				Authorization: `Bearer ${token}`,
			},
		});

		return data;
	}

	private async getToken() {
		if (this.token) {
			return this.token;
		}

		const password = process.env.CHAT_RPG_PASSWORD || process.env.MASTER_PASSWORD;
		if (!password) {
			throw new Error(
				'Missing ChatRPG auth. Set CHAT_RPG_TOKEN or CHAT_RPG_PASSWORD.'
			);
		}

		const auth = await this.login();
		return auth.token;
	}
}

export default new ChatRPGApi();
