import { Line } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>Digite !ofenda + nome da pessoa para ofende-la!</Line>
		<Line>_Exemplo_: `!ofenda Joaquim`</Line>
	</>
);

export const TagSomeone = ({ offense }: { offense?: string }) => (
	<Line>Por favor marque alguem pra eu xingar, seu {offense}</Line>
);

export const Curse = ({
	contact,
	offense,
	variant,
}: {
	contact: string;
	offense?: string;
	variant: number;
}) => {
	if (variant === 0) return <Line>Ae, {contact} seu {offense}</Line>;
	if (variant === 1) return <Line>{contact}, tu e um {offense}</Line>;
	return <Line>Fiquei sabendo que {contact} e {offense}</Line>;
};
