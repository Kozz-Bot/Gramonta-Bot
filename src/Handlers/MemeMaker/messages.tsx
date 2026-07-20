import { Bold, Line } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>
			<Bold>Criador de memes</Bold>
		</Line>
		<Line>Responda uma imagem com o comando</Line>
		<Line>`!meme create --top-text texto de cima --bottom-text texto de baixo`</Line>
		<Line>para receber o meme no seu whatsapp</Line>
	</>
);
