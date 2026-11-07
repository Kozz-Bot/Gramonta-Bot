'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const esc = value =>
	String(value ?? '').replace(
		/[&<>"']/g,
		char =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
	);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const apiBase = new URL('./api/', location.href);
const pages = {
	overview: 'Visão geral',
	assistant: 'Assistente IA',
	chats: 'Chats e histórico',
	automations: 'Posts periódicos',
	commands: 'Comandos',
	activity: 'Ações e atividade',
	agents: 'Agentes externos',
};
const state = {
	page: 'overview',
	csrf: '',
	expiresAt: 0,
	data: null,
	wa: null,
	selectedChat: null,
	commandTarget: null,
	chatHistory: [],
	historyQuery: null,
	nextOffset: null,
	busy: false,
	pendingId: null,
};
let pairTimer, toastTimer, agentPolicy;
const friendlyTime = value =>
	new Date(value).toLocaleString('pt-BR', {
		dateStyle: 'short',
		timeStyle: 'short',
	});
const notify = message => {
	const toast = $('#toast');
	toast.textContent = message;
	toast.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		toast.hidden = true;
	}, 6500);
};
async function api(route, body) {
	const response = await fetch(new URL(route, apiBase), {
		method: body === undefined ? 'GET' : 'POST',
		credentials: 'same-origin',
		cache: 'no-store',
		headers:
			body === undefined
				? {}
				: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrf },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		if (response.status === 401) showLogin();
		throw new Error(
			data.error || 'O serviço está indisponível no momento. Tente novamente.'
		);
	}
	return data;
}
function showLogin() {
	clearTimeout(pairTimer);
	state.csrf = '';
	state.expiresAt = 0;
	state.data = null;
	state.wa = null;
	state.selectedChat = null;
	state.commandTarget = null;
	state.chatHistory = [];
	state.historyQuery = null;
	$('#workspace').hidden = true;
	$('#login-screen').hidden = false;
	$('#main-content').replaceChildren();
	$('#confirmation-dialog').close();
	$('#confirmation-preview').textContent = '';
	state.pendingId = null;
	$('#agent-policy-dialog').close();
	$('#agent-policy-name').textContent = '';
	$('#agent-policy-summary').textContent = '';
	$('#agent-policy-form').reset();
	agentPolicy = null;
	$('#login-controls').innerHTML =
		'<button id="start-login" class="button primary full">Autorizar pelo WhatsApp ' +
		icon('arrow') +
		'</button><p class="muted">Você receberá um código para enviar no chat consigo mesmo. A sessão dura até 30 dias.</p>';
	$('#start-login').addEventListener('click', startPairing);
	if (location.protocol !== 'https:') {
		$('#start-login').disabled = true;
		$('#login-feedback').textContent =
			'Abra /wpp/ pelo endereço HTTPS da sua infraestrutura para autorizar o acesso.';
	}
}
async function startPairing() {
	const button = $('#start-login');
	button.disabled = true;
	$('#login-feedback').textContent = '';
	try {
		const pair = await api('pair', {});
		$('#login-controls').innerHTML =
			`<div class="pair-code">${esc(pair.code)}</div><p class="muted">No WhatsApp, abra o chat <strong>consigo mesmo</strong> e envie:</p><div class="pair-command"><code>${esc(pair.command)}</code><button id="copy-command" aria-label="Copiar comando">Copiar</button></div><p class="muted">Use apenas o código deste navegador. Ele permite acessar seu WhatsApp pelo painel.</p><button id="new-code" class="text-link">Gerar outro código ${icon('arrow')}</button>`;
		$('#copy-command').addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(pair.command);
				notify('Comando copiado. Envie para você mesmo no WhatsApp.');
			} catch {
				notify('Selecione e copie o comando exibido.');
			}
		});
		$('#new-code').addEventListener('click', () => {
			showLogin();
			$('#start-login').click();
		});
		const poll = async () => {
			if (Date.now() >= pair.expiresAt) {
				showLogin();
				$('#login-feedback').textContent =
					'Este código venceu. Gere outro para continuar.';
				return;
			}
			try {
				const session = await api('auth');
				if (session.authenticated) {
					await enterWorkspace(session);
					return;
				}
				$('#login-feedback').textContent =
					'Aguardando sua autorização pelo WhatsApp…';
			} catch (error) {
				$('#login-feedback').textContent = error.message;
			}
			pairTimer = setTimeout(poll, 2500);
		};
		clearTimeout(pairTimer);
		pairTimer = setTimeout(poll, 1500);
	} catch (error) {
		$('#login-feedback').textContent = error.message;
		if (button.isConnected) button.disabled = false;
	}
}
async function enterWorkspace(session) {
	clearTimeout(pairTimer);
	state.csrf = session.csrf;
	state.expiresAt = session.expiresAt;
	$('#login-screen').hidden = true;
	$('#workspace').hidden = false;
	state.page = 'overview';
	$('#main-content').innerHTML =
		'<div class="loading">Preparando sua central…</div>';
	try {
		await refresh();
		navigate('overview');
	} catch (error) {
		if (state.csrf)
			$('#main-content').innerHTML =
				`<div class="error-note">${esc(error.message)}</div><button id="retry-load" class="button secondary">Tentar novamente</button>`;
		$('#retry-load')?.addEventListener('click', () => enterWorkspace(session));
	}
}
async function refresh() {
	const data = await api('state');
	if (!state.csrf) return;
	state.data = data;
	try {
		state.wa = await api('whatsapp');
	} catch {
		state.wa = null;
	}
	updatePendingCount();
}
function updatePendingCount() {
	const count = state.data?.pending?.length || 0;
	$('#pending-count').textContent = String(count);
	$('#pending-count').hidden = !count;
}
const heading = (eyebrow, title, description) =>
	`<div class="page-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div><span class="date-label">${esc(new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }))}</span></div>`;
