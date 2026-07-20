import { Line, Bold, Italic, ForEach } from 'kozz-module-maker';

export const Help = () => {
	return (
		<>
			<Line>
				<Bold>Copypastas do bot do tramonta</Bold>
			</Line>
			<Line />
			<Line>
				<Bold>Comandos</Bold>
			</Line>
			<Line>
				<ForEach
					data={[
						{ command: '!copypasta list', description: 'Lista todas as copypastas' },
						{
							command: '!copypasta {{name}}',
							description: 'Obtém copypasta pelo nome',
						},
						{
							command: '!copypasta {{numb}}',
							description: 'Obtém copypasta pelo indice',
						},
						{ command: '!copypasta search', description: 'Pesquisa copypasta¹' },
					]}
					render={item => (
						<>
							<Line>{`${item.command.padEnd(20)} | ${item.description}`}</Line>
						</>
					)}
				/>
			</Line>
			<Line />
			<Line>
				<Italic>
					¹Passe a flag --deep para pesquisar dentro da copypasta, não apenas o
					titulo
				</Italic>
			</Line>
			<Line />
			<Line>
				<Bold>Comandos respondendo mensagens:</Bold>
			</Line>
			<Line>
				<ForEach
					data={[
						{ command: '!copypasta add {{name}}', description: 'Salva copypasta' },
						{
							command: '!copypasta delete {{name}}',
							description: 'Deleta a copypasta²',
						},
					]}
					render={item => (
						<>
							<Line>{`${item.command.padEnd(25)} | ${item.description}`}</Line>
						</>
					)}
				/>
			</Line>
			<Line />
			<Line>
				<Italic>²Você só pode deletar uma copypasta que você mesmo adicionou</Italic>
			</Line>
		</>
	);
};

export const CopypastaSearchResult = ({
	number,
	name,
}: {
	number: number;
	name: string;
}) => {
	return (
		<Line>
			{number} - {name}
		</Line>
	);
};

export const CopypastaSearchResultDeep = ({
	number,
	name,
	part,
}: {
	number: number;
	name: string;
	part: string;
}) => {
	return (
		<>
			<Line>
				{number} - {name}
			</Line>
			<Line />
			<Line>{part}</Line>
			<Line />
		</>
	);
};

export const CopypastaListItem = ({
	number,
	name,
}: {
	number: number;
	name: string;
}) => {
	return (
		<Line>
			{number} - {name}
		</Line>
	);
};

export const NeedsQuote = () => {
	return (
		<Line>
			<Bold>
				Erro: Responda com esse comando uma mensagem de texto para torna-la copypasta
			</Bold>
		</Line>
	);
};

export const NeedsQuery = () => {
	return (
		<Line>
			<Bold>Erro: Digite algo para eu pesquisar nas copypastas.</Bold>
		</Line>
	);
};

export const NeedsBody = () => {
	return (
		<Line>
			<Bold>
				Erro: Responda com esse comando uma mensagem DE TEXTO para torna-la copypasta
			</Bold>
		</Line>
	);
};

export const NeedsName = () => {
	return (
		<Line>
			<Bold>Erro: Dê um nome para a copypasta</Bold>
		</Line>
	);
};

export const NeedsNameOrNumber = () => {
	return (
		<Line>
			<Bold>Erro: Dê um nome ou numero para a copypasta que deseja obter</Bold>
		</Line>
	);
};

export const InvalidCopypasta = () => {
	return (
		<Line>
			<Bold>
				Erro: Essa copypasta não existe. Consulte a lista de copypastas com
				!copypasta list
			</Bold>
		</Line>
	);
};

export const NotCopypastaOwner = () => {
	return (
		<Line>
			<Bold>Erro: Você só pode deletar uma copypasta que você mesmo adicionou</Bold>
		</Line>
	);
};

export const CopypastaAdded = ({ name }: { name: string }) => {
	return (
		<Line>
			Sucesso! Copypasta adicionada. Para fazer o bot envia-la basta digitar
			!copypasta {name}
		</Line>
	);
};

export const CopypastaDeleted = () => {
	return <Line>A copypasta foi deletada.</Line>;
};

export const Copypasta = ({ id, text }: { id: string; text: string }) => {
	return (
		<>
			<Line>{id}</Line>
			<Line />
			<Line>{text}</Line>
		</>
	);
};
