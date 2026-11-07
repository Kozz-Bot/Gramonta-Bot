import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import {
	createMessageObject,
	type MessageObj,
} from 'kozz-module-maker/dist/Message';
import type { MessageReceivedByGateway } from 'kozz-types';
import { ownerAccess, ownerBoundary, approvalQueue } from '../OwnerAI/control';
import { ownerAiSocket } from '../OwnerAI/modules';
import { createAutoStore } from '../AutoTramonta/store';
import { isSelfControl } from '../AutoTramonta/engine';
import {
	createSessionFile,
	type Delegation,
	type StoredSession,
} from './sessionStore';
import { clearAgentAccess } from '../OwnerMCP/oauth';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const LOGIN_TTL = 5 * 60_000;
export const PANEL_SESSION_MS = 30 * 86400_000;
export type PanelSession = {
	id: string;
	origin: string;
	csrf: string;
	expiresAt: number;
	delegation: Delegation;
	requester: MessageObj;
	busy: boolean;
	history: Array<{ role: 'user' | 'assistant'; content: string }>;
};
type Challenge = {
	code: string;
	origin: string;
	expiresAt: number;
	requester?: MessageObj;
	delegation?: Delegation;
};
type Options = {
	directory?: () => string;
	restore?: (source: StoredSession['source']) => MessageObj;
};
const sourceMetadata = (r: MessageObj) => {
	const m = r.message;
	return {
		id: m.id,
		chatId: m.chatId,
		to: m.chatId,
		from: m.from,
		boundaryName: m.boundaryName,
		boundaryId: m.boundaryName,
		timestamp: m.timestamp,
		fromHostAccount: m.fromHostAccount,
		platform: m.platform,
		contact: m.contact ? { ...m.contact } : undefined,
		body: '',
		santizedBody: '',
		taggedContacts: [],
		messageType: 'TEXT',
	};
};
const restoreRequester = (source: StoredSession['source']) => {
	const socket = ownerAiSocket();
	if (!socket?.connected) throw new Error('A IA ainda está iniciando.');
	return createMessageObject(
		socket,
		{ ...source, boundaryId: 'kozz-zapo' } as MessageReceivedByGateway,
		'ai'
	);
};

