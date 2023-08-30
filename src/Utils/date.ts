export const getFormattedDateAndTime = (date?: number | Date) => {
	const threeHours = 1.08e7;

	// creating new date with -3 hours to use GMT -3;
	const now = date ? new Date(date) : new Date(new Date().getTime() - threeHours);

	return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1)
		.toString()
		.padStart(2, '0')}/${now.getFullYear()} às ${now
		.getHours()
		.toString()
		.padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};
