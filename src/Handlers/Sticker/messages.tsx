import { Bold, Line } from 'kozz-module-maker';

export const DefaultInstructions = () => (
	<>
		<Line>
			<Bold>Instrucoes!</Bold>
		</Line>
		<Line>
			Envie um video ou imagem com _*!s*_ na legenda, _ou_ responda um video ou
			imagem com _*!s*_.
		</Line>
	</>
);

export const ToImgInstructions = () => (
	<>
		<Line>
			<Bold>Instrucoes!</Bold>
		</Line>
		<Line>Por favor responda uma figurinha para transforma-la em midia.</Line>
		<Line>Por enquanto, figurinhas animadas sao enviadas apenas com o primeiro frame.</Line>
	</>
);

export const Help = () => (
	<>
		<Line>
			Envie um video ou imagem com _*!s*_ na legenda, _ou_ responda um video ou
			imagem com _*!s*_.
		</Line>
		<Line>Responda uma figurinha com _*!s*_ para transforma-la em imagem.</Line>
		<Line>
			Responda uma mensagem de texto com _*!s full*_ para criar a figurinha
			incluindo a mensagem citada por ela.
		</Line>
	</>
);
