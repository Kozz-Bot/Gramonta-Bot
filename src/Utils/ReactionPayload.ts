const BIT_ZERO = '\u200B';
const BIT_ONE = '\u200C';
const PAYLOAD_MARKER = '\u2063';
const MAX_PAYLOAD_BYTES = 512;

export type ReactionAction = {
	action: string;
	data?: unknown;
};

export type ReactionActions = Record<string, ReactionAction | string>;

export type ReactionPayload = {
	version: 1;
	reactions: Record<string, ReactionAction>;
};

const normalizeEmoji = (emoji: string) => emoji.normalize('NFC').replace(/\uFE0F/g, '');

const normalizeAction = (action: ReactionAction | string): ReactionAction | undefined => {
	const value = typeof action === 'string' ? { action } : action;
	if (!value || typeof value.action !== 'string' || !/^[a-zA-Z0-9._:-]{1,96}$/.test(value.action)) {
		return undefined;
	}
	return value.data === undefined ? { action: value.action } : { action: value.action, data: value.data };
};

const validPayload = (value: unknown): value is ReactionPayload => {
	if (!value || typeof value !== 'object') return false;
	const payload = value as Partial<ReactionPayload>;
	if (payload.version !== 1 || !payload.reactions || typeof payload.reactions !== 'object') return false;
	return Object.entries(payload.reactions).every(([emoji, action]) =>
		Boolean(normalizeEmoji(emoji)) && Boolean(normalizeAction(action))
	);
};

const toBits = (bytes: Uint8Array) => [...bytes]
	.map(byte => byte.toString(2).padStart(8, '0'))
	.join('')
	.replace(/0/g, BIT_ZERO)
	.replace(/1/g, BIT_ONE);

const fromBits = (encoded: string): Uint8Array | undefined => {
	if (!encoded || encoded.length % 8 !== 0 || encoded.length > MAX_PAYLOAD_BYTES * 8) return undefined;
	const bytes = new Uint8Array(encoded.length / 8);
	for (let offset = 0; offset < encoded.length; offset += 8) {
		let value = 0;
		for (let bit = 0; bit < 8; bit += 1) {
			const character = encoded[offset + bit];
			if (character !== BIT_ZERO && character !== BIT_ONE) return undefined;
			value = (value << 1) | (character === BIT_ONE ? 1 : 0);
		}
		bytes[offset / 8] = value;
	}
	return bytes;
};

/** Appends an opaque, zero-width reaction map to a visible message body. */
export const appendReactionPayload = (body: string, reactions: ReactionActions): string => {
	const normalizedReactions = Object.fromEntries(
		Object.entries(reactions)
			.map(([emoji, action]) => [normalizeEmoji(emoji), normalizeAction(action)] as const)
			.filter((entry): entry is [string, ReactionAction] => Boolean(entry[0] && entry[1]))
	);
	if (Object.keys(normalizedReactions).length === 0) {
		throw new Error('A reaction payload needs at least one valid emoji/action pair');
	}

	const payload: ReactionPayload = { version: 1, reactions: normalizedReactions };
	const json = JSON.stringify(payload);
	const bytes = Buffer.from(json, 'utf8');
	if (bytes.byteLength > MAX_PAYLOAD_BYTES) {
		throw new Error(`Reaction payload exceeds the ${MAX_PAYLOAD_BYTES}-byte limit`);
	}
	return `${body}${PAYLOAD_MARKER}${toBits(bytes)}${PAYLOAD_MARKER}`;
};

/** Returns the reaction map only when it is a valid trailer on the message. */
export const readReactionPayload = (body: string): ReactionPayload | undefined => {
	if (!body.endsWith(PAYLOAD_MARKER)) return undefined;
	const start = body.lastIndexOf(PAYLOAD_MARKER, body.length - PAYLOAD_MARKER.length - 1);
	if (start < 0) return undefined;
	const bytes = fromBits(body.slice(start + PAYLOAD_MARKER.length, -PAYLOAD_MARKER.length));
	if (!bytes) return undefined;
	try {
		const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
		if (!validPayload(parsed)) return undefined;
		return {
			version: 1,
			reactions: Object.fromEntries(
				Object.entries(parsed.reactions).map(([emoji, action]) => [normalizeEmoji(emoji), normalizeAction(action)!])
			),
		};
	} catch {
		return undefined;
	}
};

export const reactionActionForEmoji = (payload: ReactionPayload, emoji: string) =>
	payload.reactions[normalizeEmoji(emoji)];
