import type { Media } from 'kozz-types';

export type DailyStatusSlot = {
	/** 0 = domingo, 1 = segunda, ..., 6 = sábado. */
	weekday: number;
	time: string;
	statusId: string;
	destinations: readonly StatusDestination[];
};

export type StatusDestination =
	| { kind: 'status'; recipients: readonly string[] }
	| { kind: 'status'; audience: 'all_contacts' }
	| { kind: 'group'; chatId: string };

export type StatusContext = {
	date: string;
	timeZone: string;
	slot: DailyStatusSlot;
};

export type StatusContent = { body: string; media?: Media };
export type StatusProvider = (context: StatusContext) => StatusContent | Promise<StatusContent>;

export type StatusRecord = {
	date: string;
	statusId: string;
	destination: string;
	publicationId?: string;
	scheduledTime: string;
	state: 'sending' | 'sent' | 'failed';
	updatedAt: string;
};

export interface StatusStore {
	has(date: string, destination: string, publicationId?: string): Promise<boolean>;
	claim(record: StatusRecord): Promise<boolean>;
	finish(record: StatusRecord): Promise<void>;
}