const empty = (title, description, symbol = 'clock') =>
	`<div class="empty-state">${icon(symbol)}<strong>${title}</strong>${description}</div>`;
const composer = () =>
	`<form id="chat-form" class="composer"><label for="chat-input" class="sr-only">Sua mensagem para a IA</label><textarea id="chat-input" placeholder="Peça ao Gramonta. Ele cuida dos próximos passos." rows="2" maxlength="12000" required></textarea><button class="send-button" aria-label="Enviar mensagem">${icon('send')}</button></form><p class="composer-note">${icon('shield')} Envios e alterações precisam da sua confirmação.</p>`;
const connection = () => {
	const ready = state.wa?.ready;
	return `<div class="card connection-card"><div class="card-heading"><h2 class="card-title">Seu WhatsApp</h2>${icon('chat')}</div><div class="connection-status"><span class="status-dot"></span>${state.wa ? (ready ? 'Conectado' : 'Indisponível') : 'Sem resposta'}</div><p>${ready ? 'Conta registrada e pronta para receber seus comandos.' : 'A sessão precisa estar conectada e registrada para executar ações.'}</p><button class="text-link" id="refresh-status">Atualizar conexão ${icon('arrow')}</button></div>`;
};
function navigate(page) {
	if (!state.data || !state.csrf) return;
	state.page = pages[page] ? page : 'overview';
	$('#breadcrumb').textContent = pages[state.page];
	document
		.querySelectorAll('[data-page]')
		.forEach(button =>
			button.classList.toggle('active', button.dataset.page === state.page)
		);
	$('#sidebar').classList.remove('open');
	const main = $('#main-content');
	({
		overview: renderOverview,
		assistant: renderAssistant,
		chats: renderChats,
		automations: renderAutomations,
		commands: renderCommands,
		activity: renderActivity,
		agents: renderAgents,
	})[state.page](main);
	main.focus({ preventScroll: true });
	$('#refresh-status')?.addEventListener('click', async () => {
		try {
			await refresh();
			navigate(state.page);
		} catch (error) {
			notify(error.message);
		}
	});
}
function renderOverview(main) {
	const data = state.data,
		pending = data.pending.length;
	main.innerHTML =
		heading(
			'BEM-VINDO À SUA CENTRAL',
			'Hoje, tudo sob <em>controle.</em>',
			'Uma visão do seu WhatsApp, das suas automações e do que vem a seguir.'
		) +
		`<div class="stat-grid"><div class="stat-card"><span class="icon-tile lime">${icon('bolt')}</span><div><div class="stat-label">Módulos disponíveis</div><div class="stat-value">${data.modules.length}</div><div class="stat-note">Prontos para seus comandos</div></div></div><div class="stat-card"><span class="icon-tile tone-blue">${icon('clock')}</span><div><div class="stat-label">Grupos selecionados</div><div class="stat-value">${data.posts.groups.length}</div><div class="stat-note">Posts ${data.posts.enabled ? 'em execução' : 'pausados'}</div></div></div><div class="stat-card"><span class="icon-tile tone-peach">${icon('shield')}</span><div><div class="stat-label">Aguardando você</div><div class="stat-value">${pending.toString().padStart(2, '0')}</div><div class="stat-note">${pending ? 'Ações para revisar' : 'Nenhuma ação pendente'}</div></div></div></div><div class="dashboard-grid"><section class="card assistant-card"><div class="card-heading"><div class="assistant-intro"><span class="icon-tile lime">${icon('bolt')}</span><div><strong>Seu assistente, por aqui também.</strong><small>GRAMONTA IA</small></div></div><span class="label">FUEL IX</span></div><div class="assistant-welcome"><h2>O que vamos fazer agora?</h2><p>Do assunto que você perdeu à mensagem que precisa mandar. É só pedir.</p><div class="suggestions"><button class="chip" data-prompt="Quero um resumo de um grupo ontem à noite. Me ajude a escolher o grupo e o período.">Resumir uma conversa ↗</button><button class="chip" data-prompt="Quero habilitar posts periódicos em um grupo.">Configurar posts ↗</button><button class="chip" data-prompt="Quero enviar uma mensagem para um contato.">Avisar um contato ↗</button></div></div>${composer()}</section><div class="side-stack">${connection()}<section class="card security-card"><h2 class="card-title">Acesso só seu.</h2><ul class="security-list"><li>${icon('check')} Autorizado pelo seu WhatsApp</li><li>${icon('check')} Aprovação e autonomia por agente</li><li>${icon('check')} Sessão com tempo limitado</li></ul></section></div></div><div class="section-heading"><h2>O próximo passo é seu</h2><button class="text-link" id="open-activity">Ver ações e atividade ${icon('arrow')}</button></div><section class="card">${pending ? pendingRows() : empty('Nada esperando aprovação.', 'Quando você solicitar um envio ou uma alteração, a prévia aparece aqui.', 'shield')}</section>`;
	bindComposer();
	bindPending();
	$('#open-activity').addEventListener('click', () => navigate('activity'));
	document.querySelectorAll('[data-prompt]').forEach(button =>
		button.addEventListener('click', () => {
			navigate('assistant');
			$('#chat-input').value = button.dataset.prompt;
			$('#chat-input').focus();
		})
	);
}
function renderAssistant(main) {
	main.innerHTML =
		heading(
			'GRAMONTA IA',
			'Uma conversa. <em>Muitas possibilidades.</em>',
			'Peça em linguagem natural. O assistente encontra as ferramentas e prepara os próximos passos.'
		) +
		`<section class="card assistant-card"><div class="card-heading"><div class="assistant-intro"><span class="icon-tile lime">${icon('bolt')}</span><div><strong>Gramonta</strong><small>SEU ASSISTENTE NO WHATSAPP E NA WEB</small></div></div><span class="label">FUEL IX</span></div><div id="chat-log" class="chat-log" role="log" aria-live="polite"></div>${composer()}</section>`;
	const log = $('#chat-log');
	if (!state.data.history.length)
		log.innerHTML = empty(
			'Pode pedir. Estou por aqui.',
			'Me diga qual grupo, contato ou tarefa você quer cuidar. A conversa desta sessão fica apenas na sua central.',
			'bolt'
		);
	else
		state.data.history.forEach(item =>
			appendBubble(
				item.content.replace(/^\[#CalvoGpt?\]:\s*/i, ''),
				item.role === 'user' ? 'user' : 'assistant'
			)
		);
	bindComposer();
}
function appendBubble(text, kind = 'assistant') {
	const log = $('#chat-log');
	if (!log) return;
	$('.empty-state', log)?.remove();
	const bubble = document.createElement('div');
	bubble.className = `bubble ${kind}`;
	bubble.textContent = text;
	log.append(bubble);
	log.scrollTop = log.scrollHeight;
	return bubble;
}
function bindComposer() {
	$('#chat-form')?.addEventListener('submit', async event => {
		event.preventDefault();
		const input = $('#chat-input').value.trim();
		if (!input || state.busy) return;
		if (state.page !== 'assistant') {
			navigate('assistant');
			$('#chat-input').value = input;
		}
		state.busy = true;
		$('#chat-input').value = '';
		$('.send-button').disabled = true;
		appendBubble(input, 'user');
		const thinking = appendBubble('Consultando suas ferramentas…');
		try {
			const result = await api('chat', { input });
			thinking?.remove();
			appendBubble(result.text);
			state.data.pending = result.pending;
			updatePendingCount();
			await refresh();
			if (result.pending.length) showConfirmation(result.pending.at(-1).id);
		} catch (error) {
			thinking?.remove();
			appendBubble(error.message, 'error');
		} finally {
			state.busy = false;
			if ($('.send-button')) $('.send-button').disabled = false;
		}
	});
	$('#chat-input')?.addEventListener('keydown', event => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			$('#chat-form').requestSubmit();
		}
	});
}
const searchForm = (groupsOnly = false) =>
	`<form id="search-form" class="search-form"><label class="sr-only" for="search-input">Nome do contato ou grupo</label><input id="search-input" placeholder="${groupsOnly ? 'Encontre um grupo para adicionar…' : 'Busque um contato, grupo ou número…'}" maxlength="120" required><select id="search-kind" aria-label="Tipo de chat">${groupsOnly ? '<option value="group">Grupos</option>' : '<option value="all">Todos os chats</option><option value="group">Grupos</option><option value="contact">Contatos</option>'}</select><button class="button primary">${icon('search')} Buscar</button></form><div id="search-results" class="results-list"></div>`;
