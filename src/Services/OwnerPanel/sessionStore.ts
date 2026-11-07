import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type Delegation = { token: string; expiresAt: number };
export type StoredSession = {
	id: string;
	origin: string;
	csrf: string;
	expiresAt: number;
	delegation: Delegation;
	source: Record<string, any>;
};
const hex64 = (value: unknown) =>
	typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validateStoredSessions = (
	value: any
): value is { version: 1; sessions: StoredSession[] } => {
	if (
		!value ||
		value.version !== 1 ||
		!Array.isArray(value.sessions) ||
		value.sessions.length > 100
	)
		return false;
	return (
		value.sessions.every((s: StoredSession) => {
			try {
				return (
					hex64(s.id) &&
					hex64(s.csrf) &&
					new URL(s.origin).origin === s.origin &&
					s.origin.startsWith('https://') &&
					Number.isSafeInteger(s.expiresAt) &&
					s.expiresAt > 0 &&
					hex64(s.delegation?.token) &&
					s.delegation.expiresAt === s.expiresAt &&
					s.source?.fromHostAccount === true &&
					s.source.boundaryName === 'kozz-zapo' &&
					typeof s.source.id === 'string' &&
					s.source.id.length > 0 &&
					typeof s.source.from === 'string' &&
					/^\d+@(lid|s\.whatsapp\.net)$/.test(s.source.chatId) &&
					Number.isFinite(s.source.timestamp)
				);
			} catch {
				return false;
			}
		}) &&
		new Set(value.sessions.map((s: StoredSession) => s.id)).size ===
			value.sessions.length
	);
};

export const createSessionFile = (directory: string) => {
	const file = path.join(directory, 'sessions.json');
	return {
		load(): StoredSession[] {
			if (!fs.existsSync(file)) return [];
			const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
			if (!validateStoredSessions(parsed))
				throw new Error('Arquivo de sessões inválido; acesso web bloqueado.');
			return parsed.sessions;
		},
		save(sessions: StoredSession[]) {
			const value = { version: 1, sessions };
			if (!validateStoredSessions(value)) throw new Error('Sessões inválidas.');
			fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
			const temp = `${file}.${randomUUID()}.tmp`;
			try {
				fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
				fs.renameSync(temp, file);
			} finally {
				fs.rmSync(temp, { force: true });
			}
		},
	};
};
