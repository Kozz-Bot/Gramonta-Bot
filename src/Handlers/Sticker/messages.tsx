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
			Vídeos viram figurinhas com o som original. Para tirar o som, use{' '}
			<Monospace>!s --sem-som</Monospace>.
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
			<Bold>Vídeos com som 🔊</Bold>
		</Line>
		<Line>
			Envie um vídeo com <Monospace>!s</Monospace> na legenda ou responda ao vídeo
			com esse comando. A figurinha mantém até 10 segundos do vídeo e do áudio
			original.
		</Line>
		<Line>
			Para uma figurinha animada sem áudio, use <Monospace>!s --sem-som</Monospace>.
			Vídeos que já não têm áudio continuam silenciosos. Toque no ícone de som da
			figurinha para ouvir; é preciso uma versão do WhatsApp compatível.
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
		<Line>
			Responda uma figurinha com <Monospace>!s</Monospace> para reenviá-la, ou{' '}
			<Monospace>!s --sem-som</Monospace> para retirar seu áudio. Para transformar em
			imagem ou vídeo, use <Monospace>!s toimg</Monospace>.
		</Line>
		<Line>
			Responda uma mensagem de texto com _*!s full*_ para criar a figurinha incluindo
			a mensagem citada por ela.
		</Line>
	</>
);

export const BackgroundError = ({ message }: { message: string }) => (
	<Line>{message}</Line>
);
