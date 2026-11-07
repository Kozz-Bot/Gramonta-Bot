import { randomBytes, createHash } from 'node:crypto';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import { createMessageObject } from 'kozz-module-maker/dist/Message';
import type { MessageReceivedByGateway } from 'kozz-types';
import {
	ownerAccess,
	ownerBoundary,
	auditOwnerAction,
	approvalQueue,
} from '../OwnerAI/control';
import { ownerAiSocket } from '../OwnerAI/modules';
import { createAutoStore } from '../AutoTramonta/store';
import { isSelfControl } from '../AutoTramonta/engine';
import {
	createAgentStore,
	agentStore,
	hash,
	secret,
	type Agent,
	type Client,
} from './store';
import { scopes, validatePermissions, type Permissions } from './policy';

export const mcpOrigin = () => {
	const raw = process.env.WPP_MCP_ORIGIN;
	if (!raw) return undefined;
	const u = new URL(raw);
	if (u.protocol !== 'https:' || u.origin !== raw || u.username || u.password)
		throw new Error('WPP_MCP_ORIGIN deve ser uma origem HTTPS sem barra final.');
	return raw;
};
export const sourceMetadata = (r: MessageObj) => {
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
export const restoreAgentRequester = (source: Agent['source']) => {
	const socket = ownerAiSocket();
	if (!socket?.connected) throw new Error('Gateway indisponível.');
	return createMessageObject(
		socket,
		{ ...source, boundaryId: 'kozz-zapo' } as MessageReceivedByGateway,
		'ai'
	);
};
type Request = {
	client: Client;
	redirect: string;
	challenge: string;
	state?: string;
	resource: string;
	origin: string;
	scope: string;
	expiresAt: number;
	csrf: string;
	permissions?: Permissions;
	days?: number;
	code?: string;
	reviewed?: boolean;
	agentId?: string;
	authorizationCode?: string;
	exchanging?: boolean;
};
export const createOAuth = (
	store: ReturnType<typeof createAgentStore> = agentStore,
	now = Date.now
) => {
	const requests = new Map<string, Request>();
	const prune = () => {
		for (const [k, r] of requests) if (r.expiresAt <= now()) requests.delete(k);
	};
	return {
		begin(
			clientId: string,
			redirect: string,
			challenge: string,
			state: string | undefined,
			resource: string,
			scope: string,
			origin: string
		) {
			prune();
			const client = store.client(clientId);
			if (
				!client ||
				!client.redirects.includes(redirect) ||
				!/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
				resource !== `${origin}/wpp/mcp` ||
				(state !== undefined &&
					(typeof state !== 'string' || state.length > 2048)) ||
				typeof scope !== 'string' ||
				!scope ||
				scope.split(' ').some(s => ![...scopes, 'offline_access'].includes(s as any))
			)
				throw new Error('invalid_request');
			if (requests.size >= 100) throw new Error('temporarily_unavailable');
			const token = secret();
			const r: Request = {
				client,
				redirect,
				challenge,
				state,
				resource,
				scope: [...new Set(scope.split(' '))].join(' '),
				origin,
				expiresAt: now() + 10 * 60_000,
				csrf: secret(),
			};
			requests.set(hash(token), r);
			return { token, request: r };
		},
		get(token: string) {
			prune();
			return requests.get(hash(token));
		},
		consent(token: string, csrf: string, permissions: Permissions, days: number) {
			prune();
			const r = requests.get(hash(token));
			if (
				!r ||
				r.csrf !== csrf ||
				!validatePermissions(permissions) ||
				permissions.scopes.some(s => !r.scope.split(' ').includes(s)) ||
				!Number.isSafeInteger(days) ||
				days < 1 ||
				days > 30
			)
				throw new Error('invalid_request');
			if (r.code) {
				if (
					JSON.stringify(r.permissions) === JSON.stringify(permissions) &&
					r.days === days
				)
					return r;
				throw new Error('invalid_request');
			}
			r.permissions = JSON.parse(JSON.stringify(permissions));
			r.days = days;
			r.code = randomBytes(6).toString('hex').toUpperCase();
			return r;
		},
		byCode(code: string) {
			prune();
			return [...requests.values()].find(r => r.code === code && !r.agentId);
		},
		approve(r: Request, requester: MessageObj, delegation: Agent['delegation']) {
			if (
				!r.permissions ||
				!r.days ||
				!r.reviewed ||
				r.agentId ||
				r.expiresAt <= now()
			)
				throw new Error('invalid_request');
			const agent: Agent = {
				id: secret(),
				clientId: r.client.id,
				name: r.client.name,
				origin: r.origin,
				resource: r.resource,
				permissions: r.permissions,
				createdAt: now(),
				expiresAt: Math.min(now() + r.days * 86400_000, delegation.expiresAt),
				delegation,
				source: sourceMetadata(requester),
			};
			store.add(agent);
			r.agentId = agent.id;
			r.authorizationCode = secret();
			r.expiresAt = Math.min(r.expiresAt, now() + 60_000);
			return agent;
		},
		redirect(token: string) {
			prune();
			const r = requests.get(hash(token));
			if (!r?.agentId || !r.authorizationCode || !store.agent(r.agentId))
				return undefined;
			const u = new URL(r.redirect);
			u.searchParams.set('code', r.authorizationCode);
			if (r.state !== undefined) u.searchParams.set('state', r.state);
			return u.href;
		},
		async exchange(
			code: string,
			clientId: string,
			redirect: string,
			verifier: string,
			resource: string,
			check: (a: Agent) => Promise<void>
		) {
			prune();
			const pair = [...requests.entries()].find(
				([, r]) => r.authorizationCode === code
			);
			const r = pair?.[1],
				a = r?.agentId && store.agent(r.agentId);
			if (
				!r ||
				!a ||
				r.exchanging ||
				r.client.id !== clientId ||
				r.redirect !== redirect ||
				r.resource !== resource ||
				!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) ||
				createHash('sha256').update(verifier).digest('base64url') !== r.challenge
			)
				throw new Error('invalid_grant');
			r.exchanging = true;
			// Consume before awaiting. A failed or uncertain exchange requires a new authorization.
			requests.delete(pair![0]);
			await check(a);
			const scope = [
				...a.permissions.scopes,
				...(r.scope.split(' ').includes('offline_access') ? ['offline_access'] : []),
			].join(' ');
			return store.issue(a.id, scope, scope.split(' ').includes('offline_access'));
		},
		clear() {
			requests.clear();
		},
	};
};
export const oauth = createOAuth();
export const clearAgentAccess = () => {
	const ids = agentStore.list().map(a => a.id);
	agentStore.revoke();
	oauth.clear();
	for (const id of ids) approvalQueue.clear(`agent:${id}`);
};
export const approveAgentFromDevice = async (input: string, r: MessageObj) => {
	try {
		if (
			!isSelfControl(r.message, createAutoStore().load().ownerIds) ||
			!(await ownerAccess(r))
		)
			return 'Autorize agentes apenas no chat consigo mesmo, pela própria conta.';
		if (/^(sair|revogar)$/i.test(input)) {
			clearAgentAccess();
			await ownerBoundary(r, 'revoke_agent_sessions_from_device');
			return 'Todos os agentes externos foram revogados.';
		}
		const match = /^(?:(confirmar)\s+)?([a-f0-9]{12})$/i.exec(input);
		const request = match && oauth.byCode(match[2].toUpperCase());
		if (!request?.permissions)
			return 'Solicitação inválida ou vencida. Inicie a conexão MCP novamente. Use !ai agente sair para revogar todos os agentes.';
		if (!match![1]) {
			request.reviewed = true;
			return `Confira a autorização do agente externo:\nNome informado pelo cliente: ${request.client.name}\nRetorno: ${request.redirect}\nPermissões: ${request.permissions.scopes.join(', ')}\nChats: ${request.permissions.chats.join(', ')}\nMétodos: ${request.permissions.commands.join(', ') || 'nenhum'}\nPrazo: ${request.days} dia(s).\nEnvios e alterações exigirão aprovação no painel.\n\nSe iniciou esta conexão e concorda, envie !ai agente confirmar ${request.code}`;
		}
		if (!request.reviewed)
			return 'Revise primeiro usando !ai agente seguido do código, sem confirmar.';
		const delegation = await ownerBoundary(r, 'create_agent_session', {
			permissions: request.permissions,
			days: request.days,
		});
		if (delegation.authorized !== true || typeof delegation.token !== 'string')
			throw new Error();
		try {
			const a = oauth.approve(request, r, {
				token: delegation.token,
				expiresAt: delegation.expiresAt,
			});
			auditOwnerAction('mcp_authorize', 'completed', a.id);
		} catch (error) {
			await r.ask
				.boundary(r.message.boundaryId, 'owner_ai_revoke_session', {
					ownerSessionToken: delegation.token,
					all: false,
				})
				.catch(() => {});
			throw error;
		}
		return 'Agente autorizado. Volte à janela de conexão. Gerencie ou revogue o acesso em /wpp/ → Agentes externos.';
	} catch {
		return 'Não foi possível autorizar o agente. Confira a conexão e inicie uma nova solicitação.';
	}
};
