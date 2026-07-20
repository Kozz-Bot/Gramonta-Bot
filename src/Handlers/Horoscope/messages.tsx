import { Bold, Line } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>Escreva !horoscopo + seu signo para receber sua sorte diaria</Line>
		<Line>_Exemplo_: `!horoscopo aries`</Line>
	</>
);

export const NotFound = () => (
	<Line>
		<Bold>Nao encontrei seu signo.</Bold>
	</Line>
);

export const Horoscope = ({ horoscope }: { horoscope: string }) => (
	<>
		<Line>
			<Bold>Sua sorte diaria...</Bold>
		</Line>
		<Line>{horoscope}</Line>
	</>
);
