import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ownerAiSocket } from './modules';
import type { MessageObj } from 'kozz-module-maker/dist/Message';

// Delegations are assigned by authenticated panel/MCP code, never by model input.
const webOrigins = new WeakMap<
	MessageObj,
	{ origin: string; token?: string; active?: () => boolean }
>();
type AgentExecution = {
	policyVersion: number;
	automatic: boolean;
	executeAction?: (perform: () => Promise<unknown>) => Promise<unknown>;
};
const agentOrigins = new WeakMap<
	MessageObj,
	AgentExecution & {
		check: (name: string, args: Record<string, unknown>) => boolean;
	}
>();
export const bindPanelOrigin = (
	requester: MessageObj,
	sessionId: string,
	token?: string,
	active?: () => boolean
) => webOrigins.set(requester, { origin: `web:${sessionId}`, token, active });
export const isPanelRequester = (requester: MessageObj) => webOrigins.has(requester);
export const isAgentRequester = (requester: MessageObj) =>
	agentOrigins.has(requester);
export const bindAgentOrigin = (
	r: MessageObj,
	id: string,
	token: string,
	active: () => boolean,
	check: (name: string, args: Record<string, unknown>) => boolean,
	execution: AgentExecution = { policyVersion: 0, automatic: false }
) => {
	webOrigins.set(r, { origin: `agent:${id}`, token, active });
	agentOrigins.set(r, { check, ...execution });
};
export const agentExecution = (r: MessageObj) => agentOrigins.get(r);
export const assertAgentTool = (
	r: MessageObj,
	name: string,
	args: Record<string, unknown>
) => {
	const agent = agentOrigins.get(r);
	if (agent && !agent.check(name, args))
		throw new Error('Ferramenta ou destino fora da autorização do agente.');
};

export const localOwnerAccess = (requester: MessageObj) =>
	requester.message.boundaryName === 'kozz-zapo' &&
	requester.message.fromHostAccount === true;
export const ownerBoundary = async (
	r: MessageObj,
	operation: string,
	args: Record<string, unknown> = {}
) => {
	const web = webOrigins.get(r);
	const agent = agentOrigins.get(r);
	if (!localOwnerAccess(r) || (web?.active && !web.active()))
		throw new Error('Acesso privado negado.');
	const socket = ownerAiSocket();
	if (socket && !socket.connected) throw new Error('Gateway indisponível.');
	let eventName: string | undefined;
	const capture = (event: string, payload: { request?: { id?: string } }) => {
		if (event === 'ask_resource' && payload.request?.id)
			eventName = `reply_resource/${payload.request.id}`;
	};
	socket?.onAnyOutgoing(capture);
	const request = r.ask.boundary(
		web?.token ? r.message.boundaryName : r.message.boundaryId,
		`owner_ai_${operation}`,
		{
			...args,
			ownerMessageId: r.message.id,
			originChatId: r.message.chatId,
			ownerSessionToken: web?.token,
			...(agent
				? {
						ownerPolicyVersion: agent.policyVersion,
						ownerActionMode: agent.automatic ? 'automatic' : 'manual',
					}
				: {}),
		}
	);
	socket?.offAnyOutgoing(capture);
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const result = await Promise.race([
			request,
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error('ZAPO não respondeu no prazo.')),
					operation === 'group_picture' ? 75_000 : 35_000
				);
			}),
		]);
		if (result.response == null || result.response?.authorized === false)
			throw new Error('Não foi possível validar a conta proprietária na ZAPO.');
		if (web?.active && !web.active())
			throw new Error('Autorização revogada ou alterada durante a operação.');
		return result.response;
	} finally {
		if (timer) clearTimeout(timer);
		if (eventName) socket?.removeAllListeners(eventName);
	}
};
export const ownerAccess = async (r: MessageObj) => {
	if (!localOwnerAccess(r)) return false;
	try {
		return (await ownerBoundary(r, 'authorize')).authorized === true;
	} catch {
		return false;
	}
};

type Pending = {
	key: string;
	expires: number;
	preview: string;
	origin: string;
	perform: (r: MessageObj) => Promise<unknown>;
};
export const createApprovalQueue = (now = Date.now) => {
	const pending = new Map<string, Pending>();
	const prune = () => {
		for (const [token, action] of pending)
			if (action.expires <= now()) pending.delete(token);
	};
	return {
		propose(
			key: string,
			origin: string,
			preview: string,
			perform: Pending['perform']
		) {
			prune();
			const existing = [...pending].find(
				([, a]) => a.key === key && a.origin === origin
			);
			if (existing) return existing[0];
			if (pending.size >= 20)
				throw new Error(
					'Há muitas ações pendentes; confirme, cancele ou aguarde cinco minutos.'
				);
			const token = randomBytes(8).toString('hex');
			pending.set(token, {
				key,
				origin,
				preview,
				perform,
				expires: now() + 5 * 60_000,
			});
			return token;
		},
		list(origin: string) {
			prune();
			return [...pending]
				.filter(([, action]) => action.origin === origin)
				.map(([id, action]) => ({
					id,
					preview: action.preview,
					expiresAt: action.expires,
				}));
		},
		clear(origin: string) {
			for (const [id, action] of pending)
				if (action.origin === origin) pending.delete(id);
		},
		async take(token: string, origin: string, confirm: boolean, r: MessageObj) {
			prune();
			const action = pending.get(token);
			if (!action || action.origin !== origin) return { found: false };
			// Consume before awaiting: repeated confirmation cannot run the action twice.
			pending.delete(token);
			if (!confirm) return { found: true, cancelled: true };
			return { found: true, result: await action.perform(r) };
		},
	};
};
export const approvalQueue = createApprovalQueue();
export const ownerOrigin = (r: MessageObj) =>
	webOrigins.get(r)?.origin || `${r.message.boundaryId}:${r.message.chatId}`;
export const auditOwnerAction = (
	operation: string,
	status: string,
	target: string
) => {
	const directory = path.resolve('.runtime/owner-ai');
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	fs.appendFileSync(
		path.join(directory, 'audit.jsonl'),
		JSON.stringify({
			at: new Date().toISOString(),
			operation,
			status,
			targetHash: createHash('sha256').update(target).digest('hex').slice(0, 16),
		}) + '\n',
		{ mode: 0o600 }
	);
};
