import { randomInt } from 'node:crypto';
import { createMethod, createModule } from 'kozz-module-maker';
import {
	AiToolInputError,
	registerAiContract,
	reportCommandOutcome,
} from '../../Services/OwnerAI/contracts';
import { answers, Help, Result } from './messages';

const consult = createMethod('default', requester => {
	const question = requester.rawCommand?.query?.trim();
	if (!question) {
		reportCommandOutcome(requester.rawCommand, {
			success: false,
			error: 'Escreva uma pergunta depois de !8ball.',
		});
		return requester.reply(<Help />);
	}
	const reply = requester.reply(
		<Result answer={answers[randomInt(answers.length)]} />
	);
	reportCommandOutcome(requester.rawCommand, { success: true, status: 'submitted' });
	return reply;
});

export const startEightBallHandler = () => {
	registerAiContract('8ball', {
		description:
			'Bola 8 mágica: sorteia uma resposta em português, por brincadeira.',
		methods: {
			default: {
				syntax: '!8ball PERGUNTA',
				examples: ['!8ball Vou ter sorte hoje?'],
				description: 'Coloque a pergunta completa em immediateArg.',
			},
			help: { syntax: '!8ball help', examples: ['!8ball help'] },
		},
		validate: (method, input) => {
			if (method !== 'help' && !input.trim())
				throw new AiToolInputError('Escreva uma pergunta depois de !8ball.');
		},
	});
	return createModule({
		name: '8ball',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...consult,
				...createMethod('fallback', consult.default.func),
				...createMethod('help', requester => requester.reply(<Help />)),
			},
		},
	}).resources.upsertResource('help', () => <Help />);
};
