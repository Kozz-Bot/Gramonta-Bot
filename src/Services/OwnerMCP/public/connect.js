'use strict';
const $ = s => document.querySelector(s);
const labels = {
	'whatsapp.read': 'Buscar conversas e ler histórico local',
	'whatsapp.send': 'Preparar envio de mensagens',
	'whatsapp.commands': 'Consultar e executar os métodos de módulos selecionados',
	'whatsapp.groups': 'Preparar alteração de nome e foto de grupos',
	'whatsapp.automations': 'Consultar e alterar posts periódicos',
};
let request,
	panelCsrf = '',
	selected = new Map(),
	polling;
const feedback = message => {
	$('#feedback').textContent = message;
};
async function api(path, body, csrf) {
	const r = await fetch('/wpp/' + path, {
		method: body === undefined ? 'GET' : 'POST',
		credentials: 'same-origin',
		cache: 'no-store',
		headers:
			body === undefined
				? {}
				: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf || '' },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const value = await r.json().catch(() => ({}));
	if (!r.ok) throw new Error(value.error || 'Solicitação recusada.');
	return value;
}
async function load() {
	try {
		const session = await api('api/auth');
		if (!session.authenticated) {
			$('#login').hidden = false;
			feedback('Autorize seu navegador para revisar a conexão.');
			return;
		}
		panelCsrf = session.csrf;
		request = await api('oauth/request');
		$('#login').hidden = true;
		$('#client-name').textContent = request.clientName;
		$('#redirect').textContent = request.redirect;
		$('#client-id').textContent = request.clientId;
		const region = $('#scopes');
		region.replaceChildren();
		for (const scope of request.requestedScopes) {
			const label = document.createElement('label'),
				input = document.createElement('input');
			input.type = 'checkbox';
			input.value = scope;
			input.name = 'scope';
			input.checked = scope === 'whatsapp.read';
			input.addEventListener('change', update);
			label.append(input, document.createTextNode(labels[scope] || scope));
			region.append(label);
		}
		$('#details').hidden = false;
		feedback('Confira o cliente e selecione as permissões.');
		update();
		if (request.pending) {
			$('#consent').hidden = true;
			$('#phone').hidden = false;
			$('#command').textContent = request.command;
			feedback('Há uma autorização preparada. Conclua os comandos no WhatsApp.');
			poll();
		}
	} catch {
		feedback(
			'A solicitação venceu ou está indisponível. Inicie uma nova conexão no agente.'
		);
	}
}
function update() {
	$('#command-area').hidden = ![
		...document.querySelectorAll('[name=scope]:checked'),
	].some(i => i.value === 'whatsapp.commands');
	$('#chat-search').hidden = $('#all-chats').checked;
	$('#command-list').hidden = $('#all-commands').checked;
}
$('#all-commands').addEventListener('change', update);
$('#all-chats').addEventListener('change', update);
$('#retry').addEventListener('click', load);
$('#search').addEventListener('click', async () => {
	try {
		const data = await api(
				'api/search',
				{ query: $('#query').value, kind: 'all' },
				panelCsrf
			),
			region = $('#matches');
		region.replaceChildren();
		for (const chat of data.matches) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'button secondary';
			button.textContent = chat.name + ' (' + chat.id + ')';
			button.addEventListener('click', () => {
				selected.set(chat.id, chat.name);
				renderSelected();
			});
			region.append(button);
		}
		feedback(
			data.matches.length
				? 'Selecione as conversas que deseja autorizar.'
				: 'Nenhuma conversa encontrada.'
		);
	} catch {
		feedback('Não foi possível buscar. Confira sua sessão na central.');
	}
});
function renderSelected() {
	const region = $('#selected');
	region.replaceChildren();
	for (const [id, name] of selected) {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'button secondary';
		b.textContent = name + ' ×';
		b.addEventListener('click', () => {
			selected.delete(id);
			renderSelected();
		});
		region.append(b);
	}
}
$('#consent').addEventListener('submit', async event => {
	event.preventDefault();
	const button = event.submitter || $('#consent button:not([type=button])');
	button.disabled = true;
	try {
		const selectedScopes = [
			...document.querySelectorAll('[name=scope]:checked'),
		].map(i => i.value);
		const permissions = {
			scopes: selectedScopes,
			chats: $('#all-chats').checked ? ['*'] : [...selected.keys()],
			commands: selectedScopes.includes('whatsapp.commands')
				? $('#all-commands').checked
					? ['*']
					: $('#commands').value.split(/\s+/).filter(Boolean)
				: [],
		};
		if (!permissions.scopes.length)
			throw new Error('Selecione ao menos uma categoria de ferramentas.');
		if (
			selectedScopes.some(s =>
				['whatsapp.commands', 'whatsapp.automations'].includes(s)
			) &&
			!$('#all-chats').checked
		)
			throw new Error(
				'Para autorizar comandos ou posts periódicos, marque Permitir todos os chats da conta.'
			);
		if (!permissions.chats.length)
			throw new Error(
				'Selecione ao menos uma conversa ou marque Permitir todos os chats da conta.'
			);
		if (selectedScopes.includes('whatsapp.commands') && !permissions.commands.length)
			throw new Error(
				'Marque Autorizar todos os métodos ou preencha a lista de métodos permitidos.'
			);
		if (Date.now() >= request.expiresAt)
			throw new Error('A solicitação venceu. Inicie uma nova conexão no agente.');
		const data = await api(
			'oauth/consent',
			{ permissions, days: Number($('#days').value) },
			request.csrf
		);
		$('#consent').hidden = true;
		$('#phone').hidden = false;
		$('#command').textContent = data.command;
		feedback('Aguardando revisão e confirmação pelo seu aparelho.');
		poll();
	} catch (error) {
		feedback(
			error.message === 'invalid_consent'
				? 'Não foi possível preparar a autorização. Atualize esta página e confira ferramentas, chats e métodos; se a solicitação venceu, inicie outra conexão.'
				: error.message
		);
		button.disabled = false;
	}
});
$('#copy').addEventListener('click', () =>
	navigator.clipboard
		.writeText($('#command').textContent)
		.catch(() => feedback('Selecione e copie o comando exibido.'))
);
async function poll() {
	clearTimeout(polling);
	try {
		const data = await api('oauth/poll', {}, request.csrf);
		if (data.redirect) {
			location.replace(data.redirect);
			return;
		}
		if (Date.now() >= request.expiresAt) {
			feedback('Solicitação vencida. Inicie uma nova conexão.');
			return;
		}
	} catch {
		feedback(
			'Não foi possível continuar. Confira sua sessão ou inicie outra conexão.'
		);
		return;
	}
	polling = setTimeout(poll, 2500);
}
load();
