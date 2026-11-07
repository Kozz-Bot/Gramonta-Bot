import { Bold, Line, Monospace } from 'kozz-module-maker';
import type { ActionRecord } from '../../Services/AiExecution';

export const WorkflowSummary = ({
	actions,
	reason,
}: {
	actions: ActionRecord[];
	reason: string;
}) => {
	const status = {
		completed: 'concluído',
		submitted: 'envio submetido',
		scheduled: 'agendado',
		invoked: 'comando invocado; confira a resposta dele',
		failed: 'não concluído',
		uncertain: 'resultado incerto; confira antes de repetir',
	};
	return (
		<>
			<Line>
				<Bold>[#CalvoGPT]: {reason}</Bold>
			</Line>
			{actions.map(action => (
				<Line>{`${action.label}: ${status[action.status]}`}</Line>
			))}
			<Line>As ações já iniciadas não foram repetidas.</Line>
		</>
	);
};

export const Help = () => {
	return (
		<>
			<Line>
				<Bold>Inteligência artificial</Bold>
			</Line>
			<Line>
				Use <Monospace>!ai</Monospace> seguido do que você quer pedir ao CalvoGPT.
			</Line>
			<Line />
			<Line>
				Exemplos: <Monospace>!ai resume a conversa</Monospace>
			</Line>
			<Line>
				<Monospace>!ai cria uma imagem de um gato jogando basquete</Monospace>
			</Line>
			<Line>
				Envie ou cite uma imagem com{' '}
				<Monospace>!ai muda o fundo para azul</Monospace> para editá-la.
			</Line>
			<Line>
				<Monospace>!ai transcreve esse áudio</Monospace>
			</Line>
			<Line>
				Envie ou responda a um vídeo com <Monospace>!ai resume esse vídeo</Monospace>
				. Eu observo cenas e transcrevo o áudio.
			</Line>
			<Line>
				<Monospace>
					!ai explica essa discussão e veja as mídias se precisar
				</Monospace>
			</Line>
			<Line>
				Se o texto não bastar, posso consultar fotos, figurinhas, áudios e vídeos do
				histórico deste chat. Arquivos de até 32 MB; vídeos por trechos de até 3
				minutos, com amostras de cenas. Detalhes muito rápidos podem passar
				despercebidos.
			</Line>
			<Line>
				Qualquer pessoa pode pedir comandos por aqui, sem confirmação. Tudo acontece
				neste chat, respeitando as permissões de cada comando.
			</Line>
			<Line>
				<Monospace>!ai me lembra daqui a 30 minutos de beber água</Monospace>
			</Line>
			<Line>
				<Monospace>
					!ai cria um evento aqui: futebol, amanhã às 19h, na quadra
				</Monospace>
			</Line>
			<Line>Também pode combinar etapas no mesmo pedido:</Line>
			<Line>
				<Monospace>
					!ai gera uma arte de futebol, cria o evento amanhã às 19h na quadra usando
					essa arte e me lembra daqui a 2h de confirmar o pessoal
				</Monospace>
			</Line>
			<Line>
				Eu acompanho os resultados e aviso se alguma etapa não puder ser concluída.
			</Line>
			<Line>
				Não é possível mandar comandos para outro grupo ou avisos no privado de
				outras pessoas por este atalho.
			</Line>
			<Line>
				<Monospace>!ai usage</Monospace> mostra uso recente, tokens e erros.
			</Line>
			<Line />
			<Line>
				<Bold>Memórias deste chat 🧠</Bold>
			</Line>
			<Line>
				Posso guardar informações úteis sobre as pessoas e o grupo para lembrar
				depois. O que é dito aqui fica na memória deste chat.
			</Line>
			<Line>
				<Monospace>!ai guarda que eu prefiro pizza sem cebola</Monospace>
			</Line>
			<Line>
				<Monospace>!ai o que você lembra sobre mim?</Monospace>
			</Line>
			<Line>
				<Monospace>!ai corrige minha preferência: agora prefiro sushi</Monospace>
			</Line>
			<Line>
				<Monospace>!ai esquece minha preferência de comida</Monospace>
			</Line>
			<Line>
				Também posso lembrar automaticamente de fatos duradouros que aparecem durante
				nossos pedidos. A própria pessoa pode corrigir ou pedir para apagar
				informações sobre si.
			</Line>
			<Line>
				Agentes externos: conecte o MCP em https://gramont.digital/wpp/mcp e siga a
				autorização. <Monospace>!ai agente sair</Monospace> revoga todos os agentes
				no chat consigo mesmo.
			</Line>
		</>
	);
};
