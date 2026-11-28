import type {
  ArmorSlot,
  ElementalStaffId,
  ElementalStoneKind,
  PreciousMetalId,
  WeaponId,
} from '../types';

export interface WeaponDefinition {
  id: WeaponId;
  islandId: number;
  name: string;
  shortTag: string;
  desc: string;
  coinCost: number;
  cooldown: number;
  color: string;
  iconKind: 'bow' | 'shield' | 'hammer' | 'spear' | 'staff' | 'rune' | 'sword' | 'horn' | 'scepter';
}

export interface ElementalStoneDefinition {
  kind: ElementalStoneKind;
  name: string;
  shortName: string;
  islandId: number;
  color: string;
  highlight: string;
  staffId: ElementalStaffId;
}

export interface ElementalStaffRecipe {
  staffId: ElementalStaffId;
  stoneKind: ElementalStoneKind;
  diamondCost: number;
  coinCost: number;
  woodCost: number;
  stoneCost: number;
  yggdrasilWoodCost: number;
  altarOffset: number;
}

export const ELEMENTAL_STONE_DEFS: Record<ElementalStoneKind, ElementalStoneDefinition> = {
  fire: {
    kind: 'fire',
    name: 'Pedra Vermelha do Fogo',
    shortName: 'Pedra Fogo',
    islandId: 1,
    color: '#ff4238',
    highlight: '#ff9e78',
    staffId: 'staff_fire',
  },
  ice: {
    kind: 'ice',
    name: 'Pedra Azul do Gelo',
    shortName: 'Pedra Gelo',
    islandId: 3,
    color: '#36d8ff',
    highlight: '#c4f7ff',
    staffId: 'staff_ice',
  },
  thunder: {
    kind: 'thunder',
    name: 'Pedra Amarela do Trovão',
    shortName: 'Pedra Trovão',
    islandId: 5,
    color: '#ffe033',
    highlight: '#fff9b8',
    staffId: 'staff_thunder',
  },
};

export const ELEMENTAL_STAFF_ORDER: ElementalStaffId[] = [
  'staff_fire',
  'staff_ice',
  'staff_thunder',
];

export const ELEMENTAL_STAFF_RECIPES: Record<ElementalStaffId, ElementalStaffRecipe> = {
  staff_fire: {
    staffId: 'staff_fire',
    stoneKind: 'fire',
    diamondCost: 2,
    coinCost: 8,
    woodCost: 10,
    stoneCost: 10,
    yggdrasilWoodCost: 3,
    altarOffset: -232,
  },
  staff_ice: {
    staffId: 'staff_ice',
    stoneKind: 'ice',
    diamondCost: 2,
    coinCost: 8,
    woodCost: 10,
    stoneCost: 10,
    yggdrasilWoodCost: 3,
    altarOffset: 232,
  },
  staff_thunder: {
    staffId: 'staff_thunder',
    stoneKind: 'thunder',
    diamondCost: 3,
    coinCost: 10,
    woodCost: 12,
    stoneCost: 12,
    yggdrasilWoodCost: 3,
    altarOffset: 310,
  },
};

/**
 * Strictly 3 Elemental Portals exist across the entire 9-island saga:
 * - Island 1: Red Fire Stone
 * - Island 3: Blue Ice Stone
 * - Island 5: Yellow Thunder Stone
 */
export function getIslandElementalPortalStone(islandId: number): ElementalStoneKind | null {
  if (islandId === 1) return 'fire';
  if (islandId === 3) return 'ice';
  if (islandId === 5) return 'thunder';
  return null;
}

export interface PreciousMetalDefinition {
  id: PreciousMetalId;
  islandId: number;
  name: string;
  color: string;
  highlight: string;
}

export interface ArmorDefinition {
  slot: ArmorSlot;
  islandId: number;
  metalId: PreciousMetalId;
  name: string;
  bonusDesc: string;
  oreCost: number;
  woodCost: number;
  stoneCost: number;
  coinCost: number;
  speedBonusPct: number;
  damageBonusPct: number;
  cooldownReducePct: number;
  pouchBonus: number;
  crownShield: boolean;
}

