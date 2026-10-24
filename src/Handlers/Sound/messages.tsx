import { Bold, Line, Monospace } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>Procura e envia o primeiro som encontrado no MyInstants.</Line>
		<Line>
			Use <Monospace>/som &lt;pesquisa&gt;</Monospace>
		</Line>
		<Line>
			Exemplo: <Monospace>/som vine boom</Monospace>
		</Line>
	</>
);

export const EmptyQuery = () => (
	<Line>
		<Bold>Informe o som que você quer procurar.</Bold> Exemplo: /som risada
	</Line>
);

export const NoResults = () => (
	<Line>Não encontrei nenhum som para essa pesquisa.</Line>
);

export const SearchError = () => (
	<Line>Não consegui buscar o som agora. Tente novamente em instantes.</Line>
);
