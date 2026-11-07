import type { MessageObj } from 'kozz-module-maker/dist/Message';
import type { Message } from '../../API/FuelIXApi';

type Runner = (requester: MessageObj, history: Message[]) => Promise<unknown>;
let runner: Runner | undefined;
export const setPanelAiRunner = (next: Runner) => {
	runner = next;
};
export const runPanelAi = (requester: MessageObj, history: Message[]) => {
	if (!runner)
		throw new Error('A IA ainda está iniciando. Tente novamente em instantes.');
	return runner(requester, history);
};