export const WEAPON_DEFS: Record<WeaponId, WeaponDefinition> = {
  freya_bow: {
    id: 'freya_bow',
    islandId: 1,
    name: 'Arco de Freya',
    shortTag: 'ARCO',
    desc: 'Dispara até 3 flechas divinas sequenciais nos inimigos',
    coinCost: 6,
    cooldown: 4.5,
    color: '#ffe07d',
    iconKind: 'bow',
  },
  tyr_shield: {
    id: 'tyr_shield',
    islandId: 2,
    name: 'Escudo de Tyr',
    shortTag: 'ESCUDO',
    desc: 'Substitui um muro caído por barreira rúnica durante 1 noite',
    coinCost: 8,
    cooldown: 16,
    color: '#7ef5ff',
    iconKind: 'shield',
  },
  thor_hammer: {
    id: 'thor_hammer',
    islandId: 3,
    name: 'Martelo de Thor',
    shortTag: 'MJÖLNIR',
    desc: 'Dispara trovão em cadeia em até 5 inimigos sequencialmente',
    coinCost: 10,
    cooldown: 6.5,
    color: '#9cf2ff',
    iconKind: 'hammer',
  },
  odin_gungnir: {
    id: 'odin_gungnir',
    islandId: 4,
    name: 'Lança Gungnir',
    shortTag: 'LANÇA',
    desc: 'Lança rúnica perfurante que atravessa e empurra inimigos',
    coinCost: 10,
    cooldown: 6.0,
    color: '#82bfff',
    iconKind: 'spear',
  },
  loki_staff: {
    id: 'loki_staff',
    islandId: 5,
    name: 'Cajado de Loki',
    shortTag: 'CAJADO',
    desc: 'Invoca 3 arqueiros e 3 espadachins espectrais para a batalha',
    coinCost: 12,
    cooldown: 22,
    color: '#63f5b5',
    iconKind: 'staff',
  },
  ymir_rune: {
    id: 'ymir_rune',
    islandId: 6,
    name: 'Runa de Ymir',
    shortTag: 'GELO',
    desc: 'Magia glacial que congela inimigos próximos em gelo sólido',
    coinCost: 12,
    cooldown: 10,
    color: '#a8f0ff',
    iconKind: 'rune',
  },
  surtr_blade: {
    id: 'surtr_blade',
    islandId: 7,
    name: 'Espada de Surtr',
    shortTag: 'FOGO',
    desc: 'Libera onda flamejante que incendeia o chão e queima inimigos',
    coinCost: 14,
    cooldown: 7.5,
    color: '#ff7d38',
    iconKind: 'sword',
  },
  heimdall_horn: {
    id: 'heimdall_horn',
    islandId: 8,
    name: 'Trompa Gjallarhorn',
    shortTag: 'TROMPA',
    desc: 'Onda sonora repele inimigos e inspira as tropas próximas',
    coinCost: 14,
    cooldown: 12,
    color: '#ffd15c',
    iconKind: 'horn',
  },
  baldr_scepter: {
    id: 'baldr_scepter',
    islandId: 9,
    name: 'Cetro de Baldr',
    shortTag: 'LUZ',
    desc: 'Feixes solares fulminam 6 inimigos e restauram muralhas',
    coinCost: 16,
    cooldown: 11,
    color: '#fff2a6',
    iconKind: 'scepter',
  },
  staff_fire: {
    id: 'staff_fire',
    islandId: 6,
    name: 'Cajado do Fogo',
    shortTag: 'C.FOGO',
    desc: 'Dispara bola de fogo que explode no 1º inimigo e espalha chamas no chão!',
    coinCost: 8,
    cooldown: 5.5,
    color: '#ff5d38',
    iconKind: 'staff',
  },
  staff_ice: {
    id: 'staff_ice',
    islandId: 6,
    name: 'Cajado do Gelo',
    shortTag: 'C.GELO',
    desc: 'Bola de gelo congela o 1º inimigo e deflagra 3 flocos letais em outros inimigos!',
    coinCost: 8,
    cooldown: 6.5,
    color: '#5ce8ff',
    iconKind: 'staff',
  },
  staff_thunder: {
    id: 'staff_thunder',
    islandId: 6,
    name: 'Cajado do Trovão',
    shortTag: 'TROVÃO',
    desc: 'Dispara trovão arcano que destrói até 5 inimigos instantaneamente!',
    coinCost: 10,
    cooldown: 8.0,
    color: '#ffe033',
    iconKind: 'staff',
  },
};

