import { Bold, Line } from 'kozz-module-maker';

export const Help = () => (
	<>
		<Line>
			<Bold>Comandos de lista de transmissao!</Bold>
		</Line>
		<Line>!transmit add **nome_da_lista** para adicionar grupo a lista de transmissao</Line>
		<Line>!transmit remove **nome_da_lista** para remover grupo da lista de transmissao</Line>
		<Line>!transmit list **nome_da_lista** para ver todos os grupos da lista de transmissao</Line>
		<Line>
			Responder mensagem de anuncio com !transmit to **nome_da_lista** para
			transmitir mensagem para todos os grupos da lista escolhida.
		</Line>
	</>
);
