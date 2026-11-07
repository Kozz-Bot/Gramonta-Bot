import {
	HUMAN_RECENT_MS,
	isAutoMessage,
	markAutoMessage,
	stripAutoMarker,
} from './identity';
import { setTimeout as sleep } from 'node:timers/promises';
import { AutoReply, replyFingerprint, validateAutoReply } from './reply';

export type Range = [number, number];
export type Settings = {
	version: 1;
	ownerIds: string[];
	enabled: boolean;
	groups: Array<{ id: string; name: string }>;
	cadence: Range;
	online: Range;
	offline: Range;
	mentionChance: number;
};
export const defaults = (): Settings => ({
	version: 1,
	ownerIds: [],
	enabled: false,
	groups: [],
	cadence: [45, 120],
	online: [300, 900],
	offline: [900, 2700],
	mentionChance: 35,
});
export const normalizeId = (id: string) => id.replace(/:\d+(?=@)/, '');
export const isSelfControl = (
	message: { fromHostAccount: boolean; chatId: string; boundaryName: string },
	ids: string[]
) =>
	message.boundaryName === 'kozz-zapo' &&
	message.fromHostAccount &&
	ids.includes(normalizeId(message.chatId));

export function validateSettings(value: unknown): asserts value is Settings {
	const s = value as Settings;
	if (
		!s ||
		s.version !== 1 ||
		typeof s.enabled !== 'boolean' ||
		!Array.isArray(s.ownerIds) ||
		!s.ownerIds.length ||
		s.ownerIds.some(
			id => typeof id !== 'string' || !/^\d+@(s\.whatsapp\.net|lid)$/.test(id)
		) ||
		!Array.isArray(s.groups) ||
		s.groups.length > 50 ||
		s.groups.some(
			g =>
				!/^\d+(?:-\d+)?@g\.us$/.test(g?.id) ||
				typeof g.name !== 'string' ||
				g.name.length > 300
		) ||
		new Set(s.groups.map(g => g.id)).size !== s.groups.length
	)
		throw new Error('Configuração inválida do AutoTramonta.');
	for (const [key, min, max] of [
		['cadence', 10, 3600],
		['online', 60, 10800],
		['offline', 60, 86400],
	] as const) {
		const range = s[key];
		if (
			!Array.isArray(range) ||
			range.length !== 2 ||
			range.some(n => !Number.isInteger(n) || n < min || n > max) ||
			range[0] > range[1]
		) {
			throw new Error(
				`${key}: use mínimo e máximo entre ${min} e ${max} segundos, nessa ordem.`
			);
		}
	}
	if (
		!Number.isInteger(s.mentionChance) ||
		s.mentionChance < 0 ||
		s.mentionChance > 100
	)
		throw new Error('Chance de menção: use um inteiro de 0 a 100.');
}

export type ChatLine = {
	id: string;
	author: string;
	text: string;
	timestamp: number;
	own?: boolean;
	quoteMessageId?: string;
	quotable?: boolean;
	mentioned?: boolean;
	respondingToMessageIds?: string[];
};
export type Incoming = ChatLine & { chatId: string; mentioned: boolean };
type GroupState = {
	phase: 'online' | 'offline';
	until: number;
	due: number;
	seq: number;
	evaluated: number;
	context: ChatLine[];
	seen: Set<string>;
	controller?: AbortController;
	lastError?: string;
	lastSent?: number;
	sent: number;
	humanUntil?: number;
	lastHumanAt?: number;
	recentReplies: ChatLine[];
	answeredIds: Set<string>;
};
export type GenerateInput = {
	chatId: string;
	context: ChatLine[];
	newMessageIds: string[];
	recentReplies?: ChatLine[];
	answeredMessageIds?: string[];
};
type Dependencies = {
	now?: () => number;
	random?: () => number;
	persist: (settings: Settings) => void;
	ready: () => boolean;
	allowed: (chatId: string) => boolean;
	generate: (input: GenerateInput, signal: AbortSignal) => Promise<AutoReply>;
	send: (chatId: string, text: string, quoteMessageId?: string) => void;
	wait?: (ms: number, signal: AbortSignal) => Promise<void>;
};