export const PRECIOUS_METALS: Record<PreciousMetalId, PreciousMetalDefinition> = {
  copper: { id: 'copper', islandId: 1, name: 'Cobre Nórdico', color: '#d9874a', highlight: '#ffbd82' },
  bronze: { id: 'bronze', islandId: 2, name: 'Bronze Rúnico', color: '#d4a259', highlight: '#ffe09e' },
  silver: { id: 'silver', islandId: 3, name: 'Prata de Midgard', color: '#b8c9dc', highlight: '#eef6ff' },
  frost_steel: { id: 'frost_steel', islandId: 4, name: 'Aço Glacial', color: '#6ecbf0', highlight: '#cff5ff' },
  mithril: { id: 'mithril', islandId: 5, name: 'Mithril Verde', color: '#58dba8', highlight: '#b8ffe0' },
  dwarf_gold: { id: 'dwarf_gold', islandId: 6, name: 'Ouro Anão', color: '#f2be42', highlight: '#fff099' },
  obsidian: { id: 'obsidian', islandId: 7, name: 'Obsidiana Solar', color: '#ff6f42', highlight: '#ffc288' },
  jotun_iron: { id: 'jotun_iron', islandId: 8, name: 'Titânio de Jotun', color: '#94aaff', highlight: '#dde5ff' },
  asgard_uru: { id: 'asgard_uru', islandId: 9, name: 'Uru de Asgard', color: '#ffe57a', highlight: '#ffffff' },
};

export const ARMOR_DEFS: Record<ArmorSlot, ArmorDefinition> = {
  gloves: {
    slot: 'gloves',
    islandId: 1,
    metalId: 'copper',
    name: 'Luvas de Cobre',
    bonusDesc: '-12% recarga de armas',
    oreCost: 3,
    woodCost: 3,
    stoneCost: 2,
    coinCost: 5,
    speedBonusPct: 0,
    damageBonusPct: 6,
    cooldownReducePct: 12,
    pouchBonus: 0,
    crownShield: false,
  },
  boots: {
    slot: 'boots',
    islandId: 2,
    metalId: 'bronze',
    name: 'Botas de Bronze',
    bonusDesc: '+12% velocidade do Rei',
    oreCost: 3,
    woodCost: 4,
    stoneCost: 3,
    coinCost: 6,
    speedBonusPct: 12,
    damageBonusPct: 0,
    cooldownReducePct: 0,
    pouchBonus: 0,
    crownShield: false,
  },
  cloak: {
    slot: 'cloak',
    islandId: 3,
    metalId: 'silver',
    name: 'Capa de Prata',
    bonusDesc: '+8% veloc. & +4 moedas bolsa',
    oreCost: 4,
    woodCost: 4,
    stoneCost: 4,
    coinCost: 7,
    speedBonusPct: 8,
    damageBonusPct: 6,
    cooldownReducePct: 0,
    pouchBonus: 4,
    crownShield: false,
  },
  helmet: {
    slot: 'helmet',
    islandId: 4,
    metalId: 'frost_steel',
    name: 'Capacete Glacial',
    bonusDesc: 'Protege a Coroa (1 golpe/dia)',
    oreCost: 4,
    woodCost: 5,
    stoneCost: 4,
    coinCost: 8,
    speedBonusPct: 0,
    damageBonusPct: 8,
    cooldownReducePct: 5,
    pouchBonus: 0,
    crownShield: true,
  },
  chestplate: {
    slot: 'chestplate',
    islandId: 5,
    metalId: 'mithril',
    name: 'Peitoral de Mithril',
    bonusDesc: '+6 bolsa & +12% dano divino',
    oreCost: 5,
    woodCost: 5,
    stoneCost: 5,
    coinCost: 9,
    speedBonusPct: 0,
    damageBonusPct: 12,
    cooldownReducePct: 6,
    pouchBonus: 6,
    crownShield: false,
  },
  pauldrons: {
    slot: 'pauldrons',
    islandId: 6,
    metalId: 'dwarf_gold',
    name: 'Ombreiras de Ouro',
    bonusDesc: '+20% dano das armas divinas',
    oreCost: 5,
    woodCost: 6,
    stoneCost: 6,
    coinCost: 10,
    speedBonusPct: 0,
    damageBonusPct: 20,
    cooldownReducePct: 5,
    pouchBonus: 0,
    crownShield: false,
  },
  greaves: {
    slot: 'greaves',
    islandId: 7,
    metalId: 'obsidian',
    name: 'Grevas de Obsidiana',
    bonusDesc: '+10% veloc. & +12% dano',
    oreCost: 6,
    woodCost: 6,
    stoneCost: 6,
    coinCost: 10,
    speedBonusPct: 10,
    damageBonusPct: 12,
    cooldownReducePct: 0,
    pouchBonus: 0,
    crownShield: false,
  },
  belt: {
    slot: 'belt',
    islandId: 8,
    metalId: 'jotun_iron',
    name: 'Cinturão de Jotun',
    bonusDesc: '+10 bolsa & -14% recarga',
    oreCost: 6,
    woodCost: 7,
    stoneCost: 7,
    coinCost: 11,
    speedBonusPct: 0,
    damageBonusPct: 8,
    cooldownReducePct: 14,
    pouchBonus: 10,
    crownShield: false,
  },
  royal_aegis: {
    slot: 'royal_aegis',
    islandId: 9,
    metalId: 'asgard_uru',
    name: 'Manto Real de Uru',
    bonusDesc: '+28% dano + Escudo da Coroa',
    oreCost: 7,
    woodCost: 8,
    stoneCost: 8,
    coinCost: 12,
    speedBonusPct: 10,
    damageBonusPct: 28,
    cooldownReducePct: 12,
    pouchBonus: 10,
    crownShield: true,
  },
};

