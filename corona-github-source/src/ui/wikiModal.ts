import {
  ARMOR_DEFS,
  ELEMENTAL_STAFF_ORDER,
  ELEMENTAL_STAFF_RECIPES,
  ELEMENTAL_STONE_DEFS,
  PRECIOUS_METALS,
  WEAPON_DEFS,
  getIslandArmorSlot,
  getIslandElementalPortalStone,
  getIslandMetalId,
  getIslandWeaponId,
} from '../world/arsenal';
import { ELDER_DEFS, ELDER_ORDER } from '../world/elders';
import { ISLAND_DEFINITIONS } from '../world/islands';
import { GOD_DEFS, MOUNT_DEFS } from '../world/mountsAndGods';
import type { GodId, MountId } from '../types';

export type WikiTabId =
  | 'overview'
  | 'resources'
  | 'kingdom'
  | 'weapons'
  | 'armor'
  | 'elders'
  | 'gods'
  | 'mounts'
  | 'islands';

interface WikiEntry {
  title: string;
  subtitle?: string;
  accent?: string;
  tags?: Array<{ label: string; tone?: 'gold' | 'cyan' | 'green' | 'red' | 'purple' | 'neutral' }>;
  body: string;
  bullets?: string[];
}

interface WikiSection {
  id: WikiTabId;
  label: string;
  icon: string;
  intro: string;
  entries: WikiEntry[];
}

