import {
	Bold,
	ForEach,
	Line,
	ListItem,
	Monospace,
	Render,
} from 'kozz-module-maker';
import {
	ChatRPGAttribute,
	ChatRPGBaitEffects,
	ChatRPGFishingProbabilitiesResponse,
	ChatRPGInventoryItem,
	ChatRPGItem,
	ChatRPGProgressionEntry,
} from 'src/API/ChatRPGApi';
import {
	formatAttribute,
	formatEffectName,
	formatEffectValue,
	formatItemName,
	formatSkill,
} from './formatters';

type RpgBait = {
	id: string;
	name: string;
	buyPrice?: number;
	effects?: ChatRPGBaitEffects;
	quantity?: number;
};

type ProgressionEntry = ChatRPGProgressionEntry;

const formatEffects = (effects: ChatRPGBaitEffects = {}) => {
	const entries = Object.entries(effects);

	if (!entries.length) {
		return 'sem bonus';
	}

	return entries
		.map(
			([effect, value]) =>
				`${formatEffectName(effect)}: ${formatEffectValue(effect, value)}`
		)
		.join(', ');
};

const itemName = (slot: ChatRPGInventoryItem, items: ChatRPGItem[]) =>
	formatItemName(
		items.find(candidate => candidate.id === slot.itemId),
		slot.itemId
	);

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;

const topDrops = (
	drops: ChatRPGFishingProbabilitiesResponse['probabilities']['drops']['fish']
) =>
	[...drops]
		.sort((a, b) => b.probabilityPerFishingAttempt - a.probabilityPerFishingAttempt)
		.slice(0, 5);

export const ChatRPGHelp = () => (
	<>
		<Line>
			<Bold>🎲 Chat RPG</Bold>
		</Line>
		<Line>Comandos disponiveis para jogar pelo grupo:</Line>
		<Line />
		<Line>
			<Monospace>!registro {'{nome}'}</Monospace> cria seu personagem
		</Line>
		<Line>
			<Monospace>!status</Monospace> mostra o resumo do personagem
		</Line>
		<Line>
			<Monospace>!inventario</Monospace> lista seus itens
		</Line>
		<Line>
			<Monospace>!skills</Monospace> mostra suas skills
		</Line>
		<Line>
			<Monospace>!atributos</Monospace> mostra atributos e pontos
		</Line>
		<Line>
			<Monospace>!gold</Monospace> consulta seu gold
		</Line>
		<Line>
			<Monospace>!loja iscas</Monospace> abre a loja de iscas
		</Line>
		<Line>
			<Monospace>!comprar iscas {'{isca}'} {'{qtd}'}</Monospace> compra iscas
		</Line>
		<Line>
			<Monospace>!pescar [{'{isca}'}]</Monospace> tenta uma pescaria
		</Line>
		<Line>
			<Monospace>!chances pesca [{'{isca}'}]</Monospace> mostra as odds da pesca
		</Line>
		<Line>
			<Monospace>!vender {'{slot | item}'} [{'{qtd}'}]</Monospace> vende item
		</Line>
	</>
);

export const RpgError = ({ title, message }: { title: string; message: string }) => (
	<>
		<Line>
			<Bold>⚠️ {title}</Bold>
		</Line>
		<Line>{message}</Line>
	</>
);

export const ChancesUsage = () => (
	<>
		<Line>
			<Bold>🎯 Chances</Bold>
		</Line>
		<Line>
			Use <Monospace>!chances pesca</Monospace> para ver as probabilidades da
			pescaria.
		</Line>
		<Line>
			Com isca especifica: <Monospace>!chances pesca {'{nome da isca}'}</Monospace>
		</Line>
	</>
);

export const RegisterUsage = () => (
	<>
		<Line>
			<Bold>🪪 Registro de personagem</Bold>
		</Line>
		<Line>
			Use <Monospace>!registro {'{nome}'}</Monospace> dentro de um grupo.
		</Line>
		<Line>
			Exemplo: <Monospace>!registro Arkan</Monospace>
		</Line>
	</>
);

