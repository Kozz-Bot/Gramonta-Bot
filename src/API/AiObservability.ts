import fs from 'fs/promises';
import path from 'path';

export type AiUsageEvent = {
	event: string;
	timestamp?: string;
	status: 'success' | 'error';
	provider?: string;
	model?: string;
	durationMs?: number;
	error?: {
		status?: number;
		message?: string;
	};
	metadata?: Record<string, unknown>;
	usage?: Record<string, unknown>;
};

export type AiError = {
	response?: {
		status?: number;
	};
	message?: string;
};

export const normalizeAiError = (e: unknown): AiError =>
	e && typeof e === 'object' ? (e as AiError) : {};

const AI_USAGE_LOG_PATH =
	process.env.AI_USAGE_LOG_PATH ?? './logs/ai-usage.jsonl';

export const logAiUsage = async (event: AiUsageEvent) => {
	const logPath = path.resolve(process.cwd(), AI_USAGE_LOG_PATH);
	const payload = {
		...event,
		timestamp: event.timestamp ?? new Date().toISOString(),
	};

	try {
		await fs.mkdir(path.dirname(logPath), { recursive: true });
		await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`);
	} catch (e) {
		console.warn('Failed to write AI usage log:', e);
	}
};

const numberValue = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : 0;

const readUsageEvents = async (limit: number): Promise<AiUsageEvent[]> => {
	const logPath = path.resolve(process.cwd(), AI_USAGE_LOG_PATH);

	try {
		const content = await fs.readFile(logPath, 'utf8');
		return content
			.trim()
			.split('\n')
			.slice(-limit)
			.map(line => JSON.parse(line) as AiUsageEvent);
	} catch (e) {
		if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
			return [];
		}

		throw e;
	}
};

export const summarizeAiUsage = async (limit = 200) => {
	const events = await readUsageEvents(limit);
	const totals = events.reduce(
		(acc, event) => {
			const key = `${event.event}:${event.model ?? 'sem-modelo'}`;
			const usage = event.usage ?? {};
			const bucket = acc.byModel[key] ?? {
				count: 0,
				errors: 0,
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				durationMs: 0,
			};

			bucket.count += 1;
			bucket.errors += event.status === 'error' ? 1 : 0;
			bucket.promptTokens += numberValue(usage.prompt_tokens);
			bucket.completionTokens += numberValue(usage.completion_tokens);
			bucket.totalTokens += numberValue(usage.total_tokens);
			bucket.durationMs += numberValue(event.durationMs);
			acc.byModel[key] = bucket;

			acc.count += 1;
			acc.errors += event.status === 'error' ? 1 : 0;
			acc.promptTokens += numberValue(usage.prompt_tokens);
			acc.completionTokens += numberValue(usage.completion_tokens);
			acc.totalTokens += numberValue(usage.total_tokens);
			acc.durationMs += numberValue(event.durationMs);

			return acc;
		},
		{
			count: 0,
			errors: 0,
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0,
			durationMs: 0,
			byModel: {} as Record<
				string,
				{
					count: number;
					errors: number;
					promptTokens: number;
					completionTokens: number;
					totalTokens: number;
					durationMs: number;
				}
			>,
		}
	);

	return {
		events,
		totals,
		logPath: path.resolve(process.cwd(), AI_USAGE_LOG_PATH),
	};
};
