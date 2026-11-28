import type { GodId, MountId } from '../types';

export interface RGBTuple {
  r: number;
  g: number;
  b: number;
}

export type MountainStyle =
  | 'fjord_peaks'
  | 'emerald_valleys'
  | 'jagged_thunder'
  | 'glacier_spires'
  | 'misty_archipelago'
  | 'dwarven_crags'
  | 'volcanic_calderas'
  | 'titan_canyon'
  | 'asgard_spires';

export type MonumentGodStyle =
  | 'midgard_runestone'
  | 'freya'
  | 'thor'
  | 'odin'
  | 'loki'
  | 'nidavellir_smith'
  | 'surtr'
  | 'ymir'
  | 'asgard_heimdall';

export type VegetationStyle =
  | 'nordic_pine'
  | 'lush_vale'
  | 'storm_pine'
  | 'frost_spruce'
  | 'mist_cypress'
  | 'amber_cedar'
  | 'ash_deadwood'
  | 'glacial_pine'
  | 'golden_yggdrasil';

export type RainbowStyle = 'none' | 'single' | 'double' | 'bifrost';

export interface IslandTheme {
  skyDayTop: RGBTuple;
  skyDayBot: RGBTuple;
  skyDuskTop: RGBTuple;
  skyDuskBot: RGBTuple;
  skyNightTop: RGBTuple;
  skyNightBot: RGBTuple;
  auroraPrimary: RGBTuple;
  auroraSecondary: RGBTuple;
  mountainStyle: MountainStyle;
  farMountainDay: RGBTuple;
  farMountainNight: RGBTuple;
  mountainCapDay: RGBTuple;
  mountainCapNight: RGBTuple;
  midRidgeDay: RGBTuple;
  midRidgeNight: RGBTuple;
  forestFarDay: RGBTuple;
  vegetationStyle: VegetationStyle;
  treeDarkDay: RGBTuple;
  treeMidDay: RGBTuple;
  grassDay: RGBTuple;
  grassAccentDay: RGBTuple;
  soilDay: RGBTuple;
  beachSandDay: RGBTuple;
  cliffRockDay: RGBTuple;
  waterTintDay: RGBTuple;
  mistColor: RGBTuple;
  hasRainbow: RainbowStyle;
  hasDistantIslands: boolean;
  hasWaterfalls: boolean;
  hasVolcanoGlow: boolean;
  monumentGod: MonumentGodStyle;
  monumentName: string;
}

export interface IslandDefinition {
  id: number; // 1..9 (Island 1 -> max Kingdom Lv2; each next island +1 level up to Lv10)
  name: { pt: string; en: string; es: string };
  subtitle: { pt: string; en: string; es: string };
  mapX: number; // Normalized 0..1 position on the World Map sea chart
  mapY: number; // Normalized 0..1
  worldWidth: number; // Progressively larger islands: 2800 -> 7600
  portalCount: number; // Progressively more enemy portals: 2 -> 8
  godId: GodId | null;
  mountId: MountId | null;
  maxDiamonds: number; // Strictly <= 5 per island
  puzzleName: { pt: string; en: string; es: string } | null;
  skyTint: string;
  difficultyBase: number;
  theme: IslandTheme;
}