function bindSearch(mode = 'chats') {
	$('#search-form').addEventListener('submit', async event => {
		event.preventDefault();
		const button = $('#search-form button');
		button.disabled = true;
		try {
			const result = await api('search', {
				query: $('#search-input').value.trim(),
				kind: $('#search-kind').value,
			});
			const list = $('#search-results');
			list.innerHTML = result.matches.length
				? result.matches
						.map(
							(item, index) =>
								`<button class="result-row" data-result="${index}"><span class="avatar">${esc(item.name.slice(0, 1).toUpperCase())}</span><span><strong>${esc(item.name)}</strong><small>${esc(item.id)}</small></span><span class="text-link">${mode === 'posts' ? 'Adicionar e ativar' : 'Abrir'} ${icon('arrow')}</span></button>`
						)
						.join('')
				: empty(
						'Nenhum chat encontrado.',
						'Tente outro nome ou um número mais completo.',
						'search'
					);
			if (result.truncated)
				list.insertAdjacentHTML(
					'beforeend',
					'<p class="muted">Há mais resultados. Refine o nome para encontrar o chat certo.</p>'
				);
			list.querySelectorAll('[data-result]').forEach(button =>
				button.addEventListener('click', async () => {
					const target = result.matches[Number(button.dataset.result)];
					if (mode === 'posts')
						await prepareTool('owner_set_periodic_posts', {
							chatId: target.id,
							enabled: true,
						});
					else {
						state.selectedChat = target;
						state.chatHistory = [];
						state.nextOffset = null;
						state.historyQuery = null;
						renderChatDetail();
					}
				})
			);
		} catch (error) {
			notify(error.message);
		} finally {
			button.disabled = false;
		}
	});
}
function renderChats(main) {
	main.innerHTML =
		heading(
			'SEU WHATSAPP',
			'Cada conversa, <em>mais perto.</em>',
			'Encontre o chat certo, consulte um período ou prepare uma mensagem.'
		) +
		`<div class="split-grid"><section class="card card-pad"><h2 class="card-title">Encontre uma conversa</h2><p class="section-description">A busca usa seus contatos e grupos disponíveis no WhatsApp.</p>${searchForm()}</section><section id="chat-detail" class="card card-pad"></section></div>`;
	bindSearch();
	renderChatDetail();
}
const localInputTime = date => {
	const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return copy.toISOString().slice(0, 16);
};
function renderChatDetail() {
	const detail = $('#chat-detail');
	if (!detail) return;
	const chat = state.selectedChat;
	if (!chat) {
		detail.innerHTML = empty(
			'Qual conversa vamos abrir?',
			'Busque um contato ou grupo e selecione um resultado à esquerda.',
			'chat'
		);
		return;
	}
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	yesterday.setHours(18, 0, 0, 0);
	const end = new Date(yesterday);
	end.setHours(23, 59);
	detail.innerHTML = `<div class="card-heading"><div><h2 class="card-title">${esc(chat.name)}</h2><p class="card-subtitle">${esc(chat.id)}</p></div><button id="use-command-target" class="text-link">Usar nos comandos ${icon('arrow')}</button></div><form id="history-form"><div class="form-row"><div class="field"><label for="history-start">A partir de</label><input type="datetime-local" id="history-start" value="${localInputTime(yesterday)}" required></div><div class="field"><label for="history-end">Até</label><input type="datetime-local" id="history-end" value="${localInputTime(end)}" required></div></div><p class="muted">Horário do seu navegador. Consulte até sete dias de mensagens armazenadas.</p><button class="button secondary">Consultar histórico ${icon('arrow')}</button></form><div id="history-results"></div><form id="send-form"><div class="field"><label for="message-body">Uma mensagem para ${esc(chat.name)}</label><textarea id="message-body" placeholder="Escreva o texto que você quer enviar…" maxlength="4000" required></textarea></div><button class="button primary">Preparar mensagem ${icon('send')}</button></form>`;
	$('#use-command-target').addEventListener('click', () => {
		state.commandTarget = chat;
		navigate('commands');
	});
	$('#send-form').addEventListener('submit', async event => {
		event.preventDefault();
		await prepareTool('owner_send_message', {
			chatId: chat.id,
			body: $('#message-body').value,
		});
	});
	$('#history-form').addEventListener('submit', async event => {
		event.preventDefault();
		const start = new Date($('#history-start').value),
			end = new Date($('#history-end').value);
		if (
			!Number.isFinite(start.getTime()) ||
			!Number.isFinite(end.getTime()) ||
			end <= start ||
			end - start > 7 * 86400000
		) {
			notify('Escolha um intervalo válido de até sete dias.');
			return;
		}
		state.historyQuery = {
			chatId: chat.id,
			start: start.toISOString(),
			end: end.toISOString(),
			limit: 100,
		};
		state.chatHistory = [];
		await fetchHistory(0);
	});
	if (state.chatHistory.length) renderHistory();
}
async function fetchHistory(offset) {
	const region = $('#history-results');
	if (!region || !state.historyQuery) return;
	if (offset > 0 && region.getAttribute('aria-busy') === 'true') return;
	const query = state.historyQuery,
		requestId = (state.historyRequest = (state.historyRequest || 0) + 1);
	region.setAttribute('aria-busy', 'true');
	if ($('#load-more')) $('#load-more').disabled = true;
	try {
		const result = await api('history', { ...query, offset });
		if (
			state.historyRequest !== requestId ||
			state.historyQuery !== query ||
			state.selectedChat?.id !== query.chatId
		)
			return;
		state.chatHistory.push(...result.messages);
		state.nextOffset = result.nextOffset;
		state.totalHistory = result.totalStored;
		renderHistory();
	} catch (error) {
		notify(error.message);
	} finally {
		if (state.historyRequest === requestId) {
			region.removeAttribute('aria-busy');
			if ($('#load-more')) $('#load-more').disabled = false;
		}
	}
}
function renderHistory() {
	const region = $('#history-results');
	region.innerHTML =
		`<div class="section-heading"><h2>Histórico armazenado</h2><span class="label gray">${state.chatHistory.length} de ${state.totalHistory}</span></div>` +
		(state.chatHistory.length
			? state.chatHistory
					.map(
						message =>
							`<article class="history-message"><div class="history-author"><span>${esc(message.author)}</span><time>${esc(friendlyTime(message.timestamp))}</time></div><div class="history-body">${esc(message.body || `[${message.messageType}]`)}${message.bodyTruncated ? '\n[Texto truncado]' : ''}</div></article>`
					)
					.join('')
			: empty(
					'Nenhuma mensagem armazenada neste período.',
					'Isso não garante que a conversa ficou sem mensagens.'
				)) +
		(state.nextOffset !== null
			? '<button class="button secondary" id="load-more">Carregar próximas mensagens</button>'
			: '') +
		'<p class="hint">Somente o histórico disponível no banco local. Mídias não são carregadas nesta consulta.</p>';
	$('#load-more')?.addEventListener('click', () => fetchHistory(state.nextOffset));
}
function renderAutomations(main) {
	const settings = state.data.posts;
	main.innerHTML =
		heading(
			'AUTOMAÇÕES',
			'Os posts seguem. <em>Você escolhe onde.</em>',
			'Gerencie os grupos que recebem as mídias periódicas do Gramonta, na mesma agenda dos Status.'
		) +
		`<div class="split-grid"><section class="card card-pad"><div class="card-heading"><div><h2 class="card-title">Envios para grupos</h2><p class="card-subtitle">${settings.groups.length} grupos selecionados</p></div><span class="label ${settings.enabled ? '' : 'gray'}">${settings.enabled ? 'EM EXECUÇÃO' : 'PAUSADOS'}</span></div><p class="section-description">Pausar ou retomar afeta todos os grupos selecionados. Cada alteração gera uma prévia para você aprovar.</p><button id="toggle-posts" class="button ${settings.enabled ? 'secondary' : 'primary'}" ${!settings.groups.length ? 'disabled' : ''}>${settings.enabled ? 'Pausar todos os envios' : 'Retomar nos grupos selecionados'} ${icon('arrow')}</button><div class="results-list">${settings.groups.length ? settings.groups.map((group, index) => `<div class="result-row"><span class="avatar">${esc(group.name.slice(0, 1))}</span><span><strong>${esc(group.name)}</strong><small>${esc(group.id)}</small></span><button class="text-link" data-remove-group="${index}">Remover</button></div>`).join('') : empty('Seus grupos começam aqui.', 'Busque um grupo ao lado para preparar a ativação.', 'clock')}</div></section><section class="card card-pad"><h2 class="card-title">Adicionar um grupo</h2><p class="section-description">Adicionar e ativar também retoma os outros grupos que já estavam selecionados. A prévia mostra a lista resultante.</p>${searchForm(true)}</section></div>`;
	bindSearch('posts');
	$('#toggle-posts').addEventListener('click', () =>
		prepareTool('owner_execute_command', {
			module: 'autostatus',
			method: settings.enabled ? 'parar' : 'iniciar',
			chatId: state.data.selfChatId,
			immediateArg: '',
			namedArgs: '{}',
		})
	);
	document.querySelectorAll('[data-remove-group]').forEach(button =>
		button.addEventListener('click', () =>
			prepareTool('owner_set_periodic_posts', {
				chatId: settings.groups[Number(button.dataset.removeGroup)].id,
				enabled: false,
			})
		)
	);
}
function renderCommands(main) {
	const modules = state.data.modules,
		target = state.commandTarget || {
			id: state.data.selfChatId,
			name: 'Chat comigo mesmo',
		};
	main.innerHTML =
		heading(
			'COMANDOS DO BOT',
			'Todas as ferramentas. <em>Um lugar só.</em>',
			'Escolha um módulo e prepare a execução. As permissões e os limites de cada comando continuam valendo.'
		) +
		`<div class="split-grid"><section class="card card-pad"><h2 class="card-title">Preparar um comando</h2><form id="command-form"><div class="form-row"><div class="field"><label for="command-module">Módulo</label><select id="command-module">${modules.map(module => `<option>${esc(module.name)}</option>`).join('')}</select></div><div class="field"><label for="command-method">Comando</label><select id="command-method"></select></div></div><div class="field"><label for="command-text">Texto do comando</label><textarea id="command-text" placeholder="Preencha se o comando precisar de um texto ou argumento…" maxlength="4000"></textarea></div><div id="command-fields"></div><button class="button primary">Revisar execução ${icon('arrow')}</button></form></section><div class="side-stack"><section class="card card-pad"><h2 class="card-title">Destino dos resultados</h2><div class="result-row"><span class="avatar">${esc(target.name.slice(0, 1))}</span><span><strong>${esc(target.name)}</strong><small>${esc(target.id)}</small></span></div><p class="muted">O módulo pode enviar mensagens ou alterar configurações nesse destino. Para escolher outro chat, use a busca.</p><button id="choose-target" class="text-link">Escolher um chat ${icon('arrow')}</button></section><section class="card card-pad"><h2 class="card-title">Uma confirmação por vez.</h2><p class="muted">Você verá o comando, seus argumentos e o destino antes de executar. Comandos de mídia devem ser usados no WhatsApp com o arquivo anexado.</p></section></div></div>`;
	const moduleSelect = $('#command-module'),
		methodSelect = $('#command-method');
	const selectedMethod = () =>
		modules
			.find(module => module.name === moduleSelect.value)
			?.methods.find(method => method.method === methodSelect.value);
	const fields = () => {
		const method = selectedMethod();
		$('#command-fields').innerHTML = Object.entries(method?.args || {})
			.map(
				([name, type], index) =>
					`<div class="field"><label for="arg-${index}">${esc(name)} ${type.endsWith('?') ? '(opcional)' : ''} · ${esc(type.replace('?', ''))}</label><input id="arg-${index}" data-arg="${esc(name)}" data-type="${esc(type)}" ${type === 'boolean' || type === 'boolean?' ? 'placeholder="true ou false"' : ''} ${type.endsWith('?') ? '' : 'required'}></div>`
			)
			.join('');
	};
	const methods = () => {
		const module = modules.find(module => module.name === moduleSelect.value);
		methodSelect.innerHTML = (module?.methods || [])
			.map(method => `<option>${esc(method.method)}</option>`)
			.join('');
		fields();
	};
	moduleSelect.addEventListener('change', methods);
	methodSelect.addEventListener('change', fields);
	methods();
	$('#choose-target').addEventListener('click', () => navigate('chats'));
	$('#command-form').addEventListener('submit', async event => {
		event.preventDefault();
		const args = {};
		try {
			document.querySelectorAll('[data-arg]').forEach(input => {
				const type = input.dataset.type,
					raw = input.value.trim();
				if (!raw && type.endsWith('?')) return;
				const parse = value => {
					if (type.startsWith('number')) {
						const number = Number(value);
						if (!Number.isFinite(number))
							throw new Error('Preencha os campos numéricos com números válidos.');
						return number;
					}
					if (type.startsWith('boolean')) {
						if (!['true', 'false'].includes(value))
							throw new Error('Use true ou false nos campos booleanos.');
						return value === 'true';
					}
					return value;
				};
				args[input.dataset.arg] = type.includes('[]')
					? raw.split(',').map(value => parse(value.trim()))
					: parse(raw);
			});
			await prepareTool('owner_execute_command', {
				module: moduleSelect.value,
				method: methodSelect.value,
				chatId: target.id,
				immediateArg: $('#command-text').value,
				namedArgs: JSON.stringify(args),
			});
		} catch (error) {
			notify(error.message);
		}
	});
}
function pendingRows() {
	return state.data.pending
		.map(
			action =>
				`<div class="pending-row"><div><strong>${esc(action.preview.split('\n').find(line => line.trim()) || 'Ação pendente')}</strong><p>Expira em ${esc(new Date(action.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}</p></div><button class="button secondary" data-pending="${esc(action.id)}">Revisar ${icon('arrow')}</button></div>`
		)
		.join('');
}
async function renderAgents(main) {
	main.innerHTML =
		heading(
			'CONEXÕES AUTORIZADAS',
			'Agentes externos',
			'Gerencie permissões, autonomia e aprovações dos agentes conectados ao seu WhatsApp.'
		) +
		'<section id="agents-content" class="card card-pad">Carregando agentes…</section>';
	try {
		const data = await api('agents');
		if (state.page !== 'agents' || !state.csrf) return;
		const region = $('#agents-content');
		region.innerHTML =
			`<h2 class="card-title">Conectar um agente</h2><p class="section-description">Adicione este endereço como servidor MCP remoto no seu cliente. A conexão abre uma autorização no navegador e exige confirmação no chat consigo mesmo.</p><pre class="history-body">${esc(data.endpoint || 'MCP ainda não configurado.')}</pre><button id="refresh-agents" class="button secondary">Atualizar solicitações</button><h2 class="card-title">Acessos ativos</h2>` +
			(data.agents.length
				? data.agents
						.map(
							agent =>
								`<article class="history-message"><strong>${esc(agent.name)}</strong><p class="label ${agent.approvalMode === 'automatic' ? '' : 'gray'}">${agent.approvalMode === 'automatic' ? 'AUTÔNOMO · SEM APROVAÇÃO POR AÇÃO' : 'APROVAÇÃO POR AÇÃO'}</p><p class="muted">Expira em ${esc(friendlyTime(agent.expiresAt))}</p><p class="history-body">Permissões: ${esc(agent.permissions.scopes.join(', '))}\nChats: ${esc(agent.permissions.chats.join(', '))}\nMétodos: ${esc(agent.permissions.commands.includes('*') ? 'Todos os métodos, atuais e futuros' : agent.permissions.commands.join(', ') || 'nenhum')}</p><button class="button secondary" data-policy-agent="${esc(agent.id)}">Configurar autorização</button><button class="button secondary" data-revoke-agent="${esc(agent.id)}">Revogar acesso</button></article>`
						)
						.join('')
				: '<p class="muted">Nenhum agente autorizado.</p>') +
			'<h2 class="card-title">Ações aguardando sua aprovação</h2>' +
			(data.pending.length
				? data.pending
						.map(
							action =>
								`<article class="history-message"><strong>${esc(action.agentName)}</strong><pre class="history-body">${esc(action.preview)}</pre>${action.imageBase64 ? `<img class="agent-preview" alt="Imagem exata que será aplicada ao grupo" src="data:image/jpeg;base64,${esc(action.imageBase64)}">` : ''}<p class="muted">Expira em ${esc(friendlyTime(action.expiresAt))}. Confira todos os efeitos antes de aprovar.</p><button class="button primary" data-agent-action="${esc(action.id)}" data-accept="true">Aceitar e executar</button><button class="button secondary" data-agent-action="${esc(action.id)}" data-accept="false">Recusar</button></article>`
						)
						.join('')
				: '<p class="muted">Nenhuma ação pendente.</p>');
		$('#refresh-agents').addEventListener('click', () => renderAgents(main));
		document
			.querySelectorAll('[data-policy-agent]')
			.forEach(button =>
				button.addEventListener('click', () =>
					openAgentPolicy(data.agents.find(a => a.id === button.dataset.policyAgent))
				)
			);
		document.querySelectorAll('[data-revoke-agent]').forEach(button =>
			button.addEventListener('click', async () => {
				button.disabled = true;
				try {
					await api('agents/revoke', { id: button.dataset.revokeAgent });
					notify('Acesso do agente revogado.');
					await renderAgents(main);
				} catch (error) {
					notify(error.message);
					button.disabled = false;
				}
			})
		);
		document.querySelectorAll('[data-agent-action]').forEach(button =>
			button.addEventListener('click', async () => {
				if (state.busy) return;
				state.busy = true;
				button.disabled = true;
				try {
					const result = await api('agents/approve', {
						id: button.dataset.agentAction,
						accept: button.dataset.accept === 'true',
					});
					notify(
						result.status === 'rejected'
							? 'Ação recusada.'
							: 'Ação executada. Confira o WhatsApp; submissão não comprova entrega.'
					);
				} catch (error) {
					notify(error.message);
				} finally {
					state.busy = false;
					await renderAgents(main);
				}
			})
		);
	} catch (error) {
		if (state.page === 'agents' && $('#agents-content'))
			$('#agents-content').textContent = error.message;
	}
}
function openAgentPolicy(agent) {
	if (!agent) return;
	agentPolicy = agent;
	$('#agent-policy-form').reset();
	$('#agent-policy-feedback').textContent = '';
	$('#agent-policy-name').textContent = agent.name;
	$('#agent-policy-summary').textContent =
		`Cliente: ${agent.clientId || agent.id}\nFerramentas: ${agent.permissions.scopes.join(', ')}\nChats: ${agent.permissions.chats.join(', ')}\nVálido até: ${friendlyTime(agent.expiresAt)}`;
	$('#agent-approval-mode').value = agent.approvalMode || 'manual';
	$('#agent-commands-section').hidden =
		!agent.permissions.scopes.includes('whatsapp.commands');
	$('#agent-all-commands').disabled = !agent.permissions.chats.includes('*');
	$('#agent-all-commands').checked = agent.permissions.commands.includes('*');
	$('#agent-methods').value = agent.permissions.commands
		.filter(m => m !== '*')
		.join('\n');
	updateAgentPolicyForm();
	$('#agent-policy-dialog').showModal();
}
function updateAgentPolicyForm() {
	const all = $('#agent-all-commands').checked,
		automatic = $('#agent-approval-mode').value === 'automatic';
	const needsConsent =
		automatic || (all && !agentPolicy?.permissions.commands.includes('*'));
	$('#agent-commands-list').hidden = all;
	$('#agent-methods').required = Boolean(
		agentPolicy?.permissions.scopes.includes('whatsapp.commands') && !all
	);
	$('#agent-policy-consent').hidden = !needsConsent;
	$('#agent-policy-understood').required = needsConsent;
	$('#agent-policy-confirmation').required = needsConsent;
	$('#agent-policy-confirmation').pattern = needsConsent ? 'AUTORIZAR' : '.*';
}
$('#agent-approval-mode').addEventListener('change', updateAgentPolicyForm);
$('#agent-all-commands').addEventListener('change', updateAgentPolicyForm);
$('#close-agent-policy').addEventListener('click', () =>
	$('#agent-policy-dialog').close()
);
$('#cancel-agent-policy').addEventListener('click', () =>
	$('#agent-policy-dialog').close()
);
$('#agent-policy-form').addEventListener('submit', async event => {
	event.preventDefault();
	if (!agentPolicy || state.busy || !$('#agent-policy-form').reportValidity())
		return;
	const agent = agentPolicy;
	state.busy = true;
	$('#save-agent-policy').disabled = true;
	try {
		await api('agents/policy', {
			id: agent.id,
			expectedVersion: agent.policyVersion || 0,
			approvalMode: $('#agent-approval-mode').value,
			allCommands: $('#agent-all-commands').checked,
			commands: $('#agent-methods').value.split(/\s+/).filter(Boolean),
			understood: $('#agent-policy-understood').checked,
			confirmation: $('#agent-policy-confirmation').value,
		});
		$('#agent-policy-dialog').close();
		notify(
			'Autorização atualizada. Peça ao agente para atualizar a lista de ferramentas.'
		);
		if (state.page === 'agents') await renderAgents($('#main-content'));
	} catch (error) {
		$('#agent-policy-feedback').textContent = error.message;
	} finally {
		state.busy = false;
		$('#save-agent-policy').disabled = false;
	}
});
function bindPending() {
	document
		.querySelectorAll('[data-pending]')
		.forEach(button =>
			button.addEventListener('click', () =>
				showConfirmation(button.dataset.pending)
			)
		);
}
function renderActivity(main) {
	const status = {
			started: 'Iniciada',
			completed: 'Concluída',
			failed_or_unknown: 'Falha ou resultado incerto',
			autonomy_enabled: 'Autonomia autorizada',
			approval_required: 'Aprovação por ação ativada',
		},
		operations = {
			mcp_policy: 'Permissão de agente',
			owner_send_message: 'Envio de mensagem',
			owner_execute_command: 'Execução de comando',
			owner_set_periodic_posts: 'Posts periódicos',
		};
	main.innerHTML =
		heading(
			'AÇÕES E ATIVIDADE',
			'O que acontece passa <em>por você.</em>',
			'Revise as solicitações desta sessão e acompanhe os registros de execução.'
		) +
		`<div class="section-heading"><h2>Aguardando sua confirmação</h2><button class="text-link" id="refresh-activity">Atualizar ${icon('arrow')}</button></div><section class="card">${state.data.pending.length ? pendingRows() : empty('Tudo em dia.', 'Nenhuma solicitação aguardando sua confirmação.', 'shield')}</section><div class="section-heading"><h2>Atividade recente</h2><span class="label gray">SEM CONTEÚDO DAS MENSAGENS</span></div><section class="card card-pad">${state.data.activity.length ? state.data.activity.map(item => `<div class="audit-row"><span><strong>${esc(operations[item.operation] || 'Ação')}</strong><br><span class="muted">${esc(status[item.status] || item.status)}</span></span><time>${esc(friendlyTime(item.at))}</time></div>`).join('') : empty('Sua atividade aparece aqui.', 'O registro guarda apenas o tipo da ação e seu resultado.')}<p class="muted">Submissão não comprova entrega ou leitura. Ações incertas não são repetidas automaticamente.</p></section>`;
	bindPending();
	$('#refresh-activity').addEventListener('click', async () => {
		try {
			await refresh();
			navigate('activity');
		} catch (error) {
			notify(error.message);
		}
	});
}
async function prepareTool(name, args) {
	if (state.busy) {
		notify('Aguarde a operação atual terminar.');
		return;
	}
	state.busy = true;
	try {
		const result = await api('tool', { name, args });
		state.data.pending = result.pending;
		updatePendingCount();
		const pending = result.pending.at(-1);
		if (pending) showConfirmation(pending.id);
		else notify(result.text || 'Não foi criada uma prévia.');
	} catch (error) {
		notify(error.message);
	} finally {
		state.busy = false;
	}
}
function showConfirmation(id) {
	const pending = state.data?.pending.find(action => action.id === id);
	if (!pending) {
		notify('Esta ação não está mais disponível. Atualize o painel.');
		return;
	}
	state.pendingId = id;
	$('#confirmation-preview').textContent = pending.preview;
	$('#confirmation-dialog').showModal();
}
async function decide(accept) {
	if (state.busy || !state.pendingId) return;
	state.busy = true;
	const id = state.pendingId;
	$('#accept-action').disabled = true;
	$('#reject-action').disabled = true;
	try {
		const result = await api('approve', { id, accept });
		$('#confirmation-dialog').close();
		notify(result.text);
		state.data.pending = result.pending;
		updatePendingCount();
		await refresh();
		navigate(state.page);
	} catch (error) {
		$('#confirmation-dialog').close();
		notify(error.message);
		if (state.csrf) {
			try {
				await refresh();
				navigate(state.page);
			} catch {}
		}
	} finally {
		state.busy = false;
		state.pendingId = null;
		$('#accept-action').disabled = false;
		$('#reject-action').disabled = false;
	}
}
document
	.querySelectorAll('.nav-item')
	.forEach(button =>
		button.addEventListener('click', () => navigate(button.dataset.page))
	);
