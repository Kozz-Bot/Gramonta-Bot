import { Bold, Line } from 'kozz-module-maker';

export const Menu = () => <>
	<Line><Bold>Teste de botões</Bold></Line>
	<Line>Toque em uma opção ou digite um dos comandos abaixo.</Line>
	<Line>Os botões ficam disponíveis para quem pediu este menu por 15 minutos.</Line>
</>;

export const Help = () => <Line>Digite `!botoes` para testar os botões de resposta do WhatsApp. Se não aparecerem, use os comandos escritos na mensagem.</Line>;