const WEAPON_BY_ISLAND: WeaponId[] = [
  'freya_bow',
  'tyr_shield',
  'thor_hammer',
  'odin_gungnir',
  'loki_staff',
  'ymir_rune',
  'surtr_blade',
  'heimdall_horn',
  'baldr_scepter',
];

const METAL_BY_ISLAND: PreciousMetalId[] = [
  'copper',
  'bronze',
  'silver',
  'frost_steel',
  'mithril',
  'dwarf_gold',
  'obsidian',
  'jotun_iron',
  'asgard_uru',
];

const ARMOR_BY_ISLAND: ArmorSlot[] = [
  'gloves',
  'boots',
  'cloak',
  'helmet',
  'chestplate',
  'pauldrons',
  'greaves',
  'belt',
  'royal_aegis',
];

export function getIslandWeaponId(islandId: number): WeaponId {
  return WEAPON_BY_ISLAND[Math.max(0, Math.min(WEAPON_BY_ISLAND.length - 1, islandId - 1))];
}

export function getIslandMetalId(islandId: number): PreciousMetalId {
  return METAL_BY_ISLAND[Math.max(0, Math.min(METAL_BY_ISLAND.length - 1, islandId - 1))];
}

export function getIslandArmorSlot(islandId: number): ArmorSlot {
  return ARMOR_BY_ISLAND[Math.max(0, Math.min(ARMOR_BY_ISLAND.length - 1, islandId - 1))];
}

export interface ComputedArmorBonuses {
  pieceCount: number;
  speedMult: number;
  damageMult: number;
  cooldownMult: number;
  pouchBonus: number;
  hasCrownShield: boolean;
}

export function computeArmorBonuses(
  armor: Partial<Record<ArmorSlot, PreciousMetalId>> | undefined
): ComputedArmorBonuses {
  if (!armor) {
    return {
      pieceCount: 0,
      speedMult: 1,
      damageMult: 1,
      cooldownMult: 1,
      pouchBonus: 0,
      hasCrownShield: false,
    };
  }
  let pieceCount = 0;
  let speedPct = 0;
  let dmgPct = 0;
  let cdPct = 0;
  let pouchBonus = 0;
  let hasCrownShield = false;

  for (const key of Object.keys(armor) as ArmorSlot[]) {
    if (!armor[key]) continue;
    const def = ARMOR_DEFS[key];
    if (!def) continue;
    pieceCount += 1;
    speedPct += def.speedBonusPct;
    dmgPct += def.damageBonusPct;
    cdPct += def.cooldownReducePct;
    pouchBonus += def.pouchBonus;
    if (def.crownShield) hasCrownShield = true;
  }

  return {
    pieceCount,
    speedMult: 1 + speedPct / 100,
    damageMult: 1 + dmgPct / 100,
    cooldownMult: Math.max(0.45, 1 - cdPct / 100),
    pouchBonus,
    hasCrownShield,
  };
}
