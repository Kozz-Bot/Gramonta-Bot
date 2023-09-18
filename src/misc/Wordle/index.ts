import { randomItem } from 'src/Utils/arrays';
import { validGuesses, validSolutions } from './WordList';
import { normalizeString } from 'src/Utils/strings';

type Word = {
	hasLetter: (letter: string) => boolean;
	hasLetterInIndex: (letter: string, index: number) => boolean;
	asString: string;
};

type LetterStatus = 'InWord' | 'InIndex' | 'NotFound';
type Guess = LetterStatus[];

const createWord = (word: string): Word => ({
	asString: word,
	hasLetter: (letter: string) => normalizeString(word).includes(letter),
	hasLetterInIndex: (letter: string, index: number) =>
		normalizeString(letter)[index] === letter,
});

const createGame = () => {
	const word = createWord(randomItem(validSolutions));
	let guessHistory: Guess[] = [];
	let guesses = 0;
	let won = false;
	let gameValidUntil = new Date().getTime() + 24 * 60 * 60 * 1000; // one day

	const guessWord = (guess: string) => {
		const normalizedGuess = normalizeString(guess);
		
        if (won) throw 'ALREADY_WON';
		if (!validGuesses.includes(guess)) throw 'INVALID_GUESS';

		const result: Guess = normalizedGuess.split('').map((letter, index) => {
			if (word.hasLetterInIndex(letter, index)) return 'InIndex';
			if (word.hasLetter(letter)) return 'InWord';
			return 'NotFound';
		});

		guessHistory.push(result);
		won = guess === word.asString;

		if (won) {

		}

		guesses++;
		return result;
	};

	return guessWord;
};
