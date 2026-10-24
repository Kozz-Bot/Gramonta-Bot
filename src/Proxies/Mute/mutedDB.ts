import { ContactPayload } from 'kozz-types';
import { useJsonDB } from 'src/Utils/StaticJsonDb';

export type MuteContact = Pick<ContactPayload, 'id'> & { aliases?: string[] };
export type MutedPerson = {
	id: string;
	aliases?: string[];
	mutes: {
		chat: string;
		boundaryName?: string;
		reason: string;
		expiration: number;
		prettyExpiration: string;
		lastMessageSent: number;
	}[];
};

const mutedDb = useJsonDB<MutedPerson, 'muted'>(
	'muted', './src/Proxies/Mute/muted.json'
);
const ids = (contact: MuteContact) => [contact.id, ...(contact.aliases ?? [])];
const findPeople = (contact: MuteContact) => mutedDb.getAllEntities().filter(
	person => ids(person).some(id => ids(contact).includes(id))
);

// Use the synchronous operations: upsertEntity yields before saving and can
// lose updates or let simultaneous messages reserve the same notification.
const savePerson = (person: MutedPerson) => {
	if (mutedDb.getEntityById(person.id)) mutedDb.updateEntity(person.id, person);
	else mutedDb.addEntity(person);
};

const consolidate = (contact: MuteContact): MutedPerson => {
	const people = findPeople(contact);
	const mutes = new Map<string, MutedPerson['mutes'][number]>();
	for (const person of people) {
		for (const mute of person.mutes) {
			const old = mutes.get(mute.chat);
			mutes.set(mute.chat, {
				...(old && old.expiration > mute.expiration ? old : mute),
				lastMessageSent: Math.max(old?.lastMessageSent ?? 0, mute.lastMessageSent),
			});
		}
	}
	const person = {
		id: people[0]?.id ?? contact.id,
		aliases: [...new Set([...ids(contact), ...people.flatMap(ids)])],
		mutes: [...mutes.values()],
	};
	savePerson(person);
	for (const duplicate of people.slice(1)) mutedDb.removeEntity(duplicate.id);
	return person;
};

export const getMuteRegister = (contact: MuteContact, chat: string) =>
	findPeople(contact).flatMap(person => person.mutes)
		.filter(mute => mute.chat === chat)
		.sort((a, b) => b.expiration - a.expiration)[0];

export const isUserMutted = (contact: MuteContact, chat: string) =>
	(getMuteRegister(contact, chat)?.expiration ?? 0) > Date.now();

export const hasActiveMuteInChat = (chat: string) => mutedDb.getAllEntities()
	.some(person => person.mutes.some(mute => mute.chat === chat && mute.expiration > Date.now()));

export const rememberMuteAliases = (contact: MuteContact) => {
	if (findPeople(contact).length) consolidate(contact);
};

const validateDuration = (duration: number, base: number) => {
	if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(new Date(base + duration).getTime())) {
		throw new Error('Informe um tempo válido, maior que zero, em minutos.');
	}
};

export const mutePerson = (contact: MuteContact, chat: string, reason: string, timeInMs: number, boundaryName?: string) => {
	validateDuration(timeInMs, Date.now());
	if (isUserMutted(contact, chat)) throw new Error('Este usuário já está silenciado neste grupo. Use !mutemais para aumentar o tempo.');
	const person = consolidate(contact);
	const previous = person.mutes.find(mute => mute.chat === chat);
	const expiration = Date.now() + timeInMs;
	const mute = {
		chat, boundaryName, reason, expiration,
		prettyExpiration: new Date(expiration).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
		lastMessageSent: previous?.lastMessageSent ?? 0,
	};
	savePerson({ ...person, mutes: [...person.mutes.filter(mute => mute.chat !== chat), mute] });
	return mute;
};

export const extendMute = (contact: MuteContact, chat: string, timeInMs: number, reason?: string, boundaryName?: string) => {
	const current = getMuteRegister(contact, chat);
	if (!current || current.expiration <= Date.now()) throw new Error('Este usuário não está silenciado neste grupo.');
	validateDuration(timeInMs, current.expiration);
	const person = consolidate(contact);
	const expiration = current.expiration + timeInMs;
	const mute = {
		...person.mutes.find(mute => mute.chat === chat)!, expiration, reason: reason || current.reason,
		boundaryName: boundaryName ?? current.boundaryName,
		prettyExpiration: new Date(expiration).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
	};
	savePerson({ ...person, mutes: person.mutes.map(old => old.chat === chat ? mute : old) });
	return mute;
};

export const unmutePerson = (contact: MuteContact, chat: string) => {
	if (!isUserMutted(contact, chat)) throw new Error('Este usuário não está silenciado neste grupo.');
	const person = consolidate(contact);
	// Keep the last notification time, including across revoke/reapply cycles.
	savePerson({ ...person, mutes: person.mutes.map(mute => mute.chat === chat ? { ...mute, expiration: 0 } : mute) });
};

export const claimMuteNotification = (contact: MuteContact, chat: string) => {
	if (!isUserMutted(contact, chat)) return false;
	const person = consolidate(contact);
	const mute = person.mutes.find(mute => mute.chat === chat)!;
	const now = Date.now();
	if (mute.lastMessageSent && now - mute.lastMessageSent < 60_000) return false;
	savePerson({ ...person, mutes: person.mutes.map(old => old.chat === chat ? { ...old, lastMessageSent: now } : old) });
	return true;
};

// One subscription per boundary/group, retained until its last mute expires.
export const getActiveMuteRoutes = () => {
	const routes = new Map<string, { boundary: string; chat: string; expiration: number }>();
	for (const person of mutedDb.getAllEntities()) {
		for (const mute of person.mutes) {
			if (!mute.boundaryName || mute.expiration <= Date.now()) continue;
			const key = JSON.stringify([mute.boundaryName, mute.chat]);
			const previous = routes.get(key);
			routes.set(key, {
				boundary: mute.boundaryName,
				chat: mute.chat,
				expiration: Math.max(previous?.expiration ?? 0, mute.expiration),
			});
		}
	}
	return [...routes.values()];
};
