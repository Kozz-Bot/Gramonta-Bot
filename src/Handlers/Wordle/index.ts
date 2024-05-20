import { createMethod, createModule } from 'kozz-module-maker';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import { guessWord } from 'src/misc/Wordle';
const templatePath = 'src/Handlers/Wordle/messages.kozz.md';

const guess = createMethod('fallback', requester => {
	try {
		const query = requester.rawCommand?.method;
		if (!query) {
			return requester.reply.withTemplate('EmptyQuery');
		}

		const game = guessWord(requester, query);

		const prettyResult = game.guesses
			.map(guess => `${guess.guess.toUpperCase()}\n${guess.prettyResult}`)
			.join('\n');
		const tries = game.guesses.length;

		if (game.win) {
			return requester.reply.withTemplate('Win', {
				tries,
				history: prettyResult,
			});
		} else {
			requester.reply.withTemplate('GuessResult', {
				tries,
				history: prettyResult,
			});

			if (tries === 6) {
				requester.reply(`A palavra era ${game.word}`);
			}
		}
	} catch (e) {
		if (e === 'INVALID_GUESS') {
			return requester.reply.withTemplate('InvalidGuess');
		}
		if (e === 'GAME_OVER') {
			return requester.reply.withTemplate('GameOver');
		}
		return requester.reply(`${e}`);
	}
});

const help = createMethod('help', requester => {
	requester.reply.withTemplate('Help');
});

export const startWordleModule = () => {
	const instance = createModule({
		name: 'wordle',
		commands: {
			boundariesToHandle: ['Gramonta-Wa', 'postman-test', 'postman-test-2'],
			methods: {
				...guess,
				...help,
			},
		},
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		templatePath,
	}).resources.upsertResource('help', () =>
		loadTemplates(templatePath).getTextFromTemplate('Help')
	);

	return instance;
};
