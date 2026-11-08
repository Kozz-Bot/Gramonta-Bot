import { AiToolInputError } from '../OwnerAI/contracts';

// Reviewed modules: commands whose effects and outputs stay in the source chat.
// Socket/resource guards provide a second check; global automations are not
// made local merely by changing their result destination.
const local = new Set([
	'8ball',
	's',
	'getstatus',
	'debug',
	'ping',
	'yt',
	'video',
	'audio',
	'ofenda',
	'horoscopo',
	'clima',
	'help',
	'coins',
	'copypasta',
	'cnpj',
	'tia',
	'news',
	'wordle',
	'todes',
	'meme',
	'ascii',
	'mine',
	'spotify',
	'poop',
	'water',
	'rpg',
	'faladores',
	'som',
	'del',
	'group',
	'botoes',
	'toaudio',
	'tw',
	'ig',
	'fb',
	'tt',
	'role',
	'lembrete',
	'mute',
]);
export const chatMethodAllowed = (module: string, method: string, owner = false) => {
	if (module === 'updates')
		return (
			owner &&
			['default', 'listar', 'buscar', 'adicionar', 'remover', 'help'].includes(
				method
			)
		);
	// Explicit owner request: this global control is exposed only to the real host.
	// The handler independently verifies identity; other global modules stay denied.
	if (module === 'ban')
		return owner && ['default', 'unban', 'list', 'help'].includes(method);
	if (module === 'reveal') return ['default', 'block', 'allow'].includes(method);
	if (module === 'all') return ['fallback', 'allow', 'deny'].includes(method);
	if (module === 'tags') return ['default', 'silence'].includes(method);
	return local.has(module);
};
export const assertChatMethod = (
	module: string,
	method: string,
	input: string,
	owner = false
) => {
	if (module === 'updates' && !owner)
		throw new AiToolInputError(
			'Apenas o dono do bot pode controlar os grupos de novidades.'
		);
	if (module === 'ban' && !owner)
		throw new AiToolInputError(
			'O WhatsApp não identificou o solicitante deste pedido como dono do bot. Apenas a conta dona pode administrar banimentos.'
		);
	if (!chatMethodAllowed(module, method, owner))
		throw new AiToolInputError(
			'Esse comando pode afetar outros chats e não está disponível por este atalho.'
		);
	if (
		module === 'lembrete' &&
		(/\s--privado(?:\s|$)/i.test(' ' + input) ||
			(method === 'privado' && /\son\s*$/i.test(input)))
	)
		throw new AiToolInputError(
			'Pela IA, lembretes ficam somente neste chat. Avisos no privado não são permitidos.'
		);
};
