import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { validatePermissions, type Permissions } from './policy';
import type { Delegation } from '../OwnerPanel/sessionStore';

export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
export type Client = {
	id: string;
	name: string;
	redirects: string[];
	createdAt: number;
};
export type ApprovalMode = 'manual' | 'automatic';
export type Agent = {
	id: string;
	clientId: string;
	name: string;
	origin: string;
	resource: string;
	permissions: Permissions;
	approvalMode?: ApprovalMode;
	policyVersion?: number;
	expiresAt: number;
	createdAt: number;
	delegation: Delegation;
	source: Record<string, any>;
};
export type Operation = {
	id: string;
	agentId: string;
	keyHash: string;
	requestHash: string;
	status: 'executing' | 'completed' | 'failed_or_unknown';
	result?: Record<string, boolean | string>;
	createdAt: number;
};
type Token = {
	hash: string;
	agentId: string;
	expiresAt: number;
	kind: 'access' | 'refresh' | 'used';
	scope: string;
};
type Data = {
	version: 1;
	clients: Client[];
	agents: Agent[];
	tokens: Token[];
	operations?: Operation[];
};
const hex = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
export const validRedirect = (s: unknown): s is string => {
	try {
		if (
			typeof s !== 'string' ||
			s.length > 2048 ||
			/[\u0000-\u0020\u007f\u202a-\u202e\u2066-\u2069]/.test(s)
		)
			return false;
		const u = new URL(s);
		return (
			!u.username &&
			!u.password &&
			!u.hash &&
			(u.protocol === 'https:' ||
				(u.protocol === 'http:' &&
					['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname)))
		);
	} catch {
		return false;
	}
};
const validData = (d: any): d is Data =>
	d?.version === 1 &&
	Array.isArray(d.clients) &&
	d.clients.length <= 200 &&
	d.clients.every(
		(c: Client) =>
			hex(c.id) &&
			typeof c.name === 'string' &&
			c.name.length > 0 &&
			c.name.length <= 100 &&
			Array.isArray(c.redirects) &&
			c.redirects.length > 0 &&
			c.redirects.length <= 10 &&
			c.redirects.every(validRedirect) &&
			Number.isSafeInteger(c.createdAt)
	) &&
	Array.isArray(d.agents) &&
	d.agents.length <= 100 &&
	d.agents.every(
		(a: Agent) =>
			hex(a.id) &&
			d.clients.some((c: Client) => c.id === a.clientId) &&
			typeof a.name === 'string' &&
			typeof a.origin === 'string' &&
			/^https:\/\//.test(a.origin) &&
			a.resource === `${a.origin}/wpp/mcp` &&
			validatePermissions(a.permissions) &&
			Number.isSafeInteger(a.expiresAt) &&
			Number.isSafeInteger(a.createdAt) &&
			hex(a.delegation?.token) &&
			a.expiresAt <= a.delegation.expiresAt &&
			a.source?.fromHostAccount === true &&
			a.source.boundaryName === 'kozz-zapo' &&
			typeof a.source.id === 'string' &&
			typeof a.source.chatId === 'string'
	) &&
	Array.isArray(d.tokens) &&
	d.tokens.length <= 20000 &&
	d.tokens.every(
		(t: Token) =>
			hex(t.hash) &&
			d.agents.some((a: Agent) => a.id === t.agentId) &&
			['access', 'refresh', 'used'].includes(t.kind) &&
			Number.isSafeInteger(t.expiresAt) &&
			typeof t.scope === 'string'
	) &&
	d.agents.every(
		(a: Agent) =>
			(a.approvalMode === undefined ||
				['manual', 'automatic'].includes(a.approvalMode)) &&
			(a.policyVersion === undefined ||
				(Number.isSafeInteger(a.policyVersion) && a.policyVersion >= 0))
	) &&
	(d.operations === undefined ||
		(Array.isArray(d.operations) &&
			d.operations.length <= 10000 &&
			d.operations.every(
				(o: Operation) =>
					hex(o.id) &&
					hex(o.agentId) &&
					hex(o.keyHash) &&
					hex(o.requestHash) &&
					['executing', 'completed', 'failed_or_unknown'].includes(o.status) &&
					Number.isSafeInteger(o.createdAt) &&
					(o.result === undefined ||
						(o.result &&
							!Array.isArray(o.result) &&
							typeof o.result === 'object' &&
							Object.entries(o.result).every(
								([k, v]) =>
									[
										'submitted',
										'updated',
										'invoked',
										'deliveryConfirmed',
										'messageId',
									].includes(k) &&
									(typeof v === 'boolean' ||
										(k === 'messageId' && typeof v === 'string' && v.length <= 200))
							)))
			) &&
			new Set(d.operations.map((o: Operation) => `${o.agentId}:${o.keyHash}`))
				.size === d.operations.length &&
			new Set(d.operations.map((o: Operation) => o.id)).size ===
				d.operations.length)) &&
	new Set(d.clients.map((c: Client) => c.id)).size === d.clients.length &&
	new Set(d.agents.map((a: Agent) => a.id)).size === d.agents.length &&
	new Set(d.tokens.map((t: Token) => t.hash)).size === d.tokens.length;

// Mutations are copy-on-write; failed persistence never leaves an in-memory grant active.
export const createAgentStore = (directory?: () => string, now = Date.now) => {
	let data: Data | undefined;
	const load = () => {
		if (!data) {
			const file = directory && path.join(directory(), 'agents.json');
			const parsed =
				file && fs.existsSync(file)
					? JSON.parse(fs.readFileSync(file, 'utf8'))
					: { version: 1, clients: [], agents: [], tokens: [] };
			if (!validData(parsed))
				throw new Error('Armazenamento de agentes inválido; acesso bloqueado.');
			data = parsed;
		}
		return data!;
	};
	const mutate = <T>(fn: (next: Data) => T) => {
		const next: Data = JSON.parse(JSON.stringify(load()));
		const result = fn(next);
		if (!validData(next))
			throw new Error('Registro de agentes inválido ou limite atingido.');
		if (directory) {
			const dir = directory(),
				file = path.join(dir, 'agents.json'),
				temp = `${file}.${randomUUID()}.tmp`;
			fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
			try {
				const fd = fs.openSync(temp, 'wx', 0o600);
				try {
					fs.writeFileSync(fd, JSON.stringify(next));
					fs.fsyncSync(fd);
				} finally {
					fs.closeSync(fd);
				}
				fs.renameSync(temp, file);
				const directoryFd = fs.openSync(dir, 'r');
				try {
					fs.fsyncSync(directoryFd);
				} finally {
					fs.closeSync(directoryFd);
				}
			} finally {
				fs.rmSync(temp, { force: true });
			}
		}
		data = next;
		return result;
	};
	const active = (a?: Agent) => (a && a.expiresAt > now() ? a : undefined);
	const issue = (d: Data, a: Agent, scope: string, offline: boolean) => {
		// Old access tokens are unnecessary after a refresh. Retain used refresh hashes to detect replay.
		d.tokens = d.tokens.filter(
			t => t.expiresAt > now() && !(t.agentId === a.id && t.kind === 'access')
		);
		const access_token = secret(),
			expiresAt = Math.min(now() + 10 * 60_000, a.expiresAt);
		d.tokens.push({
			hash: hash(access_token),
			agentId: a.id,
			kind: 'access',
			scope,
			expiresAt,
		});
		const refresh_token = offline ? secret() : undefined;
		if (refresh_token)
			d.tokens.push({
				hash: hash(refresh_token),
				agentId: a.id,
				kind: 'refresh',
				scope,
				expiresAt: a.expiresAt,
			});
		return {
			access_token,
			token_type: 'Bearer',
			expires_in: Math.floor((expiresAt - now()) / 1000),
			scope,
			...(refresh_token ? { refresh_token } : {}),
		};
	};
	return {
		register(name: string, redirects: string[]) {
			return mutate(d => {
				const used = new Set(
					d.agents.filter(a => a.expiresAt > now()).map(a => a.clientId)
				);
				if (d.clients.length >= 200) {
					const oldest = d.clients.find(c => !used.has(c.id));
					if (!oldest) throw new Error('Client limit');
					// Remove expired grants before reclaiming a registration slot.
					d.agents = d.agents.filter(a => a.clientId !== oldest.id);
					const ids = new Set(d.agents.map(a => a.id));
					d.tokens = d.tokens.filter(t => ids.has(t.agentId));
					d.clients = d.clients.filter(c => c.id !== oldest.id);
				}
				const c = { id: secret(), name, redirects, createdAt: now() };
				d.clients.push(c);
				return c;
			});
		},
		client(id: string) {
			return load().clients.find(c => c.id === id);
		},
		add(agent: Agent) {
			mutate(d => {
				d.agents = d.agents.filter(a => a.expiresAt > now());
				const ids = new Set(d.agents.map(a => a.id));
				d.tokens = d.tokens.filter(t => ids.has(t.agentId) && t.expiresAt > now());
				d.agents.push(agent);
			});
		},
		agent(id: string) {
			return active(load().agents.find(a => a.id === id));
		},
		list() {
			return load().agents.filter(a => active(a));
		},
		updatePolicy(
			id: string,
			expectedVersion: number,
			approvalMode: ApprovalMode,
			commands: string[],
			policyVersion: number
		) {
			return mutate(d => {
				const a = active(d.agents.find(a => a.id === id));
				if (
					!a ||
					(a.policyVersion || 0) !== expectedVersion ||
					policyVersion !== expectedVersion + 1
				)
					throw new Error('Política mudou. Atualize o painel.');
				a.approvalMode = approvalMode;
				a.policyVersion = policyVersion;
				a.permissions.commands = commands;
				return a;
			});
		},
		operation(agentId: string, id: string) {
			return load().operations?.find(o => o.agentId === agentId && o.id === id);
		},
		operationByKey(agentId: string, keyHash: string) {
			return load().operations?.find(
				o => o.agentId === agentId && o.keyHash === keyHash
			);
		},
		beginOperation(agentId: string, keyHash: string, requestHash: string) {
			return mutate(d => {
				if (!active(d.agents.find(a => a.id === agentId)))
					throw new Error('Agente revogado.');
				const activeIds = new Set(d.agents.filter(a => active(a)).map(a => a.id));
				d.operations = (d.operations || []).filter(o => activeIds.has(o.agentId));
				if (d.operations.some(o => o.agentId === agentId && o.keyHash === keyHash))
					throw new Error('Chave já utilizada.');
				const o: Operation = {
					id: secret(),
					agentId,
					keyHash,
					requestHash,
					status: 'executing',
					createdAt: now(),
				};
				d.operations.push(o);
				return o;
			});
		},
		finishOperation(id: string, status: Operation['status'], result?: unknown) {
			return mutate(d => {
				const o = d.operations?.find(o => o.id === id);
				if (!o) throw new Error('Registro de execução indisponível.');
				o.status = status;
				if (result && typeof result === 'object')
					o.result = Object.fromEntries(
						Object.entries(result).filter(
							([k, v]) =>
								[
									'submitted',
									'updated',
									'invoked',
									'deliveryConfirmed',
									'messageId',
								].includes(k) &&
								(typeof v === 'boolean' ||
									(k === 'messageId' && typeof v === 'string' && v.length <= 200))
						)
					);
				return o;
			});
		},
		revoke(id?: string) {
			mutate(d => {
				d.agents = id ? d.agents.filter(a => a.id !== id) : [];
				const ids = new Set(d.agents.map(a => a.id));
				d.tokens = d.tokens.filter(t => ids.has(t.agentId));
			});
		},
		issue(id: string, scope: string, offline: boolean) {
			return mutate(d => {
				const a = active(d.agents.find(a => a.id === id));
				if (!a) throw new Error('invalid_grant');
				return issue(d, a, scope, offline);
			});
		},
		access(token: string, resource: string) {
			if (!hex(token)) return undefined;
			const t = load().tokens.find(
				t => t.hash === hash(token) && t.kind === 'access' && t.expiresAt > now()
			);
			const a = t && active(load().agents.find(a => a.id === t.agentId));
			return a?.resource === resource && t
				? {
						...a,
						permissions: {
							...a.permissions,
							scopes: a.permissions.scopes.filter(s =>
								t.scope.split(' ').includes(s)
							),
						},
					}
				: undefined;
		},
		revocable(token: string, resource: string) {
			if (!hex(token)) return undefined;
			const t = load().tokens.find(
				t => t.hash === hash(token) && t.kind !== 'used' && t.expiresAt > now()
			);
			const a = t && active(load().agents.find(a => a.id === t.agentId));
			return a?.resource === resource ? a : undefined;
		},
		refresh(token: string, clientId: string, resource: string, scope?: string) {
			let invalid = false;
			const result = mutate(d => {
				const t = hex(token)
					? d.tokens.find(
							t => t.hash === hash(token) && ['refresh', 'used'].includes(t.kind)
						)
					: undefined;
				const a = t && active(d.agents.find(a => a.id === t.agentId));
				if (
					!a ||
					!t ||
					a.clientId !== clientId ||
					a.resource !== resource ||
					t.expiresAt <= now()
				) {
					invalid = true;
					return;
				}
				if (t.kind === 'used') {
					d.agents = d.agents.filter(v => v.id !== a.id);
					d.tokens = d.tokens.filter(v => v.agentId !== a.id);
					invalid = true;
					return;
				}
				const granted = scope === undefined ? t.scope : scope;
				if (granted.split(' ').some(s => !t.scope.split(' ').includes(s))) {
					invalid = true;
					return;
				}
				t.kind = 'used';
				return issue(d, a, granted, granted.split(' ').includes('offline_access'));
			});
			if (invalid || !result) throw new Error('invalid_grant');
			return result;
		},
	};
};
export const agentStore = createAgentStore(() => path.resolve('.runtime/owner-mcp'));
