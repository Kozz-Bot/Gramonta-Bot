import { validGuesses, validSolutions } from './WordList';
import { normalizeString } from 'src/Utils/strings';
import { useJsonDB } from 'src/Utils/StaticJsonDb';
import { MessageObj } from 'kozz-module-maker/dist/Message';

type Word = {
	hasLetter: (letter: string) => boolean;
	hasLetterInIndex: (letter: string, index: number) => boolean;
	asString: string;
};

type PrettyLetterStatus = '🟩' | '🟨' | '⬛';
type Guess = {
	prettyResult: `${PrettyLetterStatus}${PrettyLetterStatus}${PrettyLetterStatus}${PrettyLetterStatus}${PrettyLetterStatus}`;
	guess: string;
};

type Game = {
	id: string;
	date: number;
	formattedDate: string;
	word: string;
	guesses: Guess[];
	win: boolean;
};

const createWord = (word: string): Word => ({
	asString: word,
	hasLetter: (letter: string) => normalizeString(word).includes(letter),
	hasLetterInIndex: (letter: string, index: number) =>
		normalizeString(word)[index] === letter,
});

const gameDb = useJsonDB<Game, 'games'>('games', './src/Handlers/Wordle/games.json');

const getWord = (requester: MessageObj) => {
	const groupIdAsNumber = Number(requester.message.to.match(/[0-9]*/)![0]);
	const contactIdAsNumber = Number(requester.message.from.match(/[0-9]*/)![0]);
	const formattedDay = new Date().getDate();
	const formattedMonth = new Date().getMonth();

	//expression to get a number hash using current day, month, requester's contactId and chatId
	const index =
		((groupIdAsNumber + contactIdAsNumber) ^
			((formattedDay * 26) ^ (formattedMonth * 523))) %
		validSolutions.length;

	const actualIndex = index < 0 ? index * -1 : index;

	return createWord(validSolutions[actualIndex]);
};

const createGame = (requester: MessageObj, gameId: string) => {
	const word = getWord(requester);
	const game: Game = {
		id: gameId,
		date: new Date().getTime(),
		formattedDate: new Date().toDateString(),
		guesses: [],
		win: false,
		word: word.asString,
	};
	gameDb.addEntity(game);
	return game;
};

export const guessWord = (requester: MessageObj, guess: string) => {
	const gameId = `${new Date().toLocaleDateString('BR')}|${requester.message.from}-${
		requester.message.to
	}`;
	const game = gameDb.getEntityById(gameId) ?? createGame(requester, gameId);

	if (game.win || game.guesses.length > 5) {
		throw 'GAME_OVER';
	}

	const normalizedGuess = normalizeString(guess);

	if (!validGuesses.some(validGuess => normalizeString(validGuess) === guess))
		throw 'INVALID_GUESS';

	const word = createWord(game.word);

	const result = normalizedGuess
		.split('')
		.map((letter, index) => {
			if (word.hasLetterInIndex(letter, index)) return '🟩';
			if (word.hasLetter(letter)) return '🟨';
			return '⬛';
		})
		.join('');

	const win = guess === normalizeString(word.asString);

	const updatedGame: Game = {
		...game,
		guesses: [
			...game.guesses,
			{
				guess,
				prettyResult: result as Guess['prettyResult'],
			},
		],
		win,
	};

	gameDb.updateEntity(gameId, updatedGame);

	return updatedGame;
};
