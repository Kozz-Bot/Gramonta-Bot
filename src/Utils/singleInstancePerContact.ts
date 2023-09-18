type InstanceMap<Instance> = Record<string, Instance>;

export const createInstanceGetter = <Instance>(instanceGetter: () => Instance) => {
	const instanceMap: InstanceMap<Instance> = {};

	const getInstance = (id: string) => {
		if (!instanceMap[id]) {
			instanceMap[id] = instanceGetter();
		}
		return instanceMap[id];
	};

	return getInstance;
};
