import { botBans } from './store';

const [action, number, ...rest] = process.argv.slice(2);
if (action === 'ban' && number) {
	// Aliases are supplied from verified boundary mappings by the operator.
	const aliases = rest.filter(value => value.includes('@'));
	const reason = rest.filter(value => !value.includes('@')).join(' ');
	botBans.ban(number, aliases, reason);
	console.log('Banimento salvo.');
} else if (action === 'unban' && number) {
	botBans.unban(number);
	console.log('Banimento removido.');
} else {
	console.error(
		'Uso: node dist/Services/Bans/manage.js ban NÚMERO [JID] [MOTIVO] | unban NÚMERO'
	);
	process.exitCode = 1;
}