export const AlreadyRegistered = ({
	username,
	playerId,
	guildName,
}: {
	username: string;
	playerId: number;
	guildName: string;
}) => (
	<>
		<Line>
			<Bold>🧙 Personagem ja registrado</Bold>
		</Line>
		<Line>
			Nome: <Bold>{username}</Bold>
		</Line>
		<Line>Player ID: {playerId}</Line>
		<Line>Guilda: {guildName}</Line>
	</>
);

export const RegisterSuccess = ({
	username,
	playerId,
	guildName,
}: {
	username: string;
	playerId: number;
	guildName: string;
}) => (
	<>
		<Line>
			<Bold>✨ Registro criado</Bold>
		</Line>
		<Line>
			Bem-vindo, <Bold>{username}</Bold>.
		</Line>
		<Line>Player ID: {playerId}</Line>
		<Line>Guilda: {guildName}</Line>
	</>
);

export const BaitShop = ({ baits }: { baits: RpgBait[] }) => (
	<>
		<Line>
			<Bold>🛒 Loja de iscas</Bold>
		</Line>
		<Line />
		<ForEach
			data={baits}
			render={bait => (
				<>
					<Line>
						<Bold>{bait.name}</Bold> <Monospace>{bait.id}</Monospace>
					</Line>
					<Line>
						💰 {bait.buyPrice ?? 0} gold | {formatEffects(bait.effects)}
					</Line>
				</>
			)}
		/>
	</>
);

export const BuyUsage = () => (
	<>
		<Line>
			<Bold>🛒 Compra de iscas</Bold>
		</Line>
		<Line>
			Use <Monospace>!comprar iscas {'{nome da isca}'} {'{quantidade}'}</Monospace>
		</Line>
	</>
);

export const BuySuccess = ({
	quantity,
	baitName,
	goldSpent,
	currentGold,
}: {
	quantity: number;
	baitName: string;
	goldSpent: number | undefined;
	currentGold: number | string;
}) => (
	<>
		<Line>
			<Bold>✅ Compra realizada</Bold>
		</Line>
		<Line>
			{quantity}x <Bold>{baitName}</Bold>
		</Line>
		<Line>Gold gasto: {goldSpent ?? 0}</Line>
		<Line>Gold atual: {currentGold}</Line>
	</>
);

export const NoBaitForFishing = () => (
	<>
		<Line>
			<Bold>🎣 Voce precisa de isca</Bold>
		</Line>
		<Line>Sem isca, nada de pescaria por enquanto.</Line>
		<Line>
			Veja a loja com <Monospace>!loja iscas</Monospace> e compre com{' '}
			<Monospace>!comprar iscas {'{isca}'} {'{qtd}'}</Monospace>.
		</Line>
	</>
);

export const MultipleBaitsForFishing = ({
	baits,
	command = '!pescar',
}: {
	baits: RpgBait[];
	command?: string;
}) => (
	<>
		<Line>
			<Bold>🎣 Escolha uma isca</Bold>
		</Line>
		<Line>
			Voce tem mais de um tipo. Use <Monospace>{command} {'{nome da isca}'}</Monospace>.
		</Line>
		<Line />
		<Line>
			<Bold>Suas iscas</Bold>
		</Line>
		<ForEach
			data={baits}
			render={bait => (
				<ListItem>
					{bait.name} x{bait.quantity ?? 0}
				</ListItem>
			)}
		/>
	</>
);

export const MissingBaitForFishing = ({ baits }: { baits: RpgBait[] }) => (
	<>
		<Line>
			<Bold>🎣 Isca indisponivel</Bold>
		</Line>
		<Line>Voce nao tem essa isca no inventario.</Line>
		<Render when={baits.length > 0}>
			<Line />
			<Line>
				<Bold>Suas iscas</Bold>
			</Line>
			<ForEach
				data={baits}
				render={bait => (
					<ListItem>
						{bait.name} x{bait.quantity ?? 0}
					</ListItem>
				)}
			/>
		</Render>
		<Render when={baits.length === 0}>
			<Line>
				Use <Monospace>!loja iscas</Monospace> para ver as opcoes.
			</Line>
		</Render>
	</>
);

