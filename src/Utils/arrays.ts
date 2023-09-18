export const randomItem = <T>(array: T[]) => {
	return array[Math.round(Math.random() * (array.length - 1))];
};
