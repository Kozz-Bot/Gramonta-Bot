import { CronJob } from 'cron';
import { createModule, createMethod } from 'kozz-module-maker';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { rateLimit } from 'src/Middlewares/RateLimit';
import { useJsonDB } from 'src/Utils/StaticJsonDb';
import fs from 'fs/promises';
import { Media } from 'kozz-types';
import mime from 'mime-types';

type Group = {
	id: string;
	boundaryName: string;
	jobs: Job[];
};

type Job = {
	cron: string;
	body: string;
	mediaPath?: string;
};

const groupDB = useJsonDB<Group, 'group'>(
	'group',
	'./src/Handlers/PeriodicPosts/gropuDB.json'
);

const addGroup = createMethod(
	'add',
	hostAccountOnly(requester => {
		const groupId = requester.message.chatId;
		const quotedMedia = requester.message.quotedMessage?.media;

		let group = groupDB.getEntityById(groupId);

		if (!group) {
			group = {
				boundaryName: requester.message.boundaryName,
				id: groupId,
				jobs: [],
			};
		}

		const newJob: Job = {
			cron: '0 * * * *',
			body: 'PLACEHOLDER',
		};

		group.jobs.push(newJob);

		console.log({ group });

		groupDB.upsertEntity(group);
	}, 'Apenas o dono do bot pode utilizar esse comando')
);

const createAllCronJobs = (module: ReturnType<typeof createModule>) => {
	const groups = groupDB.getAllEntities();
	groups.forEach(group => {
		group.jobs.forEach(job => {
			CronJob.from({
				cronTime: job.cron,
				onTick: async () => {
					if (job.mediaPath) {
						const mediab64 = await fs.readFile(job.mediaPath, 'base64url');

						const mediaName = job.mediaPath.split('/').at(-1)!;

						const media: Media = {
							data: mediab64,
							fileName: mediaName,
							mimeType: mime.lookup(mediaName) || 'octet/stream',
							sizeInBytes: mediab64.length,
							stickerTags: [],
							transportType: 'b64',
							duration: null,
						};

						module.sendMessage.withMedia(
							group.id,
							group.boundaryName,
							job.body,
							media
						);
					} else {
						module.sendMessage(group.id, group.boundaryName, job.body);
					}
				},
				start: true,
			});
		});
	});
};

export const startPeriodicModule = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...addGroup,
			},
		},
		name: 'periodic',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	});

	createAllCronJobs(instance);

	return instance;
};