$('#mobile-menu').addEventListener('click', () =>
	$('#sidebar').classList.toggle('open')
);
$('#close-dialog').addEventListener('click', () =>
	$('#confirmation-dialog').close()
);
$('#accept-action').addEventListener('click', () => decide(true));
$('#reject-action').addEventListener('click', () => decide(false));
$('#logout-all').addEventListener('click', async () => {
	try {
		await api('logout-all', {});
		showLogin();
		notify('Todos os acessos foram encerrados.');
	} catch (error) {
		notify(error.message);
	}
});
$('#logout').addEventListener('click', async () => {
	try {
		await api('logout', {});
		showLogin();
		notify('Sessão encerrada.');
	} catch (error) {
		notify(error.message);
	}
});
setInterval(() => {
	if (!state.csrf) return;
	const minutes = Math.ceil((state.expiresAt - Date.now()) / 60000);
	if (minutes <= 0) {
		showLogin();
		notify('Sua sessão terminou. Autorize novamente pelo WhatsApp.');
	} else {
		const remaining =
			minutes > 1440
				? Math.ceil(minutes / 1440) + ' d'
				: minutes > 60
					? Math.ceil(minutes / 60) + ' h'
					: minutes + ' min';
		$('#session-status').innerHTML =
			'<span class="status-dot"></span>Sessão privada · ' + remaining;
	}
}, 15000);
showLogin();
api('auth')
	.then(session => {
		if (session.authenticated) return enterWorkspace(session);
	})
	.catch(error => {
		$('#login-feedback').textContent = error.message;
	});
