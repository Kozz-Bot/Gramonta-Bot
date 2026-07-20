import { Bold, Line } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>
			<Bold>Portal de noticias</Bold>
		</Line>
		<Line>Seu noticiario no bot do zap!</Line>
		<Line>`|   today    |   Gratis!!    |     !news today     |`</Line>
		<Line>{'`|   search   | 10 CalvoCoins |   !news {{busca}}   |`'}</Line>
		<Line />
		<Line>_*today:*_ Busca as manchetes do ultimo dia.</Line>
		<Line>_*search*_: Busca noticias segundo os termos que inserir.</Line>
		<Line>
			Os comandos sao paginados. Voce pode usar o parametro _*page*_ para obter
			mais resultados.
		</Line>
		<Line>Exemplo: _*!news Taxacao shein --page 2*_</Line>
	</>
);

export const ErrorMessage = ({ error }: { error: unknown }) => (
	<>
		<Line>
			<Bold>Erro:</Bold>
		</Line>
		<Line>Erro desconhecido: {String(error)}</Line>
	</>
);

export const NotFound = () => (
	<>
		<Line>
			<Bold>Erro:</Bold>
		</Line>
		<Line>Nao encontrei nenhuma noticia.</Line>
	</>
);

export const formatArticle = ({
	headline,
	sourceName,
	articleLink,
	date,
}: {
	headline: string;
	sourceName: string;
	articleLink: string;
	date: string;
}) => `${headline}
Fonte: ${sourceName}
${date}
${articleLink}
`;
