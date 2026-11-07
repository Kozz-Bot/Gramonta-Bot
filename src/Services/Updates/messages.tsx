import { Bold, Line } from 'kozz-module-maker';

export const Announcement = ({ summary }: { summary: string }) => (
	<>
		<Line>
			<Bold>Novidades do Gramonta 📣</Bold>
		</Line>
		<Line />
		<Line>{summary}</Line>
	</>
);
