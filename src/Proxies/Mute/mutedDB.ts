import { ContactPayload } from 'kozz-types';
import { useJsonDB } from 'src/Utils/StaticJsonDb';

export type MutedPerson = {
	id: string;
	mutes: {
		chat: string;
		reason: string;
		expiration: number;
		prettyExpiration: string;
		lastMessageSent: number;
	}[];
};

const mutedDb = useJsonDB<MutedPerson, 'muted'>(
	'muted',
	'./src/Proxies/Mute/muted.json'
);

export const isUserMutted = (contact: ContactPayload, chat: string) => {
	const userInDB = mutedDb.getEntityById(contact.id);
	if (!userInDB) return false;

	const mutedChat = userInDB.mutes.find(mute => mute.chat === chat);
	if (!mutedChat) return false;

	return mutedChat.expiration > new Date().getTime();
};

export const getMuteRegister = (contact: ContactPayload, chat: string) => {
	const userInDb = mutedDb.getEntityById(contact.id);
	if (!userInDb) return;

	const mutedChat = userInDb.mutes.find(mute => mute.chat === chat);
	if (!mutedChat) return;

	return mutedChat;
};

export const mutePerson = (
	contact: ContactPayload,
	chat: string,
	reason: string,
	timeInMs: number
) => {
	const alrearyMutted = isUserMutted(contact, chat);

	if (alrearyMutted) {
		throw 'User already mutted';
	}

	const expiration = new Date().getTime() + timeInMs;

	const oldMuttedUserData = mutedDb.getEntityById(contact.id);

	mutedDb.upsertEntity({
		id: contact.id,
		mutes: [
			...(oldMuttedUserData
				? oldMuttedUserData.mutes.filter(mute => mute.chat !== chat)
				: []),
			{
				chat,
				reason,
				expiration,
				prettyExpiration: new Date(expiration).toLocaleString('PT-BR'),
				lastMessageSent: 0,
			},
		],
	});
};

export const unmutePerson = (contact: ContactPayload, chat: string) => {
	const alrearyMutted = isUserMutted(contact, chat);

	if (!alrearyMutted) {
		throw 'User not mutted';
	}

	const oldMuttedUserData = mutedDb.getEntityById(contact.id);
	const oldMutes = oldMuttedUserData!.mutes;
	const expiration = 0;

	mutedDb.upsertEntity({
		id: contact.id,
		mutes: oldMutes.map(oldMute =>
			oldMute.chat === chat
				? {
						...oldMute,
						expiration,
				  }
				: oldMute
		),
	});
};

export const updateWhenMutedSendsMessage = (
	contact: ContactPayload,
	chat: string
) => {
	const alrearyMutted = isUserMutted(contact, chat);

	if (!alrearyMutted) {
		throw 'User not mutted';
	}

	const oldMuttedUserData = mutedDb.getEntityById(contact.id)!;

	const oldMutedRegister = oldMuttedUserData!.mutes.find(
		muteRegister => muteRegister.chat === chat
	)!;

	const newMutedRegister: MutedPerson['mutes'][number] = {
		...oldMutedRegister,
		lastMessageSent: new Date().getTime(),
	};

	mutedDb.upsertEntity({
		id: contact.id,
		mutes: [
			...(oldMuttedUserData
				? oldMuttedUserData.mutes.filter(mute => mute.chat !== chat)
				: []),
			newMutedRegister,
		],
	});
};
