import { createModule, createMethod } from 'kozz-module-maker';
import {
	addGroupToTransmission,
	getTransmissionList,
	removeGroupFromTransmission,
} from './transmissionListManager';
import { hostAccountOnly } from 'src/Middlewares/CheckContact';
import { GroupChatData } from 'kozz-types';
import { promiseIsFulfilled } from 'src/Utils/promises';

const help = createMethod('help', requester => {
	requester.reply.withTemplate('Help');
});

const templatePath = 'src/Handlers/Transmission/messages.kozz.md';

const add = createMethod(
	'add',
	hostAccountOnly(requester => {
		const list = requester.rawCommand?.immediateArg;
		// requester.reply(`Adding chatId ${requester.message.to} to transmission ${list ?? "default"}`);
		addGroupToTransmission(
			requester.message.to,
			requester.message.boundaryName,
			list!
		);
	})
);

const to = createMethod(
	'to',
	hostAccountOnly(requester => {
		if (!requester.message.fromHostAccount) {
			return;
		}

		const list = requester.rawCommand?.immediateArg;
		if (!list) {
			return requester.reply('no-list');
		}

		const quotedMessage = requester.message.quotedMessage;

		if (!quotedMessage) {
			return requester.reply('Responda uma mensagem pra transmitir');
		}

		let delay = 0;
		let delayIncrement = 2000; // 2s

		getTransmissionList(requester.message.boundaryName, list).forEach(group => {
			setTimeout(() => {
				if (quotedMessage.media) {
					requester.sendMessage.withMedia(
						group.chatId,
						quotedMessage.body,
						quotedMessage.media
					);
				} else {
					requester.sendMessage(group.chatId, quotedMessage.body);
				}

				delay += delayIncrement + Math.random() * 1500;
			}, delay);
		});
	})
);

const remove = createMethod(
	'remove',
	hostAccountOnly(requester => {
		const list = requester.rawCommand?.immediateArg;
		// requester.reply(`Removing chatId ${requester.message.to} to transmission ${list ?? "default"}`);
		removeGroupFromTransmission(
			requester.message.to,
			requester.message.boundaryName,
			list!
		);
	})
);

const list = createMethod(
	'list',
	hostAccountOnly(async requester => {
		const list = requester.rawCommand?.immediateArg;

		console.log(requester.message.boundaryName);

		const allGroups = getTransmissionList(requester.message.boundaryName, list!);

		const allGroupNames = await Promise.allSettled(
			allGroups.map(async group => {
				const { response } = await requester.ask.boundary(
					requester.message.boundaryName,
					'chat_info',
					{
						id: group.chatId,
					}
				);

				return (response as GroupChatData).name;
			})
		);

		const response = allGroupNames
			.filter(promiseIsFulfilled)
			.map(({ value }) => value)
			.join('\n\n');

		requester.reply(response);
	})
);

export const startTransmissionHandler = () =>
	createModule({
		commands: {
			boundariesToHandle: [
				'Gramonta-Wa',
				'postman-test',
				'postman-test-2',
				'SalesBot',
			],
			methods: {
				...help,
				...add,
				...to,
				...remove,
				...list,
			},
		},
		name: 'transmit',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
		templatePath,
	});