export class AutoTramontaEngine {
	private settings: Settings;
	private states = new Map<string, GroupState>();
	private generation = 0;
	private ticking = false;
	private readonly startedAt: number;
	private readonly now: () => number;
	private readonly random: () => number;
	constructor(
		settings: Settings,
		private readonly deps: Dependencies
	) {
		validateSettings(settings);
		this.settings = structuredClone(settings);
		this.now = deps.now || Date.now;
		this.random = deps.random || Math.random;
		this.startedAt = this.now();
		this.reset();
	}
	get config() {
		return structuredClone(this.settings);
	}
	private duration(range: Range) {
		return (range[0] + this.random() * (range[1] - range[0])) * 1000;
	}
	private reset() {
		this.generation++;
		for (const state of this.states.values()) state.controller?.abort();
		this.states.clear();
		if (!this.settings.enabled) return;
		for (const group of this.settings.groups)
			this.states.set(group.id, {
				phase: 'online',
				until: this.now() + this.duration(this.settings.online),
				due: this.now() + this.duration(this.settings.cadence),
				seq: 0,
				evaluated: 0,
				context: [],
				seen: new Set(),
				sent: 0,
				recentReplies: [],
				answeredIds: new Set(),
			});
	}
	configure(
		patch: Partial<
			Pick<
				Settings,
				'enabled' | 'groups' | 'cadence' | 'online' | 'offline' | 'mentionChance'
			>
		>
	) {
		const next = { ...this.config, ...patch };
		validateSettings(next);
		if (next.enabled && !next.groups.length)
			throw new Error('Escolha pelo menos um grupo antes de iniciar.');
		// Persist first: a failed write must not leave a different live configuration.
		this.deps.persist(next);
		const wasEnabled = this.settings.enabled;
		this.settings = structuredClone(next);
		if (!wasEnabled || !next.enabled) {
			this.reset();
			return;
		}
		this.generation++;
		for (const state of this.states.values()) state.controller?.abort();
		const previous = this.states;
		this.states = new Map();
		for (const group of next.groups) {
			const old = previous.get(group.id);
			const state: GroupState = old
				? {
						...old,
						controller: undefined,
						context: [...old.context],
						seen: new Set(old.seen),
						recentReplies: [...old.recentReplies],
						answeredIds: new Set(old.answeredIds),
					}
				: {
						phase: 'online',
						until: this.now() + this.duration(next.online),
						due: this.now() + this.duration(next.cadence),
						seq: 0,
						evaluated: 0,
						context: [],
						seen: new Set(),
						sent: 0,
						recentReplies: [],
						answeredIds: new Set(),
					};
			if (patch.cadence) state.due = this.now() + this.duration(next.cadence);
			if (patch[state.phase])
				state.until = this.now() + this.duration(next[state.phase]);
			this.states.set(group.id, state);
		}
	}
	status() {
		return this.settings.groups.map(group => {
			const state = this.states.get(group.id);
			return {
				...group,
				phase: state?.phase || 'parado',
				until: state?.until,
				pending: state ? state.seq - state.evaluated : 0,
				sent: state?.sent || 0,
				lastSent: state?.lastSent,
				lastError: state?.lastError,
				humanPaused: Boolean(state?.humanUntil && this.now() < state.humanUntil),
			};
		});
	}
	private advance(state: GroupState) {
		if (state.humanUntil && this.now() < state.humanUntil) {
			state.until = Math.max(state.until, state.humanUntil);
			return;
		}
		if (this.now() < state.until) return;
		state.phase = state.phase === 'online' ? 'offline' : 'online';
		state.humanUntil = undefined;
		state.until = this.now() + this.duration(this.settings[state.phase]);
		state.due = this.now() + this.duration(this.settings.cadence);
	}
	ingest(message: Incoming) {
		if (
			!this.settings.enabled ||
			!Number.isFinite(message.timestamp) ||
			message.timestamp > this.now() + 5000 ||
			message.timestamp < this.now() - HUMAN_RECENT_MS ||
			!message.text.trim()
		)
			return;
		const state = this.states.get(message.chatId);
		if (!state || state.seen.has(message.id)) return;
		if (message.own && isAutoMessage(message.text)) return;
		if (
			!message.own &&
			(message.timestamp < this.startedAt - 5000 ||
				/^[!./]/.test(message.text.trim()) ||
				!this.deps.allowed(message.chatId))
		)
			return;
		if (
			message.own &&
			state.lastHumanAt !== undefined &&
			message.timestamp < state.lastHumanAt
		)
			return;
		this.advance(state);
		state.seen.add(message.id);
		if (state.seen.size > 2000) state.seen.delete(state.seen.values().next().value!);
		state.context.push({
			...message,
			text: stripAutoMarker(message.text).slice(0, 1000),
		});
		state.context = state.context.slice(-40);
		if (message.own) {
			state.controller?.abort();
			state.phase = 'offline';
			state.lastHumanAt = message.timestamp;
			state.humanUntil = Math.max(
				this.now() + this.duration(this.settings.offline),
				message.timestamp + HUMAN_RECENT_MS
			);
			state.until = state.humanUntil;
			state.due = state.until + this.duration(this.settings.cadence);
			state.evaluated = state.seq; // Drop the conversation the human just took over.
			state.lastError = undefined;
			return;
		}
		state.seq++;
		if (
			state.phase === 'offline' &&
			!state.humanUntil &&
			message.mentioned &&
			this.random() < this.settings.mentionChance / 100
		) {
			state.phase = 'online';
			state.until = this.now() + this.duration(this.settings.online);
			state.due = this.now() + this.duration(this.settings.cadence);
		}
	}
	async tick() {
		if (this.ticking || !this.settings.enabled) return;
		this.ticking = true;
		try {
			for (const [chatId, state] of this.states) {
				if (!this.settings.enabled || this.states.get(chatId) !== state) continue;
				this.advance(state);
				if (
					state.phase !== 'online' ||
					state.seq <= state.evaluated ||
					this.now() < state.due ||
					!this.deps.ready() ||
					!this.deps.allowed(chatId)
				)
					continue;
				const version = this.generation;
				const snapshot = state.seq;
				const context = state.context.map(line => ({ ...line }));
				const newMessageIds = context
					.filter(line => !line.own)
					.slice(-(snapshot - state.evaluated))
					.map(line => line.id);
				const controller = new AbortController();
				state.controller = controller;
				try {
					const plan = validateAutoReply(
						await this.deps.generate(
							{
								chatId,
								context,
								newMessageIds,
								recentReplies: state.recentReplies.map(line => ({ ...line })),
								answeredMessageIds: [...state.answeredIds],
							},
							controller.signal
						)
					);
					if (version !== this.generation || controller.signal.aborted) continue;
					const targets =
						plan.respondingToMessageIds ??
						(plan.messages.some(p => p.quoteMessageId)
							? plan.messages.flatMap(p =>
									p.quoteMessageId ? [p.quoteMessageId] : []
								)
							: newMessageIds);
					const invalidTarget =
						plan.messages.length &&
						(!targets.length ||
							targets.some(
								id => !newMessageIds.includes(id) || state.answeredIds.has(id)
							));
					const oldQuote = plan.messages.some(
						p => p.quoteMessageId && state.answeredIds.has(p.quoteMessageId)
					);
					const repeated = plan.messages.some(part => {
						const key = replyFingerprint(part.text);
						return (
							key.length >= 12 &&
							state.recentReplies.some(
								previous =>
									this.now() - previous.timestamp < 3_600_000 &&
									replyFingerprint(previous.text) === key
							)
						);
					});
					if (invalidTarget || oldQuote || repeated) {
						state.evaluated = snapshot;
						continue; // Stale/duplicate model output is silence, never a retry loop.
					}
					for (const [index, part] of plan.messages.entries()) {
						if (index) {
							const delay = 1200 + this.random() * 2300;
							if (this.deps.wait) await this.deps.wait(delay, controller.signal);
							else await sleep(delay, undefined, { signal: controller.signal });
						}
						if (
							version !== this.generation ||
							controller.signal.aborted ||
							this.states.get(chatId) !== state
						)
							break;
						this.advance(state);
						if (
							state.phase !== 'online' ||
							!this.deps.ready() ||
							!this.deps.allowed(chatId)
						)
							break;
						this.deps.send(chatId, markAutoMessage(part.text), part.quoteMessageId);
						const sentLine: ChatLine = {
							id: `auto-${snapshot}-${index}`,
							author: 'Tramonta (automático)',
							text: part.text,
							timestamp: this.now(),
							own: true,
							quotable: false,
							quoteMessageId: part.quoteMessageId,
							respondingToMessageIds: targets,
						};
						state.context.push(sentLine);
						state.recentReplies.push(sentLine);
						state.recentReplies = state.recentReplies.slice(-12);
						for (const id of targets) state.answeredIds.add(id);
						if (part.quoteMessageId) state.answeredIds.add(part.quoteMessageId);
						while (state.answeredIds.size > 1000)
							state.answeredIds.delete(state.answeredIds.values().next().value!);
						state.context = state.context.slice(-40);
						state.lastSent = this.now();
						state.sent++;
						// Each dispatch consumes preceding activity, including messages
						// arriving between parts. Never resend a partial burst on retry.
						state.evaluated = state.seq;
					}
					if (!plan.messages.length) state.evaluated = snapshot;
					state.lastError = undefined;
				} catch {
					if (!controller.signal.aborted)
						state.lastError =
							'Falha ao gerar ou enviar; nova tentativa na próxima cadência.';
				} finally {
					state.controller = undefined;
					state.due = this.now() + this.duration(this.settings.cadence);
				}
			}
		} finally {
			this.ticking = false;
		}
	}
}