export const ISLAND_DEFINITIONS: IslandDefinition[] = [
  {
    id: 1,
    name: { pt: 'Ilha I — Costa de Midgard', en: 'Island I — Midgard Coast', es: 'Isla I — Costa de Midgard' },
    subtitle: { pt: 'Ilha Básica · Aprenda os comandos, construa o Drakkar e zarpe', en: 'Starter Island · Learn basics, build the Drakkar & sail', es: 'Isla Básica · Aprende comandos, construye el Drakkar y zarpa' },
    mapX: 0.08,
    mapY: 0.64,
    worldWidth: 2800,
    portalCount: 2,
    godId: null,
    mountId: null,
    maxDiamonds: 0,
    puzzleName: null,
    skyTint: '#5a82a6',
    difficultyBase: 1,
    theme: {
      skyDayTop: { r: 62, g: 102, b: 144 },
      skyDayBot: { r: 162, g: 196, b: 222 },
      skyDuskTop: { r: 44, g: 46, b: 84 },
      skyDuskBot: { r: 196, g: 112, b: 86 },
      skyNightTop: { r: 7, g: 13, b: 27 },
      skyNightBot: { r: 18, g: 38, b: 64 },
      auroraPrimary: { r: 74, g: 232, b: 188 },
      auroraSecondary: { r: 76, g: 184, b: 245 },
      mountainStyle: 'fjord_peaks',
      farMountainDay: { r: 78, g: 102, b: 128 },
      farMountainNight: { r: 16, g: 28, b: 44 },
      mountainCapDay: { r: 215, g: 229, b: 240 },
      mountainCapNight: { r: 64, g: 88, b: 112 },
      midRidgeDay: { r: 44, g: 64, b: 82 },
      midRidgeNight: { r: 12, g: 22, b: 34 },
      forestFarDay: { r: 28, g: 46, b: 56 },
      vegetationStyle: 'nordic_pine',
      treeDarkDay: { r: 28, g: 66, b: 46 },
      treeMidDay: { r: 44, g: 94, b: 58 },
      grassDay: { r: 88, g: 130, b: 78 },
      grassAccentDay: { r: 114, g: 158, b: 92 },
      soilDay: { r: 54, g: 45, b: 42 },
      beachSandDay: { r: 204, g: 184, b: 134 },
      cliffRockDay: { r: 82, g: 92, b: 106 },
      waterTintDay: { r: 26, g: 56, b: 84 },
      mistColor: { r: 170, g: 204, b: 224 },
      hasRainbow: 'none',
      hasDistantIslands: true,
      hasWaterfalls: false,
      hasVolcanoGlow: false,
      monumentGod: 'midgard_runestone',
      monumentName: 'Pedra dos Primeiros Reis',
    },
  },
  {
    id: 2,
    name: { pt: 'Ilha II — Vale de Freya', en: "Island II — Freya's Vale", es: 'Isla II — Valle de Freya' },
    subtitle: { pt: 'Forja de Ferro · Freya & Harpia · Nv.3', en: 'Iron Forge · Freya & Harpy · Lv.3', es: 'Forja de Hierro · Freya y Arpía · Nv.3' },
    mapX: 0.19,
    mapY: 0.38,
    worldWidth: 3400,
    portalCount: 3,
    godId: 'freya',
    mountId: 'harpy',
    maxDiamonds: 5,
    puzzleName: { pt: 'Círculo da Colheita', en: 'Harvest Rune Circle', es: 'Círculo de la Cosecha' },
    skyTint: '#5b9485',
    difficultyBase: 2,
    theme: {
      skyDayTop: { r: 66, g: 132, b: 146 },
      skyDayBot: { r: 194, g: 232, b: 208 },
      skyDuskTop: { r: 68, g: 52, b: 92 },
      skyDuskBot: { r: 232, g: 146, b: 116 },
      skyNightTop: { r: 10, g: 22, b: 34 },
      skyNightBot: { r: 22, g: 58, b: 68 },
      auroraPrimary: { r: 120, g: 248, b: 172 },
      auroraSecondary: { r: 246, g: 162, b: 214 },
      mountainStyle: 'emerald_valleys',
      farMountainDay: { r: 74, g: 122, b: 112 },
      farMountainNight: { r: 18, g: 36, b: 42 },
      mountainCapDay: { r: 214, g: 240, b: 224 },
      mountainCapNight: { r: 68, g: 102, b: 106 },
      midRidgeDay: { r: 46, g: 92, b: 74 },
      midRidgeNight: { r: 14, g: 32, b: 32 },
      forestFarDay: { r: 30, g: 68, b: 50 },
      vegetationStyle: 'lush_vale',
      treeDarkDay: { r: 34, g: 92, b: 54 },
      treeMidDay: { r: 68, g: 136, b: 68 },
      grassDay: { r: 94, g: 158, b: 82 },
      grassAccentDay: { r: 154, g: 204, b: 108 },
      soilDay: { r: 64, g: 52, b: 40 },
      beachSandDay: { r: 222, g: 204, b: 150 },
      cliffRockDay: { r: 82, g: 102, b: 94 },
      waterTintDay: { r: 30, g: 78, b: 88 },
      mistColor: { r: 188, g: 236, b: 212 },
      hasRainbow: 'single',
      hasDistantIslands: true,
      hasWaterfalls: true,
      hasVolcanoGlow: false,
      monumentGod: 'freya',
      monumentName: 'Colosso de Freya',
    },
  },
  {
    id: 3,
    name: { pt: 'Ilha III — Picos do Trovão', en: 'Island III — Thunder Peaks', es: 'Isla III — Picos del Trueno' },
    subtitle: { pt: 'Thor (libera Espadas!) & Lobo · Nv.4', en: 'Thor (unlocks Swords!) & Wolf · Lv.4', es: 'Thor (¡desbloquea Espadas!) y Lobo · Nv.4' },
    mapX: 0.30,
    mapY: 0.66,
    worldWidth: 4000,
    portalCount: 4,
    godId: 'thor',
    mountId: 'wolf',
    maxDiamonds: 5,
    puzzleName: { pt: 'Bigorna do Trovão', en: 'Thunder Anvil', es: 'Yunque del Trueno' },
    skyTint: '#4f5a75',
    difficultyBase: 3,
    theme: {
      skyDayTop: { r: 54, g: 66, b: 104 },
      skyDayBot: { r: 142, g: 156, b: 188 },
      skyDuskTop: { r: 40, g: 34, b: 74 },
      skyDuskBot: { r: 178, g: 118, b: 124 },
      skyNightTop: { r: 8, g: 10, b: 26 },
      skyNightBot: { r: 26, g: 34, b: 68 },
      auroraPrimary: { r: 112, g: 196, b: 255 },
      auroraSecondary: { r: 255, g: 218, b: 110 },
      mountainStyle: 'jagged_thunder',
      farMountainDay: { r: 66, g: 74, b: 104 },
      farMountainNight: { r: 18, g: 22, b: 42 },
      mountainCapDay: { r: 198, g: 210, b: 234 },
      mountainCapNight: { r: 74, g: 88, b: 124 },
      midRidgeDay: { r: 44, g: 52, b: 76 },
      midRidgeNight: { r: 14, g: 18, b: 34 },
      forestFarDay: { r: 28, g: 38, b: 54 },
      vegetationStyle: 'storm_pine',
      treeDarkDay: { r: 26, g: 52, b: 58 },
      treeMidDay: { r: 42, g: 78, b: 82 },
      grassDay: { r: 78, g: 106, b: 86 },
      grassAccentDay: { r: 114, g: 140, b: 118 },
      soilDay: { r: 48, g: 46, b: 54 },
      beachSandDay: { r: 162, g: 156, b: 146 },
      cliffRockDay: { r: 70, g: 76, b: 96 },
      waterTintDay: { r: 24, g: 38, b: 68 },
      mistColor: { r: 162, g: 180, b: 216 },
      hasRainbow: 'none',
      hasDistantIslands: false,
      hasWaterfalls: true,
      hasVolcanoGlow: false,
      monumentGod: 'thor',
      monumentName: 'Colosso de Thor',
    },
  },
  {
    id: 4,
    name: { pt: 'Ilha IV — Fiorde Glacial', en: 'Island IV — Glacial Fjord', es: 'Isla IV — Fiordo Glacial' },
    subtitle: { pt: 'Gelo eterno · Odin & Cavalo de Gelo · Nv.5', en: 'Eternal frost · Odin & Frost Steed · Lv.5', es: 'Hielo eterno · Odín y Corcel de Hielo · Nv.5' },
    mapX: 0.41,
    mapY: 0.34,
    worldWidth: 4600,
    portalCount: 4,
    godId: 'odin',
    mountId: 'ice_horse',
    maxDiamonds: 5,
    puzzleName: { pt: 'Monólitos Congelados', en: 'Frozen Monoliths', es: 'Monolitos Helados' },
    skyTint: '#6fa8cc',
    difficultyBase: 4,
    theme: {
      skyDayTop: { r: 76, g: 136, b: 186 },
      skyDayBot: { r: 204, g: 234, b: 248 },
      skyDuskTop: { r: 38, g: 64, b: 112 },
      skyDuskBot: { r: 174, g: 196, b: 232 },
      skyNightTop: { r: 6, g: 18, b: 36 },
      skyNightBot: { r: 22, g: 56, b: 88 },
      auroraPrimary: { r: 96, g: 244, b: 255 },
      auroraSecondary: { r: 142, g: 172, b: 255 },
      mountainStyle: 'glacier_spires',
      farMountainDay: { r: 116, g: 158, b: 192 },
      farMountainNight: { r: 24, g: 48, b: 74 },
      mountainCapDay: { r: 236, g: 248, b: 255 },
      mountainCapNight: { r: 96, g: 142, b: 176 },
      midRidgeDay: { r: 76, g: 114, b: 142 },
      midRidgeNight: { r: 18, g: 36, b: 56 },
      forestFarDay: { r: 38, g: 68, b: 84 },
      vegetationStyle: 'frost_spruce',
      treeDarkDay: { r: 32, g: 68, b: 78 },
      treeMidDay: { r: 58, g: 102, b: 114 },
      grassDay: { r: 154, g: 190, b: 204 },
      grassAccentDay: { r: 214, g: 238, b: 248 },
      soilDay: { r: 62, g: 76, b: 92 },
      beachSandDay: { r: 188, g: 214, b: 228 },
      cliffRockDay: { r: 106, g: 142, b: 168 },
      waterTintDay: { r: 32, g: 74, b: 108 },
      mistColor: { r: 204, g: 236, b: 252 },
      hasRainbow: 'none',
      hasDistantIslands: true,
      hasWaterfalls: false,
      hasVolcanoGlow: false,
      monumentGod: 'odin',
      monumentName: 'Colosso de Odin',
    },
  },
  {
    id: 5,
    name: { pt: 'Ilha V — Bosque de Fenrir', en: "Island V — Fenrir's Woods", es: 'Isla V — Bosque de Fenrir' },
    subtitle: { pt: 'Florestas densas · Loki & Urso · Nv.6', en: 'Dense woods · Loki & Armored Bear · Lv.6', es: 'Bosques densos · Loki y Oso · Nv.6' },
    mapX: 0.52,
    mapY: 0.64,
    worldWidth: 5200,
    portalCount: 5,
    godId: 'loki',
    mountId: 'bear',
    maxDiamonds: 5,
    puzzleName: { pt: 'Estátuas dos Lobos', en: 'Wolf Statues', es: 'Estatuas de los Lobos' },
    skyTint: '#466b78',
    difficultyBase: 5,
    theme: {
      skyDayTop: { r: 44, g: 92, b: 102 },
      skyDayBot: { r: 148, g: 194, b: 184 },
      skyDuskTop: { r: 34, g: 48, b: 64 },
      skyDuskBot: { r: 132, g: 162, b: 142 },
      skyNightTop: { r: 6, g: 18, b: 24 },
      skyNightBot: { r: 16, g: 48, b: 54 },
      auroraPrimary: { r: 72, g: 242, b: 158 },
      auroraSecondary: { r: 174, g: 112, b: 244 },
      mountainStyle: 'misty_archipelago',
      farMountainDay: { r: 58, g: 96, b: 98 },
      farMountainNight: { r: 14, g: 30, b: 36 },
      mountainCapDay: { r: 178, g: 214, b: 206 },
      mountainCapNight: { r: 52, g: 84, b: 88 },
      midRidgeDay: { r: 36, g: 68, b: 66 },
      midRidgeNight: { r: 10, g: 24, b: 28 },
      forestFarDay: { r: 22, g: 48, b: 46 },
      vegetationStyle: 'mist_cypress',
      treeDarkDay: { r: 22, g: 62, b: 56 },
      treeMidDay: { r: 38, g: 96, b: 82 },
      grassDay: { r: 68, g: 118, b: 92 },
      grassAccentDay: { r: 108, g: 168, b: 132 },
      soilDay: { r: 42, g: 48, b: 46 },
      beachSandDay: { r: 158, g: 168, b: 148 },
      cliffRockDay: { r: 62, g: 82, b: 82 },
      waterTintDay: { r: 20, g: 58, b: 64 },
      mistColor: { r: 162, g: 214, b: 202 },
      hasRainbow: 'double',
      hasDistantIslands: true,
      hasWaterfalls: true,
      hasVolcanoGlow: false,
      monumentGod: 'loki',
      monumentName: 'Colosso de Loki',
    },
  },
  {
    id: 6,
    name: { pt: 'Ilha VI — Forjas de Nidavellir', en: 'Island VI — Nidavellir Forges', es: 'Isla VI — Forjas de Nidavellir' },
    subtitle: { pt: 'Salões dos anões · Cavalo de Fogo · Nv.7', en: 'Dwarven halls · Fire Steed · Lv.7', es: 'Salas enanas · Corcel de Fuego · Nv.7' },
    mapX: 0.63,
    mapY: 0.36,
    worldWidth: 5800,
    portalCount: 6,
    godId: null,
    mountId: 'fire_horse',
    maxDiamonds: 5,
    puzzleName: { pt: 'Fornalha Rúnica', en: 'Runic Furnace', es: 'Horno Rúnico' },
    skyTint: '#7a5844',
    difficultyBase: 6,
    theme: {
      skyDayTop: { r: 104, g: 76, b: 68 },
      skyDayBot: { r: 222, g: 174, b: 122 },
      skyDuskTop: { r: 66, g: 36, b: 48 },
      skyDuskBot: { r: 232, g: 124, b: 68 },
      skyNightTop: { r: 18, g: 12, b: 20 },
      skyNightBot: { r: 54, g: 32, b: 36 },
      auroraPrimary: { r: 255, g: 178, b: 78 },
      auroraSecondary: { r: 235, g: 106, b: 72 },
      mountainStyle: 'dwarven_crags',
      farMountainDay: { r: 106, g: 82, b: 72 },
      farMountainNight: { r: 34, g: 24, b: 28 },
      mountainCapDay: { r: 224, g: 186, b: 142 },
      mountainCapNight: { r: 96, g: 64, b: 56 },
      midRidgeDay: { r: 74, g: 56, b: 48 },
      midRidgeNight: { r: 24, g: 18, b: 22 },
      forestFarDay: { r: 56, g: 40, b: 30 },
      vegetationStyle: 'amber_cedar',
      treeDarkDay: { r: 112, g: 62, b: 32 },
      treeMidDay: { r: 168, g: 98, b: 42 },
      grassDay: { r: 142, g: 110, b: 64 },
      grassAccentDay: { r: 196, g: 144, b: 72 },
      soilDay: { r: 62, g: 44, b: 36 },
      beachSandDay: { r: 182, g: 146, b: 108 },
      cliffRockDay: { r: 88, g: 68, b: 58 },
      waterTintDay: { r: 64, g: 46, b: 46 },
      mistColor: { r: 232, g: 184, b: 138 },
      hasRainbow: 'none',
      hasDistantIslands: false,
      hasWaterfalls: false,
      hasVolcanoGlow: true,
      monumentGod: 'nidavellir_smith',
      monumentName: 'Colosso de Brokkr',
    },
  },
  {
    id: 7,
    name: { pt: 'Ilha VII — Terras de Muspel', en: 'Island VII — Muspelheim', es: 'Isla VII — Tierras de Muspel' },
    subtitle: { pt: 'Cinzas ardentes · Maestria de Guerra · Nv.8', en: 'Burning ash · War Mastery · Lv.8', es: 'Cenizas ardientes · Maestría Bélica · Nv.8' },
    mapX: 0.74,
    mapY: 0.64,
    worldWidth: 6400,
    portalCount: 6,
    godId: null,
    mountId: null,
    maxDiamonds: 5,
    puzzleName: { pt: 'Tochas de Surtr', en: 'Torches of Surtr', es: 'Antorchas de Surtr' },
    skyTint: '#8a4a3a',
    difficultyBase: 7,
    theme: {
      skyDayTop: { r: 96, g: 44, b: 46 },
      skyDayBot: { r: 224, g: 122, b: 74 },
      skyDuskTop: { r: 58, g: 20, b: 32 },
      skyDuskBot: { r: 238, g: 88, b: 54 },
      skyNightTop: { r: 20, g: 8, b: 14 },
      skyNightBot: { r: 64, g: 22, b: 26 },
      auroraPrimary: { r: 255, g: 112, b: 64 },
      auroraSecondary: { r: 255, g: 206, b: 84 },
      mountainStyle: 'volcanic_calderas',
      farMountainDay: { r: 84, g: 48, b: 52 },
      farMountainNight: { r: 30, g: 16, b: 22 },
      mountainCapDay: { r: 244, g: 136, b: 74 },
      mountainCapNight: { r: 178, g: 64, b: 38 },
      midRidgeDay: { r: 56, g: 34, b: 38 },
      midRidgeNight: { r: 22, g: 12, b: 16 },
      forestFarDay: { r: 40, g: 26, b: 28 },
      vegetationStyle: 'ash_deadwood',
      treeDarkDay: { r: 86, g: 44, b: 36 },
      treeMidDay: { r: 138, g: 64, b: 42 },
      grassDay: { r: 98, g: 68, b: 56 },
      grassAccentDay: { r: 168, g: 92, b: 58 },
      soilDay: { r: 44, g: 32, b: 32 },
      beachSandDay: { r: 94, g: 76, b: 74 },
      cliffRockDay: { r: 62, g: 44, b: 48 },
      waterTintDay: { r: 62, g: 32, b: 36 },
      mistColor: { r: 236, g: 142, b: 96 },
      hasRainbow: 'none',
      hasDistantIslands: true,
      hasWaterfalls: false,
      hasVolcanoGlow: true,
      monumentGod: 'surtr',
      monumentName: 'Colosso de Surtr',
    },
  },
  {
    id: 8,
    name: { pt: 'Ilha VIII — Abismo de Jotunheim', en: 'Island VIII — Jotunheim Abyss', es: 'Isla VIII — Abismo de Jotunheim' },
    subtitle: { pt: 'Terra dos gigantes de gelo · Nv.9', en: 'Land of frost giants · Lv.9', es: 'Tierra de gigantes de hielo · Nv.9' },
    mapX: 0.84,
    mapY: 0.38,
    worldWidth: 7000,
    portalCount: 7,
    godId: null,
    mountId: null,
    maxDiamonds: 5,
    puzzleName: { pt: 'Trono de Ymir', en: 'Throne of Ymir', es: 'Trono de Ymir' },
    skyTint: '#445d78',
    difficultyBase: 8,
    theme: {
      skyDayTop: { r: 46, g: 72, b: 114 },
      skyDayBot: { r: 148, g: 186, b: 224 },
      skyDuskTop: { r: 30, g: 38, b: 76 },
      skyDuskBot: { r: 128, g: 146, b: 204 },
      skyNightTop: { r: 6, g: 12, b: 28 },
      skyNightBot: { r: 24, g: 42, b: 78 },
      auroraPrimary: { r: 118, g: 214, b: 255 },
      auroraSecondary: { r: 196, g: 136, b: 255 },
      mountainStyle: 'titan_canyon',
      farMountainDay: { r: 72, g: 98, b: 134 },
      farMountainNight: { r: 18, g: 28, b: 50 },
      mountainCapDay: { r: 212, g: 234, b: 250 },
      mountainCapNight: { r: 84, g: 116, b: 152 },
      midRidgeDay: { r: 46, g: 66, b: 96 },
      midRidgeNight: { r: 12, g: 20, b: 36 },
      forestFarDay: { r: 28, g: 44, b: 64 },
      vegetationStyle: 'glacial_pine',
      treeDarkDay: { r: 34, g: 60, b: 84 },
      treeMidDay: { r: 58, g: 94, b: 122 },
      grassDay: { r: 112, g: 146, b: 172 },
      grassAccentDay: { r: 176, g: 212, b: 234 },
      soilDay: { r: 48, g: 56, b: 72 },
      beachSandDay: { r: 152, g: 176, b: 198 },
      cliffRockDay: { r: 76, g: 96, b: 124 },
      waterTintDay: { r: 24, g: 48, b: 82 },
      mistColor: { r: 176, g: 206, b: 238 },
      hasRainbow: 'none',
      hasDistantIslands: true,
      hasWaterfalls: true,
      hasVolcanoGlow: false,
      monumentGod: 'ymir',
      monumentName: 'Colosso de Ymir',
    },
  },
  {
    id: 9,
    name: { pt: 'Ilha IX — Portões de Asgard', en: 'Island IX — Gates of Asgard', es: 'Isla IX — Puertas de Asgard' },
    subtitle: { pt: 'Reino final Nv.10 · Sleipnir (8 Patas)', en: 'Final realm Lv.10 · Sleipnir (8 Legs)', es: 'Reino final Nv.10 · Sleipnir (8 Patas)' },
    mapX: 0.93,
    mapY: 0.56,
    worldWidth: 7600,
    portalCount: 8,
    godId: null,
    mountId: 'sleipnir',
    maxDiamonds: 5,
    puzzleName: { pt: 'Ponte Bifrost', en: 'Bifrost Bridge', es: 'Puente Bifrost' },
    skyTint: '#61548a',
    difficultyBase: 9,
    theme: {
      skyDayTop: { r: 78, g: 68, b: 138 },
      skyDayBot: { r: 244, g: 208, b: 146 },
      skyDuskTop: { r: 58, g: 36, b: 102 },
      skyDuskBot: { r: 248, g: 162, b: 112 },
      skyNightTop: { r: 14, g: 12, b: 38 },
      skyNightBot: { r: 48, g: 38, b: 88 },
      auroraPrimary: { r: 255, g: 224, b: 122 },
      auroraSecondary: { r: 132, g: 232, b: 255 },
      mountainStyle: 'asgard_spires',
      farMountainDay: { r: 108, g: 94, b: 144 },
      farMountainNight: { r: 30, g: 26, b: 56 },
      mountainCapDay: { r: 255, g: 236, b: 174 },
      mountainCapNight: { r: 126, g: 112, b: 166 },
      midRidgeDay: { r: 78, g: 68, b: 108 },
      midRidgeNight: { r: 24, g: 20, b: 44 },
      forestFarDay: { r: 58, g: 64, b: 78 },
      vegetationStyle: 'golden_yggdrasil',
      treeDarkDay: { r: 126, g: 94, b: 44 },
      treeMidDay: { r: 214, g: 168, b: 68 },
      grassDay: { r: 124, g: 152, b: 92 },
      grassAccentDay: { r: 234, g: 206, b: 112 },
      soilDay: { r: 74, g: 62, b: 56 },
      beachSandDay: { r: 242, g: 218, b: 156 },
      cliffRockDay: { r: 116, g: 106, b: 134 },
      waterTintDay: { r: 46, g: 48, b: 88 },
      mistColor: { r: 246, g: 220, b: 172 },
      hasRainbow: 'bifrost',
      hasDistantIslands: true,
      hasWaterfalls: true,
      hasVolcanoGlow: false,
      monumentGod: 'asgard_heimdall',
      monumentName: 'Colosso de Heimdall',
    },
  },
];

