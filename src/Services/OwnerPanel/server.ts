import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { MessageObj } from 'kozz-module-maker/dist/Message';
import { panelAuth, clearPanelSessions, type PanelSession } from './auth';
import { runPanelAi } from './bridge';
import {
	approvalQueue,
	bindPanelOrigin,
	ownerOrigin,
	ownerBoundary,
} from '../OwnerAI/control';
import { executeOwnerTool } from '../OwnerAI/execute';
import { moduleCatalog, ownerAiSocket } from '../OwnerAI/modules';
import { periodicGroups } from '../PeriodicStatus/groups';
import { summarizeAiUsage } from '../../API/AiObservability';
import {
	createMcpRouter,
	publicAgents,
	revokeAgent,
	listAgentActions,
	decideAgentAction,
	updateAgentPolicy,
} from '../OwnerMCP/server';
import { mcpOrigin } from '../OwnerMCP/oauth';

const SESSION_COOKIE = '__Secure-gramonta_wpp';
const PAIR_COOKIE = '__Secure-gramonta_wpp_pair';
const cookieOptions = {
	httpOnly: true,
	secure: true,
	sameSite: 'strict' as const,
	path: '/wpp/',
};
const cookies = (header = '') =>
	Object.fromEntries(
		header
			.split(';')
			.map(item => item.trim().split('='))
			.filter(parts => parts.length === 2)
	);