const ROMANS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildWikiSections(): WikiSection[] {
  const godOrder: GodId[] = ['freya', 'thor', 'odin', 'loki'];
  const mountOrder: MountId[] = [
    'starter',
    'harpy',
    'wolf',
    'ice_horse',
    'bear',
    'fire_horse',
    'sleipnir',
  ];

  // Map mountId -> island roman
  const mountIslandMap = new Map<MountId, string>();
  mountIslandMap.set('starter', 'Ilha I (Inicial)');
  for (const isl of ISLAND_DEFINITIONS) {
    if (isl.mountId) mountIslandMap.set(isl.mountId, `Ilha ${ROMANS[isl.id - 1]}`);
  }

  const godIslandMap = new Map<GodId, string>();
  for (const isl of ISLAND_DEFINITIONS) {
    if (isl.godId) godIslandMap.set(isl.godId, `Ilha ${ROMANS[isl.id - 1]}`);
  }

  return [
    // =========================================================================
    // 1. VISÃO GERAL & CONTROLES
    // =========================================================================
    {
      id: 'overview',
      label: 'Início',
      icon: '👑',
      intro:
        'Guia completo de Corona — Sagas do Norte (v2.19). Expanda seu reino nórdico através de 9 ilhas progressivas, proteja sua Coroa nas noites de ataque, resgate Anciões, invoque Deuses e forje armas, cajados e armaduras lendárias.',
      entries: [
        {
          title: 'Objetivo da Campanha & A Coroa',
          accent: '#ffe58a',
          tags: [
            { label: '9 Ilhas', tone: 'gold' },
            { label: 'Reino até Nv.10', tone: 'cyan' },
          ],
          body: 'Você governa como Rei ou Rainha montado em sua montaria. Recrute súditos, construa muralhas, torres, fazendas e o Drakkar para navegar pelas 9 ilhas até os Portões de Asgard.',
          bullets: [
            'Se monstros arrancarem sua Coroa e você não a recuperar, o reinado termina (Game Over).',
            'O Capacete Glacial (Ilha IV) e o Manto Real de Uru (Ilha IX) concedem Escudo da Coroa que absorve 1 golpe fatal por dia.',
            'Cada ilha libera +1 nível máximo de Reino (Ilha I = Nv.2 até Ilha IX = Nv.10).',
          ],
        },
        {
          title: 'Ciclo Dia / Noite & Lua de Sangue',
          accent: '#ff8a95',
          tags: [
            { label: 'Duração ajustável no Menu', tone: 'neutral' },
            { label: 'Lua de Sangue', tone: 'red' },
          ],
          body: 'Durante o dia, súditos constroem, colhem, caçam e mineram. Ao cair da noite, portais liberam ondas de monstros cada vez maiores. Noites de Lua de Sangue trazem ataques mais intensos e exige defesa reforçada.',
          bullets: [
            'Você pode ajustar a duração do Dia/Noite no menu ☰ (1 a 5 min por metade).',
            'Destruir todos os portais de uma ilha encerra as invasões daquela ilha.',
          ],
        },
        {
          title: 'Controles (PC e Celular / Touch)',
          accent: '#84e8ff',
          tags: [
            { label: 'Teclado', tone: 'cyan' },
            { label: 'Toque', tone: 'green' },
          ],
          body: 'Controles pensados para jogar com fluidez tanto no computador quanto no celular (modo retrato ou paisagem):',
          bullets: [
            'Mover / Galopar: A / D ou ◀ / ▶ (Segure Shift para galopar). No celular, toque nos lados da tela.',
            'Pagar Moedas / Interagir: Espaço ou ↓ (ou toque direto nas moedas flutuantes da construção).',
            'Poder da Arma / Cajado: F ou Q (ou botão de arma no canto do HUD).',
            'Poder da Montaria: E (ou botão de montaria no HUD).',
            'Poder do Ancião montado: R ou botão do Ancião no HUD.',
            'Zoom da Câmera & Tamanho da Fonte: 6 níveis de fonte (padrão 4) e Zoom ajustáveis no menu ☰.',
          ],
        },
        {
          title: 'Co-op Online, Campanhas Salvas & Discoteca',
          accent: '#7bf598',
          tags: [
            { label: 'Até 4 Jogadores', tone: 'green' },
            { label: '8 Slots + Nuvem', tone: 'gold' },
            { label: '10 Músicas', tone: 'purple' },
          ],
          body: 'Jogue sozinho ou com até 3 amigos na mesma campanha usando código de sala, com chat de texto e voz integrados.',
          bullets: [
            'Campanhas Salvas: até 8 slots independentes sincronizados com sua conta Google, exibindo ícones de todos os itens acumulados em cada slot.',
            'Discoteca Nórdica: escolha entre 10 músicas nórdicas originais com prévia ao vivo antes de selecionar, ou ative a alternância automática.',
          ],
        },
      ],
    },

    // =========================================================================
    // 2. RECURSOS & ECONOMIA
    // =========================================================================
    {
      id: 'resources',
      label: 'Recursos',
      icon: '💎',
      intro:
        'A economia do reino combina moedas, diamantes, materiais básicos, 9 minérios preciosos, madeira sagrada de Yggdrasil e 3 pedras elementais raras.',
      entries: [
        {
          title: 'Moedas & Transferência Automática por Salto',
          accent: '#ffe58a',
          tags: [
            { label: 'Bolsa do Rei', tone: 'gold' },
            { label: 'Salto Automático', tone: 'green' },
          ],
          body: 'Moedas financiam recrutamento, ferramentas, construções, fazendas, armas, armaduras e rituais.',
          bullets: [
            'Sempre que um súdito carregando moeda passa pelo Rei (ou o Rei passa pelo súdito) e há espaço na bolsa, a moeda salta automaticamente com animação direto para o Rei!',
            'Fontes de moedas: caça de animais (arqueiros), colheita nas fazendas (produtores), baús de tesouro, derrubar árvores/pedras, puzzles rúnicos e rendimentos do Banqueiro.',
            'O Banqueiro guarda suas moedas excedentes e rende juros diários no cofre do reino.',
          ],
        },
        {
          title: 'Diamantes (◆)',
          accent: '#7ef5ff',
          tags: [
            { label: 'Recurso Raro', tone: 'cyan' },
            { label: 'Persiste entre Ilhas', tone: 'gold' },
          ],
          body: 'Diamantes são usados para invocar Deuses (3◆), domar Montarias especiais (2 a 4◆), convocar um Ancião para montar na garupa do cavalo (1◆) e forjar Cajados Elementais (2 a 3◆).',
          bullets: [
            'Obtidos em baús de tesouro (incluindo 3 diamantes iniciais na Ilha I), resolvendo Puzzles Rúnicos (+2◆ por ilha nas Ilhas II a IX) e recompensas da Comunidade / Convide Amigos.',
          ],
        },
        {
          title: 'Madeira, Pedra e Ferro',
          accent: '#e8bc82',
          tags: [
            { label: 'Construção', tone: 'neutral' },
            { label: 'Forja', tone: 'gold' },
          ],
          body: 'Materiais fundamentais extraídos pelos Pedreiros ao marcar árvores, rochas e depósitos.',
          bullets: [
            'Madeira e Pedra são usadas para evoluir muralhas, torres, fazendas, o Reino, forjar armaduras e construir os Cajados Elementais.',
            'Ferro (a partir da Ilha II) fortalece construções e equipamentos avançados.',
            'Com o Ancião da Força, é possível converter minérios, pedras e madeiras em outros recursos.',
          ],
        },
        {
          title: '9 Minérios Preciosos (1 Mina por Ilha)',
          accent: '#ffcf5c',
          tags: [
            { label: 'Ilhas I–IX', tone: 'gold' },
            { label: 'Requer Pedreiros', tone: 'cyan' },
          ],
          body: 'Cada uma das 9 ilhas possui uma mina exclusiva de um metal precioso diferente. Pague moedas na mina para enviar Pedreiros e extrair minérios para a Forja.',
          bullets: Object.values(PRECIOUS_METALS).map(
            (m) => `Ilha ${ROMANS[m.islandId - 1]}: ${m.name}`
          ),
        },
        {
          title: 'Madeira de Yggdrasil (Árvore Gigante da Ilha VI)',
          accent: '#7eff9e',
          tags: [
            { label: 'Ilha VI', tone: 'green' },
            { label: 'Custo: 3🪙 → +3 Madeiras', tone: 'gold' },
          ],
          body: 'Na Ilha VI (Forjas de Nidavellir) ergue-se a colossal árvore sagrada Yggdrasil. Pague 3 moedas junto às suas raízes para que seus Pedreiros colham +3 Madeiras de Yggdrasil (renovável).',
          bullets: [
            'Cada Cajado Elemental exige 3 Madeiras de Yggdrasil para ser forjado.',
          ],
        },
        {
          title: 'As 3 Pedras Elementais Flutuantes',
          accent: '#ff6b6b',
          tags: [
            { label: 'Apenas 3 Portais', tone: 'red' },
            { label: 'Fogo · Gelo · Trovão', tone: 'gold' },
          ],
          body: 'Em toda a campanha existem exatamente 3 portais inimigos especiais marcados por uma pedra elemental brilhante flutuando acima do portal. Ao destruir o portal, você conquista a pedra!',
          bullets: [
            '🔴 Pedra Vermelha (Fogo): portal interno direito da Ilha I — forja o Cajado do Fogo.',
            '🔵 Pedra Azul (Gelo): portal interno esquerdo da Ilha III — forja o Cajado do Gelo.',
            '🟡 Pedra Amarela (Trovão): portal interno direito da Ilha V — forja o Cajado do Trovão.',
          ],
        },
      ],
    },

    // =========================================================================
    // 3. TROPAS & REINO
    // =========================================================================
    {
      id: 'kingdom',
      label: 'Tropas & Reino',
      icon: '🏰',
      intro:
        'Transforme errantes das florestas em trabalhadores e guerreiros especializados, expanda suas fortificações e navegue com sua tripulação no Drakkar.',
      entries: [
        {
          title: 'Recrutamento & Classes de Súditos',
          accent: '#9fd8ff',
          tags: [
            { label: '5 Profissões', tone: 'cyan' },
            { label: 'Errantes nos Acampamentos', tone: 'neutral' },
          ],
          body: 'Jogue 1 moeda para errantes nos acampamentos da floresta para recrutá-los como súditos. Depois, compre ferramentas nas tendas do reino para atribuir profissões:',
          bullets: [
            '🔨 Pedreiros: cortam árvores, quebram pedras, erguem e consertam muralhas/torres/barco, mineram metais preciosos e colhem Yggdrasil.',
            '🏹 Arqueiros: caçam animais durante o dia (gerando moedas!) e defendem muralhas e torres à noite.',
            '⚔️ Espadachins: linha de frente resistente contra monstros e ataques a portais (tenda de espadas liberada ao invocar Thor na Ilha III).',
            '🔱 Lanceiros: combatentes ágeis de médio alcance, essenciais nas companhias de ataque do Ancião de Guerra.',
            '🌾 Fazendeiros (Produtores): cultivam fazendas gerando grande fluxo contínuo de moedas todos os dias.',
          ],
        },
        {
          title: 'Muralhas, Torres, Fazendas & Evolução do Reino',
          accent: '#efc462',
          tags: [
            { label: 'Reino Nv.1 → Nv.10', tone: 'gold' },
            { label: 'Ancião das Obras', tone: 'cyan' },
          ],
          body: 'Evolua o Salão Principal para liberar novas construções, aumentar a defesa e desbloquear níveis avançados.',
          bullets: [
            'Muralhas protegem o reino contra invasões noturnas e delimitam a zona segura dos Anciões.',
            'Torres posicionam arqueiros em posição elevada com maior alcance.',
            'Somente com o Ancião das Obras é possível melhorar muros, construções e o Reino para níveis avançados usando minérios e matérias-primas.',
          ],
        },
        {
          title: 'O Drakkar (Barco Nórdico) & Viagem entre Ilhas',
          accent: '#78d2ff',
          tags: [
            { label: 'Navegação', tone: 'cyan' },
            { label: 'Tripulação', tone: 'gold' },
          ],
          body: 'Construa o Drakkar e leve-o até o cais para zarpar para a próxima ilha no Mapa das Ilhas.',
          bullets: [
            'Ao tocar o sino do barco, uma tripulação de Arqueiros, Espadachins, Pedreiros e Anciões resgatados embarca com você.',
            'Seu progresso nas ilhas anteriores fica salvo em snapshots e você pode retornar a qualquer ilha desbloqueada pelo Mapa das Ilhas.',
          ],
        },
      ],
    },

    // =========================================================================
    // 4. ARMAS & MAGIAS (9 DIVINAS + 3 CAJADOS ELEMENTAIS)
    // =========================================================================
    {
      id: 'weapons',
      label: 'Armas & Magias',
      icon: '⚡',
      intro:
        'Cada ilha oferece 1 Arma Divina em seu Santuário, e nos Altares de Forja você pode criar os 3 Cajados de Magia Elemental. Cada jogador pode portar 1 arma por vez (e nunca repetida no Co-op). Ative com [F], [Q] ou o botão no HUD.',
      entries: [
        {
          title: 'Regras de Equipamento de Armas & Cajados',
          accent: '#ffe58a',
          tags: [
            { label: '1 Arma por Jogador', tone: 'gold' },
            { label: 'Nunca Repetida', tone: 'red' },
          ],
          body: 'Apenas uma arma ou cajado pode estar equipado por jogador. No Co-op, cada relíquia divina é única — se outro jogador já estiver portando, ela não se repete. Cajados elementais forjados podem ser trocados/reequipados no altar por 1🪙.',
        },
        // 3 Elemental Magic Staves
        ...ELEMENTAL_STAFF_ORDER.map((staffId): WikiEntry => {
          const wDef = WEAPON_DEFS[staffId];
          const rec = ELEMENTAL_STAFF_RECIPES[staffId];
          const stone = ELEMENTAL_STONE_DEFS[rec.stoneKind];
          return {
            title: `✨ ${wDef.name} (Magia Elemental)`,
            subtitle: `Altar de Forja no Reino · Recarga ${wDef.cooldown}s`,
            accent: wDef.color,
            tags: [
              { label: `${rec.diamondCost}◆ + ${rec.coinCost}🪙`, tone: 'gold' },
              { label: `${rec.woodCost} Mad · ${rec.stoneCost} Ped`, tone: 'neutral' },
              { label: `${stone.shortName} (Ilha ${ROMANS[stone.islandId - 1]})`, tone: rec.stoneKind === 'fire' ? 'red' : rec.stoneKind === 'ice' ? 'cyan' : 'gold' },
              { label: `${rec.yggdrasilWoodCost} Yggdrasil (Ilha VI)`, tone: 'green' },
            ],
            body: wDef.desc,
          };
        }),
        // 9 Divine Island Weapons
        ...ISLAND_DEFINITIONS.map((isl): WikiEntry => {
          const wId = getIslandWeaponId(isl.id);
          const wDef = WEAPON_DEFS[wId];
          return {
            title: `${wDef.name}`,
            subtitle: `Santuário da Ilha ${ROMANS[isl.id - 1]} (${isl.name.pt.split('—')[1]?.trim() ?? ''})`,
            accent: wDef.color,
            tags: [
              { label: `Ilha ${ROMANS[isl.id - 1]}`, tone: 'cyan' },
              { label: `Custo: ${wDef.coinCost}🪙`, tone: 'gold' },
              { label: `Recarga: ${wDef.cooldown}s`, tone: 'neutral' },
            ],
            body: wDef.desc,
          };
        }),
      ],
    },

    // =========================================================================
    // 5. ARMADURAS & MINAS PRECIOSAS
    // =========================================================================
    {
      id: 'armor',
      label: 'Armaduras',
      icon: '🛡️',
      intro:
        'Em cada uma das 9 ilhas há uma mina de metal precioso e uma peça de armadura exclusiva forjada na Forja. Todos os bônus das peças forjadas são cumulativos e permanentes para o Monarca!',
      entries: [
        {
          title: 'Como Minerar e Forjar Armaduras',
          accent: '#ffcf5c',
          tags: [
            { label: 'Requer Ancião da Força', tone: 'red' },
            { label: 'Bônus Cumulativos', tone: 'green' },
          ],
          body: 'Para forjar uma peça de armadura, primeiro resgate o Ancião da Força. Depois:',
          bullets: [
            '1. Encontre a Mina de Metal Precioso da ilha atual e pague moedas para enviar seus Pedreiros.',
            '2. Acumule o minério precioso + Madeira + Pedra + Moedas.',
            '3. Vá até a Forja com o Ancião da Força ativo no reino para fundir e equipar a nova peça visualmente no Monarca!',
          ],
        },
        ...ISLAND_DEFINITIONS.map((isl): WikiEntry => {
          const slot = getIslandArmorSlot(isl.id);
          const armor = ARMOR_DEFS[slot];
          const metal = PRECIOUS_METALS[getIslandMetalId(isl.id)];
          return {
            title: `${armor.name}`,
            subtitle: `Ilha ${ROMANS[isl.id - 1]} · Metal: ${metal.name}`,
            accent: metal.highlight,
            tags: [
              { label: `${armor.oreCost} ${metal.name}`, tone: 'gold' },
              { label: `${armor.woodCost} Mad · ${armor.stoneCost} Ped`, tone: 'neutral' },
              { label: `${armor.coinCost}🪙`, tone: 'gold' },
              ...(armor.crownShield ? [{ label: 'Escudo da Coroa', tone: 'cyan' as const }] : []),
            ],
            body: `Bônus concedido: ${armor.bonusDesc}.`,
          };
        }),
      ],
    },

    // =========================================================================
    // 6. OS 5 ANCIÕES NÓRDICOS
    // =========================================================================
    {
      id: 'elders',
      label: 'Anciões',
      icon: '🧙',
      intro:
        'Cinco Anciões únicos vivem em cabanas espalhadas pelas terras selvagens. Cada um desbloqueia mecânicas vitais e habilidades exclusivas no reino.',
      entries: [
        {
          title: 'Regras de Resgate, Montaria & Segurança dos Muros',
          accent: '#d9c2ff',
          tags: [
            { label: 'Resgate: 4🪙', tone: 'gold' },
            { label: 'Montar no Cavalo: 1◆', tone: 'cyan' },
            { label: 'Regra dos Muros', tone: 'red' },
          ],
          body: 'Entenda como conduzir e usar os Anciões corretamente:',
          bullets: [
            'Resgate: pague 4 moedas na cabana do Ancião na floresta para trazê-lo ao reino. Ele passa a viajar com você para as próximas ilhas.',
            'Segurança: todo Ancião resgatado caminha dentro da proteção das muralhas do reino.',
            'Convocação a Cavalo: aproxime-se do Ancião dentro do reino e pague 1 Diamante (◆) para que ele monte na garupa do seu cavalo.',
            'Saída dos Muros: se você ultrapassar as muralhas externas, APENAS o Ancião de Guerra e o Ancião das Obras continuam no cavalo. Os outros (Bardo, Força e Feras) descem automaticamente para não correrem perigo!',
          ],
        },
        ...ELDER_ORDER.map((id): WikiEntry => {
          const e = ELDER_DEFS[id];
          return {
            title: `${e.name}`,
            subtitle: `Habilidade: ${e.powerName} (Recarga ${e.powerCooldown}s)`,
            accent: e.accentColor,
            tags: [
              { label: `Resgate: ${e.rescueCoins}🪙`, tone: 'gold' },
              { label: 'Montar: 1◆', tone: 'cyan' },
              {
                label: e.canLeaveWalls ? 'Sai dos Muros no Cavalo' : 'Fica Dentro dos Muros',
                tone: e.canLeaveWalls ? 'green' : 'red',
              },
            ],
            body: e.roleDesc,
          };
        }),
      ],
    },

    // =========================================================================
    // 7. DEUSES, BUFFS & RITUAL DE SACRIFÍCIO (TRIBUTO)
    // =========================================================================
    {
      id: 'gods',
      label: 'Deuses & Sacrifícios',
      icon: '🗿',
      intro:
        'Estátuas monumentais dos deuses nórdicos oferecem bênçãos poderosas permanentes na campanha — mas exigem Diamantes, Moedas e um Ritual de Tributo (Sacrifício de Súditos).',
      entries: [
        {
          title: 'Como Funciona o Ritual de Sacrifício (Tributo)',
          accent: '#ff8a95',
          tags: [
            { label: '3◆ + Moedas + Tributos', tone: 'red' },
            { label: 'Fila de Arrebatamento', tone: 'gold' },
          ],
          body: 'Invocar um Deus não depende apenas de ouro e diamantes — os deuses exigem devoção viva do seu reino:',
          bullets: [
            '1. Aproxime-se da Estátua do Deus na ilha correspondente e pague os 3 Diamantes + Moedas.',
            '2. Ao concluir o pagamento, o número exigido de súditos disponíveis no reino (arqueiros, espadachins, pedreiros, fazendeiros ou súditos sem ferramenta) é convocado automaticamente.',
            '3. Os tributos marcham formando uma fila sagrada até a estátua ativada e são arrebatados um por um aos céus em um feixe de luz!',
            '4. Quando o último tributo é arrebatado, o Deus é oficialmente invocado e seu Buff é ativado.',
          ],
        },
        ...godOrder.map((id): WikiEntry => {
          const g = GOD_DEFS[id];
          const extra =
            id === 'thor'
              ? ' Além do buff de combate, invocar Thor libera a Forja de Espadas (Espadachins) no reino!'
              : '';
          return {
            title: `${g.name} — ${g.title.pt}`,
            subtitle: `Encontrado na ${godIslandMap.get(id) ?? 'Campanha'}`,
            accent: g.color,
            tags: [
              { label: `${g.diamondCost}◆ + ${g.coinCost}🪙`, tone: 'gold' },
              { label: `Sacrifício: ${g.tributeCount} Súditos`, tone: 'red' },
            ],
            body: `Buff Divino: ${g.buffDesc.pt}.${extra}`,
          };
        }),
      ],
    },

    // =========================================================================
    // 8. MONTARIAS NÓRDICAS
    // =========================================================================
    {
      id: 'mounts',
      label: 'Montarias',
      icon: '🐎',
      intro:
        'Domestique 7 montarias míticas ao longo das 9 ilhas. Cada montaria altera sua velocidade, fôlego e concede um poder ativo acionado com [E] ou o botão de montaria no HUD.',
      entries: mountOrder.map((id): WikiEntry => {
        const m = MOUNT_DEFS[id];
        return {
          title: m.name.pt,
          subtitle: mountIslandMap.get(id) ?? 'Ilha',
          accent: m.accentColor,
          tags: [
            {
              label: m.diamondCost > 0 ? `${m.diamondCost}◆ + ${m.coinCost}🪙` : 'Gratuita',
              tone: m.diamondCost > 0 ? 'cyan' : 'green',
            },
            { label: `Galope: ${m.sprintSpeed}`, tone: 'gold' },
            ...(m.powerCooldown > 0
              ? [{ label: `Recarga: ${m.powerCooldown}s`, tone: 'neutral' as const }]
              : []),
          ],
          body: `Poder especial: ${m.powerDesc.pt}. Velocidade de trote: ${m.trotSpeed} · Galope: ${m.sprintSpeed}.`,
        };
      }),
    },

    // =========================================================================
    // 9. ILHAS, PORTAIS & PUZZLES
    // =========================================================================
    {
      id: 'islands',
      label: 'Ilhas & Puzzles',
      icon: '🗺️',
      intro:
        'A saga percorre 9 ilhas únicas com cenários, montanhas, céus, auroras, arcos-íris e estátuas monumentais distintas. Cada nova ilha é maior (de 2800 até 7600px) e traz mais portais inimigos (de 2 até 8).',
      entries: [
        {
          title: 'Puzzles Rúnicos & Baús Secretos',
          accent: '#7ef5ff',
          tags: [
            { label: 'Ilhas II a IX', tone: 'cyan' },
            { label: 'Custo: 3🪙 → +2◆ + 4🪙', tone: 'gold' },
          ],
          body: 'Cada ilha a partir da Ilha II esconde um Altar de Puzzle Rúnico a oeste do reino (x = centro - 640), além de baús de tesouro nas fronteiras selvagens.',
          bullets: [
            'Puzzle Rúnico: aproxime-se do altar misterioso e deposite 3 moedas para decifrar as runas antigas e liberar +2 Diamantes e +4 Moedas.',
            'Baús de Tesouro: há 2 baús nas extremidades de todas as ilhas (e 4 baús nas ilhas grandes a partir da Ilha IV) com moedas e diamantes.',
            'Fronteiras do Mapa: praias com cais a oeste e cadeias montanhosas monumentais a leste encerram cada território.',
          ],
        },
        ...ISLAND_DEFINITIONS.map((isl): WikiEntry => {
          const wDef = WEAPON_DEFS[getIslandWeaponId(isl.id)];
          const metal = PRECIOUS_METALS[getIslandMetalId(isl.id)];
          const armor = ARMOR_DEFS[getIslandArmorSlot(isl.id)];
          const elemStone = getIslandElementalPortalStone(isl.id);
          const godName = isl.godId ? GOD_DEFS[isl.godId].name : null;
          const mountName = isl.mountId ? MOUNT_DEFS[isl.mountId].name.pt : null;

          const bullets: string[] = [
            `Arma Divina: ${wDef.name} (${wDef.coinCost}🪙) · Armadura: ${armor.name} (${metal.name}).`,
            `Monumento do Cenário: ${isl.theme.monumentName} · Mapa: ${isl.worldWidth}px · Portais inimigos: ${isl.portalCount}.`,
          ];
          if (godName || mountName) {
            bullets.push(
              [
                godName ? `Deus: ${godName}` : null,
                mountName ? `Montaria: ${mountName}` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            );
          }
          if (isl.puzzleName) {
            bullets.push(`Puzzle Rúnico: ${isl.puzzleName.pt} (+2◆ + 4🪙).`);
          }
          if (elemStone) {
            const stDef = ELEMENTAL_STONE_DEFS[elemStone];
            bullets.push(`Portal Especial com Pedra Flutuante: ${stDef.name} (destrua o portal para coletar!).`);
          }
          if (isl.id === 6) {
            bullets.push('Árvore Gigante Yggdrasil: pague 3🪙 para colher +3 Madeiras de Yggdrasil (necessária para os 3 Cajados Elementais).');
          }

          return {
            title: isl.name.pt,
            subtitle: isl.subtitle.pt,
            accent: isl.skyTint,
            tags: [
              { label: `Reino Nv.${isl.id + 1}`, tone: 'gold' },
              { label: `${isl.portalCount} Portais`, tone: 'red' },
              ...(isl.maxDiamonds > 0
                ? [{ label: `Até ${isl.maxDiamonds}◆`, tone: 'cyan' as const }]
                : [{ label: '3◆ nos Baús', tone: 'cyan' as const }]),
              ...(elemStone
                ? [
                    {
                      label: ELEMENTAL_STONE_DEFS[elemStone].shortName,
                      tone:
                        elemStone === 'fire'
                          ? ('red' as const)
                          : elemStone === 'ice'
                            ? ('cyan' as const)
                            : ('gold' as const),
                    },
                  ]
                : []),
              ...(isl.id === 6 ? [{ label: '🌳 Yggdrasil', tone: 'green' as const }] : []),
            ],
            body: `Território ${ROMANS[isl.id - 1]} da campanha nórdica.`,
            bullets,
          };
        }),
      ],
    },
  ];
}

export interface WikiController {
  open: (tab?: WikiTabId) => void;
  close: () => void;
  isOpen: () => boolean;
}

export function createWikiController(onStateChange?: (open: boolean) => void): WikiController {
  const modal = document.getElementById('wiki-modal') as HTMLDivElement | null;
  const btnClose = document.getElementById('btn-wiki-close') as HTMLButtonElement | null;
  const searchInput = document.getElementById('wiki-search-input') as HTMLInputElement | null;
  const tabsContainer = document.getElementById('wiki-tabs') as HTMLDivElement | null;
  const bodyContainer = document.getElementById('wiki-body') as HTMLDivElement | null;

  const sections = buildWikiSections();
  let isOpenFlag = false;
  let activeTab: WikiTabId = 'overview';
  let searchQuery = '';

  const renderTabs = () => {
    if (!tabsContainer) return;
    tabsContainer.innerHTML = sections
      .map((sec) => {
        const active = sec.id === activeTab && !searchQuery;
        return `<button type="button" class="wiki-tab-btn${active ? ' active' : ''}" data-wiki-tab="${sec.id}">${sec.icon} ${escapeHtml(sec.label)}</button>`;
      })
      .join('');

    tabsContainer.querySelectorAll<HTMLButtonElement>('.wiki-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextTab = btn.dataset.wikiTab as WikiTabId | undefined;
        if (!nextTab) return;
        activeTab = nextTab;
        if (searchInput && searchInput.value) {
          searchInput.value = '';
          searchQuery = '';
        }
        renderTabs();
        renderBody();
        if (bodyContainer) bodyContainer.scrollTop = 0;
      });
    });
  };

  const renderEntryCard = (entry: WikiEntry, sectionLabel?: string): string => {
    const tagsHtml = (entry.tags ?? [])
      .map(
        (tg) =>
          `<span class="wiki-tag ${tg.tone ?? 'neutral'}">${escapeHtml(tg.label)}</span>`
      )
      .join('');
    const bulletsHtml =
      entry.bullets && entry.bullets.length > 0
        ? `<ul class="wiki-bullets">${entry.bullets
            .map((b) => `<li>${escapeHtml(b)}</li>`)
            .join('')}</ul>`
        : '';
    const borderStyle = entry.accent ? ` style="border-left-color:${entry.accent}"` : '';
    const sectionPill = sectionLabel
      ? `<span class="wiki-sec-badge">${escapeHtml(sectionLabel)}</span>`
      : '';
    return `
      <article class="wiki-card"${borderStyle}>
        <div class="wiki-card-head">
          <div>
            <h3 class="wiki-card-title">${escapeHtml(entry.title)}</h3>
            ${entry.subtitle ? `<div class="wiki-card-sub">${escapeHtml(entry.subtitle)}</div>` : ''}
          </div>
          ${sectionPill}
        </div>
        ${tagsHtml ? `<div class="wiki-tags">${tagsHtml}</div>` : ''}
        <p class="wiki-card-text">${escapeHtml(entry.body)}</p>
        ${bulletsHtml}
      </article>
    `;
  };

  const renderBody = () => {
    if (!bodyContainer) return;
    const q = searchQuery.trim().toLowerCase();

    if (q) {
      const matches: Array<{ entry: WikiEntry; sec: WikiSection }> = [];
      for (const sec of sections) {
        for (const entry of sec.entries) {
          const hay = [
            sec.label,
            entry.title,
            entry.subtitle ?? '',
            entry.body,
            ...(entry.bullets ?? []),
            ...(entry.tags ?? []).map((t) => t.label),
          ]
            .join(' ')
            .toLowerCase();
          if (hay.includes(q)) {
            matches.push({ entry, sec });
          }
        }
      }
      if (matches.length === 0) {
        bodyContainer.innerHTML = `<div class="wiki-empty">Nenhum resultado para "<strong>${escapeHtml(searchQuery)}</strong>". Tente buscar por "Fogo", "Yggdrasil", "Ancião", "Thor", "Puzzle" ou "Armadura".</div>`;
        return;
      }
      bodyContainer.innerHTML =
        `<div class="wiki-intro">Encontrados <strong>${matches.length}</strong> tópicos para "<strong>${escapeHtml(searchQuery)}</strong>":</div>` +
        matches.map((m) => renderEntryCard(m.entry, `${m.sec.icon} ${m.sec.label}`)).join('');
      return;
    }

    const sec = sections.find((s) => s.id === activeTab) ?? sections[0];
    bodyContainer.innerHTML =
      `<div class="wiki-intro">${escapeHtml(sec.intro)}</div>` +
      sec.entries.map((e) => renderEntryCard(e)).join('');
  };

  const open = (tab?: WikiTabId) => {
    if (tab) activeTab = tab;
    isOpenFlag = true;
    renderTabs();
    renderBody();
    modal?.classList.add('open');
    if (bodyContainer) bodyContainer.scrollTop = 0;
    onStateChange?.(true);
  };

  const close = () => {
    if (!isOpenFlag) return;
    isOpenFlag = false;
    modal?.classList.remove('open');
    onStateChange?.(false);
  };

  btnClose?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderTabs();
    renderBody();
  });

  return {
    open,
    close,
    isOpen: () => isOpenFlag,
  };
}
