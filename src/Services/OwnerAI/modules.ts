import type { createModule } from 'kozz-module-maker';
import type { Command } from 'kozz-types';
import { aiContract, commandOutcome } from './contracts';
import { guardModuleSocket } from '../ChatCommands/scope';

type Runtime = ReturnType<typeof createModule>;
const modules = new Map<string, Runtime>();
let aiSocket: Runtime['socket'] | undefined;
export const ownerAiSocket = () => aiSocket;
export const registerOwnerAiModule = (runtime: Runtime) => {
	guardModuleSocket(runtime.socket);
	if (runtime.name === 'ai') aiSocket = runtime.socket;
	if (runtime.name !== 'ai' && Object.keys(runtime.commandMethods).length)
		modules.set(runtime.name, runtime);
};
export const moduleCatalog = () =>
	[...modules].map(([name, runtime]) => ({
		name,
		...(aiContract(name) ? { description: aiContract(name)!.description } : {}),
		methods: Object.entries(runtime.commandMethods).map(([method, definition]) => ({
			method,
			args: definition.args,
			...aiContract(name)?.methods[method],
		})),
	}));
export const invokeModule = async (command: Command) => {
	const runtime = modules.get(command.module || '');
	if (!runtime?.socket.connected) throw new Error('Módulo indisponível.');
	const result = await runtime.executeCommand(command);
	const outcome = commandOutcome(command);
	return outcome
		? {
				...result,
				handlerCompleted: result?.executed === true,
				executed: result?.executed === true && outcome.success,
				outcome,
			}
		: { ...result, handlerCompleted: result?.executed === true };
};
