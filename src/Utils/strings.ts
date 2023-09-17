export function normalizeString(string: string) {
	return string.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export const makeAccentsInsensitiveRegex = (desiredToMatch: string) => {
	const regexString = `${desiredToMatch}|${desiredToMatch.replace(
		/[\u00E0-\u00FC]/,
		'[à-ü]'
	)}`;
	return new RegExp(regexString);
};

/**
 * Queries a string for a substring and returns the part of the string in which the
 * substring appears. You can control how many words before and after the match should
 * be in the return. If no matches occur, the function returns an empty string.
 * @param text
 * @param query
 * @param wordsBefore
 * @param wordsAfter
 * @returns
 */
export const queryText = (
	text: string,
	query: string,
	wordsBefore = 0,
	wordsAfter = wordsBefore,
	caseSensitive = false
) => {
	const splittedText = normalizeString(text).split(' ');
	const splittedQuery = normalizeString(query).split(' ');

	const { found, higherIndex, lowerIndex } = (() => {
		for (let i = 0; i < splittedText.length - splittedQuery.length; i++) {
			const match = splittedQuery.reduce((done, word, index) => {
				return caseSensitive
					? done &&
							word.replace(/\W/, '') === splittedText[i + index].replace(/\W/, '')
					: done &&
							word.toLowerCase().replace(/\W/, '') ===
								splittedText[i + index].toLowerCase().replace(/\W/, '');
			}, true);

			if (match) {
				return {
					lowerIndex: i,
					higherIndex: i + splittedQuery.length,
					found: true,
				};
			}
		}
		return {
			found: false,
			lowerIndex: undefined,
			higherIndex: undefined,
		};
	})();

	if (!found) {
		return '';
	}

	// Making sure i'm not indexing out of bounds with those ugly ternary expressions
	const sanitizedLowerIndex =
		lowerIndex! - wordsBefore < 0 ? 0 : lowerIndex! - wordsBefore;
	const sanitizedHigherIndex =
		higherIndex! + wordsAfter > splittedText.length - 1
			? splittedText.length
			: higherIndex! + wordsAfter;

	const maybeThreeDotsBegin = sanitizedLowerIndex === 0 ? '' : '...';
	const maybeThreeDotsEnd =
		sanitizedHigherIndex === splittedText.length ? '' : '...';

	return `${maybeThreeDotsBegin}${text
		.split(' ')
		.slice(sanitizedLowerIndex, sanitizedHigherIndex)
		.join(' ')}${maybeThreeDotsEnd}`;
};
