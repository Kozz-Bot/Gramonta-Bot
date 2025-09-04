import { Bold, ForEach, Line, ListItem, Monospace } from 'kozz-module-maker';
import { Poop } from 'src/Handlers/Poop';
import { Water } from '.';

export const RankingMessage = ({ ranking }: { ranking: [string, number][] }) => {
	return (
		<ForEach
			data={ranking}
			render={(entry, index) => {
				const [userId, amount] = entry;
				return (
					<ListItem>{`${index + 1}: ${userId} bebeu ${
						amount > 1000 ? `${amount / 1000}L` : `${amount}ml`
					} de água!`}</ListItem>
				);
			}}
		/>
	);
};

export const History = ({ drinks, name }: { drinks: Water[]; name: string }) => {
	return (
		<>
			<Line>
				<Bold>Histórico de hidratação de ${name}</Bold>
			</Line>
			<ForEach
				data={drinks}
				render={(drink, index) => {
					return (
						<ListItem>{`Bebeu ${
							drink.amount > 1000 ? `${drink.amount / 1000}L` : `${drink.amount}ml`
						} de água às ${new Date(drink.timestamp).toLocaleString(
							'pt-BR'
						)}`}</ListItem>
					);
				}}
			/>
		</>
	);
};

export const Total = ({ total }: { total: number }) => {
	return (
		<>
			<Line>
				Você bebeu um total de <Bold>{total / 1000}</Bold>L de água!
			</Line>
		</>
	);
};

export const AddWater = ({ amount }: { amount: number }) => {
	return (
		<>
			<Line>
				Você bebeu <Bold>{amount > 1000 ? `${amount / 1000}L` : `${amount}ml`}</Bold>{' '}
				de água!
			</Line>
			<Line>Obrigado por cuidar da sua hidratação 💧</Line>
		</>
	);
};

export const InvalidUnit = ({ unit }: { unit: string }) => {
	return (
		<>
			<Line>
				Unidade <Bold>{unit}</Bold> inválida. Use 'l' para litros ou 'ml' para
				mililitros.
			</Line>
			<Line>
				Exemplo: <Monospace>!water 0.5l</Monospace> ou{' '}
				<Monospace>!water 500ml</Monospace>
			</Line>
		</>
	);
};

export const NoWaterAmount = () => {
	return (
		<>
			<Line>
				Por favor, informe a quantidade de água ingerida em ml ou l. Exemplo:{' '}
				<Monospace>!water 200ml</Monospace> ou <Monospace>!water 0.35l</Monospace>
			</Line>
		</>
	);
};

export const NoHistory = ({ name }: { name: string }) => {
	return (
		<>
			<Line>
				<Bold>{name}</Bold> ainda não registrou nenhuma hidratação.
			</Line>
			<Line>Vamos lá, beba água e registre aqui!</Line>
		</>
	);
};
