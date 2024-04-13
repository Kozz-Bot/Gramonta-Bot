import fs from 'fs';

type EntityWithID = {
	id: string;
};

type DB<EntityName extends string, DataType extends EntityWithID> = {
	[key in EntityName]: DataType[];
};

/**
 * Currently it reads and writes to the file each single operation. I know this is
 * not scalable, but I'm not gonna cache the thing in memory for now. That's a [TODO]
 * @param entityName
 * @param JsonPath
 * @returns
 */
export const useJsonDB = <DataType extends EntityWithID, EntityName extends string>(
	entityName: EntityName,
	JsonPath: string
) => {
	let DB: DB<EntityName, DataType> | null = null;

	const getDB = () => {
		const jsonAsString = fs.readFileSync(JsonPath, {
			encoding: 'utf-8',
		});
		return JSON.parse(jsonAsString) as DB<EntityName, DataType>;
	};

	const writeDB = async (db: DB<EntityName, DataType>): Promise<void> => {
		DB = db;
		return fs.writeFileSync(JsonPath, JSON.stringify(db, undefined, '    '), {
			encoding: 'utf-8',
		});
	};

	const getAllEntities = () => {
		if (!DB) {
			DB = getDB();
		}
		return DB[entityName];
	};

	const addEntity = (newEntity: DataType) => {
		if (!DB) {
			DB = getDB();
		}

		if (DB[entityName].find(u => u.id === newEntity.id)) {
			return;
		}

		writeDB({
			...DB,
			[entityName]: [...DB[entityName], newEntity],
		});

		DB = getDB();
	};

	const removeEntity = (entityID: string) => {
		if (!DB) {
			DB = getDB();
		}

		writeDB({
			...DB,
			[entityName]: DB[entityName]?.filter(entity => entity.id !== entityID),
		});

		DB = getDB();
	};

	const getEntityById = (entityId: string): DataType | undefined => {
		if (!DB) {
			DB = getDB();
		}

		return DB[entityName]?.filter(entity => entity.id === entityId)[0];
	};

	const updateEntity = (id: string, newEntity: Partial<DataType>) => {
		if (!DB) {
			DB = getDB();
		}

		writeDB({
			...DB,
			[entityName]: DB[entityName].map(oldEntity => {
				if (oldEntity.id === id) {
					return {
						...oldEntity,
						...newEntity,
					};
				}
				return oldEntity;
			}),
		});

		DB = getDB();
	};

	const upsertEntity = async (user: DataType) => {
		const maybeEntity: DataType | undefined = await getEntityById(user.id);
		if (!maybeEntity) {
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
