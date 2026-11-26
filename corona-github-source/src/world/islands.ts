import type { GodId, MountId } from '../types';

export interface IslandDefinition {
  id: number; // 1..7
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
    subtitle: { pt: 'Construa o Drakkar e zarpe ao norte', en: 'Build the Drakkar and sail north', es: 'Construye el Drakkar y zarpa al norte' },
    mapX: 0.12,
    mapY: 0.62,
    godId: null,
    mountId: null,
    maxDiamonds: 0, // Island 1 only has the Drakkar boat to build
    puzzleName: null,
    skyTint: '#5a82a6',
    difficultyBase: 1,
  },
  {
    id: 2,
    name: { pt: 'Ilha II — Vale de Freya', en: "Island II — Freya's Vale", es: 'Isla II — Valle de Freya' },
    subtitle: { pt: 'Campos férteis · Freya & Harpia', en: 'Fertile fields · Freya & Harpy', es: 'Campos fértiles · Freya y Arpía' },
    mapX: 0.25,
    mapY: 0.42,
    godId: 'freya',
    mountId: 'harpy',
    maxDiamonds: 5,
    puzzleName: { pt: 'Círculo da Colheita', en: 'Harvest Rune Circle', es: 'Círculo de la Cosecha' },
    skyTint: '#5b9485',
    difficultyBase: 2,
  },
  {
    id: 3,
    name: { pt: 'Ilha III — Bosque de Fenrir', en: "Island III — Fenrir's Woods", es: 'Isla III — Bosque de Fenrir' },
    subtitle: { pt: 'Florestas densas · Loki & Lobo', en: 'Dense woods · Loki & Giant Wolf', es: 'Bosques densos · Loki y Lobo' },
    mapX: 0.39,
    mapY: 0.64,
    godId: 'loki',
    mountId: 'wolf',
    maxDiamonds: 5,
    puzzleName: { pt: 'Estátuas dos Lobos', en: 'Wolf Statues', es: 'Estatuas de los Lobos' },
    skyTint: '#466b78',
    difficultyBase: 3,
  },
  {
    id: 4,
    name: { pt: 'Ilha IV — Fiorde Glacial', en: 'Island IV — Glacial Fjord', es: 'Isla IV — Fiordo Glacial' },
    subtitle: { pt: 'Gelo eterno · Odin & Cavalo de Gelo', en: 'Eternal frost · Odin & Frost Steed', es: 'Hielo eterno · Odín y Corcel de Hielo' },
    mapX: 0.52,
    mapY: 0.36,
    godId: 'odin',
    mountId: 'ice_horse',
    maxDiamonds: 5,
    puzzleName: { pt: 'Monólitos Congelados', en: 'Frozen Monoliths', es: 'Monolitos Helados' },
    skyTint: '#6fa8cc',
    difficultyBase: 4,
  },
  {
    id: 5,
    name: { pt: 'Ilha V — Picos do Trovão', en: 'Island V — Thunder Peaks', es: 'Isla V — Picos del Trueno' },
    subtitle: { pt: 'Montanhas de ferro · Thor & Urso', en: 'Iron peaks · Thor & Armored Bear', es: 'Picos de hierro · Thor y Oso' },
    mapX: 0.66,
    mapY: 0.60,
    godId: 'thor',
    mountId: 'bear',
    maxDiamonds: 5,
    puzzleName: { pt: 'Bigorna do Trovão', en: 'Thunder Anvil', es: 'Yunque del Trueno' },
    skyTint: '#4f5a75',
    difficultyBase: 5,
  },
  {
    id: 6,
    name: { pt: 'Ilha VI — Terras de Muspel', en: 'Island VI — Muspelheim', es: 'Isla VI — Tierras de Muspel' },
    subtitle: { pt: 'Cinzas ardentes · Cavalo de Fogo', en: 'Burning ash · Fire Steed', es: 'Cenizas ardientes · Corcel de Fuego' },
    mapX: 0.79,
    mapY: 0.38,
    godId: null,
    mountId: 'fire_horse',
    maxDiamonds: 5,
    puzzleName: { pt: 'Tochas de Surtr', en: 'Torches of Surtr', es: 'Antorchas de Surtr' },
    skyTint: '#8a4a3a',
    difficultyBase: 6,
  },
  {
    id: 7,
    name: { pt: 'Ilha VII — Portões de Asgard', en: 'Island VII — Gates of Asgard', es: 'Isla VII — Puertas de Asgard' },
    subtitle: { pt: 'Reino final · Sleipnir (8 Patas)', en: 'Final realm · Sleipnir (8 Legs)', es: 'Reino final · Sleipnir (8 Patas)' },
    mapX: 0.90,
    mapY: 0.54,
    godId: null,
    mountId: 'sleipnir',
    maxDiamonds: 5,
    puzzleName: { pt: 'Ponte Bifrost', en: 'Bifrost Bridge', es: 'Puente Bifrost' },
    skyTint: '#61548a',
    difficultyBase: 7,
  },
];

export function getIslandDef(id: number): IslandDefinition {
  return ISLAND_DEFINITIONS.find((isl) => isl.id === id) ?? ISLAND_DEFINITIONS[0];
}
