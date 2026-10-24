import { useJsonDB } from 'src/Utils/StaticJsonDb';

type DisabledGroup = {
	id: string;
};

const disabledGroupsDb = useJsonDB<DisabledGroup, 'groups'>(
	'groups',
	'./src/Handlers/Group/disabledGroups.json'
);

export const areCommandsDisabledForGroup = (groupId: string) =>
	!!disabledGroupsDb.getEntityById(groupId);

export const disableCommandsForGroup = (groupId: string) =>
	disabledGroupsDb.addEntity({ id: groupId });

export const enableCommandsForGroup = (groupId: string) =>
	disabledGroupsDb.removeEntity(groupId);
