import { Bold, Line, Monospace } from 'kozz-module-maker';

export const HostOnly = () => (
	<>
		<Line>Apenas o dono do bot pode alterar esta configuração.</Line>
	</>
);

export const GroupOnly = () => (
	<>
		<Line>Este comando só pode ser usado em grupos.</Line>
	</>
);

export const CommandsDisabled = () => (
	<>
		<Line>
			<Bold>Comandos desativados neste grupo.</Bold>
		</Line>
		<Line>
			Use <Monospace>/group on</Monospace> para reativá-los.
		</Line>
	</>
);

export const CommandsEnabled = () => (
	<>
		<Line>
			<Bold>Comandos ativados neste grupo.</Bold>
		</Line>
	</>
);

export const Help = () => (
	<>
		<Line>
			<Bold>Configuração do grupo</Bold>
		</Line>
		<Line>
			<Monospace>/group off</Monospace> desativa os comandos neste grupo.
		</Line>
		<Line>
			<Monospace>/group on</Monospace> reativa os comandos neste grupo.
		</Line>
	</>
);