export const FishingNoCatch = () => (
	<>
		<Line>
			<Bold>🎣 Pescaria concluida</Bold>
		</Line>
		<Line>A linha voltou vazia dessa vez.</Line>
	</>
);

export const FishingSuccess = ({
	itemName,
	quality,
	weight,
	xp,
	sellValue,
	randomEvent,
}: {
	itemName: string;
	quality: string;
	weight: string;
	xp: number;
	sellValue: number;
	randomEvent?: string;
}) => (
	<>
		<Line>
			<Bold>🎣 Pescaria concluida</Bold>
		</Line>
		<Line>
			Item: <Bold>{itemName}</Bold>
		</Line>
		<Line>Qualidade: {quality}</Line>
		<Line>Peso: {weight}</Line>
		<Line>XP: +{xp}</Line>
		<Line>Venda: {sellValue} gold</Line>
		<Render when={Boolean(randomEvent)}>
			<Line>Evento: {randomEvent}</Line>
		</Render>
	</>
);

export const FishingProbabilitiesMessage = ({
	probabilities,
}: {
	probabilities: ChatRPGFishingProbabilitiesResponse['probabilities'];
}) => {
	const categories = probabilities.categoryProbabilities;
	const fishDrops = topDrops(probabilities.drops.fish);
	const treasureDrops = topDrops(probabilities.drops.treasure);
	const junkDrops = topDrops(probabilities.drops.junk);

	return (
		<>
			<Line>
				<Bold>🎯 Probabilidades da pesca</Bold>
			</Line>
			<Line>Isca: {probabilities.bait?.name ?? 'sem isca'}</Line>
			<Line>
				Niveis: pesca {probabilities.levels.fishingLevel}, destreza{' '}
				{probabilities.levels.dexterityLevel}, sorte {probabilities.levels.luckLevel}
			</Line>
			<Line />
			<Line>
				<Bold>Categorias</Bold>
			</Line>
			<ListItem>🐟 Peixe: {percent(categories.fish)}</ListItem>
			<ListItem>🪙 Tesouro: {percent(categories.treasure)}</ListItem>
			<ListItem>🧱 Lixo: {percent(categories.junk)}</ListItem>
			<Line />
			<Line>
				<Bold>Top peixes por tentativa</Bold>
			</Line>
			<ForEach
				data={fishDrops}
				render={drop => (
					<ListItem>
						{drop.name}: {percent(drop.probabilityPerFishingAttempt)}
					</ListItem>
				)}
			/>
			<Line />
			<Line>
				<Bold>Top tesouros</Bold>
			</Line>
			<ForEach
				data={treasureDrops}
				render={drop => (
					<ListItem>
						{drop.name}: {percent(drop.probabilityPerFishingAttempt)}
					</ListItem>
				)}
			/>
			<Line />
			<Line>
				<Bold>Top lixo</Bold>
			</Line>
			<ForEach
				data={junkDrops}
				render={drop => (
					<ListItem>
						{drop.name}: {percent(drop.probabilityPerFishingAttempt)}
					</ListItem>
				)}
			/>
			<Line />
			<Line>
				Evento aleatorio: {percent(1 - probabilities.randomEvents.none)}
			</Line>
			<Line>
				Qualidades e eventos tambem entram no calculo final da pescaria.
			</Line>
		</>
	);
};