export const createPanelAuth = (now = Date.now, options: Options = {}) => {
	const challenges = new Map<string, Challenge>();
	let sessions = new Map<string, PanelSession>();
	const records = new Map<string, StoredSession>();
	let file: ReturnType<typeof createSessionFile> | undefined;
	let loaded = false;
	const load = () => {
		if (loaded) return;
		if (options.directory) {
			file = createSessionFile(options.directory());
			for (const record of file.load())
				if (record.expiresAt > now()) {
					let requester: MessageObj | undefined;
					const session: PanelSession = {
						id: record.id,
						origin: record.origin,
						csrf: record.csrf,
						expiresAt: record.expiresAt,
						delegation: record.delegation,
						busy: false,
						history: [],
						get requester() {
							return (requester ||= (options.restore || restoreRequester)(
								record.source
							));
						},
					};
					sessions.set(record.id, session);
					records.set(record.id, record);
				}
		}
		loaded = true;
	};
	const commit = (next: Map<string, PanelSession>, extra?: StoredSession) => {
		const durable = [...next.keys()].map(id =>
			id === extra?.id ? extra : records.get(id)!
		);
		file?.save(durable);
		sessions = next;
		for (const id of records.keys()) if (!next.has(id)) records.delete(id);
		if (extra) records.set(extra.id, extra);
	};
	const prune = () => {
		load();
		for (const [id, challenge] of challenges)
			if (challenge.expiresAt <= now()) challenges.delete(id);
		const active = new Map(
			[...sessions].filter(([, session]) => session.expiresAt > now())
		);
		if (active.size !== sessions.size) commit(active);
	};
	return {
		challenge(origin: string) {
			prune();
			if (challenges.size >= 100 || sessions.size >= 100)
				throw new Error(
					'Muitas solicitações de acesso. Encerre os acessos antigos ou aguarde.'
				);
			const token = secret(),
				code = randomBytes(6).toString('hex').toUpperCase();
			const value = { code, origin, expiresAt: now() + LOGIN_TTL };
			challenges.set(digest(token), value);
			return { token, ...value };
		},
		pending(code: string) {
			prune();
			return [...challenges.values()].some(
				c => c.code === code.toUpperCase() && !c.requester
			);
		},
		approve(code: string, requester: MessageObj, delegation: Delegation) {
			prune();
			const challenge = [...challenges.values()].find(
				c => c.code === code.toUpperCase() && !c.requester
			);
			if (
				!challenge ||
				!delegation ||
				!Number.isSafeInteger(delegation.expiresAt) ||
				!/^[a-f0-9]{64}$/.test(delegation.token) ||
				delegation.expiresAt <= now() ||
				delegation.expiresAt > now() + PANEL_SESSION_MS + 5000
			)
				return undefined;
			challenge.requester = requester;
			challenge.delegation = delegation;
			return { origin: challenge.origin };
		},
		claim(token: string, origin: string) {
			prune();
			const id = digest(token),
				challenge = challenges.get(id);
			if (
				!challenge ||
				challenge.origin !== origin ||
				!challenge.requester ||
				!challenge.delegation ||
				challenge.delegation.expiresAt <= now()
			)
				return undefined;
			const sessionToken = secret(),
				expiresAt = challenge.delegation.expiresAt;
			const session: PanelSession = {
				id: digest(sessionToken),
				origin,
				csrf: secret(),
				requester: challenge.requester,
				delegation: challenge.delegation,
				expiresAt,
				busy: false,
				history: [],
			};
			const record: StoredSession = {
				id: session.id,
				origin,
				csrf: session.csrf,
				delegation: session.delegation,
				expiresAt,
				source: sourceMetadata(session.requester),
			};
			commit(new Map([...sessions, [session.id, session]]), record);
			challenges.delete(id);
			return { token: sessionToken, session };
		},
		get(token: string, origin: string) {
			prune();
			const session = sessions.get(digest(token));
			return session?.origin === origin ? session : undefined;
		},
		isActive(id: string) {
			prune();
			return sessions.has(id);
		},
		ids() {
			prune();
			return [...sessions.keys()];
		},
		revoke(token: string) {
			prune();
			const next = new Map(sessions);
			next.delete(digest(token));
			commit(next);
		},
		revokeAll() {
			load();
			commit(new Map());
			challenges.clear();
		},
	};
};
export const panelAuth = createPanelAuth(Date.now, {
	directory: () => path.resolve('.runtime/owner-panel'),
});
export const clearPanelSessions = () => {
	clearAgentAccess();
	const ids = panelAuth.ids();
	panelAuth.revokeAll();
	for (const id of ids) approvalQueue.clear(`web:${id}`);
};
export const approvePanelBrowser = async (code: string, requester: MessageObj) => {
	try {
		if (
			!isSelfControl(requester.message, createAutoStore().load().ownerIds) ||
			!(await ownerAccess(requester))
		)
			return '[#CalvoGPT]: Autorize o painel apenas no chat consigo mesmo, usando a própria conta.';
		if (/^(sair|revogar)$/i.test(code)) {
			clearPanelSessions();
			await ownerBoundary(requester, 'revoke_sessions_from_device');
			return '[#CalvoGPT]: Todos os acessos ao painel e dos agentes externos foram encerrados. É necessária uma nova autorização.';
		}
		if (!/^[a-f0-9]{12}$/i.test(code))
			return '[#CalvoGPT]: Abra /wpp no navegador e envie para você mesmo o comando !ai painel seguido do código exibido. Use !ai painel sair para encerrar todos os acessos.';
		if (!panelAuth.pending(code))
			return '[#CalvoGPT]: Código vencido, inválido ou já utilizado. Gere outro código no painel.';
		const grant = await ownerBoundary(requester, 'create_session');
		const result = panelAuth.approve(code, requester, {
			token: grant.token,
			expiresAt: grant.expiresAt,
		});
		return result
			? `[#CalvoGPT]: Navegador autorizado para ${result.origin}. Volte ao painel. A sessão dura até 30 dias; envios e alterações ainda exigem sua confirmação na web.`
			: '[#CalvoGPT]: Não foi possível concluir o acesso. Gere outro código no painel.';
	} catch {
		return '[#CalvoGPT]: Não consegui concluir a solicitação de acesso ao painel. Tente novamente.';
	}
};
