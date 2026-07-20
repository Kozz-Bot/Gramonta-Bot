import { createModule, createMethod, Line, Bold } from 'kozz-module-maker';
import { rateLimit } from 'src/Middlewares/RateLimit';
import { Help } from './messages';

const Pong = ({ time }: { time: number }) => {
	return (
		<>
			<Line>
				<Bold>Pong!</Bold> Tempo de resposta: {time.toString()}
			</Line>
		</>
	);
};

const defaultMethod = createMethod(
	'default',
	rateLimit(1000 * 1, 'ping', requester => {
		const now = new Date().getTime();
		const requestTime = requester.message.timestamp;
		const difference = (now - requestTime!) / 1000;

		requester.reply(<Pong time={difference} />);
	})
);

export const startPingHandler = () => {
	const instance = createModule({
		commands: {
			boundariesToHandle: ['*'],
			methods: {
				...defaultMethod,
			},
		},
		name: 'ping',
		address: `${process.env.GATEWAY_URL}`,
		customSocketPath: process.env.SOCKET_PATH,
	}).resources.upsertResource('help', () => <Help />);

	return instance;
};
