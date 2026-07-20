import { Bold, ForEach, Line, Monospace } from 'kozz-module-maker';

export type WeatherForecast = {
	date: string;
	description: string;
	minimum: string;
	maximum: string;
	rainChance: number;
};

type WeatherProps = {
	location: string;
	description: string;
	temperature: string;
	minimum: string;
	maximum: string;
	feelsLike: string;
	humidity: string;
	wind: string;
	localtime: string;
	forecast: WeatherForecast[];
};

export const NotFound = () => (
	<>
		<Line>
			<Bold>Erro:</Bold>
		</Line>
		<Line>Não encontrei esse lugar</Line>
	</>
);

export const EmptyQuery = () => (
	<>
		<Line>
			<Bold>Erro:</Bold>
		</Line>
		<Line>Por favor insira um local para eu pesquisar.</Line>
	</>
);

export const ErrorMessage = ({ error }: { error: string }) => (
	<>
		<Line>
			<Bold>Erro:</Bold>
		</Line>
		<Line>Erro desconhecido: {error}</Line>
	</>
);

export const Weather = ({
	location,
	description,
	temperature,
	minimum,
	maximum,
	feelsLike,
	humidity,
	wind,
	localtime,
	forecast,
}: WeatherProps) => (
	<>
		<Line>
			<Bold>🌤️ Clima em {location}</Bold>
		</Line>
		<Line />
		<Line>{description}</Line>
		<Line>
			<Bold>Agora:</Bold> {temperature}
		</Line>
		<Line>
			<Bold>Mínima:</Bold> {minimum} · <Bold>Máxima:</Bold> {maximum}
		</Line>
		<Line>
			<Bold>Sensação:</Bold> {feelsLike}
		</Line>
		<Line>
			<Bold>Umidade:</Bold> {humidity}
		</Line>
		<Line>
			<Bold>Vento:</Bold> {wind}
		</Line>
		<Line>
			<Bold>Hora local:</Bold> {localtime}
		</Line>
		<Line />
		<Line>
			<Bold>Próximos 3 dias</Bold>
		</Line>
		<ForEach
			data={forecast}
			render={(day, index) => (
				<>
					<Line>
						<Bold>{day.date}</Bold>
					</Line>
					<Line>{day.description}</Line>
					<Line>
						{day.minimum} a {day.maximum} · Chuva: {day.rainChance}%
					</Line>
					{index !== forecast.length - 1 ? <Line /> : null}
				</>
			)}
		/>
	</>
);

export const Help = () => (
	<>
		<Line>
			Digite <Monospace>!clima</Monospace> seguido do nome do local para consultar
			o tempo e a previsão dos próximos 3 dias!
		</Line>
		<Line />
		<Line>
			<Bold>Exemplo:</Bold>
		</Line>
		<Line>
			<Monospace>!clima rio de janeiro</Monospace>
		</Line>
		<Line>
			<Monospace>!clima curitiba</Monospace>
		</Line>
		<Line>
			<Monospace>!clima alabama</Monospace>
		</Line>
	</>
);
