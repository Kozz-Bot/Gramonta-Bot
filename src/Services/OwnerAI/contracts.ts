import type { Command } from 'kozz-types';

export class AiToolInputError extends Error {}
export type CommandOutcome = {
	success: boolean;
	scheduled?: boolean;
	reminderId?: string;
	eventId?: string;
	status?: 'completed' | 'submitted' | 'uncertain';
	error?: string;
};
type Contract = {
	description: string;
	methods: Record<
		string,
		{ syntax: string; examples: string[]; description?: string }
	>;
	validate?: (method: string, immediateArg: string, chatId: string) => void;
};
const contracts = new Map<string, Contract>();
const outcomes = new WeakMap<Command, CommandOutcome>();
export const registerAiContract = (name: string, contract: Contract) =>
	contracts.set(name, contract);
export const aiContract = (name: string) => contracts.get(name);
export const reportCommandOutcome = (
	command: Command | undefined,
	outcome: CommandOutcome
) => {
	if (command) outcomes.set(command, outcome);
};
export const commandOutcome = (command: Command) => outcomes.get(command);