export interface IslandMapNode {
  id: number;
  /** Non-sequential landscape normalized coordinates (0..1) */
  mapX: number;
  mapY: number;
  /** Non-sequential portrait normalized coordinates (0..1) */
  portraitX: number;
  portraitY: number;
  /** Intertwined non-sequential sea routes connecting this island */
  connections: number[];
}

export const ISLAND_MAP_GRAPH: Record<number, IslandMapNode> = {
  1: { id: 1, mapX: 0.12, mapY: 0.78, portraitX: 0.20, portraitY: 0.88, connections: [2, 3] },
  2: { id: 2, mapX: 0.38, mapY: 0.84, portraitX: 0.78, portraitY: 0.80, connections: [1, 5, 7] },
  3: { id: 3, mapX: 0.22, mapY: 0.24, portraitX: 0.22, portraitY: 0.62, connections: [1, 4, 5] },
  4: { id: 4, mapX: 0.54, mapY: 0.14, portraitX: 0.84, portraitY: 0.36, connections: [3, 5, 6, 8] },
  5: { id: 5, mapX: 0.46, mapY: 0.48, portraitX: 0.54, portraitY: 0.54, connections: [2, 3, 4, 6, 7] },
  6: { id: 6, mapX: 0.74, mapY: 0.50, portraitX: 0.22, portraitY: 0.34, connections: [4, 5, 7, 8, 9] },
  7: { id: 7, mapX: 0.68, mapY: 0.86, portraitX: 0.58, portraitY: 0.22, connections: [2, 5, 6, 9] },
  8: { id: 8, mapX: 0.86, mapY: 0.18, portraitX: 0.82, portraitY: 0.10, connections: [4, 6, 9] },
  9: { id: 9, mapX: 0.90, mapY: 0.72, portraitX: 0.26, portraitY: 0.10, connections: [6, 7, 8] },
};

export function getIslandMapNode(id: number): IslandMapNode {
  return ISLAND_MAP_GRAPH[id] ?? ISLAND_MAP_GRAPH[1];
}

export function getIslandDef(id: number): IslandDefinition {
  return ISLAND_DEFINITIONS.find((isl) => isl.id === id) ?? ISLAND_DEFINITIONS[0];
}
