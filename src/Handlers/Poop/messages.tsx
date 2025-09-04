import { Bold, ForEach, Line, ListItem } from 'kozz-module-maker';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import { Poop } from 'src/Handlers/Poop';

export const RankingMessage = ({ ranking }: { ranking: [string, number][] }) => {
	return (
		<ForEach
			data={ranking}
			render={(entry, index) => {
				const [userId, poopCount] = entry;
				return (
					<ListItem>{`${
						index + 1
					}: ${userId} já cagou ${poopCount} vezes!`}</ListItem>
				);
			}}
		/>
	);
};

export const History = ({ poops, name }: { poops: Poop[]; name: string }) => {
	return (
		<>
			<Line>
				<Bold>Histórico de cagadas de ${name}</Bold>
			</Line>
			<ForEach
				data={poops}
				render={(poop, index) => {
					return (
						<ListItem>{`Cagada ${index + 1} / ${poops.length}: ${new Date(
							poop.timestamp
						).toLocaleString('pt-BR')}`}</ListItem>
					);
				}}
			/>
		</>
	);
};

export const Total = ({ total }: { total: number }) => {
	console.log(total);

	return (
		<>
			<Line>
				Você cagou um total de <Bold>{total}</Bold> vezes!
			</Line>
		</>
	);
};
