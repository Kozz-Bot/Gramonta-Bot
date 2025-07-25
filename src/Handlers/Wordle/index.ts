import { createMethod, createModule } from 'kozz-module-maker';
import { loadTemplates } from 'kozz-module-maker/dist/Message';
import { getGameFromRequester, guessWord } from 'src/misc/Wordle';
import fs from 'fs/promises';

const templatePath = 'src/Handlers/Wordle/messages.kozz.md';

const resend = createMethod('resend', async requester => {
	const game = getGameFromRequester(requester);

	if (!game) {
		return requester.reply('Você nao tem um jogo ativo ainda.');
	}

	const prettyResult = game.guesses
		.map(guess => `${guess.guess.toUpperCase()}\n${guess.prettyResult}`)
		.join('\n');
	const tries = game.guesses.length;

	requester.reply.withTemplate('GuessResult', {
		tries,
		history: prettyResult,
	});
});

/**
 * Using try-catch as control-flow???? pls kill me :v
 */
const guess = createMethod('fallback', async requester => {
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
			const recebaGnoseSticker = await fs.readFile(
				'./media/saved/receba-gnose.webp',
				'base64url'
			);

			requester.reply.withSticker({
				data: recebaGnoseSticker,
				fileName: 'receba-gnose.webp',
				mimeType: 'image/webp',
				sizeInBytes: recebaGnoseSticker.length,
				stickerTags: [],
				transportType: 'b64',
				duration: null,
			});

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
				const entrgueGnose = await fs.readFile(
					'./media/saved/entregue_a_gnose.jpeg',
					'base64url'
				);

				requester.reply.withSticker({
					data: entrgueGnose,
					fileName: 'entregue_a_gnose.webp',
					mimeType: 'image/webp',
					sizeInBytes: entrgueGnose.length,
					stickerTags: [],
					transportType: 'b64',
					duration: null,
				});
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
			boundariesToHandle: ['*'],
			methods: {
				...guess,
				...help,
				...resend,
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
