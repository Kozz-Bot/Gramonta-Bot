import { Bold, Line } from 'kozz-module-maker';
import type { UpdateGroup } from '../../Services/Updates/store';

export const Feedback = ({ text }: { text: string }) => <Line>{text}</Line>;
export const Groups = ({
	groups,
	title,
}: {
	groups: (UpdateGroup & { groupType?: string })[];
	title: string;
}) => (
	<>
		<Line>
			<Bold>{title}</Bold>
		</Line>
		{groups.length ? (
			groups.map(g => (
				<Line>
					{g.name} — {g.id}
					{g.groupType ? ` (${g.groupType})` : ''}
				</Line>
			))
		) : (
			<Line>Nenhum grupo na lista.</Line>
		)}
	</>
);
export const Help = () => (
	<>
		<Line>
			<Bold>Novidades do Gramonta</Bold>
		</Line>
		<Line>
			O dono escolhe os grupos que recebem avisos sobre atualizações do bot. A lista
			fica salva e começa vazia.
		</Line>
		<Line />
		<Line>
			<Bold>Começar neste grupo</Bold>
		</Line>
		<Line>!updates adicionar</Line>
		<Line>Ou peça: !ai ative os avisos de novidades neste grupo</Line>
		<Line />
		<Line>
			<Bold>Escolher outro grupo</Bold>
		</Line>
		<Line>!updates buscar Sem Juízo</Line>
		<Line>!updates adicionar NOME DO GRUPO</Line>
		<Line>
			Substitua NOME DO GRUPO pelo nome completo ou pelo ID mostrado na busca. Se
			houver nomes iguais, escolha o ID do grupo de conversa ou de avisos; a
			comunidade não recebe mensagens.
		</Line>
		<Line />
		<Line>
			<Bold>Consultar e remover</Bold>
		</Line>
		<Line>!updates listar</Line>
		<Line>!updates remover</Line>
		<Line>
			Sem nome, remove o grupo atual. Para outro grupo: !updates remover NOME DO
			GRUPO
		</Line>
		<Line>
			Também pode pedir tudo isso à IA. Só o dono pode alterar ou consultar a lista.
			Configurar um grupo não envia um aviso agora; os avisos acompanham os próximos
			pushes feitos por nós.
		</Line>
	</>
);
