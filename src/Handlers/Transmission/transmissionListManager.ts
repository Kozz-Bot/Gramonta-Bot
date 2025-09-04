import { useJsonDB } from 'src/Utils/StaticJsonDb';
import { randomUUID } from 'crypto';

type TransmissionGroup = {
	id: string;
	chatId: string;
	list: string;
	boundary: string;
};

const TransmissionListDb = useJsonDB<TransmissionGroup, 'groups'>(
	'groups',
	'./src/Handlers/Transmission/TransmissionDb.json'
);

export const addGroupToTransmission = (
	chatId: string,
	boundary: string,
	list: string = 'default'
) => {
	if (TransmissionListDb.getEntityById(chatId)?.list === list) {
		return;
	}

	const newGroup: TransmissionGroup = {
		id: randomUUID(),
		chatId,
		list: list ?? 'default',
		boundary,
	};

	TransmissionListDb.addEntity(newGroup);
};

export const getTransmissionList = (boundary: string, list: string = 'default') => {
	return TransmissionListDb.getAllEntities().filter(
		group => group.list === list && boundary === group.boundary
	);
};

export const removeGroupFromTransmission = (
	groupId: string,
	_: string,
	list: string = 'default'
) => {
	const groupEntries = TransmissionListDb.getAllEntities().filter(
		group => group.id === groupId
	);

	groupEntries.forEach(group => {
		if (group.list === list) {
			TransmissionListDb.removeEntity(group.id);
		}
	});
};
