import { Line, Bold, Italic, ForEach } from 'kozz-module-maker';

export const Help = () => {
	return (
		<>
			<Line>
				<Bold>CalvoCoins</Bold>
			</Line>
			<Line>
				CalvoCoins são as moedas utilizadas nos comandos premium do bot do Tramonta.
				Cada CalvoCoin equivale a 1 centavo e os comandos pagos irão automaticamente
				cobrar as moedas do seu saldo
			</Line>
			<Line />
			<Line>
				<Bold>Como criar conta?</Bold>
			</Line>
			<Line>
				Para criar uma conta no CalvoBank basta digitar `!coins create`. Você terá
				uma conta com saldo de 0 CalvoCoins
			</Line>
			<Line />
			<Line>
				<Bold>Como comprar CalvoCoins?</Bold>
			</Line>
			<Line>
				Basta fazer um pix para o numero 11947952409 e avisar o Tramonta. Ele irá
				adicionar as moedas ao seu saldo e você poderá utiliza-las imediatamente.
			</Line>
			<Line />
			<Line>
				<Bold>Premium?</Bold>
			</Line>
			<Line>
				Você pode também comprar o acesso premium ilimitado por R$19,90. Ao comprar o
				premium, você pode utilizar quantos comandos pagos quiser sem gastar uma
				única CalvoCoin. O premium é valido por 30 dias a partir do momento da
				compra.
			</Line>
			<Line />
			<Line>
				Os comandos pagos são mostrados nas seções de ajuda com o respectivo preço
				nesse formato: `💲10 !ai image prompt`. Você pode consultar o seu saldo
				utilizando o comando !coins.
			</Line>
		</>
	);
};

export const Info = ({
	name,
	coins,
	premium,
}: {
	name: string;
	coins: number;
	premium: boolean;
}) => {
	return (
		<>
			<Line>
				<Bold>Dados de usuário</Bold>
			</Line>
			<Line />
			<Line>
				<Bold>Nome</Bold>: {name}
			</Line>
			<Line>
				<Bold>CalvoCoins</Bold>: {coins}
			</Line>
			<Line>
				<Bold>Premium?</Bold> {premium ? 'Sim' : 'Não'}
			</Line>
			<Line />
			<Line>Para consultar seu extrato digite `!coins history`</Line>
			<Line>
				Para puxar as 10 ultimas transações digite `!coins history --count 10`
			</Line>
		</>
	);
};

export const NotEnoughCoins = ({
	needed,
	current,
}: {
	needed: number;
	current: number;
}) => {
	return (
		<>
			<Line>
				<Bold>Erro:</Bold> Você não tem CalvoCoins suficientes para usar esse
				comando.
			</Line>
			<Line>
				Você precisa de {needed} CalvoCoins, mas você só tem {current}.
			</Line>
			<Line>Para comprar mais CalvoCoins, digite `!coins help`.</Line>
		</>
	);
};

export const TransactionSuccess = ({
	amount,
	newBalance,
}: {
	amount: number;
	newBalance: number;
}) => {
	return (
		<>
			<Line>Transação concluída com sucesso!</Line>
			<Line>Valor: {amount} CalvoCoins</Line>
			<Line>Novo saldo: {newBalance} CalvoCoins</Line>
		</>
	);
};

export const TransactionError = ({ error }: { error: string }) => {
	return (
		<>
			<Line>
				<Bold>Erro:</Bold> Não foi possível concluir a transação.
			</Line>
			<Line>{error}</Line>
		</>
	);
};

export const HistoryItem = ({
	date,
	amount,
	description,
}: {
	date: string;
	amount: number;
	description: string;
}) => {
	return (
		<Line>
			{date} - {amount > 0 ? '+' : ''}
			{amount} CalvoCoins: {description}
		</Line>
	);
};

export const HistoryEmpty = () => {
	return <Line>Você não tem transações recentes.</Line>;
};
