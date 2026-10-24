import type { DailyStatusSlot, StatusDestination, StatusProvider } from './types';
import { createMediaProvider, periodicMediaCatalog } from './mediaCatalog';

export const statusProviders = new Map<string, StatusProvider>(periodicMediaCatalog.map(media => [
	media.statusId, createMediaProvider(media.filename, media.duration, {
		trimToSeconds: 'trimToSeconds' in media ? media.trimToSeconds : undefined,
	}),
]));

export const createMediaSchedule = (destinations: readonly StatusDestination[]): readonly DailyStatusSlot[] =>
	periodicMediaCatalog.flatMap(media => media.weekdays.map(weekday => ({
		weekday, time: media.time, statusId: media.statusId, destinations,
	})));

export const statusSchedule = createMediaSchedule([{ kind: 'status', audience: 'all_contacts' }]);