export const StatusMessage = ({
	username,
	playerId,
	gold,
	attributePoints,
	skills,
	attributes,
	inventory,
	items,
}: {
	username: string;
	playerId: number;
	gold: number;
	attributePoints: number;
	skills: ProgressionEntry[];
	attributes: ProgressionEntry[];
	inventory: ChatRPGInventoryItem[];
	items: ChatRPGItem[];
}) => (
	<>
		<Line>
			<Bold>🧙 Status de {username}</Bold>
		</Line>
		<Line>ID: {playerId}</Line>
		<Line>💰 Gold: {gold}</Line>
		<Line>⭐ Pontos de atributo: {attributePoints}</Line>
		<Line />
		<Line>
			<Bold>Skills principais</Bold>
		</Line>
		<ForEach
			data={[...skills].sort((a, b) => b.level - a.level).slice(0, 6)}
			render={skill => (
				<ListItem>
					{formatSkill(skill.skill)}: nivel {skill.level}, xp {skill.xp}
					{skill.xpRemainingToNextLevel === null
						? ''
						: `, faltam ${skill.xpRemainingToNextLevel}`}
				</ListItem>
			)}
		/>
		<Line />
		<Line>
			<Bold>Atributos</Bold>
		</Line>
		<ForEach
			data={attributes}
			render={attribute => (
				<ListItem>
					{formatAttribute(attribute.attribute)}: nivel {attribute.level}
				</ListItem>
			)}
		/>
		<Line />
		<InventoryMessage inventory={inventory} items={items} compact />
	</>
);

export const InventoryMessage = ({
	inventory,
	items,
	compact = false,
}: {
	inventory: ChatRPGInventoryItem[];
	items: ChatRPGItem[];
	compact?: boolean;
}) => (
	<>
		<Line>
			<Bold>🎒 Inventario</Bold>
		</Line>
		<Render when={inventory.length === 0}>
			<Line>Inventario vazio.</Line>
		</Render>
		<Render when={inventory.length > 0}>
			<ForEach
				data={inventory}
				render={slot => (
					<ListItem>
						slot {slot.slotNumber ?? slot.id}: {itemName(slot, items)} x{slot.quantity}
					</ListItem>
				)}
			/>
		</Render>
		<Render when={!compact}>
			<Line />
			<Line>
				Para vender: <Monospace>!vender {'{slot}'}</Monospace>
			</Line>
		</Render>
	</>
);

export const SkillsMessage = ({ skills }: { skills: ProgressionEntry[] }) => (
	<>
		<Line>
			<Bold>📘 Skills</Bold>
		</Line>
		<ForEach
			data={[...skills].sort((a, b) => b.level - a.level)}
			render={skill => (
				<ListItem>
					{formatSkill(skill.skill)}: nivel {skill.level}, xp {skill.xp}
					{skill.xpRemainingToNextLevel === null
						? ''
						: `, faltam ${skill.xpRemainingToNextLevel}`}
				</ListItem>
			)}
		/>
	</>
);

export const AttributesMessage = ({
	attributes,
	points,
}: {
	attributes: ProgressionEntry[];
	points: number;
}) => (
	<>
		<Line>
			<Bold>⭐ Atributos</Bold>
		</Line>
		<Line>Pontos disponiveis: {points}</Line>
		<ForEach
			data={attributes}
			render={attribute => (
				<ListItem>
					{formatAttribute(attribute.attribute)}: nivel {attribute.level}
				</ListItem>
			)}
		/>
	</>
);

export const GoldMessage = ({ gold }: { gold: number }) => (
	<Line>
		💰 Gold: <Bold>{gold}</Bold>
	</Line>
);

export const SellUsage = () => (
	<>
		<Line>
			<Bold>💰 Venda de item</Bold>
		</Line>
		<Line>
			Use <Monospace>!vender {'{slot | nome do item}'} [{'{quantidade}'}]</Monospace>
		</Line>
	</>
);

export const SellSuccess = ({
	quantity,
	item,
	goldGained,
	currentGold,
}: {
	quantity: number;
	item: string;
	goldGained: number;
	currentGold: number | string;
}) => (
	<>
		<Line>
			<Bold>💰 Venda realizada</Bold>
		</Line>
		<Line>
			{quantity}x <Bold>{item}</Bold>
		</Line>
		<Line>Gold recebido: {goldGained}</Line>
		<Line>Gold atual: {currentGold}</Line>
	</>
);
