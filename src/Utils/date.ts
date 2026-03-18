export const getFormattedDateAndTime = (date?: number | Date) => {
	const now = date ? new Date(date) : new Date(new Date().getTime());

	return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1)
		.toString()
		.padStart(2, '0')}/${now.getFullYear()} às ${now
		.getHours()
		.toString()
		.padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

export const getMonthName = (monthIndex: number) => {
	const monthNames = [
		'Janeiro',
		'Fevereiro',
		'Março',
		'Abril',
		'Maio',
		'Junho',
		'Julho',
		'Agosto',
		'Setembro',
		'Outubro',
		'Novembro',
		'Dezembro',
	];

	return monthNames[monthIndex];
};

export const formatWeekDates = ({
	firstDay,
	lastDay,
}: {
	firstDay: Date;
	lastDay: Date;
}) => {
	return `${firstDay.getDate().toString().padStart(2, '0')} / ${getMonthName(
		firstDay.getMonth()
	)} - ${lastDay.getDate().toString().padStart(2, '0')}/${getMonthName(
		lastDay.getMonth()
	)} / ${lastDay.getFullYear()}`;
};
