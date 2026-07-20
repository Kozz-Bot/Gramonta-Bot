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
				nesse formato: `💲10 !comando exemplo`. Você pode consultar o seu saldo
				utilizando o comando !coins.
			</Line>
		</>
	);
};

export const Info = ({
	id,
	userId,
	name,
	coins,
	premium,
}: {
	id: string;
	userId: string;
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
			<Line />
			<Line>
				<Bold>ID</Bold>: {id}
			</Line>
			<Line>
				<Bold>UserId</Bold>: {userId}
			</Line>
		</>
	);
};

export const ErrorMessage = ({ error }: { error: unknown }) => {
	return (
		<Line>
			<Bold>Erro:</Bold> {String(error)}
		</Line>
	);
};

export const AddCoinsResponse = ({
	amount,
	userBalance,
}: {
	amount: string;
	userBalance: number;
}) => {
	return (
		<>
			<Line>
				<Bold>Feito!</Bold>
			</Line>
			<Line>
				Adicionado {amount} CalvoCoins ao seu saldo. Seu novo saldo é de
				{userBalance}
			</Line>
		</>
	);
};

export const MakePremiumResponse = ({ quotedUser }: { quotedUser: string }) => {
	return (
		<>
			<Line>
				<Bold>Feito!</Bold>
			</Line>
			<Line>
				{quotedUser} agora é premium. Você pode consultar seu status usando o
				comando `!coins`
			</Line>
		</>
	);
};

export const CreateAccountResponse = ({ userId }: { userId: string }) => {
	return (
		<>
			<Line>
				<Bold>Feito!</Bold>
			</Line>
			<Line>
				@{userId} agora possui uma conta no CalvoBank. Seu saldo inicial é de 0
				CalvoCoins. Você pode consultar seu saldo usando o comando `!coins`
			</Line>
		</>
	);
};

export const formatTransactionListItem = ({
	id,
	type,
	timestamp,
	direction,
	counterpart,
	amount,
	messageBody,
	groupName,
	mediaUrl,
}: {
	id: string;
	type: string;
	timestamp: string;
	direction: string;
	counterpart: string;
	amount: number;
	messageBody: string;
	groupName: string;
	mediaUrl: string;
}) => `_*ID da Transação*_: ${id}
_*Tipo*_: ${type}
_*Data/Hora*_: ${timestamp}

_*Direção*_: ${direction}
_*Contraparte*_: ${counterpart}
_*Valor*_: C$ ${amount}
_*Mensagem*_: ${messageBody}
_*Grupo*_:${groupName}
_*Mídia da mensagem*_: ${mediaUrl}`;

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
