import fs from 'fs';

type EntityWithID = {
	id: string;
};

type DB<EntityName extends string, DataType extends EntityWithID> = {
	[key in EntityName]: DataType[];
};

export const useJsonDB = <DataType extends EntityWithID, EntityName extends string>(
	entityName: EntityName,
	JsonPath: string
) => {
	const getDB = () => {
		const jsonAsString = fs.readFileSync(JsonPath, {
			encoding: 'utf-8',
		});
		return JSON.parse(jsonAsString) as DB<EntityName, DataType>;
	};

	const writeDB = async (db: DB<EntityName, DataType>): Promise<void> => {
		return fs.writeFileSync(JsonPath, JSON.stringify(db, undefined, '    '), {
			encoding: 'utf-8',
		});
	};

	const getAllEntities = () => {
		const db = getDB();
		return db[entityName];
	};

	const addEntity = (newEntity: DataType) => {
		const db = getDB();

		if (db[entityName].find(u => u.id === newEntity.id)) {
			return;
		}

		writeDB({
			...db,
			[entityName]: [...db[entityName], newEntity],
		});
	};

	const removeEntity = (entityID: string) => {
		const db = getDB();
		writeDB({
			...db,
			[entityName]: db[entityName]?.filter(entity => entity.id !== entityID),
		});
	};

	const getEntityById = (entityId: string) => {
		const db = getDB();
		return db[entityName]?.filter(entity => entity.id === entityId)[0]!;
	};

	const updateEntity = (id: string, newEntity: Partial<DataType>) => {
		const db = getDB();
		writeDB({
			...db,
			[entityName]: db[entityName].map(oldEntity => {
				if (oldEntity.id === id) {
					return {
						...oldEntity,
						...newEntity,
					};
				}
				return oldEntity;
			}),
		});
	};

	const upsertEntity = async (user: DataType) => {
		const maybeUser: DataType | null = await getEntityById(user.id);
		if (!maybeUser) {
			return addEntity(user);
		} else {
			return updateEntity(user.id, user);
		}
	};

	return {
		getAllEntities,
		addEntity,
		removeEntity,
		getEntityById,
		updateEntity,
		upsertEntity,
	};
};
