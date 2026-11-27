import type { GodId, MountId } from '../types';

export interface IslandDefinition {
  id: number; // 1..9 (Island 1 -> max Kingdom Lv2; each next island +1 level up to Lv10)
  name: { pt: string; en: string; es: string };
  subtitle: { pt: string; en: string; es: string };
  mapX: number; // Normalized 0..1 position on the World Map sea chart
  mapY: number; // Normalized 0..1
  godId: GodId | null;
  mountId: MountId | null;
  maxDiamonds: number; // Strictly <= 5 per island
  puzzleName: { pt: string; en: string; es: string } | null;
  skyTint: string;
  difficultyBase: number;
}

export const ISLAND_DEFINITIONS: IslandDefinition[] = [
  {
    id: 1,
    name: { pt: 'Ilha I — Costa de Midgard', en: 'Island I — Midgard Coast', es: 'Isla I — Costa de Midgard' },
    subtitle: { pt: 'Reino até Nv.2 · Construa o Drakkar e zarpe', en: 'Kingdom up to Lv.2 · Build the Drakkar', es: 'Reino hasta Nv.2 · Construye el Drakkar' },
    mapX: 0.08,
    mapY: 0.64,
    godId: null,
    mountId: null,
    maxDiamonds: 0,
    puzzleName: null,
    skyTint: '#5a82a6',
    difficultyBase: 1,
  },
  {
    id: 2,
    name: { pt: 'Ilha II — Vale de Freya', en: "Island II — Freya's Vale", es: 'Isla II — Valle de Freya' },
    subtitle: { pt: 'Forja de Ferro · Freya & Harpia · Nv.3', en: 'Iron Forge · Freya & Harpy · Lv.3', es: 'Forja de Hierro · Freya y Arpía · Nv.3' },
    mapX: 0.19,
    mapY: 0.38,
    godId: 'freya',
    mountId: 'harpy',
    maxDiamonds: 5,
    puzzleName: { pt: 'Círculo da Colheita', en: 'Harvest Rune Circle', es: 'Círculo de la Cosecha' },
    skyTint: '#5b9485',
    difficultyBase: 2,
  },
  {
    id: 3,
    name: { pt: 'Ilha III — Picos do Trovão', en: 'Island III — Thunder Peaks', es: 'Isla III — Picos del Trueno' },
    subtitle: { pt: 'Thor (libera Espadas!) & Lobo · Nv.4', en: 'Thor (unlocks Swords!) & Wolf · Lv.4', es: 'Thor (¡desbloquea Espadas!) y Lobo · Nv.4' },
    mapX: 0.30,
    mapY: 0.66,
    godId: 'thor',
    mountId: 'wolf',
    maxDiamonds: 5,
    puzzleName: { pt: 'Bigorna do Trovão', en: 'Thunder Anvil', es: 'Yunque del Trueno' },
    skyTint: '#4f5a75',
    difficultyBase: 3,
  },
  {
    id: 4,
    name: { pt: 'Ilha IV — Fiorde Glacial', en: 'Island IV — Glacial Fjord', es: 'Isla IV — Fiordo Glacial' },
    subtitle: { pt: 'Gelo eterno · Odin & Cavalo de Gelo · Nv.5', en: 'Eternal frost · Odin & Frost Steed · Lv.5', es: 'Hielo eterno · Odín y Corcel de Hielo · Nv.5' },
    mapX: 0.41,
    mapY: 0.34,
    godId: 'odin',
    mountId: 'ice_horse',
    maxDiamonds: 5,
    puzzleName: { pt: 'Monólitos Congelados', en: 'Frozen Monoliths', es: 'Monolitos Helados' },
    skyTint: '#6fa8cc',
    difficultyBase: 4,
  },
  {
    id: 5,
    name: { pt: 'Ilha V — Bosque de Fenrir', en: "Island V — Fenrir's Woods", es: 'Isla V — Bosque de Fenrir' },
    subtitle: { pt: 'Florestas densas · Loki & Urso · Nv.6', en: 'Dense woods · Loki & Armored Bear · Lv.6', es: 'Bosques densos · Loki y Oso · Nv.6' },
    mapX: 0.52,
    mapY: 0.64,
    godId: 'loki',
    mountId: 'bear',
    maxDiamonds: 5,
    puzzleName: { pt: 'Estátuas dos Lobos', en: 'Wolf Statues', es: 'Estatuas de los Lobos' },
    skyTint: '#466b78',
    difficultyBase: 5,
  },
  {
    id: 6,
    name: { pt: 'Ilha VI — Forjas de Nidavellir', en: 'Island VI — Nidavellir Forges', es: 'Isla VI — Forjas de Nidavellir' },
    subtitle: { pt: 'Salões dos anões · Cavalo de Fogo · Nv.7', en: 'Dwarven halls · Fire Steed · Lv.7', es: 'Salas enanas · Corcel de Fuego · Nv.7' },
    mapX: 0.63,
    mapY: 0.36,
    godId: null,
    mountId: 'fire_horse',
    maxDiamonds: 5,
    puzzleName: { pt: 'Fornalha Rúnica', en: 'Runic Furnace', es: 'Horno Rúnico' },
    skyTint: '#7a5844',
    difficultyBase: 6,
  },
  {
    id: 7,
    name: { pt: 'Ilha VII — Terras de Muspel', en: 'Island VII — Muspelheim', es: 'Isla VII — Tierras de Muspel' },
    subtitle: { pt: 'Cinzas ardentes · Maestria de Guerra · Nv.8', en: 'Burning ash · War Mastery · Lv.8', es: 'Cenizas ardientes · Maestría Bélica · Nv.8' },
    mapX: 0.74,
    mapY: 0.64,
    godId: null,
    mountId: null,
    maxDiamonds: 5,
    puzzleName: { pt: 'Tochas de Surtr', en: 'Torches of Surtr', es: 'Antorchas de Surtr' },
    skyTint: '#8a4a3a',
    difficultyBase: 7,
  },
  {
    id: 8,
    name: { pt: 'Ilha VIII — Abismo de Jotunheim', en: 'Island VIII — Jotunheim Abyss', es: 'Isla VIII — Abismo de Jotunheim' },
    subtitle: { pt: 'Terra dos gigantes de gelo · Nv.9', en: 'Land of frost giants · Lv.9', es: 'Tierra de gigantes de hielo · Nv.9' },
    mapX: 0.84,
    mapY: 0.38,
    godId: null,
    mountId: null,
    maxDiamonds: 5,
    puzzleName: { pt: 'Trono de Ymir', en: 'Throne of Ymir', es: 'Trono de Ymir' },
    skyTint: '#445d78',
    difficultyBase: 8,
  },
  {
    id: 9,
    name: { pt: 'Ilha IX — Portões de Asgard', en: 'Island IX — Gates of Asgard', es: 'Isla IX — Puertas de Asgard' },
    subtitle: { pt: 'Reino final Nv.10 · Sleipnir (8 Patas)', en: 'Final realm Lv.10 · Sleipnir (8 Legs)', es: 'Reino final Nv.10 · Sleipnir (8 Patas)' },
    mapX: 0.93,
    mapY: 0.56,
    godId: null,
    mountId: 'sleipnir',
    maxDiamonds: 5,
    puzzleName: { pt: 'Ponte Bifrost', en: 'Bifrost Bridge', es: 'Puente Bifrost' },
    skyTint: '#61548a',
    difficultyBase: 9,
  },
];

export function getIslandDef(id: number): IslandDefinition {
  return ISLAND_DEFINITIONS.find((isl) => isl.id === id) ?? ISLAND_DEFINITIONS[0];
}
