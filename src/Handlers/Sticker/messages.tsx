import { Bold, Line, Monospace } from 'kozz-module-maker';

export const DefaultInstructions = () => (
	<>
		<Line>
			<Bold>Vamos fazer uma figurinha? ✨</Bold>
		</Line>
		<Line>
			Envie um video ou imagem com _*!s*_ na legenda, _ou_ responda um video ou
			imagem com _*!s*_.
		</Line>
		<Line>
			Para recortar uma foto e deixar o fundo transparente, use{' '}
			<Monospace>!s --sem-fundo</Monospace> ou <Monospace>!s --sf</Monospace>.
		</Line>
	</>
);

export const ToImgInstructions = () => (
	<>
		<Line>
			<Bold>Instrucoes!</Bold>
		</Line>
		<Line>Por favor responda uma figurinha para transforma-la em midia.</Line>
		<Line>Figurinhas animadas sao convertidas e enviadas como video MP4.</Line>
	</>
);

export const Help = () => (
	<>
		<Line>
			<Bold>Figurinhas ✨</Bold>
		</Line>
		<Line>
			Envie um video ou imagem com _*!s*_ na legenda, _ou_ responda um video ou
			imagem com _*!s*_.
		</Line>
		<Line />
		<Line>
			<Bold>Com fundo transparente ✂️</Bold>
		</Line>
		<Line>
			Responda a uma foto com <Monospace>!s --sem-fundo</Monospace>, ou escreva esse
			comando na legenda da foto. O atalho <Monospace>!s --sf</Monospace> faz o
			mesmo.
		</Line>
		<Line>
			Funciona com fotos estáticas de até 8 MB e 16 megapixels. Aguarde a conclusão
			antes de enviar outra; fundos muito parecidos com o objeto podem dificultar o
			recorte.
		</Line>
		<Line>
			Para vídeos e GIFs, use <Monospace>!s</Monospace> sem essa opção.
		</Line>
		<Line>
			Também pode pedir:{' '}
			<Monospace>!ai faz uma figurinha dessa foto sem o fundo</Monospace>.
		</Line>
		<Line />
		<Line>
			<Bold>Outras opções</Bold>
		</Line>
		<Line>Responda uma figurinha com _*!s*_ para transforma-la em imagem.</Line>
		<Line>
			Responda uma mensagem de texto com _*!s full*_ para criar a figurinha incluindo
			a mensagem citada por ela.
		</Line>
	</>
);

export const BackgroundError = ({ message }: { message: string }) => (
	<Line>{message}</Line>
);
