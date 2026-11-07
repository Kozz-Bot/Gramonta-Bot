#!/usr/bin/env node
// Invoked by the agent after a successful push and deployment, never by pre-push.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createUpdateGroupsStore } = require('../dist/Services/Updates/store');
const { publishUpdate } = require('../dist/Services/Updates/publish');
const { createModule } = require('kozz-module-maker');

async function main() {
	const args = process.argv.slice(2);
	const options = {};
	for (let i = 0; i < args.length; i += 2) {
		if (
			!['--repo', '--summary-file', '--group-summaries-file'].includes(args[i]) ||
			!args[i + 1] ||
			Object.hasOwn(options, args[i])
		)
			throw new Error('Opções de aviso inválidas.');
		options[args[i]] = args[i + 1];
	}
	if (
		!options['--repo'] ||
		(!options['--summary-file'] && !options['--group-summaries-file'])
	)
		throw new Error(
			'Uso: node --env-file=.env scripts/announce-update.cjs --repo CAMINHO_DO_REPO [--summary-file RESUMO_GERAL] [--group-summaries-file JSON_POR_GRUPO]'
		);
	const selected = createUpdateGroupsStore().list();
	if (!selected.length) {
		console.log('Nenhum grupo selecionado; sem avisos.');
		return;
	}
	const git = (...command) =>
		execFileSync('git', ['-C', options['--repo'], ...command], {
			encoding: 'utf8',
			timeout: 20000,
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	const branch = git('symbolic-ref', '--short', 'HEAD');
	const commit = git('rev-parse', 'HEAD');
	const upstream = git(
		'rev-parse',
		'--abbrev-ref',
		'--symbolic-full-name',
		'@{upstream}'
	);
	const remote = git('config', `branch.${branch}.remote`);
	const ref = git('config', `branch.${branch}.merge`);
	if (!remote || remote === '.' || !ref.startsWith('refs/heads/'))
		throw new Error('Branch sem remoto de push verificável.');
	const remoteHead = git('ls-remote', '--exit-code', remote, ref).split(/\s/)[0];
	const repository = createHash('sha256')
		.update(git('remote', 'get-url', remote))
		.digest('hex');
	if (remoteHead !== commit)
		throw new Error(
			'O HEAD local ainda não é o commit publicado na branch remota. Faça o push primeiro.'
		);
	const summary = options['--summary-file']
		? fs.readFileSync(options['--summary-file'], 'utf8').trim()
		: '';
	const groupSummaries = options['--group-summaries-file']
		? JSON.parse(fs.readFileSync(options['--group-summaries-file'], 'utf8'))
		: undefined;
	if ((!summary && !groupSummaries) || summary.length > 3500)
		throw new Error('Resumo deve ter entre 1 e 3500 caracteres.');
	if (!process.env.GATEWAY_URL) throw new Error('GATEWAY_URL indisponível.');
	const runtime = createModule({
		name: `updates-push-${Date.now()}`,
		namespace: 'default',
		address: process.env.GATEWAY_URL,
		customSocketPath: process.env.SOCKET_PATH,
	});
	const deadline = setTimeout(() => {
		runtime.socket.disconnect();
		console.error('Tempo de conexão excedido; não repita avisos incertos.');
		process.exitCode = 1;
	}, 55000);
	try {
		await new Promise((resolve, reject) => {
			runtime.socket.once('introduction_ack', ack =>
				ack?.success ? resolve() : reject(new Error('Gateway recusou o registro.'))
			);
			runtime.socket.once('connect_error', () =>
				reject(new Error('Falha na conexão ao gateway.'))
			);
			runtime.socket.once('disconnect', () =>
				reject(new Error('Gateway desconectado.'))
			);
		});
		const ask = async resource => {
			let timer;
			try {
				return (
					await Promise.race([
						runtime.ask.boundary('kozz-zapo', resource),
						new Promise((_, reject) => {
							timer = setTimeout(
								() => reject(new Error('Consulta à ZAPO excedeu o prazo.')),
								15000
							);
						}),
					])
				).response;
			} finally {
				clearTimeout(timer);
			}
		};
		const status = await ask('chat_status');
		if (!status?.connected || !status.registered || status.hasQr !== false)
			throw new Error('WhatsApp não está pronto.');
		const groups = await ask('all_groups');
		if (!Array.isArray(groups))
			throw new Error('Não foi possível validar os grupos.');
		const results = await publishUpdate({
			repository,
			commit,
			summary,
			groupSummaries,
			groups,
			send: (id, body) => {
				if (!runtime.socket.connected) throw new Error('Gateway desconectado.');
				runtime.sendMessage(id, 'kozz-zapo', body);
			},
		});
		// sendMessage confirms emission to the socket, not WhatsApp delivery.
		await new Promise(resolve => setTimeout(resolve, 2000));
		console.log(JSON.stringify({ commit, results, deliveryConfirmed: false }));
		if (
			results.some(r =>
				['unavailable', 'failed_or_unknown_do_not_retry'].includes(r.status)
			)
		)
			process.exitCode = 1;
	} finally {
		clearTimeout(deadline);
		runtime.socket.disconnect();
	}
}
main().catch(error => {
	console.error(
		error.message?.startsWith('Command failed:')
			? 'Não foi possível verificar o push no Git remoto.'
			: error.message
	);
	process.exitCode = 1;
});
