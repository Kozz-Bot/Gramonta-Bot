import {
	AiToolInputError,
	registerAiContract,
} from '../../Services/OwnerAI/contracts';
import { parseReminder } from './store';

export const validateReminderInvocation = (
	method: string,
	input: string,
	chatId: string
) => {
	try {
		if (['criar', 'default', 'fallback'].includes(method)) {
			const parsed = parseReminder(input);
			if (parsed.private && !chatId.endsWith('@g.us'))
				throw new Error('--privado exige um grupo como destino.');
		} else if (
			['ver', 'cancelar'].includes(method) &&
			!/^[a-f0-9]{16}$/i.test(input)
		)
			throw new Error('Informe somente o código de 16 caracteres do lembrete.');
		else if (method === 'privado' && !/^[a-f0-9]{16}\s+(on|off)$/i.test(input))
			throw new Error('Use CÓDIGO on ou CÓDIGO off.');
		else if (
			method === 'pessoas' &&
			!/^[a-f0-9]{16}(?:\s+(?:@\d+\s*)+)?$/i.test(input)
		)
			throw new Error('Use CÓDIGO @contato @outro, com marcações válidas.');
	} catch (error) {
		throw new AiToolInputError(
			`Lembrete não preparado: ${(error as Error).message} Use immediateArg="1m texto do lembrete", nunca "em 1 minuto ...". Prefira chat_create_reminder no WhatsApp ou owner_create_reminder no painel.`
		);
	}
};

export const registerReminderContract = () =>
	registerAiContract('lembrete', {
		description:
			'Agenda lembretes. No WhatsApp prefira chat_create_reminder: fica no chat atual, sem avisos privados. No painel existe owner_create_reminder. Tempo usa unidades: 30s, 10m, 3h, 2d, 1h30m; não aceita "em 1 minuto". namedArgs é {}.',
		methods: {
			criar: {
				syntax: 'TEMPO TEXTO [--pessoas @ID @ID] [--privado]',
				examples: [
					'1m ensinar como funcionam os lembretes',
					'1h30m reunião --pessoas @123456 --privado',
				],
				description:
					'immediateArg começa pela duração. Pessoas exigem metadados de menção; use owner_create_reminder para isso.',
			},
			default: { syntax: 'TEMPO TEXTO', examples: ['10m beber água'] },
			fallback: { syntax: 'TEMPO TEXTO', examples: ['1m falar com fulano'] },
			lista: { syntax: '', examples: [''] },
			ver: { syntax: 'CÓDIGO', examples: ['0123456789abcdef'] },
			cancelar: { syntax: 'CÓDIGO', examples: ['0123456789abcdef'] },
			pessoas: {
				syntax: 'CÓDIGO [@ID @ID]',
				examples: ['0123456789abcdef'],
				description:
					'Sem marcações, consulta a lista. Marcações devem vir do WhatsApp; não invente contatos.',
			},
			privado: {
				syntax: 'CÓDIGO on|off',
				examples: ['0123456789abcdef on', '0123456789abcdef off'],
			},
			help: {
				syntax: '',
				examples: [''],
				description:
					'Ajuda para o usuário; não é necessário executar para conhecer a assinatura acima.',
			},
		},
		validate: validateReminderInvocation,
	});
