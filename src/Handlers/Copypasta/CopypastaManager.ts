import { useJsonDB } from 'src/StaticJsonDb';
import { getFormattedDateAndTime } from 'src/Utils/date';

type Copypasta = {
	id: string;
	index: number;
	text: string;
	dateAdded: number;
	dateDeleted: number | null;
	formattedDateAdded: string;
	userIdWhoAdded: string;
	chatId: string;
};

/**
 * Properties that are required for the `addCopypasta` methods
 */
type ObligatoryProperties = 'id' | 'text' | 'userIdWhoAdded' | 'chatId';

const copypastasDB = useJsonDB<Copypasta, 'copypastas'>(
	'copypastas',
	'./src/Handlers/Copypasta/Copypastas.json'
);

export const addCopypasta = (copypasta: Pick<Copypasta, ObligatoryProperties>) => {
	if (copypastasDB.getEntityById(copypasta.id)) {
		throw 'Already_Exists';
	}

	const newCopypasta: Copypasta = {
		...copypasta,
		index: copypastasDB.getAllEntities().length,
		dateAdded: new Date().getTime(),
		dateDeleted: null,
		formattedDateAdded: getFormattedDateAndTime(),
	};

	copypastasDB.addEntity(newCopypasta);
};

export const getCopypastaById = (id: string): Copypasta | undefined => {
	return copypastasDB.getEntityById(id);
};

export const getCopypastaByIndex = (index: number) => {
	return copypastasDB.getAllEntities().find(c => c.index === index);
};

export const getCopypastasList = () => {
	return copypastasDB.getAllEntities().filter(copy => !copy.dateDeleted);
};

export const deleteCopypastaById = (id: string) => {
	const copypasta = getCopypastaById(id);
	if (!copypasta) return;

	copypastasDB.updateEntity(id, {
		dateDeleted: new Date().getTime(),
		id: `{{${copypasta.id}}}`,
	});
};
