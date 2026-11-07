import { createHash } from 'node:crypto';
import type { Media } from 'kozz-types';
import { AiToolInputError } from '../OwnerAI/contracts';
import type { Message } from '../../API/FuelIXApi';

export type ActionStatus =
	'completed' | 'submitted' | 'scheduled' | 'invoked' | 'failed' | 'uncertain';
export type ActionRecord = { id: string; label: string; status: ActionStatus };
export type ToolExecutionResult =
	| { terminal: true }
	| {
			terminal: false;
			content: string;
			action?: ActionRecord;
			contextMessages?: Message[];
	  };
const stable = (value: unknown): unknown =>
	Array.isArray(value)
		? value.map(stable)
		: value && typeof value === 'object'
			? Object.fromEntries(
					Object.entries(value)
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([key, entry]) => [key, stable(entry)])
				)
			: value;
export const executionKey = (value: unknown) =>
	createHash('sha256')
		.update(JSON.stringify(stable(value)))
		.digest('hex');
const executions = new WeakMap<object, Map<string, Promise<unknown>>>();

// The receipt lives for this requester only. Also coalesces concurrent calls.
// Rejections stay cached: an uncertain side effect must never be retried silently.
export const executeOnce = async <T>(
	requester: object,
	signature: unknown,
	perform: () => Promise<T>
) => {
	const id = executionKey(signature);
	let entries = executions.get(requester);
	if (!entries) {
		entries = new Map();
		executions.set(requester, entries);
	}
	const reused = entries.has(id);
	if (!reused) entries.set(id, Promise.resolve().then(perform));
	return { id, reused, value: (await entries.get(id)!) as T };
};

const images = new WeakMap<object, Map<string, Media>>();
export const rememberGeneratedImage = (requester: object, media: Media) => {
	if (!media.data || media.data.length > 11_000_000) return undefined;
	let entries = images.get(requester);
	if (!entries) {
		entries = new Map();
		images.set(requester, entries);
	}
	if (entries.size >= 4) return undefined;
	const id = `generated-image-${entries.size + 1}`;
	entries.set(id, { ...media });
	return id;
};
export const generatedImage = (requester: object, id: unknown) => {
	if (id === undefined || id === '') return undefined;
	if (typeof id !== 'string' || !images.get(requester)?.has(id))
		throw new AiToolInputError(
			'A imagem precisa ter sido gerada neste mesmo pedido. Use a referência retornada por generate_image.'
		);
	return { ...images.get(requester)!.get(id)! };
};
