import type { ChatLine, GenerateInput } from './engine';
import type { AutoReply } from './reply';
import { replyFingerprint } from './reply';

const ownerName = /\btramonta\b/i;
const closesConversation = (text: string) =>
	isAcknowledgement(text) ||
	/^(?:beleza|blz|fechou|combinado|valeu|obrigad[oa]|ate (?:mais|amanha)|depois a gente se fala|te mando|mando (?:cedo|amanha))\b/.test(
		replyFingerprint(text)
	);
// The same token language as the former nested-repetition regex, evaluated
// without backtracking. Laughter followed by ordinary text must stay linear.
const acknowledgementTokens = [
	'k',
	'ha',
	'he',
	'rs',
	'sim',
	's',
	'ok',
	'okay',
	'blz',
	'beleza',
	'boa',
	'valeu',
	'vlw',
	'obg',
	'obrigado',
	'obrigada',
	'fechou',
	'show',
	'top',
	'aham',
	'uhum',
	'exato',
	'entendi',
	'isso',
	'ai',
	'ne',
];
const acknowledgementsByFirst = new Map<string, string[]>();
for (const token of acknowledgementTokens) {
	const first = token[0];
	acknowledgementsByFirst.set(first, [
		...(acknowledgementsByFirst.get(first) || []),
		token,
	]);
}
export const isAcknowledgement = (text: string) => {
	if (text.includes('?')) return false;
	const key = replyFingerprint(text.replace(/@\d+/g, ''));
	const reachable = new Uint8Array(key.length + 1);
	reachable[0] = 1;
	for (let index = 0; index < key.length; index++) {
		if (!reachable[index]) continue;
		if (key[index] === ' ') {
			reachable[index + 1] = 1;
			continue;
		}
		for (const token of acknowledgementsByFirst.get(key[index]) || []) {
			if (key.startsWith(token, index)) reachable[index + token.length] = 1;
		}
	}
	return reachable[key.length] === 1;
};

const identityQuestion = (text: string) => {
	const key = replyFingerprint(text);
	return (
		/\b(?:vc|voce|isso) (?:e|eh) (?:um |uma )?(?:bot|robo|ia)\b/.test(key) ||
		/\be o tramonta\b.*\b(?:digitando|mesmo|bot)\b/.test(key) ||
		/^(?:e |eh )?(?:bot|robo|ia)(?: ou| mesmo|$)/.test(key) ||
		/\b(?:quem|tem alguem)\b.*\b(?:digitando|respondendo)\b/.test(key)
	);
};
const personalQuestion = (text: string) => {
	const key = replyFingerprint(text);
	return (
		/\b(?:que horas|quando|onde)\b.*\b(?:vc|voce|tu|tramonta)\b.*\b(?:chega|chegar|vai|vem|ta|esta|mora|trabalha|sai|volta)\b/.test(
			key
		) ||
		/\b(?:vc|voce|tu|tramonta)\b.*\b(?:ja pagou|ja mandou|ja chegou|vai chegar|vai estar|vai vir|vai ao|vai no|ta onde|esta onde|mora onde)\b/.test(
			key
		)
	);
};
export const isAddressedToOwner = (line: ChatLine, input: GenerateInput) => {
	if (line.mentioned || ownerName.test(line.text)) return true;
	if (
		line.quoteMessageId &&
		input.context.some(
			previous => previous.id === line.quoteMessageId && previous.own
		)
	)
		return true;
	// A new question from someone we just answered is a continuation, unless
	// it explicitly addresses another participant by name.
	if (!line.text.includes('?')) return false;
	const key = replyFingerprint(line.text);
	const namedOther = input.context.some(
		other =>
			!other.own &&
			other.author !== line.author &&
			other.author &&
			key.startsWith(`${replyFingerprint(other.author).split(' ')[0]} `)
	);
	if (namedOther) return false;
	return (input.recentReplies || []).some(previous =>
		(previous.respondingToMessageIds || []).some(id =>
			input.context.some(peer => peer.id === id && peer.author === line.author)
		)
	);
};

export const chooseParticipation = (
	input: GenerateInput
): {
	kind: 'skip' | 'identity' | 'personal' | 'generate';
	candidates: ChatLine[];
} => {
	const fresh = input.context.filter(
		line => !line.own && input.newMessageIds.includes(line.id)
	);
	const candidates = fresh.filter(line => !isAcknowledgement(line.text));
	if (!candidates.length) return { kind: 'skip', candidates };
	const identity = candidates.find(line => identityQuestion(line.text));
	if (identity) return { kind: 'identity', candidates: [identity] };
	const personal = candidates.find(line => personalQuestion(line.text));
	if (personal) return { kind: 'personal', candidates: [personal] };
	if (
		fresh.length > 1 &&
		closesConversation(fresh[fresh.length - 1].text) &&
		!fresh.some(line => isAddressedToOwner(line, input))
	)
		return { kind: 'skip', candidates };
	const latest = Math.max(...candidates.map(line => line.timestamp));
	const recentlySpoke = (input.recentReplies || []).some(
		line => latest - line.timestamp >= 0 && latest - line.timestamp < 180_000
	);
	if (recentlySpoke && !candidates.some(line => isAddressedToOwner(line, input)))
		return { kind: 'skip', candidates };
	return { kind: 'generate', candidates };
};

export const naturalizeReply = (
	reply: AutoReply,
	input: GenerateInput
): AutoReply => {
	// The automation cannot assert the owner's real-world presence or actions.
	if (
		reply.messages.some(part =>
			/\b(?:eu )?(?:nao )?(?:to|estou) (?:em reuniao|no trabalho|no bar|em casa|a caminho|no uber|na rua|indo|saindo|chegando|trabalhando)\b|\b(?:vou (?:chegar|passar|mandar|pagar|buscar|estar|levar|ligar|enviar)|ja (?:paguei|mandei|cheguei|enviei|fiz o pix))\b/.test(
				replyFingerprint(part.text)
			)
		)
	)
		return { messages: [] };
	const targets = input.context.filter(line =>
		reply.respondingToMessageIds?.includes(line.id)
	);
	if (
		reply.messages.length &&
		reply.messages.every(part => isAcknowledgement(part.text)) &&
		!targets.some(line => isAddressedToOwner(line, input))
	)
		return { messages: [] };
	const latestPeer = [...input.context].reverse().find(line => !line.own);
	const quoted = new Set<string>();
	return {
		...reply,
		messages: reply.messages.map((part, index) => {
			const quote = part.quoteMessageId;
			if (!quote || index > 0 || quote === latestPeer?.id || quoted.has(quote))
				return { text: part.text };
			quoted.add(quote);
			return part;
		}),
	};
};
