import type { GodId, MountId } from '../types';

export interface GodDefinition {
  id: GodId;
  name: string;
  title: { pt: string; en: string; es: string };
  buffDesc: { pt: string; en: string; es: string };
  diamondCost: number; // Strictly 3 diamonds per God
  coinCost: number;    // Activation coins
  tributeCount: number; // Subjects required to march in queue & ascend as divine tribute
  color: string;
}

export interface MountDefinition {
  id: MountId;
  name: { pt: string; en: string; es: string };
  powerDesc: { pt: string; en: string; es: string };
  diamondCost: number;
  coinCost: number;
  trotSpeed: number;
  sprintSpeed: number;
  staminaDrain: number;
  powerCooldown: number;
  accentColor: string;
}

export const GOD_DEFS: Record<GodId, GodDefinition> = {
  freya: {
    id: 'freya',
    name: 'Freya',
    title: { pt: 'Deusa dos Fazendeiros', en: 'Goddess of Farmers', es: 'Diosa de Granjeros' },
    buffDesc: { pt: 'Fazendas +50% ouro/dia', en: 'Farms +50% daily gold', es: 'Granjas +50% oro/día' },
    diamondCost: 3,
    coinCost: 6,
    tributeCount: 2,
    color: '#7be088',
  },
  loki: {
    id: 'loki',
    name: 'Loki',
    title: { pt: 'Deus dos Cavalos', en: 'God of Mounts', es: 'Dios de Monturas' },
    buffDesc: { pt: '+25% velocidade e recarga', en: '+25% speed & cooldown', es: '+25% velocidad y recarga' },
    diamondCost: 3,
    coinCost: 6,
    tributeCount: 2,
    color: '#5be0c2',
  },
  odin: {
    id: 'odin',
    name: 'Odin',
    title: { pt: 'Deus dos Pedreiros', en: 'God of Builders', es: 'Dios de Constructores' },
    buffDesc: { pt: 'Muros +40% HP · obras +50%', en: 'Walls +40% HP · build +50%', es: 'Muros +40% HP · obra +50%' },
    diamondCost: 3,
    coinCost: 8,
    tributeCount: 3,
    color: '#82bfff',
  },
  thor: {
    id: 'thor',
    name: 'Thor',
    title: { pt: 'Deus dos Guerreiros', en: 'God of Warriors', es: 'Dios de Guerreros' },
    buffDesc: { pt: 'Guerreiros +50% dano/HP', en: 'Warriors +50% dmg/HP', es: 'Guerreros +50% daño/HP' },
    diamondCost: 3,
    coinCost: 8,
    tributeCount: 3,
    color: '#ffd15c',
  },
};

export const MOUNT_DEFS: Record<MountId, MountDefinition> = {
  starter: {
    id: 'starter',
    name: { pt: 'Cavalo Comum', en: 'Common Steed', es: 'Caballo Común' },
    powerDesc: { pt: 'Sem poder especial', en: 'No special power', es: 'Sin poder especial' },
    diamondCost: 0,
    coinCost: 0,
    trotSpeed: 74,
    sprintSpeed: 112,
    staminaDrain: 0.34,
    powerCooldown: 0,
    accentColor: '#c4b196',
  },
  harpy: {
    id: 'harpy',
    name: { pt: 'Harpia', en: 'Harpy', es: 'Arpía' },
    powerDesc: { pt: 'Voa sobre inimigos (1x/carga)', en: 'Flies over enemies (1x/charge)', es: 'Vuela sobre enemigos (1x)' },
    diamondCost: 2,
    coinCost: 6,
    trotSpeed: 84,
    sprintSpeed: 124,
    staminaDrain: 0.28,
    powerCooldown: 8,
    accentColor: '#d4a6ff',
  },
  wolf: {
    id: 'wolf',
    name: { pt: 'Lobo Gigante', en: 'Giant Wolf', es: 'Lobo Gigante' },
    powerDesc: { pt: 'Corre rápido e morde inimigos', en: 'Fast sprint biting enemies', es: 'Corre rápido y muerde enemigos' },
    diamondCost: 2,
    coinCost: 8,
    trotSpeed: 92,
    sprintSpeed: 146,
    staminaDrain: 0.3,
    powerCooldown: 2,
    accentColor: '#98b4cc',
  },
  ice_horse: {
    id: 'ice_horse',
    name: { pt: 'Cavalo de Gelo', en: 'Frost Steed', es: 'Corcel de Hielo' },
    powerDesc: { pt: 'Onda congela inimigos por 10s', en: 'Frost wave freezes for 10s', es: 'Ola congela enemigos 10s' },
    diamondCost: 3,
    coinCost: 10,
    trotSpeed: 86,
    sprintSpeed: 132,
    staminaDrain: 0.26,
    powerCooldown: 11,
    accentColor: '#7ef2ff',
  },
  bear: {
    id: 'bear',
    name: { pt: 'Urso Blindado', en: 'Armored Bear', es: 'Oso Blindado' },
    powerDesc: { pt: 'Patada mata 1 + grito afasta', en: 'Swipe kills 1 + roar pushes', es: 'Zarpazo mata 1 + rugido empuja' },
    diamondCost: 3,
    coinCost: 12,
    trotSpeed: 62,
    sprintSpeed: 90,
    staminaDrain: 0.22,
    powerCooldown: 6,
    accentColor: '#c9935b',
  },
  fire_horse: {
    id: 'fire_horse',
    name: { pt: 'Cavalo de Fogo', en: 'Fire Steed', es: 'Corcel de Fuego' },
    powerDesc: { pt: 'Solta fogo no chão ao correr', en: 'Leaves burning fire trail', es: 'Deja fuego al correr' },
    diamondCost: 3,
    coinCost: 12,
    trotSpeed: 90,
    sprintSpeed: 138,
    staminaDrain: 0.26,
    powerCooldown: 0.35,
    accentColor: '#ff7d38',
  },
  sleipnir: {
    id: 'sleipnir',
    name: { pt: 'Sleipnir (8 Patas)', en: 'Sleipnir (8 Legs)', es: 'Sleipnir (8 Patas)' },
    powerDesc: { pt: 'Mais veloz + raios em aéreos', en: 'Fastest + lightning on flyers', es: 'Más veloz + rayos a aéreos' },
    diamondCost: 4,
    coinCost: 16,
    trotSpeed: 106,
    sprintSpeed: 164,
    staminaDrain: 0.2,
    powerCooldown: 4.5,
    accentColor: '#ffe58a',
  },
};