const safeOrigin = (host: string | undefined) => {
	if (!host || !/^[a-z0-9.:[\]-]+$/i.test(host)) throw new Error('Host inválido.');
	return new URL(`https://${host}`).origin;
};
const resultText = (result: unknown) => {
	const value = result as any;
	return value?.submitted
		? 'Mensagem enviada ao WhatsApp. Entrega e leitura ainda não confirmadas.'
		: value?.updated
			? 'Configuração atualizada.'
			: value?.invoked
				? 'Módulo executado. Confira o resultado no chat de destino.'
				: 'O módulo não executou o comando. Confira suas restrições e os argumentos.';
};
export const createPanelRequester = (
	session: PanelSession,
	input = '',
	active = () => panelAuth.isActive(session.id)
) => {
	const output: string[] = [];
	const reply = Object.assign(
		(value: unknown) => {
			output.push(String(value));
		},
		{
			withButtons: () => {
				output.push('Preparei uma ação para você revisar e confirmar.');
			},
		}
	);
	const requester = {
		...session.requester,
		reply,
		react: () => {},
		rawCommand: {
			...session.requester.rawCommand,
			query: input,
			immediateArg: input,
		},
		message: {
			...session.requester.message,
			body: `!ai ${input}`,
			santizedBody: `!ai ${input}`,
			quotedMessage: undefined,
			media: undefined,
		},
	} as unknown as MessageObj;
	bindPanelOrigin(requester, session.id, session.delegation?.token, active);
	return { requester, output };
};
const recentAudit = () => {
	const file = path.resolve('.runtime/owner-ai/audit.jsonl');
	if (!fs.existsSync(file)) return [];
	const size = fs.statSync(file).size,
		length = Math.min(size, 64 * 1024),
		buffer = Buffer.alloc(length);
	const fd = fs.openSync(file, 'r');
	try {
		fs.readSync(fd, buffer, 0, length, size - length);
	} finally {
		fs.closeSync(fd);
	}
	const lines = buffer.toString('utf8').split('\n');
	if (size > length) lines.shift();
	return lines
		.filter(Boolean)
		.slice(-80)
		.reverse()
		.flatMap(line => {
			try {
				const { at, operation, status, targetHash } = JSON.parse(line);
				return [{ at, operation, status, targetHash }];
			} catch {
				return [];
			}
		});
};
export const createOwnerPanelApp = () => {
	const app = express();
	app.disable('x-powered-by');
	app.use((_req, res, next) => {
		res.set({
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'no-referrer',
			'Content-Security-Policy':
				"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
			'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
		});
		next();
	});
	app.use(createMcpRouter());
	app.use('/api', express.json({ limit: '64kb', strict: true }));
	app.use('/api', (req, res, next) => {
		try {
			const origin = safeOrigin(req.get('host'));
			if (req.method !== 'GET' && req.get('origin') !== origin)
				return res.status(403).json({
					error:
						'Origem recusada. Acesse o painel pelo endereço HTTPS da infraestrutura.',
				});
			if (req.get('sec-fetch-site') === 'cross-site')
				return res
					.status(403)
					.json({ error: 'Solicitação de outro site recusada.' });
			res.locals.origin = origin;
			next();
		} catch {
			res.status(400).json({ error: 'Endereço inválido.' });
		}
	});
	app.get('/api/auth', (req, res) => {
		const values = cookies(req.get('cookie')),
			origin = res.locals.origin;
		let session = panelAuth.get(values[SESSION_COOKIE] || '', origin);
		if (!session && values[PAIR_COOKIE]) {
			const claim = panelAuth.claim(values[PAIR_COOKIE], origin);
			if (claim) {
				session = claim.session;
				res.cookie(SESSION_COOKIE, claim.token, {
					...cookieOptions,
					expires: new Date(session.expiresAt),
				});
				res.clearCookie(PAIR_COOKIE, cookieOptions);
			}
		}
		res.json(
			session
				? { authenticated: true, csrf: session.csrf, expiresAt: session.expiresAt }
				: { authenticated: false }
		);
	});
	let recentChallenges: number[] = [];
	app.post('/api/pair', (_req, res) => {
		recentChallenges = recentChallenges.filter(at => at > Date.now() - 60_000);
		if (recentChallenges.length >= 8)
			return res.status(429).json({
				error: 'Muitas solicitações. Aguarde um minuto para gerar outro código.',
			});
		recentChallenges.push(Date.now());
		try {
			const challenge = panelAuth.challenge(res.locals.origin);
			res.cookie(PAIR_COOKIE, challenge.token, {
				...cookieOptions,
				expires: new Date(challenge.expiresAt),
			});
			res.json({
				code: challenge.code,
				command: `!ai painel ${challenge.code}`,
				expiresAt: challenge.expiresAt,
			});
		} catch {
			res.status(429).json({ error: 'Aguarde alguns minutos e tente novamente.' });
		}
	});
	app.use('/api', (req, res, next) => {
		const token = cookies(req.get('cookie'))[SESSION_COOKIE] || '';
		const session = panelAuth.get(token, res.locals.origin);
		if (!session)
			return res.status(401).json({
				error:
					'Sua sessão terminou. Autorize este navegador novamente pelo WhatsApp.',
			});
		if (req.method !== 'GET' && req.get('x-csrf-token') !== session.csrf)
			return res.status(403).json({
				error: 'Proteção da sessão recusou a solicitação. Atualize a página.',
			});
		res.locals.session = session;
		res.locals.token = token;
		next();
	});
	app.post(['/api/logout', '/api/logout-all'], async (req, res) => {
		try {
			const session: PanelSession = res.locals.session;
			const { requester } = createPanelRequester(session);
			// Begin boundary revocation while the session is active; revoke locally even if ZAPO is offline.
			const revocation = ownerBoundary(requester, 'revoke_session', {
				all: req.path === '/api/logout-all',
			}).catch(() => {});
			if (req.path === '/api/logout-all') clearPanelSessions();
			else {
				panelAuth.revoke(res.locals.token);
				approvalQueue.clear(`web:${session.id}`);
			}
			await revocation.catch(() => {});
			res.clearCookie(SESSION_COOKIE, cookieOptions);
			res.json({ ok: true });
		} catch {
			res
				.status(503)
				.json({ error: 'Não foi possível concluir a revogação. Tente novamente.' });
		}
	});
	app.get('/api/state', async (_req, res) => {
		try {
			const session: PanelSession = res.locals.session;
			const { requester } = createPanelRequester(session);
			const usage = await summarizeAiUsage(100);
			res.json({
				expiresAt: session.expiresAt,
				modules: moduleCatalog(),
				posts: periodicGroups.load(),
				pending: approvalQueue.list(ownerOrigin(requester)),
				activity: recentAudit(),
				usage: {
					calls: usage.totals.count,
					errors: usage.totals.errors,
					tokens: usage.totals.totalTokens,
				},
				selfChatId: session.requester.message.chatId,
				history: session.history,
			});
		} catch {
			res
				.status(503)
				.json({ error: 'Não foi possível carregar o painel. Tente novamente.' });
		}
	});
	app.get('/api/agents', async (_req, res) => {
		try {
			const { requester } = createPanelRequester(res.locals.session);
			await ownerBoundary(requester, 'authorize');
			res.json({
				endpoint: mcpOrigin() ? `${mcpOrigin()}/wpp/mcp` : null,
				agents: publicAgents(),
				pending: listAgentActions(),
			});
		} catch {
			res.status(503).json({ error: 'Não foi possível consultar os agentes.' });
		}
	});
	app.post('/api/agents/revoke', async (req, res) => {
		try {
			await ownerBoundary(
				createPanelRequester(res.locals.session).requester,
				'authorize'
			);
			if (typeof req.body.id !== 'string') throw new Error();
			await revokeAgent(req.body.id);
			res.json({ ok: true });
		} catch {
			res.status(400).json({ error: 'Não foi possível revogar o agente.' });
		}
	});
	app.post('/api/agents/policy', async (req, res) => {
		const session: PanelSession = res.locals.session;
		if (session.busy)
			return res.status(409).json({ error: 'Aguarde a operação atual.' });
		session.busy = true;
		try {
			const b = req.body;
			const current = publicAgents().find(a => a.id === b.id);
			if (
				typeof b.id !== 'string' ||
				!Number.isSafeInteger(b.expectedVersion) ||
				!['manual', 'automatic'].includes(b.approvalMode) ||
				typeof b.allCommands !== 'boolean' ||
				((b.approvalMode === 'automatic' ||
					(b.allCommands && !current?.permissions.commands.includes('*'))) &&
					(b.confirmation !== 'AUTORIZAR' || b.understood !== true))
			)
				return res.status(400).json({
					error: 'Revise o agente e confirme expressamente a autorização.',
				});
			const { requester } = createPanelRequester(session);
			await ownerBoundary(requester, 'authorize');
			res.json(
				await updateAgentPolicy(
					requester,
					b.id,
					b.expectedVersion,
					b.approvalMode,
					b.allCommands,
					b.commands
				)
			);
		} catch {
			res.status(409).json({
				error:
					'Não foi possível confirmar a mudança. Atualize o painel; se a política ficar divergente, revogue e reconecte o agente.',
			});
		} finally {
			session.busy = false;
		}
	});
	app.post('/api/agents/approve', async (req, res) => {
		const session: PanelSession = res.locals.session;
		if (session.busy)
			return res.status(409).json({ error: 'Aguarde a operação atual.' });
		session.busy = true;
		try {
			await ownerBoundary(createPanelRequester(session).requester, 'authorize');
			if (typeof req.body.id !== 'string' || typeof req.body.accept !== 'boolean')
				throw new Error();
			res.json(await decideAgentAction(req.body.id, req.body.accept));
		} catch {
			res.status(400).json({
				error:
					'Ação indisponível ou resultado incerto. Confira o WhatsApp antes de repetir.',
			});
		} finally {
			session.busy = false;
		}
	});
	app.get('/api/whatsapp', async (_req, res) => {
		const socket = ownerAiSocket();
		let eventName: string | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const capture = (event: string, payload: { request?: { id?: string } }) => {
			if (event === 'ask_resource' && payload.request?.id)
				eventName = `reply_resource/${payload.request.id}`;
		};
		try {
			if (socket && !socket.connected) throw new Error();
			const session: PanelSession = res.locals.session;
			socket?.onAnyOutgoing(capture);
			const request = session.requester.ask.boundary(
				session.requester.message.boundaryId,
				'chat_status'
			);
			socket?.offAnyOutgoing(capture);
			const { response } = await Promise.race([
				request,
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error()), 10_000);
				}),
			]);
			// Only booleans are returned, never QR/session keys.
			res.json({
				connected: response?.connected === true,
				registered: response?.registered === true,
				hasQr: response?.hasQr === true,
				ready: response?.ready === true,
			});
		} catch {
			res.status(503).json({ error: 'WhatsApp indisponível no momento.' });
		} finally {
			if (timer) clearTimeout(timer);
			socket?.offAnyOutgoing(capture);
			if (eventName) socket?.removeAllListeners(eventName);
		}
	});
	app.post('/api/search', async (req, res) => {
		try {
			const { requester } = createPanelRequester(res.locals.session);
			const query = typeof req.body.query === 'string' ? req.body.query : '';
			const kind = ['contact', 'group', 'all'].includes(String(req.body.kind))
				? String(req.body.kind)
				: 'all';
			res.json(await ownerBoundary(requester, 'search', { query, kind }));
		} catch {
			res
				.status(400)
				.json({ error: 'Não foi possível pesquisar. Confira o nome e sua sessão.' });
		}
	});
	app.post('/api/history', async (req, res) => {
		try {
			const { requester } = createPanelRequester(res.locals.session);
			const { chatId, start, end, offset, limit } = req.body;
			res.json(
				await ownerBoundary(requester, 'history', {
					chatId,
					start,
					end,
					offset,
					limit,
				})
			);
		} catch {
			res.status(400).json({
				error:
					'Não foi possível consultar. Use um chat válido e um intervalo de até sete dias.',
			});
		}
	});
	app.post(['/api/chat', '/api/tool', '/api/approve'], async (req, res) => {
		const session: PanelSession = res.locals.session;
		if (session.busy)
			return res.status(409).json({
				error: 'Uma operação ainda está em andamento. Aguarde a conclusão.',
			});
		session.busy = true;
		try {
			const input = typeof req.body.input === 'string' ? req.body.input.trim() : '';
			const { requester, output } = createPanelRequester(session, input);
			if (req.path === '/api/chat') {
				if (!input || input.length > 12000)
					return res
						.status(400)
						.json({ error: 'Escreva uma mensagem com até 12 mil caracteres.' });
				await runPanelAi(requester, session.history);
				const answer =
					output.join('\n') || 'Não consegui concluir esta solicitação.';
				session.history = [
					...session.history,
					{ role: 'user' as const, content: input },
					{ role: 'assistant' as const, content: answer.slice(0, 16000) },
				].slice(-12);
			} else if (req.path === '/api/tool') {
				const allowed = [
					'owner_send_message',
					'owner_execute_command',
					'owner_set_periodic_posts',
				];
				if (
					!allowed.includes(req.body.name) ||
					!req.body.args ||
					typeof req.body.args !== 'object'
				)
					return res.status(400).json({ error: 'Ação inválida.' });
				await executeOwnerTool(requester, req.body.name, req.body.args);
			} else {
				if (
					typeof req.body.id !== 'string' ||
					!/^[a-f0-9]{16}$/.test(req.body.id) ||
					typeof req.body.accept !== 'boolean'
				)
					return res.status(400).json({ error: 'Confirmação inválida.' });
				// Revalidate the original WhatsApp delegation even for web approval clicks.
				await ownerBoundary(requester, 'authorize');
				const result = await approvalQueue.take(
					req.body.id,
					ownerOrigin(requester),
					req.body.accept,
					requester
				);
				if (!result.found)
					return res
						.status(409)
						.json({ error: 'Ação vencida ou já utilizada. Faça um novo pedido.' });
				output.push(result.cancelled ? 'Ação recusada.' : resultText(result.result));
			}
			if (!panelAuth.get(res.locals.token, res.locals.origin))
				return res.status(401).json({ error: 'Sua sessão terminou.' });
			res.json({
				text: output.join('\n').replace(/^\[#CalvoGpt?\]:\s*/i, ''),
				pending: approvalQueue.list(ownerOrigin(requester)),
			});
		} catch {
			res.status(400).json({
				error:
					'Não foi possível comprovar a conclusão. Confira sua sessão e o destino antes de repetir.',
			});
		} finally {
			session.busy = false;
		}
	});
	const publicDirectory = path.join(__dirname, 'public');
	app.get('/', (_req, res) => {
		res.sendFile(path.join(publicDirectory, 'index.html'));
	});
	app.use(
		express.static(publicDirectory, {
			index: false,
			dotfiles: 'deny',
			fallthrough: true,
		})
	);
	app.use((_req, res) => {
		res.status(404).json({ error: 'Página não encontrada.' });
	});
	app.use(
		(
			_error: unknown,
			_req: express.Request,
			res: express.Response,
			_next: express.NextFunction
		) => {
			res.status(400).json({ error: 'Solicitação inválida.' });
		}
	);
	return app;
};
export const startOwnerPanel = () => {
	const port = Number(process.env.WPP_PANEL_PORT || 4890);
	const server = createOwnerPanelApp().listen(port, '127.0.0.1', () =>
		console.log(
			`[OwnerPanel] ouvindo em 127.0.0.1:${port}; acesso externo via /wpp/`
		)
	);
	server.on('error', () =>
		console.error('[OwnerPanel] Não foi possível iniciar o painel.')
	);
	return server;
};
