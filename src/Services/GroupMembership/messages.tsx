import { Line } from 'kozz-module-maker';
import { tagMember } from 'kozz-module-maker/dist/InlineCommands';
import type { ContactPayload, GroupChat } from 'kozz-types';

type Details = { group: GroupChat; member: ContactPayload };
type Template = (details: Details) => string;

const SemJuizoWelcome = ({ group, member }: Details) => (
	<>
		<Line>🍻 Você desbloqueou o MODO PRIME!</Line>
		<Line />
		<Line>
			Seja muito bem-vindo ao {group.name} 🍻 Se apresenta aí e bora viver essa
			loucura com a gente! 🚀
		</Line>
		<Line />
		<Line>{tagMember(member.id)}</Line>
		<Line />
		<Line>📷 Foto: (sem visual, sem participação 😎)</Line>
		<Line>🎂 Idade:</Line>
		<Line>📐 Altura:</Line>
		<Line>📌 Onde mora:</Line>
		<Line>🏳️‍🌈 Orientação sexual:</Line>
		<Line>🎈 Aniversário:</Line>
		<Line>📲 Instagram:</Line>
		<Line>🫂 Quem te recrutou:</Line>
		<Line>💌 PV LIBERADO?</Line>
		<Line />
		<Line>«🚨 RECADOS DA CASA:</Line>
		<Line>
			📖 Dá aquela olhada na descrição do grupo antes de começar a resenha!
		</Line>
		<Line>👀 Foto do perfil aberta pra facilitar a identificação.</Line>
	</>
);

// Chave fixa @g.us; templates recebem os detalhes atuais do grupo e do membro.
export const groupMembershipMessages: Record<
	string,
	{ join?: Template; leave?: Template }
> = {
	'120363411230167560@g.us': { join: SemJuizoWelcome },
};
