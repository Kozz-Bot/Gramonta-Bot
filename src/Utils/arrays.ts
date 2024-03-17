/**
 * Returns a random item from the provided array
 * @param array
 * @returns
 */
export const randomItem = <T>(array: Readonly<T[]> | T[]) => {
	return array[Math.round(Math.random() * (array.length - 1))];
};
