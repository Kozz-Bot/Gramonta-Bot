import fs from 'node:fs';
import path from 'node:path';

export type BotBan = {
	id: string;
	aliases: string[];
	reason: string;
	bannedAt: number;
};

// Numbers must include country code. Never treat the digits of a LID as a phone.
export const normalizeBanId = (value: string) => {
	const input = value.trim();
	if (/^\d{5,20}(?::\d+)?@lid$/.test(input)) return input.replace(/:\d+@/, '@');
	if (/^\d{7,15}(?::\d+)?@s\.whatsapp\.net$/.test(input))
		return input.replace(/:\d+@/, '@');
	if (/^\+?[\d\s().-]+$/.test(input)) {
		const digits = input.replace(/\D/g, '');
		if (/^\d{7,15}$/.test(digits)) return `${digits}@s.whatsapp.net`;
	}
	throw new Error('Informe um número com código do país e DDD, ou um JID válido.');
};

export const createBanStore = (file = './.runtime/access/bans.json') => {
	const list = (): BotBan[] => {
		try {
			return JSON.parse(fs.readFileSync(file, 'utf8')).bans;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
			throw error;
		}
	};
	const save = (bans: BotBan[]) => {
		fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
		fs.writeFileSync(`${file}.tmp`, JSON.stringify({ bans }, null, 2) + '\n', {
			mode: 0o600,
		});
		fs.renameSync(`${file}.tmp`, file);
	};
	const matches = (ban: BotBan, ids: string[]) =>
		[ban.id, ...ban.aliases].some(id => ids.includes(normalizeBanId(id)));
	return {
		list,
		isBanned: (values: string[]) => {
			const ids = values.flatMap(value => {
				try {
					return [normalizeBanId(value)];
				} catch {
					return [];
				}
			});
			return list().some(ban => matches(ban, ids));
		},
		ban: (number: string, aliases: string[], reason: string) => {
			const id = normalizeBanId(number);
			const ids = [...new Set([id, ...aliases.map(normalizeBanId)])];
			const current = list();
			const previous = current.filter(ban => matches(ban, ids));
			const ban: BotBan = {
				id,
				aliases: [
					...new Set([...ids, ...previous.flatMap(b => [b.id, ...b.aliases])]),
				],
				reason,
				bannedAt: previous[0]?.bannedAt ?? Date.now(),
			};
			save([...current.filter(ban => !matches(ban, ids)), ban]);
			return ban;
		},
		unban: (number: string) => {
			const id = normalizeBanId(number);
			save(list().filter(ban => !matches(ban, [id])));
		},
	};
};

export const botBans = createBanStore();
