import { sound } from '../audio/sound';
import { getLanguage, t } from '../i18n/translations';
import { markTutorialCompleted, saveCampaign } from '../storage/saveSystem';
import {
  BELL_COST,
  BOAT_BUILD_COST,
  BOAT_SAIL_COST,
  CENTER_X,
  DOCK_BUILD_COST,
  GROUND_Y,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_CREW_PER_CLASS,
  MAX_KINGDOM_LEVEL,
  WORLD_WIDTH,
  type ArcherTower,
  type BuilderTaskKind,
  type Coin,
  type CommandMode,
  type Enemy,
  type EnemyKind,
  type FloatingPrompt,
  type FlyingCoin,
  type InputState,
  type Monarch,
  type Particle,
  type PromptTargetType,
  type ResourceCost,
  type ResourceSize,
  type Season,
  type SpiritAdviceTopic,
  type SpiritAdvisorBaseline,
  type SpiritAdvisorState,
  type ToolShopKind,
  type Villager,
  type VillagerRole,
  type Wall,
  type WorldState,
} from '../types';
import { generateIslandSnapshot, heightForTreeSize, sizeFromVariant } from '../world/initWorld';
import { getIslandDef } from '../world/islands';
import { GOD_DEFS, MOUNT_DEFS } from '../world/mountsAndGods';

export const BREWERY_BUILD_COST: ResourceCost = { coins: 15, wood: 10, stone: 10, iron: 0 };
export const BREWERY_BEER_COST = 4;
export const BREWERY_MAX_BEERS = 4;

export interface SeasonModifiers {
  farm: number;
  animal: number;
  tree: number;
  rock: number;
  hasBerries: boolean;
}

export function getSeasonForDay(day: number): Season {
  const seasons: Season[] = ['summer', 'autumn', 'winter', 'spring'];
  const idx = Math.floor((Math.max(1, day) - 1) / 15) % 4;
  return seasons[idx];
}

export function getSeasonLabel(season: Season = 'summer'): string {
  switch (season) {
    case 'summer':
      return 'VERÃO';
    case 'autumn':
      return 'OUTONO';
    case 'winter':
      return 'INVERNO';
    case 'spring':
      return 'PRIMAVERA';
  }
}

export function getSeasonModifiers(season: Season = 'summer'): SeasonModifiers {
  switch (season) {
    case 'summer':
      return { farm: 1.0, animal: 1.55, tree: 1.5, rock: 0.45, hasBerries: false };
    case 'autumn':
      return { farm: 0.45, animal: 1.45, tree: 1.5, rock: 1.0, hasBerries: false };
    case 'winter':
      return { farm: 0, animal: 0.25, tree: 0.4, rock: 0.45, hasBerries: true };
    case 'spring':
      return { farm: 1.55, animal: 1.5, tree: 1.5, rock: 1.0, hasBerries: true };
  }
}

/**
 * Progressive economy tightening starting from Island 2 so each island takes ~30 minutes of strategic play.
 */
export function getIslandCoinDifficultyMult(islandId: number): number {
  if (islandId <= 1) return 1.0;
  return Math.max(0.42, 1.0 - (islandId - 1) * 0.11);
}

export interface RockHarvestSpec {
  stone: number;
  time: number; // seconds for 1 builder
  coins: number;
  sizeKey: 'size_s' | 'size_m' | 'size_l';
}

export interface TreeHarvestSpec {
  wood: number;
  time: number; // seconds for 1 builder
  coins: number;
  sizeKey: 'size_s' | 'size_m' | 'size_l';
}

export function getRockSpec(size: ResourceSize): RockHarvestSpec {
  if (size === 'small') return { stone: 5, time: 30, coins: 2, sizeKey: 'size_s' };
  if (size === 'medium') return { stone: 7, time: 45, coins: 3, sizeKey: 'size_m' };
  return { stone: 15, time: 90, coins: 5, sizeKey: 'size_l' };
}

export function getTreeSpec(size: ResourceSize): TreeHarvestSpec {
  if (size === 'small') return { wood: 4, time: 20, coins: 2, sizeKey: 'size_s' };
  if (size === 'medium') return { wood: 7, time: 35, coins: 3, sizeKey: 'size_m' };
  return { wood: 12, time: 60, coins: 4, sizeKey: 'size_l' };
}

export function getBankerDailyRatePct(hallLevel: number): number {
  if (hallLevel <= 0) return 0;
  return Math.max(1, Math.min(MAX_KINGDOM_LEVEL, hallLevel));
}

export function isConstructionBuffActive(w: WorldState): boolean {
  return w.islandBuffs.some((b) => b.kind === 'construction' && b.active);
}

export function isForgeBuffActive(w: WorldState): boolean {
  return w.islandBuffs.some((b) => b.kind === 'forge' && b.active);
}

export function getIslandMaxKingdomLevel(w: WorldState): number {
  if (w.currentIsland <= 1) return 2;
  let unlockedTiers = 0;
  for (const isl of w.islands) {
    if (isl.id < 2) continue;
    const isCur = isl.id === w.currentIsland;
    const hasCon = isCur ? isConstructionBuffActive(w) : Boolean(isl.constructionBuff);
    const hasFrg = isCur ? isForgeBuffActive(w) : Boolean(isl.forgeBuff);
    if (hasCon && hasFrg) unlockedTiers += 1;
  }
  return Math.min(MAX_KINGDOM_LEVEL, 2 + unlockedTiers);
}

export function isShopUnlocked(w: WorldState, kind: ToolShopKind): boolean {
  if (w.hall.level < 1) return false;
  if (kind === 'hammer' || kind === 'bow') return true;
  if (kind === 'seed') return w.hall.level >= 2;
  if (kind === 'sword') return w.currentIsland >= 3 && w.thorActivated;
  return false;
}

export function isFarmsUnlocked(w: WorldState): boolean {
  return w.hall.level >= 2;
}

export function getFarmMaxFarmers(level: number): number {
  if (level <= 0) return 0;
  return 2 + Math.min(MAX_KINGDOM_LEVEL, level); // Lv1: 3 .. Lv10: 12
}

export function getFarmStorageCap(level: number): number {
  if (level <= 0) return 0;
  return Math.min(MAX_KINGDOM_LEVEL, level) * 12; // Lv1: 12 .. Lv10: 120
}

export function getTowerArcherCap(level: number): number {
  if (level <= 0) return 0;
  return Math.min(4, 1 + Math.floor((level - 1) / 3)); // Lv1-3: 1, Lv4-6: 2, Lv7-9: 3, Lv10: 4
}

export function getTowerHeight(level: number): number {
  if (level <= 0) return 0;
  return 26 + Math.min(MAX_KINGDOM_LEVEL, level) * 4; // 30px at Lv1 -> 66px at Lv10
}

export function getWallHeight(level: number): number {
  if (level <= 0) return 0;
  return 20 + Math.min(MAX_KINGDOM_LEVEL, level) * 3; // 23px at Lv1 -> 50px at Lv10
}

export function getHallUpgradeResourceCost(level: number, currentIsland: number): ResourceCost {
  if (level >= MAX_KINGDOM_LEVEL) return { coins: 0, wood: 0, stone: 0, iron: 0 };
  const target = level + 1;
  if (target === 1) return { coins: 2, wood: 0, stone: 0, iron: 0 };
  if (target === 2) return { coins: 5, wood: 6, stone: 5, iron: 0 };
  const needsIron = currentIsland >= 2 || target >= 3;
  return {
    coins: 5 + target * 3,
    wood: 4 + target * 3,
    stone: 4 + target * 3,
    iron: needsIron ? (target - 2) * 3 : 0,
  };
}

export function getHallUpgradeCost(level: number, currentIsland = 1): number {
  return getHallUpgradeResourceCost(level, currentIsland).coins;
}

export function getWallUpgradeResourceCost(
  level: number,
  hallLevel: number,
  destroyed: boolean,
  previousLevel: number,
  currentIsland: number
): ResourceCost {
  if (destroyed) {
    const prev = Math.max(1, previousLevel);
    const needsIron = currentIsland >= 2 && hallLevel >= 3 && prev >= 3;
    return {
      coins: 1 + Math.floor(prev / 2),
      wood: Math.max(1, prev),
      stone: Math.max(1, prev),
      iron: needsIron ? Math.max(1, prev - 2) : 0,
    };
  }
  const target = level + 1;
  if (target > hallLevel || target > MAX_KINGDOM_LEVEL) {
    return { coins: 0, wood: 0, stone: 0, iron: 0 };
  }
  if (target === 1) return { coins: 2, wood: 2, stone: 1, iron: 0 };
  if (target === 2) return { coins: 4, wood: 4, stone: 3, iron: 0 };
  const needsIron = currentIsland >= 2 && hallLevel >= 3 && target >= 3;
  return {
    coins: 2 + target * 2,
    wood: target * 2 + 1,
    stone: target * 2 + 2,
    iron: needsIron ? (target - 2) * 2 : 0,
  };
}

export function getTowerUpgradeResourceCost(
  level: number,
  hallLevel: number,
  destroyed: boolean,
  previousLevel: number,
  currentIsland: number
): ResourceCost {
  if (destroyed) {
    const prev = Math.max(1, previousLevel);
    const needsIron = currentIsland >= 2 && hallLevel >= 3 && prev >= 3;
    return {
      coins: 2 + Math.floor(prev / 2),
      wood: Math.max(2, prev + 1),
      stone: Math.max(1, prev),
      iron: needsIron ? Math.max(1, prev - 2) : 0,
    };
  }
  const target = level + 1;
  if (target > hallLevel || target > MAX_KINGDOM_LEVEL) {
    return { coins: 0, wood: 0, stone: 0, iron: 0 };
  }
  if (target === 1) return { coins: 3, wood: 3, stone: 2, iron: 0 };
  if (target === 2) return { coins: 5, wood: 5, stone: 4, iron: 0 };
  const needsIron = currentIsland >= 2 && hallLevel >= 3 && target >= 3;
  return {
    coins: 3 + target * 2,
    wood: target * 2 + 2,
    stone: target * 2 + 1,
    iron: needsIron ? (target - 2) * 2 : 0,
  };
}

export function getFarmUpgradeResourceCost(
  level: number,
  hallLevel: number,
  currentIsland: number
): ResourceCost {
  const target = level + 1;
  if (hallLevel < 2 || target > hallLevel || target > MAX_KINGDOM_LEVEL) {
    return { coins: 0, wood: 0, stone: 0, iron: 0 };
  }
  if (target === 1) return { coins: 3, wood: 4, stone: 2, iron: 0 };
  if (target === 2) return { coins: 5, wood: 6, stone: 4, iron: 0 };
  const needsIron = currentIsland >= 2 && hallLevel >= 3 && target >= 3;
  return {
    coins: 2 + target * 2,
    wood: 3 + target * 2,
    stone: 2 + target * 2,
    iron: needsIron ? target - 2 : 0,
  };
}

export function getForgeBuildResourceCost(): ResourceCost {
  return { coins: 6, wood: 8, stone: 8, iron: 0 };
}

export function getForgeSmeltResourceCost(): ResourceCost {
  return { coins: 1, wood: 3, stone: 3, iron: 0 };
}

export function getForgeIronOutput(w: WorldState): number {
  return 2 + (isForgeBuffActive(w) ? 1 : 0) + (w.hall.level >= 5 ? 1 : 0) + (w.hall.level >= 8 ? 1 : 0);
}

export function getIslandBuffResourceCost(kind: 'construction' | 'forge', islandId: number): ResourceCost {
  const tier = Math.max(1, islandId - 1);
  if (kind === 'construction') {
    return {
      coins: 5 + tier * 2,
      wood: 6 + tier * 3,
      stone: 6 + tier * 3,
      iron: islandId >= 3 ? (tier - 1) * 2 : 0,
    };
  }
  return {
    coins: 5 + tier * 2,
    wood: 5 + tier * 2,
    stone: 7 + tier * 3,
    iron: islandId >= 3 ? (tier - 1) * 2 : 0,
  };
}

export function getBoatBuildResourceCost(): ResourceCost {
  return { coins: BOAT_BUILD_COST, wood: 10, stone: 5, iron: 0 };
}

export function getDockBuildResourceCost(currentIsland = 2): ResourceCost {
  const extra = Math.max(0, currentIsland - 2);
  return {
    coins: DOCK_BUILD_COST + extra * 5,
    wood: 12 + extra * 3,
    stone: 10 + extra * 3,
    iron: 2 + extra * 2,
  };
}

export function getWallMaxHp(level: number, odinBlessed = false): number {
  if (level <= 0) return 0;
  const lv = Math.min(MAX_KINGDOM_LEVEL, level);
  const base = Math.round(50 + lv * 35 + lv * lv * 15); // Lv1: 100, Lv2: 180, Lv3: 290 .. Lv10: 1900
  return odinBlessed ? Math.round(base * 1.4) : base;
}

export function getTowerMaxHp(level: number, odinBlessed = false): number {
  if (level <= 0) return 0;
  const lv = Math.min(MAX_KINGDOM_LEVEL, level);
  const base = Math.round(60 + lv * 32 + lv * lv * 10); // Lv1: 102 .. Lv10: 1380
  return odinBlessed ? Math.round(base * 1.4) : base;
}

function hasRequiredMaterials(w: WorldState, cost: ResourceCost): boolean {
  return (
    w.resources.wood >= cost.wood &&
    w.resources.stone >= cost.stone &&
    w.resources.iron >= cost.iron
  );
}

function consumeMaterials(w: WorldState, cost: ResourceCost): void {
  w.resources.wood = Math.max(0, w.resources.wood - cost.wood);
  w.resources.stone = Math.max(0, w.resources.stone - cost.stone);
  w.resources.iron = Math.max(0, w.resources.iron - cost.iron);
}

function formatMissingMaterials(w: WorldState, cost: ResourceCost): string {
  const missing: string[] = [];
  if (w.resources.wood < cost.wood) missing.push(`${cost.wood - w.resources.wood} Madeira`);
  if (w.resources.stone < cost.stone) missing.push(`${cost.stone - w.resources.stone} Pedra`);
  if (w.resources.iron < cost.iron) missing.push(`${cost.iron - w.resources.iron} Ferro`);
  return missing.join(' · ');
}

export function computeThreatLevel(w: WorldState): number {
  const islandDef = getIslandDef(w.currentIsland);
  return Math.max(
    1,
    Math.round(
      w.day +
        Math.max(0, w.currentIsland - 1) * 3.5 +
        (islandDef.difficultyBase - 1) * 1.5 +
        (w.isBloodMoon ? 4 : 0)
    )
  );
}

function uid(w: WorldState): number {
  return w.nextId++;
}

function spawnParticle(w: WorldState, p: Particle): void {
  if (w.particles.length > 280) {
    const idx = w.particles.findIndex((item) => item.kind !== 'snow');
    if (idx >= 0) w.particles.splice(idx, 1);
  }
  w.particles.push(p);
}

function spawnBurst(
  w: WorldState,
  x: number,
  y: number,
  count: number,
  color: string,
  kind: Particle['kind'],
  speed = 40
): void {
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI * Math.random();
    const mag = speed * (0.35 + Math.random() * 0.75);
    spawnParticle(w, {
      x,
      y,
      vx: Math.cos(angle) * mag + (Math.random() - 0.5) * 16,
      vy: Math.sin(angle) * mag - 10,
      size: Math.random() > 0.5 ? 2 : 1,
      color,
      alpha: 1,
      life: 0.4 + Math.random() * 0.45,
      maxLife: 0.85,
      kind,
    });
  }
}

export function spawnCoin(
  w: WorldState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  fromMonarch: boolean,
  pickupDelay = 0.25
): Coin {
  const coin: Coin = {
    id: uid(w),
    x,
    y,
    vx,
    vy,
    grounded: false,
    age: 0,
    fromMonarch,
    claimedById: null,
    pickupDelay,
  };
  w.coins.push(coin);
  return coin;
}

export function showBanner(w: WorldState, title: string, subtitle: string, accent = '#efc462'): void {
  w.banner = {
    title,
    subtitle,
    timer: 4.5,
    maxTimer: 4.5,
    accent,
  };
}

export function confirmCharacterSelection(w: WorldState): void {
  if (w.mode !== 'char_select') return;
  w.mode = 'crest_select';
  w.selectTimer = 30;
  sound.playCoinPickup();
}

export function confirmCrestAndStartCampaign(w: WorldState): void {
  if (w.mode !== 'crest_select') return;
  w.crest.locked = true;
  w.mode = 'playing';
  w.selectTimer = 0;
  sound.playHorn(false);
  const def = getIslandDef(w.currentIsland);
  const lang = getLanguage();
  showBanner(w, def.name[lang], def.subtitle[lang], w.crest.secondaryColor);
  saveCampaign(w);
}

function syncCurrentIslandProgress(w: WorldState): void {
  const entry = w.islands.find((i) => i.id === w.currentIsland);
  if (!entry) return;
  entry.visited = true;
  entry.colonized = w.hall.level >= 1 || w.currentIsland === 1;
  entry.dockBuilt = w.dock.built;
  entry.boatBuilt = w.boat.built;
  entry.hallLevel = w.hall.level;
  entry.wallsBuilt = w.walls.filter((wall) => wall.level > 0 && !wall.destroyed).length;
  entry.godUnlocked = Boolean(w.godShrine?.unlocked);
  entry.mountUnlocked = Boolean(w.mountShrine?.unlocked);
  entry.constructionBuff = isConstructionBuffActive(w);
  entry.forgeBuff = isForgeBuffActive(w);
  if (w.monarchs[0]) {
    w.monarchs[0].maxCoins = Math.max(30, 30 + Math.max(0, w.hall.level - 1) * 5);
  }
}

export function sailToIsland(w: WorldState, targetIslandId: number): boolean {
  if (targetIslandId === w.currentIsland) return false;
  const targetProgress = w.islands.find((i) => i.id === targetIslandId);
  if (!targetProgress) return false;

  // Save current island snapshot (excluding embarked crew who travel with the Monarch!)
  const embarkedCrew = w.villagers.filter((v) => v.state === 'embarked');
  const stayingVillagers = w.villagers.filter((v) => v.state !== 'embarked');

  syncCurrentIslandProgress(w);
  const curProgress = w.islands.find((i) => i.id === w.currentIsland);
  if (curProgress) {
    // Reset sail payment on departed island so future sailings cost 10 coins again
    const savedBoat = {
      ...w.boat,
      sailCoinsPaid: 0,
      bellRung: false,
      crewArchers: 0,
      crewWarriors: 0,
      crewProducers: 0,
      crewBuilders: 0,
    };
    curProgress.snapshot = {
      hall: { ...w.hall },
      forge: w.forge ? { ...w.forge } : null,
      shops: w.shops.map((s) => ({ ...s })),
      walls: w.walls.map((wall) => ({ ...wall })),
      towers: w.towers.map((tw) => ({ ...tw })),
      farms: w.farms.map((f) => ({ ...f })),
      islandBuffs: w.islandBuffs.map((b) => ({ ...b })),
      boat: savedBoat,
      dock: { ...w.dock },
      godShrine: w.godShrine ? { ...w.godShrine } : null,
      mountShrine: w.mountShrine ? { ...w.mountShrine } : null,
      puzzle: w.puzzle ? { ...w.puzzle } : null,
      camps: w.camps.map((c) => ({ ...c })),
      trees: w.trees.map((tr) => ({ ...tr })),
      rocks: w.rocks.map((r) => ({ ...r })),
      berryBushes: (w.berryBushes ?? []).map((b) => ({ ...b })),
      chests: w.chests.map((c) => ({ ...c })),
      portals: w.portals.map((p) => ({ ...p })),
      villagers: stayingVillagers.map((v) => ({ ...v })),
      rockRegrowQueue: w.rockRegrowQueue,
      rockRegrowTimer: w.rockRegrowTimer,
      treeRegrowQueue: w.treeRegrowQueue,
      treeRegrowTimer: w.treeRegrowTimer,
    };
  }

  // Switch to destination island!
  w.currentIsland = targetIslandId;
  targetProgress.visited = true;
  targetProgress.colonized = true;

  let nextSnap = targetProgress.snapshot;
  if (nextSnap) {
    // Restore colonized island and disembark crew!
    w.hall = { ...nextSnap.hall };
    w.forge = nextSnap.forge ? { ...nextSnap.forge } : null;
    w.shops = nextSnap.shops.map((s) => ({ ...s }));
    w.walls = nextSnap.walls.map((wall) => ({ ...wall }));
    w.towers = (nextSnap.towers ?? []).map((tw) => ({ ...tw }));
    w.farms = nextSnap.farms.map((f) => ({ ...f }));
    w.islandBuffs = (nextSnap.islandBuffs ?? []).map((b) => ({ ...b }));
    w.boat = {
      ...nextSnap.boat,
      built: true,
      sailCoinsPaid: 0,
      bellRung: false,
      crewArchers: 0,
      crewWarriors: 0,
      crewProducers: 0,
      crewBuilders: 0,
      waterDropProgress: 1,
      attackCooldown: 0,
    };
    w.dock = { ...nextSnap.dock };
    w.godShrine = nextSnap.godShrine ? { ...nextSnap.godShrine } : null;
    w.mountShrine = nextSnap.mountShrine ? { ...nextSnap.mountShrine } : null;
    w.puzzle = nextSnap.puzzle ? { ...nextSnap.puzzle } : null;
    w.camps = nextSnap.camps.map((c) => ({ ...c }));
    w.trees = nextSnap.trees.map((tr) => ({ ...tr }));
    w.rocks = nextSnap.rocks.map((r) => ({ ...r }));
    w.berryBushes = (nextSnap.berryBushes ?? []).map((b) => ({ ...b }));
    w.chests = nextSnap.chests.map((c) => ({ ...c }));
    w.portals = nextSnap.portals.map((p) => ({ ...p }));
    w.villagers = nextSnap.villagers.map((v) => ({ ...v }));
    w.rockRegrowQueue = nextSnap.rockRegrowQueue ?? 0;
    w.rockRegrowTimer = nextSnap.rockRegrowTimer ?? 0;
    w.treeRegrowQueue = nextSnap.treeRegrowQueue ?? 0;
    w.treeRegrowTimer = nextSnap.treeRegrowTimer ?? 0;
    embarkedCrew.forEach((member, idx) => {
      w.villagers.push({
        ...member,
        id: uid(w),
        x: w.boat.x - 18 - (idx % 6) * 8,
        y: GROUND_Y,
        vx: 0,
        state: 'idle',
        assignedFarmId: null,
        assignedTowerId: null,
        side: idx % 2 === 0 ? -1 : 1,
      });
    });
  } else {
    // Fresh unexplored island! Boat arrives floating by shore; Dock must be built!
    const fresh = generateIslandSnapshot(targetIslandId, () => uid(w), embarkedCrew);
    w.hall = fresh.hall;
    w.forge = fresh.forge;
    w.shops = fresh.shops;
    w.walls = fresh.walls;
    w.towers = fresh.towers;
    w.farms = fresh.farms;
    w.islandBuffs = fresh.islandBuffs;
    w.boat = { ...fresh.boat, waterDropProgress: fresh.boat.built ? 1 : 0, attackCooldown: 0 };
    w.dock = fresh.dock;
    w.godShrine = fresh.godShrine;
    w.mountShrine = fresh.mountShrine;
    w.puzzle = fresh.puzzle;
    w.camps = fresh.camps;
    w.trees = fresh.trees;
    w.rocks = fresh.rocks;
    w.berryBushes = fresh.berryBushes ?? [];
    w.chests = fresh.chests;
    w.portals = fresh.portals;
    w.villagers = fresh.villagers;
    w.rockRegrowQueue = fresh.rockRegrowQueue;
    w.rockRegrowTimer = fresh.rockRegrowTimer;
    w.treeRegrowQueue = fresh.treeRegrowQueue;
    w.treeRegrowTimer = fresh.treeRegrowTimer;
  }

  // Sync berry bushes with active season on destination island
  const curSeasonMod = getSeasonModifiers(w.season);
  for (const bush of w.berryBushes) {
    if (curSeasonMod.hasBerries) {
      if (bush.berries <= 0) bush.berries = w.season === 'spring' ? 4 : 3;
    } else {
      bush.berries = 0;
      bush.marked = false;
      bush.forageProgress = 0;
    }
  }

  // Reset Banker walking state cleanly to vault on arrival
  if (w.banker.carriedCoins && w.banker.carriedCoins > 0) {
    w.banker.balance += w.banker.carriedCoins;
  }
  w.banker.walkX = w.banker.x;
  w.banker.carriedCoins = 0;
  w.banker.phase = 'idle';
  w.banker.targetFarmId = null;

  // Clear transient entities and spawn Monarch beside the arrived Drakkar!
  w.enemies = [];
  w.arrows = [];
  w.coins = [];
  w.flyingCoins = [];
  w.fireTrails = [];
  w.lightningBolts = [];
  w.activePrompt = null;
  w.timeOfDay = 0.04;
  w.isNight = false;
  w.nightWaveStage = 0;
  w.waveTriggeredTonight = false;
  w.threatLevel = computeThreatLevel(w);

  const monarch = w.monarchs[0];
  if (monarch) {
    monarch.x = w.boat.x - 16;
    monarch.vx = 0;
    monarch.facing = -1;
    monarch.flyTimer = 0;
    monarch.flyY = 0;
    monarch.roarTimer = 0;
    monarch.maxCoins = Math.max(30, 30 + Math.max(0, w.hall.level - 1) * 5);
    monarch.cameraX = Math.max(0, Math.min(WORLD_WIDTH - w.viewWidth, monarch.x - w.viewWidth / 2));
  }

  w.mode = 'playing';
  w.worldMapContext = 'inspect';
  sound.playHorn(false);
  const def = getIslandDef(targetIslandId);
  const lang = getLanguage();
  const dockCost = getDockBuildResourceCost(targetIslandId);
  showBanner(
    w,
    def.name[lang],
    w.dock.built ? def.subtitle[lang] : `Construa o Porto (${dockCost.coins}🪙 + Madeira/Pedra/Ferro) e prepare as defesas!`,
    w.crest.secondaryColor
  );
  syncCurrentIslandProgress(w);
  saveCampaign(w);
  return true;
}

function getOuterDefensiveWall(w: WorldState, side: -1 | 1): Wall | null {
  const sideWalls = w.walls
    .filter((wall) => wall.side === side && wall.level > 0 && !wall.destroyed)
    .sort((a, b) => Math.abs(b.x - CENTER_X) - Math.abs(a.x - CENTER_X));
  return sideWalls[0] ?? null;
}

function countPendingFlyingCoins(w: WorldState, targetType: PromptTargetType, targetId: number): number {
  let count = 0;
  for (const fc of w.flyingCoins) {
    if (fc.targetType === targetType && fc.targetId === targetId) count++;
  }
  return count;
}

function countFarmersAssignedToFarm(w: WorldState, farmId: number): number {
  let c = 0;
  for (const v of w.villagers) {
    if (v.role === 'producer' && v.assignedFarmId === farmId && v.state !== 'embarked' && v.state !== 'boarding') {
      c++;
    }
  }
  return c;
}

export function countArchersAssignedToTower(w: WorldState, towerId: number): number {
  let c = 0;
  for (const v of w.villagers) {
    if (v.role === 'archer' && v.assignedTowerId === towerId && v.state !== 'embarked' && v.state !== 'boarding') {
      c++;
    }
  }
  return c;
}

function markActionClassCompleted(w: WorldState, actionClass: string): void {
  const map = (w.completedActionClasses = w.completedActionClasses ?? {});
  map[actionClass] = true;
}

function countInFlightCoinsToMonarch(w: WorldState, monarchIndex: number): number {
  let count = 0;
  for (const fc of w.flyingCoins) {
    if (fc.targetType === 'banker_withdraw' && monarchIndex === 0) count += 1;
    else if (fc.targetType === 'villager_tribute' && fc.targetId === monarchIndex) count += 1;
  }
  return count;
}

export function withdrawFromBanker(w: WorldState): boolean {
  const m = w.monarchs[0];
  if (!m || w.mode !== 'playing' || w.hall.level < 1) return false;
  if (Math.abs(m.x - w.banker.x) > 46) return false;
  if (w.banker.balance <= 0) return false;
  const inFlightToMonarch = countInFlightCoinsToMonarch(w, 0);
  const room = Math.max(0, m.maxCoins - (m.coins + inFlightToMonarch));
  if (room <= 0) {
    showBanner(w, 'BOLSA CHEIA', `Sua bolsa comporta até ${m.maxCoins} moedas!`, '#ffe066');
    return false;
  }
  const take = Math.min(w.banker.balance, room);
  w.banker.balance -= take;
  sound.playCoinDrop();
  spawnBurst(w, w.banker.x, GROUND_Y - 18, 8, '#ffe066', 'spark', 40);
  for (let i = 0; i < take; i++) {
    w.flyingCoins.push({
      id: uid(w),
      startX: w.banker.x + ((i % 3) - 1) * 3,
      startY: GROUND_Y - 18,
      targetX: m.x,
      targetY: GROUND_Y - 16 - m.flyY,
      progress: -i * 0.14,
      duration: 0.34,
      currency: 'coin',
      targetType: 'banker_withdraw',
      targetId: 0,
    });
  }
  return true;
}

function ringShipBell(w: WorldState): void {
  w.boat.bellRung = true;
  sound.playHorn(false);
  spawnBurst(w, w.boat.bellX, GROUND_Y - 22, 10, '#ffe066', 'spark', 40);

  const limits: Array<{ role: VillagerRole; current: () => number }> = [
    { role: 'archer', current: () => w.boat.crewArchers },
    { role: 'warrior', current: () => w.boat.crewWarriors },
    { role: 'producer', current: () => w.boat.crewProducers },
    { role: 'builder', current: () => w.boat.crewBuilders },
  ];

  let called = 0;
  for (const item of limits) {
    const alreadyBoarding = w.villagers.filter((v) => v.role === item.role && v.state === 'boarding').length;
    const slotsLeft = MAX_CREW_PER_CLASS - item.current() - alreadyBoarding;
    if (slotsLeft <= 0) continue;

    const candidates = w.villagers
      .filter((v) => v.role === item.role && v.state !== 'boarding' && v.state !== 'embarked')
      .sort((a, b) => Math.abs(a.x - w.boat.x) - Math.abs(b.x - w.boat.x));

    for (let i = 0; i < Math.min(slotsLeft, candidates.length); i++) {
      candidates[i].state = 'boarding';
      candidates[i].assignedFarmId = null;
      candidates[i].orderFlashTimer = 2.0;
      candidates[i].orderDir = w.boat.x >= candidates[i].x ? 1 : -1;
      called++;
    }
  }

  showBanner(
    w,
    'SINO DO DRAKKAR TOCADO!',
    called > 0
      ? `${called} tripulantes marchando para o barco (máx 4 de cada classe)`
      : 'Tripulação máxima já embarcada ou sem tropas livres',
    '#ffe066'
  );
}

export function computeActivePrompt(w: WorldState, m: Monarch): FloatingPrompt | null {
  if (!m.hasCrown) return null;
  let best: FloatingPrompt | null = null;
  let bestDist = 36;

  // 1. Hall / Castle (Lv 0 -> 10, capped by Island 1 = Lv 2 and +1 per next island with Construction+Forge buffs!)
  const hallDist = Math.abs(m.x - w.hall.x);
  if (w.hall.level < MAX_KINGDOM_LEVEL && hallDist < 34 && hallDist < bestDist) {
    const maxAllowed = getIslandMaxKingdomLevel(w);
    const resCost = getHallUpgradeResourceCost(w.hall.level, w.currentIsland);
    const pending = countPendingFlyingCoins(w, 'hall', 0);
    if (w.hall.level >= maxAllowed) {
      bestDist = hallDist;
      let reason = 'Navegue para a próxima ilha!';
      if (w.currentIsland === 1) {
        reason = 'Ilha I: máx Nv.2 · Zarpe no Drakkar!';
      } else if (!isConstructionBuffActive(w) || !isForgeBuffActive(w)) {
        reason = 'Ative Buffs Construção e Forja nesta ilha!';
      }
      best = {
        x: w.hall.x,
        y: GROUND_Y - (w.hall.level === 0 ? 30 : 58),
        label: `REINO NV.${w.hall.level}/${maxAllowed}`,
        cost: 0,
        paid: 0,
        pending: 0,
        blockedReason: reason,
        targetType: 'hall',
        targetId: 0,
      };
    } else if (resCost.coins > 0 && w.hall.coinsPaid < resCost.coins) {
      bestDist = hallDist;
      const nextLv = w.hall.level + 1;
      const label =
        w.hall.level === 0
          ? t('prompt_light_fire')
          : `${t('prompt_jarl_hall')} Nv.${nextLv}`;
      best = {
        x: w.hall.x,
        y: GROUND_Y - (w.hall.level === 0 ? 30 : 58),
        label,
        actionClass: w.hall.level === 0 ? 'hall_fire' : 'hall_upgrade',
        cost: resCost.coins,
        paid: w.hall.coinsPaid,
        pending,
        woodCost: resCost.wood,
        stoneCost: resCost.stone,
        ironCost: resCost.iron,
        targetType: 'hall',
        targetId: 0,
      };
    }
  }

  // 1b. Castle Banker (accepts ALL coins & yields 1%..10%/day depending on Kingdom level!)
  if (w.hall.level >= 1) {
    const bankDist = Math.abs(m.x - w.banker.x);
    if (bankDist < 26 && bankDist < bestDist) {
      const ratePct = getBankerDailyRatePct(w.hall.level);
      const pending = countPendingFlyingCoins(w, 'banker', 0);
      bestDist = bankDist;
      best = {
        x: w.banker.x,
        y: GROUND_Y - 38,
        label: t('prompt_banker'),
        actionClass: 'banker',
        cost: 1,
        paid: 0,
        pending,
        canWithdraw: w.banker.balance > 0,
        bankBalance: w.banker.balance,
        bankRatePct: ratePct,
        targetType: 'banker',
        targetId: 0,
      };
    }
  }

  // 1c. Forge (Island 2+: Build with wood+stone, then smelt wood+stone -> Iron!)
  if (w.hall.level >= 1 && w.forge) {
    const forgeDist = Math.abs(m.x - w.forge.x);
    if (forgeDist < 26 && forgeDist < bestDist) {
      if (!w.forge.built && !w.forge.underConstruction) {
        const fCost = getForgeBuildResourceCost();
        const pending = countPendingFlyingCoins(w, 'forge_build', 0);
        if (w.forge.coinsPaid < fCost.coins) {
          bestDist = forgeDist;
          best = {
            x: w.forge.x,
            y: GROUND_Y - 42,
            label: t('prompt_forge_build'),
            actionClass: 'forge_build',
            cost: fCost.coins,
            paid: w.forge.coinsPaid,
            pending,
            woodCost: fCost.wood,
            stoneCost: fCost.stone,
            ironCost: fCost.iron,
            targetType: 'forge_build',
            targetId: 0,
          };
        }
      } else if (w.forge.built && w.forge.smeltQueue < 5) {
        const sCost = getForgeSmeltResourceCost();
        const pending = countPendingFlyingCoins(w, 'forge_smelt', 0);
        if (w.forge.smeltCoinsPaid < sCost.coins) {
          const outIron = getForgeIronOutput(w);
          bestDist = forgeDist;
          best = {
            x: w.forge.x,
            y: GROUND_Y - 42,
            label: `${t('prompt_forge_smelt')} (+${outIron})`,
            actionClass: 'forge_smelt',
            cost: sCost.coins,
            paid: w.forge.smeltCoinsPaid,
            pending,
            woodCost: sCost.wood,
            stoneCost: sCost.stone,
            ironCost: 0,
            targetType: 'forge_smelt',
            targetId: 0,
          };
        }
      }
    }
  }

  // 2. Tool Shops (Hammer & Bow at Lv 1; Seed at Lv 2; Sword on Island 3+ after Thor!)
  if (w.hall.level >= 1) {
    for (const shop of w.shops) {
      if (!isShopUnlocked(w, shop.kind)) continue;
      const d = Math.abs(m.x - shop.x);
      if (d < 22 && d < bestDist && shop.stock < shop.maxStock) {
        const pending = countPendingFlyingCoins(w, 'shop', shop.id);
        const shopCost = shop.kind === 'sword' ? 3 : 2;
        if (shop.coinsPaid < shopCost) {
          bestDist = d;
          const labelMap = {
            bow: t('prompt_bow'),
            hammer: t('prompt_hammer'),
            sword: t('prompt_sword'),
            seed: t('prompt_seed'),
          };
          best = {
            x: shop.x,
            y: GROUND_Y - 38,
            label: labelMap[shop.kind],
            actionClass: `shop_${shop.kind}`,
            cost: shopCost,
            paid: shop.coinsPaid,
            pending,
            targetType: 'shop',
            targetId: shop.id,
          };
        }
      }
    }
  }

  // 3. Farms (Unlocked at Kingdom Lv >= 2; scales Lv 1..10 matching Kingdom level!)
  if (isFarmsUnlocked(w)) {
    for (const farm of w.farms) {
      if (farm.underConstruction) continue;
      const fCost = getFarmUpgradeResourceCost(farm.level, w.hall.level, w.currentIsland);
      if (fCost.coins <= 0) continue;
      const d = Math.abs(m.x - farm.x);
      if (d < 26 && d < bestDist) {
        const pending = countPendingFlyingCoins(w, 'farm', farm.id);
        if (farm.coinsPaid < fCost.coins) {
          bestDist = d;
          best = {
            x: farm.x,
            y: GROUND_Y - 40,
            label:
              farm.level === 0
                ? t('prompt_farm_build')
                : `${t('prompt_farm_upgrade')} Nv.${farm.level + 1}`,
            actionClass: farm.level === 0 ? 'farm_build' : 'farm_upgrade',
            cost: fCost.coins,
            paid: farm.coinsPaid,
            pending,
            woodCost: fCost.wood,
            stoneCost: fCost.stone,
            ironCost: fCost.iron,
            targetType: 'farm',
            targetId: farm.id,
          };
        }
      }
    }
  }

  // 3b. Archer Towers (Lv 1..10 matching Kingdom level!)
  if (w.hall.level >= 1) {
    for (const tower of w.towers) {
      if (tower.underConstruction) continue;
      const tCost = getTowerUpgradeResourceCost(
        tower.level,
        w.hall.level,
        tower.destroyed,
        tower.previousLevel,
        w.currentIsland
      );
      if (tCost.coins <= 0) continue;
      const d = Math.abs(m.x - tower.x);
      if (d < 24 && d < bestDist) {
        const pending = countPendingFlyingCoins(w, 'tower', tower.id);
        if (tower.coinsPaid < tCost.coins) {
          bestDist = d;
          const label = tower.destroyed
            ? t('prompt_tower_reform')
            : tower.level === 0
              ? t('prompt_tower_build')
              : `${t('prompt_tower_upgrade')} Nv.${tower.level + 1}`;
          best = {
            x: tower.x,
            y: GROUND_Y - Math.max(34, getTowerHeight(tower.level) + 12),
            label,
            actionClass: tower.destroyed ? 'tower_reform' : tower.level === 0 ? 'tower_build' : 'tower_upgrade',
            cost: tCost.coins,
            paid: tower.coinsPaid,
            pending,
            woodCost: tCost.wood,
            stoneCost: tCost.stone,
            ironCost: tCost.iron,
            targetType: 'tower',
            targetId: tower.id,
          };
        }
      }
    }
  }

  // 3c. Island Construction & Forge Buff Altars (Islands 2..9)
  if (w.hall.level >= 1) {
    for (const buff of w.islandBuffs) {
      if (buff.active) continue;
      const d = Math.abs(m.x - buff.x);
      if (d < 28 && d < bestDist) {
        const bCost = getIslandBuffResourceCost(buff.kind, w.currentIsland);
        const targetType: PromptTargetType =
          buff.kind === 'construction' ? 'buff_construction' : 'buff_forge';
        const pending = countPendingFlyingCoins(w, targetType, 0);
        if (buff.coinsPaid < bCost.coins) {
          bestDist = d;
          best = {
            x: buff.x,
            y: GROUND_Y - 46,
            label:
              buff.kind === 'construction'
                ? t('prompt_buff_construction')
                : t('prompt_buff_forge'),
            actionClass: targetType,
            cost: bCost.coins,
            paid: buff.coinsPaid,
            pending,
            woodCost: bCost.wood,
            stoneCost: bCost.stone,
            ironCost: bCost.iron,
            targetType,
            targetId: 0,
          };
        }
      }
    }
  }

  // 4. Dock Construction (on Islands 2..9 before sailing again!)
  if (w.hall.level >= 1 && w.dock.required && !w.dock.built && !w.dock.underConstruction) {
    const d = Math.abs(m.x - w.dock.x);
    if (d < 34 && d < bestDist) {
      const dockCost = getDockBuildResourceCost(w.currentIsland);
      const pending = countPendingFlyingCoins(w, 'dock_build', 0);
      if (w.dock.coinsPaid < dockCost.coins) {
        bestDist = d;
        best = {
          x: w.dock.x,
          y: GROUND_Y - 40,
          label: t('prompt_dock_build'),
          actionClass: 'dock_build',
          cost: dockCost.coins,
          paid: w.dock.coinsPaid,
          pending,
          woodCost: dockCost.wood,
          stoneCost: dockCost.stone,
          ironCost: dockCost.iron,
          targetType: 'dock_build',
          targetId: 0,
        };
      }
    }
  }

  // 5. Drakkar Boat: Build (Island 1) OR Sail (10 coins once built & dock ready)
  if (w.hall.level >= 1) {
    const boatDist = Math.abs(m.x - w.boat.x);
    if (!w.boat.built && !w.boat.underConstruction && boatDist < 34 && boatDist < bestDist) {
      const boatCost = getBoatBuildResourceCost();
      const pending = countPendingFlyingCoins(w, 'boat_build', 0);
      if (w.boat.coinsPaid < boatCost.coins) {
        bestDist = boatDist;
        best = {
          x: w.boat.x,
          y: GROUND_Y - 48,
          label: t('prompt_boat_build'),
          actionClass: 'boat_build',
          cost: boatCost.coins,
          paid: w.boat.coinsPaid,
          pending,
          woodCost: boatCost.wood,
          stoneCost: boatCost.stone,
          ironCost: boatCost.iron,
          targetType: 'boat_build',
          targetId: 0,
        };
      }
    } else if (w.boat.built && w.dock.built && boatDist < 32 && boatDist < bestDist) {
      const pending = countPendingFlyingCoins(w, 'boat_sail', 0);
      if (w.boat.sailCoinsPaid < BOAT_SAIL_COST) {
        bestDist = boatDist;
        best = {
          x: w.boat.x,
          y: GROUND_Y - 52,
          label: t('prompt_boat_sail'),
          actionClass: 'boat_sail',
          cost: BOAT_SAIL_COST,
          paid: w.boat.sailCoinsPaid,
          pending,
          targetType: 'boat_sail',
          targetId: 0,
        };
      }
    }

    // 6. Ship Bell (1 coin to call up to 4 archers, 4 swordsmen, 4 farmers, 4 builders!)
    if (w.boat.built && w.dock.built) {
      const bellDist = Math.abs(m.x - w.boat.bellX);
      if (bellDist < 22 && bellDist < bestDist) {
        const pending = countPendingFlyingCoins(w, 'boat_bell', 0);
        bestDist = bellDist;
        best = {
          x: w.boat.bellX,
          y: GROUND_Y - 38,
          label: t('prompt_boat_bell'),
          actionClass: 'boat_bell',
          cost: BELL_COST,
          paid: 0,
          pending,
          targetType: 'boat_bell',
          targetId: 0,
        };
      }
    }
  }

  // 7. Walls (Lv 1..10 matching Kingdom level!)
  if (w.hall.level >= 1) {
    for (const wall of w.walls) {
      if (wall.underConstruction) continue;
      const wCost = getWallUpgradeResourceCost(
        wall.level,
        w.hall.level,
        wall.destroyed,
        wall.previousLevel,
        w.currentIsland
      );
      if (wCost.coins <= 0) continue;
      const d = Math.abs(m.x - wall.x);
      if (d < 26 && d < bestDist) {
        const pending = countPendingFlyingCoins(w, 'wall', wall.id);
        if (wall.coinsPaid < wCost.coins) {
          bestDist = d;
          const label = wall.destroyed
            ? t('prompt_wall_reform')
            : wall.level === 0
              ? t('prompt_wall_build')
              : `${t('prompt_wall_upgrade')} Nv.${wall.level + 1}`;
          best = {
            x: wall.x,
            y: GROUND_Y - Math.max(30, getWallHeight(wall.level) + 12),
            label,
            actionClass: wall.destroyed ? 'wall_reform' : wall.level === 0 ? 'wall_build' : 'wall_upgrade',
            cost: wCost.coins,
            paid: wall.coinsPaid,
            pending,
            woodCost: wCost.wood,
            stoneCost: wCost.stone,
            ironCost: wCost.iron,
            targetType: 'wall',
            targetId: wall.id,
          };
        }
      }
    }
  }

  // 7b. God Shrine (1 per island: 3 Diamonds to unlock -> Coins to invoke blessing!)
  if (w.godShrine) {
    const d = Math.abs(m.x - w.godShrine.x);
    if (d < 30 && d < bestDist) {
      const godDef = GOD_DEFS[w.godShrine.godId];
      const pending = countPendingFlyingCoins(w, 'god_shrine', 0);
      if (!w.godShrine.unlocked) {
        if (w.godShrine.diamondsPaid < godDef.diamondCost) {
          bestDist = d;
          best = {
            x: w.godShrine.x,
            y: GROUND_Y - 48,
            label: `${godDef.name.toUpperCase()} (${godDef.diamondCost}◆)`,
            actionClass: 'god_unlock',
            cost: godDef.diamondCost,
            paid: w.godShrine.diamondsPaid,
            pending,
            currency: 'diamond',
            targetType: 'god_shrine',
            targetId: 0,
          };
        }
      } else if (w.activeGod !== w.godShrine.godId) {
        if (w.godShrine.coinsPaid < godDef.coinCost) {
          bestDist = d;
          best = {
            x: w.godShrine.x,
            y: GROUND_Y - 48,
            label: `INVOCAR ${godDef.name.toUpperCase()}`,
            actionClass: 'god_invoke',
            cost: godDef.coinCost,
            paid: w.godShrine.coinsPaid,
            pending,
            currency: 'coin',
            targetType: 'god_shrine',
            targetId: 0,
          };
        }
      }
    }
  }

  // 7c. Special Mount Shrine
  if (w.mountShrine) {
    const d = Math.abs(m.x - w.mountShrine.x);
    if (d < 30 && d < bestDist) {
      const mountDef = MOUNT_DEFS[w.mountShrine.mountId];
      const lang = getLanguage();
      const pending = countPendingFlyingCoins(w, 'mount_shrine', 0);
      if (!w.mountShrine.unlocked) {
        if (w.mountShrine.diamondsPaid < mountDef.diamondCost) {
          bestDist = d;
          best = {
            x: w.mountShrine.x,
            y: GROUND_Y - 42,
            label: `${mountDef.name[lang].toUpperCase()} (${mountDef.diamondCost}◆)`,
            actionClass: 'mount_unlock',
            cost: mountDef.diamondCost,
            paid: w.mountShrine.diamondsPaid,
            pending,
            currency: 'diamond',
            targetType: 'mount_shrine',
            targetId: 0,
          };
        }
      } else if (m.mount !== w.mountShrine.mountId) {
        const alreadyTamed = w.unlockedMounts.includes(w.mountShrine.mountId);
        const coinCost = alreadyTamed ? 2 : mountDef.coinCost;
        if (w.mountShrine.coinsPaid < coinCost) {
          bestDist = d;
          best = {
            x: w.mountShrine.x,
            y: GROUND_Y - 42,
            label: `${alreadyTamed ? 'MONTAR' : 'DOMAR'} ${mountDef.name[lang].toUpperCase()}`,
            actionClass: 'mount_tame',
            cost: coinCost,
            paid: w.mountShrine.coinsPaid,
            pending,
            currency: 'coin',
            targetType: 'mount_shrine',
            targetId: 0,
          };
        }
      }
    }
  }

  // 7d. Island Rune Puzzle / Secret (3 coins -> +2 Diamonds & +4 Gold!)
  if (w.puzzle && !w.puzzle.solved) {
    const d = Math.abs(m.x - w.puzzle.x);
    if (d < 30 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'puzzle', 0);
      if (w.puzzle.coinsPaid < 3) {
        bestDist = d;
        best = {
          x: w.puzzle.x,
          y: GROUND_Y - 42,
          label: 'ENIGMA RÚNICO (+2◆)',
          actionClass: 'puzzle',
          cost: 3,
          paid: w.puzzle.coinsPaid,
          pending,
          currency: 'coin',
          targetType: 'puzzle',
          targetId: 0,
        };
      }
    }
  }

  // 7e. Breweries on first vagrant camp of each side (15 coins + Wood + Stone -> 4 coins per beer, max 4 beers!)
  if (w.hall.level >= 1) {
    for (const camp of w.camps) {
      if (!camp.isBrewerySite) continue;
      const d = Math.abs(m.x - camp.x);
      if (d >= 30 || d >= bestDist) continue;
      if (!camp.isBrewery && !camp.breweryUnderConstruction) {
        const paid = camp.breweryCoinsPaid ?? 0;
        const pending = countPendingFlyingCoins(w, 'brewery_build', camp.id);
        if (paid < BREWERY_BUILD_COST.coins) {
          bestDist = d;
          best = {
            x: camp.x,
            y: GROUND_Y - 46,
            label: 'CERVEJARIA',
            actionClass: 'brewery_build',
            cost: BREWERY_BUILD_COST.coins,
            paid,
            pending,
            woodCost: BREWERY_BUILD_COST.wood,
            stoneCost: BREWERY_BUILD_COST.stone,
            targetType: 'brewery_build',
            targetId: camp.id,
          };
        }
      } else if (camp.isBrewery && (camp.beerStock ?? 0) < BREWERY_MAX_BEERS) {
        const paid = camp.beerCoinsPaid ?? 0;
        const pending = countPendingFlyingCoins(w, 'brewery_beer', camp.id);
        if (paid < BREWERY_BEER_COST) {
          bestDist = d;
          best = {
            x: camp.x,
            y: GROUND_Y - 46,
            label: `CERVEJA (${camp.beerStock ?? 0}/${BREWERY_MAX_BEERS})`,
            actionClass: 'brewery_beer',
            cost: BREWERY_BEER_COST,
            paid,
            pending,
            targetType: 'brewery_beer',
            targetId: camp.id,
          };
        }
      }
    }
  }

  // 8. Nearest wanderer
  for (const v of w.villagers) {
    if (v.role !== 'wanderer') continue;
    const d = Math.abs(m.x - v.x);
    if (d < 28 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'wanderer', v.id);
      bestDist = d;
      best = {
        x: v.x,
        y: GROUND_Y - 32,
        label: t('prompt_recruit'),
        actionClass: 'wanderer',
        cost: 1,
        paid: 0,
        pending,
        targetType: 'wanderer',
        targetId: v.id,
      };
    }
  }

  // 8b. Berry bushes (Winter & Spring: pay 1 coin for farmers to harvest berries!)
  for (const bush of w.berryBushes ?? []) {
    if (bush.berries <= 0 || bush.marked) continue;
    const d = Math.abs(m.x - bush.x);
    if (d < 26 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'berry_bush', bush.id);
      bestDist = d;
      best = {
        x: bush.x,
        y: GROUND_Y - 28,
        label: 'COLHER FRUTINHAS',
        actionClass: 'berry_bush',
        cost: 1,
        paid: 0,
        pending,
        targetType: 'berry_bush',
        targetId: bush.id,
      };
    }
  }

  // 9. Rocks (3 sizes: P +5 / 30s, M +7 / 45s, G +15 / 90s)
  for (const rock of w.rocks) {
    if (rock.mined || rock.marked) continue;
    const d = Math.abs(m.x - rock.x);
    if (d < 26 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'rock', rock.id);
      const spec = getRockSpec(rock.size ?? sizeFromVariant(rock.variant));
      bestDist = d;
      best = {
        x: rock.x,
        y: GROUND_Y - 28,
        label: `${t('prompt_rock')} ${t(spec.sizeKey)} (+${spec.stone} · ${spec.time}s)`,
        actionClass: 'rock',
        cost: 1,
        paid: 0,
        pending,
        targetType: 'rock',
        targetId: rock.id,
      };
    }
  }

  // 10. Trees (3 sizes: P +4 / 20s, M +7 / 35s, G +12 / 60s)
  for (const tree of w.trees) {
    if (tree.chopped || tree.marked) continue;
    const d = Math.abs(m.x - tree.x);
    if (d < 26 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'tree', tree.id);
      const spec = getTreeSpec(tree.size ?? sizeFromVariant(tree.variant));
      bestDist = d;
      best = {
        x: tree.x,
        y: GROUND_Y - 46,
        label: `${t('prompt_tree')} ${t(spec.sizeKey)} (+${spec.wood} · ${spec.time}s)`,
        actionClass: 'tree',
        cost: 1,
        paid: 0,
        pending,
        targetType: 'tree',
        targetId: tree.id,
      };
    }
  }

  return best;
}

function getSlotWorldPos(prompt: FloatingPrompt, slotIndex: number): { x: number; y: number } {
  if (prompt.targetType === 'banker') {
    return { x: prompt.x - 10, y: prompt.y - 4.5 };
  }
  if (prompt.cost > 10) {
    return { x: prompt.x, y: prompt.y - 4.5 };
  }
  const slotStep = 10;
  const slotsW = prompt.cost * slotStep - 3;
  const startX = prompt.x - slotsW / 2;
  return {
    x: startX + slotIndex * slotStep + 3.5,
    y: prompt.y - 4.5,
  };
}

function applyFlyingCoinArrival(w: WorldState, fc: FlyingCoin): void {
  if (fc.targetType === 'banker_withdraw') {
    const m = w.monarchs[0];
    if (m && m.coins < m.maxCoins) {
      m.coins += 1;
      w.resources.gold = m.coins;
      sound.playCoinPickup();
      spawnBurst(w, m.x, GROUND_Y - 16 - m.flyY, 4, '#ffe066', 'spark', 24);
    } else {
      w.banker.balance += 1;
    }
    if (!w.flyingCoins.some((other) => other.targetType === 'banker_withdraw')) {
      saveCampaign(w);
    }
    return;
  }

  if (fc.targetType === 'villager_tribute') {
    const m = w.monarchs[fc.targetId] ?? w.monarchs[0];
    if (m && m.coins < m.maxCoins) {
      m.coins += 1;
      if (fc.targetId === 0 || m === w.monarchs[0]) {
        w.resources.gold = m.coins;
      }
      sound.playCoinPickup();
      spawnBurst(w, m.x, GROUND_Y - 18 - m.flyY, 5, '#ffe066', 'spark', 28);
    } else if (m) {
      // Pouch filled mid-flight: drop gently on the ground so no coin is ever lost
      spawnCoin(w, m.x, GROUND_Y - 14 - m.flyY, (Math.random() - 0.5) * 28, -50, false, 0.28);
    }
    return;
  }

  sound.playCoinSlot();
  spawnBurst(w, fc.targetX, fc.targetY, 6, fc.currency === 'diamond' ? '#7ef5ff' : '#ffe066', 'spark', 28);

  if (fc.targetType === 'banker') {
    w.banker.balance += 1;
    markActionClassCompleted(w, 'banker');
    spawnBurst(w, w.banker.x, GROUND_Y - 18, 5, '#ffe066', 'spark', 24);
    return;
  }

  if (fc.targetType === 'wanderer') {
    const v = w.villagers.find((u) => u.id === fc.targetId && u.role === 'wanderer');
    if (v) {
      v.role = 'peasant';
      v.state = 'walking_to_center';
      w.stats.villagersRecruited += 1;
      markActionClassCompleted(w, 'wanderer');
      sound.playCoinPickup();
      spawnBurst(w, v.x, GROUND_Y - 12, 8, '#f7d265', 'spark', 32);
    } else {
      spawnCoin(w, fc.targetX, GROUND_Y - 14, 0, -40, true, 0.2);
    }
    return;
  }

  if (fc.targetType === 'hall') {
    const resCost = getHallUpgradeResourceCost(w.hall.level, w.currentIsland);
    const maxAllowed = getIslandMaxKingdomLevel(w);
    if (w.hall.level >= maxAllowed || resCost.coins <= 0) return;
    w.hall.coinsPaid += 1;
    if (w.hall.coinsPaid >= resCost.coins) {
      if (!hasRequiredMaterials(w, resCost)) {
        // Refund coin if materials changed mid-flight
        w.hall.coinsPaid = Math.max(0, w.hall.coinsPaid - 1);
        if (w.monarchs[0]) {
          w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
          w.resources.gold = w.monarchs[0].coins;
        }
        showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, resCost)}`, '#ff8a65');
        return;
      }
      const prevLevel = w.hall.level;
      consumeMaterials(w, resCost);
      w.hall.coinsPaid = 0;
      w.hall.level += 1;
      markActionClassCompleted(w, prevLevel === 0 ? 'hall_fire' : 'hall_upgrade');
      sound.playBuildComplete();
      spawnBurst(w, w.hall.x, GROUND_Y - 26, 20, '#ffba52', 'ember', 60);
      if (w.hall.level === 1) {
        // Only Hammer and Bow unlock automatically at Kingdom Level 1!
        for (const shop of w.shops) {
          if (shop.kind === 'hammer' || shop.kind === 'bow') shop.built = true;
        }
        showBanner(
          w,
          'REINO NV.1 — FOGUEIRA ACESA',
          'Tendas de Martelo e Arco + Banqueiro (1%/dia) liberados!',
          w.crest.secondaryColor
        );
      } else if (w.hall.level === 2) {
        for (const shop of w.shops) {
          if (shop.kind === 'seed') shop.built = true;
        }
        showBanner(
          w,
          'REINO NV.2 — SALÃO DE MADEIRA',
          'Fazendas e Tenda de Sementes liberadas! Banqueiro rende 2%/dia!',
          w.crest.secondaryColor
        );
      } else {
        const rate = getBankerDailyRatePct(w.hall.level);
        showBanner(
          w,
          `REINO EVOLUÍDO PARA NV.${w.hall.level}!`,
          `Muros, Torres e Fazendas até Nv.${w.hall.level} · Banqueiro rende ${rate}%/dia!`,
          '#ffe066'
        );
      }
      syncCurrentIslandProgress(w);
      saveCampaign(w);
    }
    return;
  }

  if (fc.targetType === 'forge_build' && w.forge && !w.forge.built && !w.forge.underConstruction) {
    const fCost = getForgeBuildResourceCost();
    w.forge.coinsPaid += 1;
    if (w.forge.coinsPaid >= fCost.coins) {
      if (!hasRequiredMaterials(w, fCost)) {
        w.forge.coinsPaid = Math.max(0, w.forge.coinsPaid - 1);
        if (w.monarchs[0]) {
          w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
          w.resources.gold = w.monarchs[0].coins;
        }
        showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, fCost)}`, '#ff8a65');
        return;
      }
      consumeMaterials(w, fCost);
      w.forge.coinsPaid = 0;
      w.forge.underConstruction = true;
      w.forge.buildProgress = 0;
      w.forge.orderedAt = stampOrderSeq(w);
      markActionClassCompleted(w, 'forge_build');
      sound.playHammer();
      showBanner(w, 'FORJA EM CONSTRUÇÃO!', 'Construtores erguendo a Forja de Ferro!', '#ff9b52');
    }
    return;
  }

  if (fc.targetType === 'forge_smelt' && w.forge && w.forge.built) {
    const sCost = getForgeSmeltResourceCost();
    w.forge.smeltCoinsPaid += 1;
    if (w.forge.smeltCoinsPaid >= sCost.coins) {
      if (!hasRequiredMaterials(w, sCost)) {
        w.forge.smeltCoinsPaid = Math.max(0, w.forge.smeltCoinsPaid - 1);
        if (w.monarchs[0]) {
          w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
          w.resources.gold = w.monarchs[0].coins;
        }
        showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, sCost)}`, '#ff8a65');
        return;
      }
      consumeMaterials(w, sCost);
      w.forge.smeltCoinsPaid = 0;
      w.forge.smeltQueue += 1;
      w.forge.smelting = true;
      markActionClassCompleted(w, 'forge_smelt');
      sound.playHammer();
      spawnBurst(w, w.forge.x, GROUND_Y - 18, 10, '#ff8f3b', 'ember', 40);
    }
    return;
  }

  if (fc.targetType === 'buff_construction' || fc.targetType === 'buff_forge') {
    const kind = fc.targetType === 'buff_construction' ? 'construction' : 'forge';
    const buff = w.islandBuffs.find((b) => b.kind === kind);
    if (buff && !buff.active) {
      const bCost = getIslandBuffResourceCost(kind, w.currentIsland);
      buff.coinsPaid += 1;
      if (buff.coinsPaid >= bCost.coins) {
        if (!hasRequiredMaterials(w, bCost)) {
          buff.coinsPaid = Math.max(0, buff.coinsPaid - 1);
          if (w.monarchs[0]) {
            w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
            w.resources.gold = w.monarchs[0].coins;
          }
          showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, bCost)}`, '#ff8a65');
          return;
        }
        consumeMaterials(w, bCost);
        buff.coinsPaid = 0;
        buff.active = true;
        markActionClassCompleted(w, fc.targetType);
        sound.playHorn(false);
        spawnBurst(w, buff.x, GROUND_Y - 24, 24, kind === 'construction' ? '#7ef5ff' : '#ff9b52', 'spark', 70);
        syncCurrentIslandProgress(w);
        const bothActive = isConstructionBuffActive(w) && isForgeBuffActive(w);
        const newCap = getIslandMaxKingdomLevel(w);
        if (bothActive) {
          showBanner(
            w,
            `REINO NV.${newCap} DESBLOQUEADO!`,
            'Buffs de Construção e Forja ativos — evolua seu Castelo e construções!',
            '#ffe066'
          );
        } else {
          showBanner(
            w,
            kind === 'construction' ? 'BUFF DE CONSTRUÇÃO ATIVO!' : 'BUFF DE FORJA ATIVO!',
            kind === 'construction'
              ? 'Obras e coleta +35% mais rápidas! Ative o Buff de Forja para evoluir o Reino.'
              : 'Forja produz +1 Ferro extra! Ative o Buff de Construção para evoluir o Reino.',
            kind === 'construction' ? '#7ef5ff' : '#ff9b52'
          );
        }
        saveCampaign(w);
      }
    }
    return;
  }

  if (fc.targetType === 'shop') {
    const shop = w.shops.find((s) => s.id === fc.targetId);
    if (shop && isShopUnlocked(w, shop.kind) && shop.stock < shop.maxStock) {
      const shopCost = shop.kind === 'sword' ? 3 : 2;
      shop.coinsPaid += 1;
      if (shop.coinsPaid >= shopCost) {
        shop.coinsPaid = 0;
        shop.built = true;
        shop.stock += 1;
        markActionClassCompleted(w, `shop_${shop.kind}`);
        sound.playBuildComplete();
        spawnBurst(w, shop.x, GROUND_Y - 18, 10, '#f3d478', 'spark', 36);
      }
    }
    return;
  }

  if (fc.targetType === 'farm') {
    const farm = w.farms.find((f) => f.id === fc.targetId);
    if (farm && !farm.underConstruction && isFarmsUnlocked(w)) {
      const fCost = getFarmUpgradeResourceCost(farm.level, w.hall.level, w.currentIsland);
      farm.coinsPaid += 1;
      if (fCost.coins > 0 && farm.coinsPaid >= fCost.coins) {
        if (!hasRequiredMaterials(w, fCost)) {
          farm.coinsPaid = Math.max(0, farm.coinsPaid - 1);
          if (w.monarchs[0]) {
            w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
            w.resources.gold = w.monarchs[0].coins;
          }
          showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, fCost)}`, '#ff8a65');
          return;
        }
        consumeMaterials(w, fCost);
        farm.coinsPaid = 0;
        farm.underConstruction = true;
        farm.buildProgress = 0;
        farm.orderedAt = stampOrderSeq(w);
        markActionClassCompleted(w, farm.level === 0 ? 'farm_build' : 'farm_upgrade');
        sound.playHammer();
      }
    }
    return;
  }

  if (fc.targetType === 'tower') {
    const tower = w.towers.find((tw) => tw.id === fc.targetId);
    if (tower && !tower.underConstruction) {
      const tCost = getTowerUpgradeResourceCost(
        tower.level,
        w.hall.level,
        tower.destroyed,
        tower.previousLevel,
        w.currentIsland
      );
      tower.coinsPaid += 1;
      if (tCost.coins > 0 && tower.coinsPaid >= tCost.coins) {
        if (!hasRequiredMaterials(w, tCost)) {
          tower.coinsPaid = Math.max(0, tower.coinsPaid - 1);
          if (w.monarchs[0]) {
            w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
            w.resources.gold = w.monarchs[0].coins;
          }
          showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, tCost)}`, '#ff8a65');
          return;
        }
        consumeMaterials(w, tCost);
        tower.coinsPaid = 0;
        tower.underConstruction = true;
        tower.buildProgress = 0;
        tower.orderedAt = stampOrderSeq(w);
        tower.targetLevel = tower.destroyed ? Math.max(1, tower.previousLevel) : tower.level + 1;
        markActionClassCompleted(
          w,
          tower.destroyed ? 'tower_reform' : tower.level === 0 ? 'tower_build' : 'tower_upgrade'
        );
        sound.playHammer();
        const hasBuilders = w.villagers.some((v) => v.role === 'builder');
        if (!hasBuilders) {
          showBanner(w, 'CONSTRUTOR NECESSÁRIO', 'Contrate um errante e forje um Martelo!', '#8fd3ff');
        }
      }
    }
    return;
  }

  if (fc.targetType === 'boat_build') {
    if (!w.boat.built && !w.boat.underConstruction) {
      const boatCost = getBoatBuildResourceCost();
      w.boat.coinsPaid = Math.min(boatCost.coins, w.boat.coinsPaid + 1);
      w.boat.buildProgress = Math.min(0.85, (w.boat.coinsPaid / boatCost.coins) * 0.85);
      if (w.boat.coinsPaid >= boatCost.coins) {
        if (!hasRequiredMaterials(w, boatCost)) {
          w.boat.coinsPaid = Math.max(0, w.boat.coinsPaid - 1);
          if (w.monarchs[0]) {
            w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
            w.resources.gold = w.monarchs[0].coins;
          }
          showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, boatCost)}`, '#ff8a65');
          return;
        }
        consumeMaterials(w, boatCost);
        w.boat.underConstruction = true;
        w.boat.orderedAt = stampOrderSeq(w);
        markActionClassCompleted(w, 'boat_build');
        sound.playHammer();
        showBanner(w, 'CASCO DO DRAKKAR PAGO!', 'Seus construtores estão finalizando o barco!', '#efc462');
      }
    }
    return;
  }

  if (fc.targetType === 'dock_build') {
    if (w.dock.required && !w.dock.built && !w.dock.underConstruction) {
      const dockCost = getDockBuildResourceCost(w.currentIsland);
      w.dock.coinsPaid = Math.min(dockCost.coins, w.dock.coinsPaid + 1);
      w.dock.buildProgress = Math.min(0.85, (w.dock.coinsPaid / dockCost.coins) * 0.85);
      if (w.dock.coinsPaid >= dockCost.coins) {
        if (!hasRequiredMaterials(w, dockCost)) {
          w.dock.coinsPaid = Math.max(0, w.dock.coinsPaid - 1);
          if (w.monarchs[0]) {
            w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
            w.resources.gold = w.monarchs[0].coins;
          }
          showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, dockCost)}`, '#ff8a65');
          return;
        }
        consumeMaterials(w, dockCost);
        w.dock.underConstruction = true;
        w.dock.orderedAt = stampOrderSeq(w);
        markActionClassCompleted(w, 'dock_build');
        sound.playHammer();
        showBanner(w, 'PORTO PAGO!', 'Seus construtores estão erguendo o cais!', '#efc462');
      }
    }
    return;
  }

  if (fc.targetType === 'boat_bell') {
    markActionClassCompleted(w, 'boat_bell');
    ringShipBell(w);
    return;
  }

  if (fc.targetType === 'boat_sail') {
    if (w.boat.built && w.dock.built) {
      w.boat.sailCoinsPaid = Math.min(BOAT_SAIL_COST, w.boat.sailCoinsPaid + 1);
      if (w.boat.sailCoinsPaid >= BOAT_SAIL_COST) {
        markActionClassCompleted(w, 'boat_sail');
        sound.playHorn(false);
        syncCurrentIslandProgress(w);
        w.worldMapContext = 'sail';
        w.mode = 'world_map';
      }
    }
    return;
  }

  if (fc.targetType === 'god_shrine' && w.godShrine) {
    const godDef = GOD_DEFS[w.godShrine.godId];
    const lang = getLanguage();
    if (fc.currency === 'diamond' && !w.godShrine.unlocked) {
      w.godShrine.diamondsPaid += 1;
      if (w.godShrine.diamondsPaid >= godDef.diamondCost) {
        w.godShrine.diamondsPaid = godDef.diamondCost;
        w.godShrine.unlocked = true;
        markActionClassCompleted(w, 'god_unlock');
        if (!w.unlockedGods.includes(godDef.id)) w.unlockedGods.push(godDef.id);
        sound.playHorn(false);
        spawnBurst(w, w.godShrine.x, GROUND_Y - 28, 22, godDef.color, 'spark', 65);
        showBanner(
          w,
          `ALTAR DE ${godDef.name.toUpperCase()} LIBERADO!`,
          `Pague ${godDef.coinCost} moedas para invocar · ${godDef.buffDesc[lang]}`,
          godDef.color
        );
        syncCurrentIslandProgress(w);
        saveCampaign(w);
      }
    } else if (fc.currency === 'coin' && w.godShrine.unlocked && w.activeGod !== godDef.id) {
      w.godShrine.coinsPaid += 1;
      if (w.godShrine.coinsPaid >= godDef.coinCost) {
        w.godShrine.coinsPaid = 0;
        w.godShrine.blessed = true;
        w.activeGod = godDef.id;
        markActionClassCompleted(w, 'god_invoke');
        // Apply immediate retroactive boosts for Odin (walls & towers +40% HP) and Thor (warriors + Sword Tents!)
        if (godDef.id === 'odin') {
          for (const wall of w.walls) {
            if (wall.level > 0 && !wall.destroyed) {
              const newMax = getWallMaxHp(wall.level, true);
              wall.hp += Math.max(0, newMax - wall.maxHp);
              wall.maxHp = newMax;
            }
          }
          for (const tower of w.towers) {
            if (tower.level > 0 && !tower.destroyed) {
              const newMax = getTowerMaxHp(tower.level, true);
              tower.hp += Math.max(0, newMax - tower.maxHp);
              tower.maxHp = newMax;
            }
          }
        } else if (godDef.id === 'thor') {
          w.thorActivated = true;
          for (const shop of w.shops) {
            if (shop.kind === 'sword') shop.built = true;
          }
          for (const v of w.villagers) {
            if (v.role === 'warrior') {
              v.maxHp = 86;
              v.hp = Math.min(86, v.hp + 22);
            }
          }
        }
        sound.playHorn(false);
        spawnBurst(w, w.godShrine.x, GROUND_Y - 30, 26, godDef.color, 'spark', 75);
        const extraNote = godDef.id === 'thor' ? ' · Tenda de Espadas desbloqueada!' : '';
        showBanner(
          w,
          `${godDef.name.toUpperCase()} INVOCADO!`,
          `${godDef.title[lang]} — ${godDef.buffDesc[lang]}${extraNote}`,
          godDef.color
        );
        syncCurrentIslandProgress(w);
        saveCampaign(w);
      }
    }
    return;
  }

  if (fc.targetType === 'mount_shrine' && w.mountShrine) {
    const mountDef = MOUNT_DEFS[w.mountShrine.mountId];
    const lang = getLanguage();
    const m = w.monarchs[0];
    if (fc.currency === 'diamond' && !w.mountShrine.unlocked) {
      w.mountShrine.diamondsPaid += 1;
      if (w.mountShrine.diamondsPaid >= mountDef.diamondCost) {
        w.mountShrine.diamondsPaid = mountDef.diamondCost;
        w.mountShrine.unlocked = true;
        markActionClassCompleted(w, 'mount_unlock');
        sound.playHorn(false);
        spawnBurst(w, w.mountShrine.x, GROUND_Y - 24, 20, mountDef.accentColor, 'spark', 60);
        showBanner(
          w,
          `${mountDef.name[lang].toUpperCase()} LIBERADO!`,
          `Pague ${mountDef.coinCost} moedas para domar · ${mountDef.powerDesc[lang]}`,
          mountDef.accentColor
        );
        syncCurrentIslandProgress(w);
        saveCampaign(w);
      }
    } else if (fc.currency === 'coin' && w.mountShrine.unlocked && m) {
      const alreadyTamed = w.unlockedMounts.includes(mountDef.id);
      const coinCost = alreadyTamed ? 2 : mountDef.coinCost;
      w.mountShrine.coinsPaid += 1;
      if (w.mountShrine.coinsPaid >= coinCost) {
        w.mountShrine.coinsPaid = 0;
        m.mount = mountDef.id;
        m.mountPowerCooldown = 0;
        m.flyTimer = 0;
        m.flyY = 0;
        m.roarTimer = 0;
        markActionClassCompleted(w, 'mount_tame');
        if (!w.unlockedMounts.includes(mountDef.id)) w.unlockedMounts.push(mountDef.id);
        sound.playHorn(false);
        spawnBurst(w, w.mountShrine.x, GROUND_Y - 24, 24, mountDef.accentColor, 'spark', 70);
        showBanner(
          w,
          `MONTARIA: ${mountDef.name[lang].toUpperCase()}!`,
          `Shift / ⚡: ${mountDef.powerDesc[lang]}`,
          mountDef.accentColor
        );
        syncCurrentIslandProgress(w);
        saveCampaign(w);
      }
    }
    return;
  }

  if (fc.targetType === 'puzzle' && w.puzzle && !w.puzzle.solved) {
    w.puzzle.coinsPaid += 1;
    if (w.puzzle.coinsPaid >= 3) {
      w.puzzle.solved = true;
      markActionClassCompleted(w, 'puzzle');
      const m = w.monarchs[0];
      const isl = w.islands.find((item) => item.id === w.currentIsland);
      const def = getIslandDef(w.currentIsland);
      const already = isl ? isl.diamondsCollected : 0;
      const grant = Math.max(0, Math.min(w.puzzle.diamondReward, def.maxDiamonds - already));
      if (m && grant > 0) {
        m.diamonds += grant;
        w.resources.diamonds = m.diamonds;
        if (isl) isl.diamondsCollected += grant;
      }
      for (let i = 0; i < 4; i++) {
        spawnCoin(w, w.puzzle.x, GROUND_Y - 14, (Math.random() - 0.5) * 70, -70 - Math.random() * 35, false, 0.3);
      }
      sound.playHorn(false);
      spawnBurst(w, w.puzzle.x, GROUND_Y - 26, 24, '#7ef5ff', 'spark', 72);
      showBanner(
        w,
        'ENIGMA RÚNICO DECIFRADO!',
        `+${grant} diamantes e +4 moedas de ouro desbloqueados!`,
        '#7ef5ff'
      );
      syncCurrentIslandProgress(w);
      saveCampaign(w);
    }
    return;
  }

  if (fc.targetType === 'wall') {
    const wall = w.walls.find((item) => item.id === fc.targetId);
    if (wall && !wall.underConstruction) {
      const wCost = getWallUpgradeResourceCost(
        wall.level,
        w.hall.level,
        wall.destroyed,
        wall.previousLevel,
        w.currentIsland
      );
      wall.coinsPaid += 1;
      if (wCost.coins > 0 && wall.coinsPaid >= wCost.coins) {
        if (!hasRequiredMaterials(w, wCost)) {
          wall.coinsPaid = Math.max(0, wall.coinsPaid - 1);
          if (w.monarchs[0]) {
            w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
            w.resources.gold = w.monarchs[0].coins;
          }
          showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, wCost)}`, '#ff8a65');
          return;
        }
        consumeMaterials(w, wCost);
        wall.coinsPaid = 0;
        wall.underConstruction = true;
        wall.buildProgress = 0;
        wall.orderedAt = stampOrderSeq(w);
        wall.targetLevel = wall.destroyed ? Math.max(1, wall.previousLevel) : wall.level + 1;
        markActionClassCompleted(
          w,
          wall.destroyed ? 'wall_reform' : wall.level === 0 ? 'wall_build' : 'wall_upgrade'
        );
        sound.playHammer();
        const hasBuilders = w.villagers.some((v) => v.role === 'builder');
        if (!hasBuilders) {
          showBanner(w, 'CONSTRUTOR NECESSÁRIO', 'Contrate um errante e forje um Martelo!', '#8fd3ff');
        }
      }
    }
    return;
  }

  if (fc.targetType === 'tree') {
    const tree = w.trees.find((tr) => tr.id === fc.targetId);
    if (tree && !tree.chopped && !tree.marked) {
      tree.marked = true;
      tree.orderedAt = stampOrderSeq(w);
      markActionClassCompleted(w, 'tree');
      sound.playHammer();
      spawnBurst(w, tree.x, GROUND_Y - 18, 6, '#e5c16b', 'spark', 22);
    }
    return;
  }

  if (fc.targetType === 'rock') {
    const rock = w.rocks.find((r) => r.id === fc.targetId);
    if (rock && !rock.mined && !rock.marked) {
      rock.marked = true;
      rock.orderedAt = stampOrderSeq(w);
      markActionClassCompleted(w, 'rock');
      sound.playHammer();
      spawnBurst(w, rock.x, GROUND_Y - 12, 6, '#cfdbe6', 'stone', 24);
    }
    return;
  }

  if (fc.targetType === 'berry_bush') {
    const bush = (w.berryBushes ?? []).find((b) => b.id === fc.targetId);
    if (bush && bush.berries > 0 && !bush.marked) {
      bush.marked = true;
      bush.orderedAt = stampOrderSeq(w);
      markActionClassCompleted(w, 'berry_bush');
      sound.playCoinPickup();
      spawnBurst(w, bush.x, GROUND_Y - 10, 6, '#ff5c7a', 'spark', 22);
    }
    return;
  }

  if (fc.targetType === 'brewery_build') {
    const camp = w.camps.find((c) => c.id === fc.targetId);
    if (camp && camp.isBrewerySite && !camp.isBrewery && !camp.breweryUnderConstruction) {
      camp.breweryCoinsPaid = (camp.breweryCoinsPaid ?? 0) + 1;
      if (camp.breweryCoinsPaid >= BREWERY_BUILD_COST.coins) {
        if (!hasRequiredMaterials(w, BREWERY_BUILD_COST)) {
          camp.breweryCoinsPaid = Math.max(0, camp.breweryCoinsPaid - 1);
          if (w.monarchs[0]) {
            w.monarchs[0].coins = Math.min(w.monarchs[0].maxCoins, w.monarchs[0].coins + 1);
            w.resources.gold = w.monarchs[0].coins;
          }
          showBanner(w, 'RECURSOS INSUFICIENTES', `Falta: ${formatMissingMaterials(w, BREWERY_BUILD_COST)}`, '#ff8a65');
          return;
        }
        consumeMaterials(w, BREWERY_BUILD_COST);
        camp.breweryCoinsPaid = 0;
        camp.breweryUnderConstruction = true;
        camp.breweryBuildProgress = 0;
        camp.orderedAt = stampOrderSeq(w);
        markActionClassCompleted(w, 'brewery_build');
        sound.playHammer();
        showBanner(w, 'CERVEJARIA ENCOMENDADA!', 'Construtores irão transformar a barraca em Cervejaria!', '#f5c469');
      }
    }
    return;
  }

  if (fc.targetType === 'brewery_beer') {
    const camp = w.camps.find((c) => c.id === fc.targetId);
    if (camp && camp.isBrewery && (camp.beerStock ?? 0) < BREWERY_MAX_BEERS) {
      camp.beerCoinsPaid = (camp.beerCoinsPaid ?? 0) + 1;
      if (camp.beerCoinsPaid >= BREWERY_BEER_COST) {
        camp.beerCoinsPaid = 0;
        camp.beerStock = Math.min(BREWERY_MAX_BEERS, (camp.beerStock ?? 0) + 1);
        markActionClassCompleted(w, 'brewery_beer');
        sound.playCoinPickup();
        spawnBurst(w, camp.x, GROUND_Y - 18, 10, '#f7d265', 'spark', 32);
      }
    }
  }
}

function handleCoinDrop(w: WorldState, m: Monarch, promptOverride?: FloatingPrompt | null): void {
  if (m.dropCooldown > 0) return;

  const prompt = promptOverride !== undefined ? promptOverride : w.activePrompt;

  // Do not spend extra coins while the final coin is already jumping into the last slot
  if (prompt && prompt.targetType !== 'banker' && !prompt.blockedReason && prompt.paid + prompt.pending >= prompt.cost) {
    return;
  }

  // Prevent wasting coins on a locked Kingdom upgrade prompt
  if (prompt && prompt.blockedReason) {
    m.dropCooldown = 0.55;
    sound.playHit();
    showBanner(w, prompt.label, prompt.blockedReason, '#ff9b52');
    return;
  }

  // Prevent wasting coins when required wood/stone/iron are missing
  if (prompt && (prompt.woodCost || prompt.stoneCost || prompt.ironCost)) {
    const matCost: ResourceCost = {
      coins: prompt.cost,
      wood: prompt.woodCost ?? 0,
      stone: prompt.stoneCost ?? 0,
      iron: prompt.ironCost ?? 0,
    };
    if (!hasRequiredMaterials(w, matCost)) {
      m.dropCooldown = 0.5;
      sound.playHit();
      showBanner(
        w,
        'RECURSOS INSUFICIENTES',
        `Falta: ${formatMissingMaterials(w, matCost)}`,
        '#ff8a65'
      );
      return;
    }
  }

  const needsDiamond = Boolean(prompt && prompt.currency === 'diamond');

  if (needsDiamond && prompt) {
    if (m.diamonds <= 0) {
      m.dropCooldown = 0.55;
      showBanner(
        w,
        'DIAMANTES NECESSÁRIOS',
        'Abra baús e resolva enigmas rúnicos nas ilhas (máx 5 diamantes/ilha)!',
        '#7ef5ff'
      );
      return;
    }
    m.diamonds -= 1;
    if (m === w.monarchs[0]) w.resources.diamonds = m.diamonds;
    m.dropCooldown = 0.18;
    sound.playCoinDrop();
    const nextSlotIndex = Math.min(prompt.cost - 1, prompt.paid + prompt.pending);
    const slotPos = getSlotWorldPos(prompt, nextSlotIndex);
    w.flyingCoins.push({
      id: uid(w),
      startX: m.x + m.facing * 4,
      startY: GROUND_Y - 16 - m.flyY,
      targetX: slotPos.x,
      targetY: slotPos.y,
      progress: 0,
      duration: 0.34,
      currency: 'diamond',
      targetType: prompt.targetType,
      targetId: prompt.targetId,
    });
    return;
  }

  if (m.coins <= 0) return;

  m.coins -= 1;
  if (m === w.monarchs[0]) w.resources.gold = m.coins;
  m.dropCooldown = prompt?.targetType === 'banker' ? 0.1 : 0.16;
  sound.playCoinDrop();

  // ALWAYS animate the coin jumping from the monarch into the exact command slot!
  if (prompt) {
    const nextSlotIndex = Math.min(Math.max(0, prompt.cost - 1), prompt.paid + prompt.pending);
    const slotPos = getSlotWorldPos(prompt, nextSlotIndex);
    w.flyingCoins.push({
      id: uid(w),
      startX: m.x + m.facing * 4,
      startY: GROUND_Y - 16 - m.flyY,
      targetX: slotPos.x,
      targetY: slotPos.y,
      progress: 0,
      duration: prompt.targetType === 'banker' ? 0.24 : 0.34,
      currency: 'coin',
      targetType: prompt.targetType,
      targetId: prompt.targetId,
    });
    return;
  }

  spawnCoin(
    w,
    m.x + m.facing * 8,
    GROUND_Y - 16 - m.flyY,
    m.vx * 0.25 + m.facing * (18 + Math.random() * 14),
    -58 - Math.random() * 18,
    true,
    0.55
  );
}

export function triggerCoinDrop(w: WorldState): void {
  const m = w.monarchs[0];
  if (!m || w.mode !== 'playing') return;
  w.activePrompt = computeActivePrompt(w, m);
  handleCoinDrop(w, m);
}

export function issueUnitCommand(w: WorldState, mode: CommandMode, targetSide: -1 | 1): void {
  const roleMap: Record<Exclude<CommandMode, 'none'>, VillagerRole> = {
    attack: 'warrior',
    archer: 'archer',
    build: 'builder',
    produce: 'producer',
  };
  if (mode === 'none') return;
  const role = roleMap[mode];
  const labelMap: Record<Exclude<CommandMode, 'none'>, string> = {
    attack: t('role_warrior'),
    archer: t('role_archer'),
    build: t('role_builder'),
    produce: t('role_producer'),
  };

  const candidates = w.villagers
    .filter((v) => v.role === role && v.side !== targetSide && v.state !== 'embarked' && v.state !== 'boarding')
    .sort((a, b) => Math.abs(a.x - CENTER_X) - Math.abs(b.x - CENTER_X));

  const dirText = targetSide < 0 ? t('sent_left') : t('sent_right');
  if (candidates.length > 0) {
    const chosen = candidates[0];
    chosen.side = targetSide;
    chosen.assignedFarmId = null;
    chosen.assignedTowerId = null;
    chosen.orderFlashTimer = 1.8;
    chosen.orderDir = targetSide;
    chosen.actionTimer = 0;
    w.hasOrderedVillager = true;
    sound.playOrder(targetSide);
    spawnBurst(w, chosen.x, GROUND_Y - 18, 6, w.crest.secondaryColor, 'spark', 28);
    w.commandFeedback = {
      mode,
      side: targetSide,
      text: `${labelMap[mode]} ${t('unit_sent')} ${dirText}`,
      timer: 1.6,
    };
  } else {
    const totalOfRole = w.villagers.filter((v) => v.role === role && v.state !== 'embarked').length;
    w.commandFeedback = {
      mode,
      side: targetSide,
      text:
        totalOfRole === 0
          ? `${labelMap[mode]}: ${t('no_unit')}`
          : `${labelMap[mode]}: ${t('all_on_side')} ${dirText}`,
      timer: 1.4,
    };
  }
}

/**
 * Directly assigns a specific recruited villager (excluding wanderers) to the left (-1) or right (+1) side.
 */
export function orderSpecificVillager(w: WorldState, villagerId: number, targetSide: -1 | 1): boolean {
  const v = w.villagers.find(
    (item) => item.id === villagerId && item.role !== 'wanderer' && item.state !== 'embarked' && item.state !== 'boarding'
  );
  if (!v) {
    w.selectedVillagerId = null;
    return false;
  }

  v.side = targetSide;
  v.assignedFarmId = null;
  v.assignedTowerId = null;
  v.targetId = null;
  v.facing = targetSide;
  v.targetX = CENTER_X + targetSide * 95;
  v.orderFlashTimer = 2.0;
  v.orderDir = targetSide;
  v.actionTimer = 0;
  w.selectedVillagerId = null;
  w.hasOrderedVillager = true;

  const roleLabels: Record<VillagerRole, string> = {
    wanderer: t('role_peasant'),
    peasant: t('role_peasant'),
    builder: t('role_builder'),
    warrior: t('role_warrior'),
    archer: t('role_archer'),
    producer: t('role_producer'),
  };
  const dirText = targetSide < 0 ? t('sent_left') : t('sent_right');
  sound.playOrder(targetSide);
  spawnBurst(w, v.x, GROUND_Y - 18, 8, w.crest.secondaryColor, 'spark', 32);
  w.commandFeedback = {
    mode:
      v.role === 'warrior'
        ? 'attack'
        : v.role === 'archer'
          ? 'archer'
          : v.role === 'builder'
            ? 'build'
            : v.role === 'producer'
              ? 'produce'
              : 'none',
    side: targetSide,
    text: `${roleLabels[v.role]} ${t('unit_sent')} ${dirText}`,
    timer: 1.6,
  };
  return true;
}

function stampOrderSeq(w: WorldState): number {
  w.nextOrderSeq = (w.nextOrderSeq ?? 0) + 1;
  return w.nextOrderSeq;
}

function findOrderedTaskX(w: WorldState, kind: BuilderTaskKind, id: number): number | null {
  if (kind === 'wall') {
    const item = w.walls.find((x) => x.id === id && x.underConstruction);
    return item ? item.x : null;
  }
  if (kind === 'tower') {
    const item = w.towers.find((x) => x.id === id && x.underConstruction);
    return item ? item.x : null;
  }
  if (kind === 'forge') {
    return w.forge && w.forge.underConstruction && !w.forge.built ? w.forge.x : null;
  }
  if (kind === 'boat') {
    return w.boat.underConstruction && !w.boat.built ? w.boat.x : null;
  }
  if (kind === 'dock') {
    return w.dock.underConstruction && !w.dock.built ? w.dock.x : null;
  }
  if (kind === 'farm') {
    const item = w.farms.find((x) => x.id === id && x.underConstruction);
    return item ? item.x : null;
  }
  if (kind === 'brewery') {
    const item = w.camps.find((x) => x.id === id && x.breweryUnderConstruction && !x.isBrewery);
    return item ? item.x : null;
  }
  if (kind === 'rock') {
    const item = w.rocks.find((x) => x.id === id && x.marked && !x.mined);
    return item ? item.x : null;
  }
  if (kind === 'tree') {
    const item = w.trees.find((x) => x.id === id && x.marked && !x.chopped);
    return item ? item.x : null;
  }
  return null;
}

/**
 * Toggles manual builder priority on an already-ordered tree, rock, or construction.
 */
export function togglePriorityTask(w: WorldState, kind: BuilderTaskKind, id: number): boolean {
  const tx = findOrderedTaskX(w, kind, id);
  if (tx === null) return false;

  if (w.priorityTask && w.priorityTask.kind === kind && w.priorityTask.id === id) {
    w.priorityTask = null;
    sound.playCoinDrop();
    return true;
  }

  w.priorityTask = { kind, id };
  w.selectedVillagerId = null;
  sound.playOrder(tx < CENTER_X ? -1 : 1);
  spawnBurst(w, tx, GROUND_Y - 22, 10, '#ffe066', 'spark', 36);
  w.commandFeedback = {
    mode: 'build',
    side: tx < CENTER_X ? -1 : 1,
    text: '▼ PRIORIDADE DEFINIDA!',
    timer: 1.5,
  };
  return true;
}

function updateTacticalCommands(w: WorldState, input: InputState, dt: number): void {
  if (w.commandFeedback) {
    w.commandFeedback.timer -= dt;
    if (w.commandFeedback.timer <= 0) w.commandFeedback = null;
  }
  if (w.touchIndicator) {
    w.touchIndicator.timer -= dt;
    if (w.touchIndicator.timer <= 0) w.touchIndicator = null;
  }

  let mode: CommandMode = w.touchCommandMode;
  if (input.cmdZ) mode = 'attack';
  else if (input.cmdX) mode = 'archer';
  else if (input.cmdC) mode = 'build';
  else if (input.cmdV) mode = 'produce';

  w.activeCommand = mode;

  if (mode !== 'none') {
    if (input.leftJustPressed) issueUnitCommand(w, mode, -1);
    if (input.rightJustPressed) issueUnitCommand(w, mode, 1);
  }
}

export function triggerMountPower(w: WorldState): boolean {
  const m = w.monarchs[0];
  if (!m || w.mode !== 'playing' || m.mount === 'starter') return false;
  const def = MOUNT_DEFS[m.mount];
  const lokiCdMult = w.activeGod === 'loki' ? 0.65 : 1.0;

  if (m.mount === 'harpy') {
    if (m.mountPowerCooldown > 0 || m.flyTimer > 0) return false;
    m.flyTimer = 2.6;
    m.flyY = Math.max(m.flyY, 22);
    m.mountPowerCooldown = def.powerCooldown * lokiCdMult;
    sound.playHorn(false);
    spawnBurst(w, m.x, GROUND_Y - 14, 14, '#d4a6ff', 'spark', 55);
    return true;
  }

  if (m.mount === 'wolf') {
    if (m.mountPowerCooldown > 0 || m.exhausted) return false;
    m.mountPowerCooldown = def.powerCooldown * lokiCdMult;
    m.sprinting = true;
    m.vx = m.facing * def.sprintSpeed * (w.activeGod === 'loki' ? 1.25 : 1) * 1.15;
    spawnBurst(w, m.x + m.facing * 12, GROUND_Y - 10, 10, '#98b4cc', 'spark', 45);
    for (let i = w.enemies.length - 1; i >= 0; i--) {
      const e = w.enemies[i];
      if (e.kind === 'hel_crow') continue;
      if (Math.abs(e.x - m.x) < 30) {
        e.hp -= 16;
        e.hitFlash = 0.16;
        e.x += m.facing * 14;
        sound.playHit();
        spawnBurst(w, e.x, GROUND_Y - 12, 8, '#e8f4ff', 'spark', 42);
        if (e.hp <= 0) handleEnemyKilled(w, e);
      }
    }
    return true;
  }

  if (m.mount === 'ice_horse') {
    if (m.mountPowerCooldown > 0) return false;
    m.mountPowerCooldown = def.powerCooldown * lokiCdMult;
    m.roarTimer = 0.65;
    sound.playBuildComplete();
    spawnBurst(w, m.x, GROUND_Y - 16, 22, '#7ef2ff', 'spark', 75);
    for (const e of w.enemies) {
      if (Math.abs(e.x - m.x) <= 155) {
        e.frozenTimer = 10; // Freezes enemies for 10 full seconds!
        e.hitFlash = 0.2;
        spawnBurst(w, e.x, e.y - 12, 6, '#aef7ff', 'spark', 32);
      }
    }
    return true;
  }

  if (m.mount === 'bear') {
    if (m.mountPowerCooldown > 0) return false;
    m.mountPowerCooldown = def.powerCooldown * lokiCdMult;
    m.roarTimer = 0.65;
    w.screenShake = 0.28;
    sound.playHorn(true);
    spawnBurst(w, m.x + m.facing * 16, GROUND_Y - 16, 20, '#ffba52', 'spark', 70);

    // Paw swipe kills 1 nearest enemy instantly; deadly roar pushes & stuns remaining nearby enemies!
    let closest: Enemy | null = null;
    let closestDist = 72;
    for (const e of w.enemies) {
      const d = Math.abs(e.x - m.x);
      if (d < closestDist) {
        closestDist = d;
        closest = e;
      }
    }
    if (closest) {
      handleEnemyKilled(w, closest);
    }
    for (const e of w.enemies) {
      const dx = e.x - m.x;
      if (Math.abs(dx) <= 145) {
        const pushDir = dx >= 0 ? 1 : -1;
        e.x = Math.max(120, Math.min(WORLD_WIDTH - 120, e.x + pushDir * 38));
        e.stunTimer = Math.max(e.stunTimer, 0.9);
        e.hitFlash = 0.2;
        spawnBurst(w, e.x, e.y - 10, 6, '#ffe082', 'spark', 35);
      }
    }
    return true;
  }

  if (m.mount === 'fire_horse') {
    if (m.mountPowerCooldown > 0) return false;
    m.mountPowerCooldown = def.powerCooldown * lokiCdMult;
    for (let step = 1; step <= 3; step++) {
      w.fireTrails.push({
        x: m.x - m.facing * (step * 12),
        life: 3.6,
        maxLife: 3.6,
      });
    }
    sound.playBuildComplete();
    spawnBurst(w, m.x - m.facing * 12, GROUND_Y - 6, 14, '#ff7d38', 'ember', 52);
    return true;
  }

  if (m.mount === 'sleipnir') {
    if (m.mountPowerCooldown > 0) return false;
    m.mountPowerCooldown = def.powerCooldown * lokiCdMult;
    // Prioritize aerial Hel Crows within 240px; fallback to nearest ground enemy within 210px!
    const flyers = w.enemies
      .filter((e) => e.kind === 'hel_crow' && Math.abs(e.x - m.x) <= 240)
      .sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))
      .slice(0, 2);

    const targets =
      flyers.length > 0
        ? flyers
        : w.enemies
            .filter((e) => Math.abs(e.x - m.x) <= 210)
            .sort((a, b) => Math.abs(a.x - m.x) - Math.abs(b.x - m.x))
            .slice(0, 1);

    if (targets.length === 0) {
      // Visual lightning crackle into sky even if no target in range
      w.lightningBolts.push({
        fromX: m.x,
        fromY: GROUND_Y - 26,
        toX: m.x + m.facing * 44,
        toY: GROUND_Y - 68,
        life: 0.3,
      });
      sound.playHit();
      return true;
    }

    for (const target of targets) {
      w.lightningBolts.push({
        fromX: m.x,
        fromY: GROUND_Y - 26,
        toX: target.x,
        toY: target.y - 8,
        life: 0.36,
      });
      target.hp -= 32;
      target.hitFlash = 0.22;
      sound.playHit();
      spawnBurst(w, target.x, target.y - 8, 14, '#ffe58a', 'spark', 65);
      if (target.hp <= 0) handleEnemyKilled(w, target);
    }
    return true;
  }

  return false;
}

function updateMonarch(
  w: WorldState,
  m: Monarch,
  input: InputState,
  dt: number,
  isHostPrimary = true
): void {
  m.dropCooldown = Math.max(0, m.dropCooldown - dt);
  m.hurtCooldown = Math.max(0, m.hurtCooldown - dt);
  m.mountPowerCooldown = Math.max(0, m.mountPowerCooldown - dt);
  m.roarTimer = Math.max(0, m.roarTimer - dt);
  m.wolfBiteCooldown = Math.max(0, m.wolfBiteCooldown - dt);

  const mountDef = MOUNT_DEFS[m.mount] ?? MOUNT_DEFS.starter;
  const lokiSpeedMult = w.activeGod === 'loki' ? 1.25 : 1.0;
  const lokiStaminaMult = w.activeGod === 'loki' ? 0.78 : 1.0;

  // Trigger mount active power via Shift / Attack button
  if (input.powerJustPressed && isHostPrimary) {
    triggerMountPower(w);
  }

  // Harpy smooth aerial elevation while flyTimer > 0
  if (m.flyTimer > 0) {
    m.flyTimer = Math.max(0, m.flyTimer - dt);
    m.flyY = Math.min(48, m.flyY + dt * 165);
  } else if (m.flyY > 0) {
    m.flyY = Math.max(0, m.flyY - dt * 135);
  }

  const commanding = isHostPrimary && w.activeCommand !== 'none';
  const dir = commanding ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) m.facing = dir as 1 | -1;

  const wantsSprint = !commanding && input.sprint && dir !== 0 && !m.exhausted;
  if (wantsSprint) {
    m.sprinting = true;
    m.stamina = Math.max(0, m.stamina - dt * mountDef.staminaDrain * lokiStaminaMult);
    if (m.stamina <= 0.02) {
      m.exhausted = true;
      m.sprinting = false;
    }
  } else {
    m.sprinting = false;
    const regenRate = dir === 0 ? 0.35 : 0.14;
    m.stamina = Math.min(m.maxStamina, m.stamina + dt * regenRate);
    if (m.exhausted && m.stamina >= 0.52) m.exhausted = false;
  }

  const maxSpeed =
    (m.sprinting ? mountDef.sprintSpeed : m.exhausted ? mountDef.trotSpeed * 0.62 : mountDef.trotSpeed) *
    lokiSpeedMult;
  const targetVx = dir * maxSpeed;
  const accel = dir !== 0 ? 440 : 380;
  if (m.vx < targetVx) m.vx = Math.min(targetVx, m.vx + accel * dt);
  if (m.vx > targetVx) m.vx = Math.max(targetVx, m.vx - accel * dt);

  m.x += m.vx * dt;
  m.x = Math.max(120, Math.min(WORLD_WIDTH - 120, m.x));

  // Giant Wolf passive sprint bite: injures ground enemies while continuing to run until tired!
  if (m.mount === 'wolf' && m.sprinting && Math.abs(m.vx) > 65 && m.wolfBiteCooldown <= 0) {
    for (let i = w.enemies.length - 1; i >= 0; i--) {
      const e = w.enemies[i];
      if (e.kind === 'hel_crow') continue;
      if (Math.abs(e.x - m.x) < 20) {
        e.hp -= 15;
        e.hitFlash = 0.16;
        e.x += m.facing * 12;
        m.wolfBiteCooldown = 0.28;
        sound.playHit();
        spawnBurst(w, e.x, GROUND_Y - 12, 8, '#dceeff', 'spark', 40);
        if (e.hp <= 0) handleEnemyKilled(w, e);
        break;
      }
    }
  }

  // Fire Steed passive fire trail while sprinting!
  if (m.mount === 'fire_horse' && m.sprinting && Math.abs(m.vx) > 55 && m.mountPowerCooldown <= 0) {
    w.fireTrails.push({
      x: m.x - m.facing * 13,
      life: 3.5,
      maxLife: 3.5,
    });
    m.mountPowerCooldown = 0.18 * (w.activeGod === 'loki' ? 0.65 : 1);
  }

  const speedAbs = Math.abs(m.vx);
  if (speedAbs > 6) {
    m.animTime += dt * (m.sprinting ? 12.5 : 8);
    if (isHostPrimary && m.flyY <= 2) sound.playHoof(m.sprinting);
    if (m.sprinting && Math.random() < dt * 12) {
      spawnParticle(w, {
        x: m.x - m.facing * 10,
        y: GROUND_Y - 1 - m.flyY,
        vx: -m.facing * (10 + Math.random() * 12),
        vy: -7 - Math.random() * 10,
        size: 2,
        color: m.mount === 'fire_horse' ? '#ff9347' : m.mount === 'ice_horse' ? '#a6f6ff' : '#c9dce8',
        alpha: 0.6,
        life: 0.32,
        maxLife: 0.32,
        kind: m.mount === 'fire_horse' ? 'ember' : 'breath',
      });
    }
  } else {
    m.animTime += dt * 2.0;
  }

  if (m.exhausted && Math.random() < dt * 5) {
    spawnParticle(w, {
      x: m.x + m.facing * 12,
      y: GROUND_Y - 16 - m.flyY,
      vx: m.facing * 10,
      vy: -12,
      size: 2,
      color: '#e2f1fa',
      alpha: 0.7,
      life: 0.45,
      maxLife: 0.45,
      kind: 'breath',
    });
  }

  const vw = w.viewWidth || 480;
  const desiredCam = m.x + m.facing * Math.min(32, vw * 0.08) - vw / 2;
  const clampedCam = Math.max(0, Math.min(WORLD_WIDTH - vw, desiredCam));
  m.cameraX += (clampedCam - m.cameraX) * Math.min(1, dt * 5.2);

  // Open wilderness chests (gold + diamonds up to 5 per island — all diamonds belong to the Host's campaign!)
  for (const chest of w.chests) {
    if (!chest.opened && Math.abs(m.x - chest.x) < 22) {
      chest.opened = true;
      sound.playBuildComplete();
      spawnBurst(w, chest.x, GROUND_Y - 10, 12, '#f7d265', 'spark', 50);
      for (let i = 0; i < chest.coins; i++) {
        spawnCoin(w, chest.x, GROUND_Y - 10, (Math.random() - 0.5) * 90, -70 - Math.random() * 45, false, 0.35);
      }
      if (chest.diamonds > 0) {
        const isl = w.islands.find((item) => item.id === w.currentIsland);
        const def = getIslandDef(w.currentIsland);
        const already = isl ? isl.diamondsCollected : 0;
        const grant = Math.max(0, Math.min(chest.diamonds, def.maxDiamonds - already));
        if (grant > 0) {
          const hostM = w.monarchs[0] ?? m;
          hostM.diamonds += grant;
          w.resources.diamonds = hostM.diamonds;
          if (isl) isl.diamondsCollected += grant;
          spawnBurst(w, chest.x, GROUND_Y - 16, 12, '#7ef5ff', 'spark', 55);
          showBanner(w, 'BAÚ REAL ENCONTRADO!', `+${chest.coins} ouro e +${grant} diamantes!`, '#7ef5ff');
        }
      } else {
        showBanner(w, 'BAÚ DO NORTE ENCONTRADO', `+${chest.coins} moedas de ouro!`);
      }
    }
  }

  // Collect hall treasury coins (deposited by coin-sweeping workers + daily tribute!)
  if (w.hall.storedTaxCoins > 0 && Math.abs(m.x - w.hall.x) < 28 && m.coins < m.maxCoins) {
    const take = Math.min(w.hall.storedTaxCoins, m.maxCoins - m.coins);
    w.hall.storedTaxCoins -= take;
    m.coins += take;
    if (isHostPrimary) w.resources.gold = m.coins;
    sound.playCoinPickup();
    spawnBurst(w, w.hall.x, GROUND_Y - 22, 6, '#f7d265', 'spark', 32);
  }

  // Note: Stored farm coins remain at each farm until full so the Banker collects them every morning!

  // Crown physics
  if (!m.hasCrown && m.crownStolenByEnemyId === null) {
    if (!m.crownGrounded) {
      m.crownVy += 260 * dt;
      m.crownX += m.crownVx * dt;
      m.crownY += m.crownVy * dt;
      if (m.crownY >= GROUND_Y - 3) {
        m.crownY = GROUND_Y - 3;
        m.crownVy *= -0.35;
        m.crownVx *= 0.65;
        if (Math.abs(m.crownVy) < 18) {
          m.crownVy = 0;
          m.crownVx = 0;
          m.crownGrounded = true;
        }
      }
    }
    if (m.hurtCooldown <= 0 && Math.abs(m.x - m.crownX) < 16) {
      m.hasCrown = true;
      m.crownGrounded = false;
      sound.playCoinPickup();
      spawnBurst(w, m.x, GROUND_Y - 22, 10, '#ffde6b', 'spark', 40);
      showBanner(w, 'COROA RECUPERADA!', 'Mantenha moedas na bolsa para se proteger');
    }
  } else if (m.hasCrown) {
    m.crownX = m.x;
    m.crownY = GROUND_Y - 24 - m.flyY;
  }

  if (isHostPrimary) {
    w.activePrompt = computeActivePrompt(w, m);
    if (input.dropJustPressed || (input.drop && m.dropCooldown <= 0)) {
      handleCoinDrop(w, m, w.activePrompt);
    }
  } else if (input.dropJustPressed || (input.drop && m.dropCooldown <= 0)) {
    const guestPrompt = computeActivePrompt(w, m);
    handleCoinDrop(w, m, guestPrompt);
  }
}

function updateFlyingCoins(w: WorldState, dt: number): void {
  const m0 = w.monarchs[0];
  for (let i = w.flyingCoins.length - 1; i >= 0; i--) {
    const fc = w.flyingCoins[i];
    if (fc.targetType === 'banker_withdraw' && m0) {
      fc.targetX = m0.x;
      fc.targetY = GROUND_Y - 16 - m0.flyY;
    } else if (fc.targetType === 'villager_tribute') {
      const targetM = w.monarchs[fc.targetId] ?? m0;
      if (targetM) {
        fc.targetX = targetM.x;
        fc.targetY = GROUND_Y - 18 - targetM.flyY;
      }
      if (fc.progress > 0 && fc.progress < 1 && Math.random() < dt * 26) {
        const p = fc.progress;
        const ease = 1 - Math.pow(1 - p, 2);
        const wx = fc.startX + (fc.targetX - fc.startX) * ease;
        const arcH = 26 + Math.min(18, Math.abs(fc.targetX - fc.startX) * 0.22);
        const wy = fc.startY + (fc.targetY - fc.startY) * ease - Math.sin(p * Math.PI) * arcH;
        spawnParticle(w, {
          x: wx,
          y: wy,
          vx: (Math.random() - 0.5) * 14,
          vy: -6 - Math.random() * 12,
          size: 1.5,
          color: '#ffe58a',
          alpha: 0.9,
          life: 0.28,
          maxLife: 0.28,
          kind: 'spark',
        });
      }
    }
    fc.progress += dt / fc.duration;
    if (fc.progress >= 1) {
      w.flyingCoins.splice(i, 1);
      applyFlyingCoinArrival(w, fc);
    }
  }
}

function updateForgeAndRegrowth(w: WorldState, dt: number): void {
  // 1. Forge smelting queue (Stone + Wood -> Iron)
  if (w.forge && w.forge.built && w.forge.smeltQueue > 0) {
    w.forge.smelting = true;
    const forgeBuffSpeed = isForgeBuffActive(w) ? 1.35 : 1.0;
    w.forge.smeltProgress += (dt / 3.2) * forgeBuffSpeed;
    if (Math.random() < dt * 8) {
      spawnParticle(w, {
        x: w.forge.x + (Math.random() - 0.5) * 10,
        y: GROUND_Y - 18,
        vx: (Math.random() - 0.5) * 14,
        vy: -18 - Math.random() * 18,
        size: Math.random() > 0.5 ? 2 : 1,
        color: Math.random() > 0.4 ? '#ff8f3b' : '#ffe066',
        alpha: 0.9,
        life: 0.5,
        maxLife: 0.5,
        kind: 'ember',
      });
    }
    if (w.forge.smeltProgress >= 1) {
      w.forge.smeltProgress = 0;
      w.forge.smeltQueue = Math.max(0, w.forge.smeltQueue - 1);
      w.forge.smelting = w.forge.smeltQueue > 0;
      const produced = getForgeIronOutput(w);
      w.resources.iron += produced;
      sound.playBuildComplete();
      spawnBurst(w, w.forge.x, GROUND_Y - 18, 12, '#b8d0e6', 'spark', 45);
      showBanner(w, 'FERRO FORJADO!', `+${produced} Ferro adicionado ao estoque!`, '#b8d0e6');
    }
  }

  // 2. Rock & Tree spawning are now driven by idle Swordsmen (excavating rocks) and idle Builders (planting trees)!
  w.rockRegrowQueue = 0;
  w.treeRegrowQueue = 0;
}

function pickProgressiveEnemyKind(w: WorldState, indexInQueue: number): EnemyKind {
  const threat = w.threatLevel;
  if ((w.isBloodMoon && indexInQueue === 0) || (threat >= 7 && indexInQueue === 0 && Math.random() < 0.45)) {
    return 'frost_troll';
  }
  if (threat >= 4 && Math.random() < Math.min(0.3, 0.1 + (threat - 4) * 0.03)) {
    return 'hel_crow'; // Flying aerial enemy!
  }
  if (threat >= 3 && Math.random() < Math.min(0.35, 0.15 + (threat - 3) * 0.035)) {
    return 'draugr_brute';
  }
  if (threat >= 2 && Math.random() < Math.min(0.32, 0.12 + (threat - 2) * 0.03)) {
    return 'wolf_wraith';
  }
  return 'draugr';
}

function spawnProgressiveEnemy(w: WorldState, portalX: number, side: -1 | 1, kind: EnemyKind): void {
  const islandScale = Math.max(0, w.currentIsland - 1) * 0.24;
  const bloodBonus = w.isBloodMoon ? 0.35 : 0;
  const threatScale = 1 + Math.max(0, w.threatLevel - 2) * 0.11 + islandScale + bloodBonus;
  const baseHpMap: Record<EnemyKind, number> = {
    draugr: 18,
    wolf_wraith: 14,
    draugr_brute: 48,
    hel_crow: 16,
    frost_troll: 120,
  };
  const hp = Math.round(baseHpMap[kind] * threatScale);

  const enemy: Enemy = {
    id: uid(w),
    kind,
    x: portalX + (side === -1 ? 10 : -10),
    y: kind === 'hel_crow' ? GROUND_Y - 38 : GROUND_Y,
    vx: 0,
    facing: side === -1 ? 1 : -1,
    hp,
    maxHp: hp,
    side,
    retreating: false,
    stolenLoot: 'none',
    attackCooldown: 0,
    animTime: Math.random() * 5,
    hitFlash: 0,
    frozenTimer: 0,
    stunTimer: 0,
  };
  w.enemies.push(enemy);
  spawnBurst(w, portalX, enemy.y - 16, 8, kind === 'frost_troll' ? '#9ef5ff' : '#7cf7ff', 'shadow', 35);
}

function canFirstNightBegin(w: WorldState): boolean {
  if (w.day > 1 || w.currentIsland > 1) return true;
  const fireLit = w.hall.level >= 1;
  const palisadeBuilt = w.walls.some((wall) => wall.level >= 1);
  const archerHired = w.villagers.some((v) => v.role === 'archer');
  const tutorialDone = !w.tutorial || !w.tutorial.active || w.tutorial.step === 'farewell';
  const orderingLearned = Boolean(w.hasOrderedVillager) || !w.tutorial?.active;
  return fireLit && palisadeBuilt && archerHired && tutorialDone && orderingLearned;
}

function updateDayNightAndWaves(w: WorldState, dt: number): void {
  const prevTime = w.timeOfDay;
  // Configurable Day/Night duration: 1..6 minutes each -> full cycle = dayHalfMinutes * 120 seconds!
  const cycleDuration = Math.max(1, Math.min(6, w.dayHalfMinutes || 3)) * 120;
  w.timeOfDay += dt / cycleDuration;

  // First night only arrives after campfire lit, palisade built, archer hired, and ghost ordering lesson completed!
  if (w.day === 1 && w.currentIsland === 1 && !canFirstNightBegin(w) && w.timeOfDay > 0.41) {
    w.timeOfDay = 0.41;
  }

  if (w.timeOfDay >= 1) {
    w.timeOfDay -= 1;
    w.day += 1;
    w.stats.daysSurvived = w.day;
    w.waveTriggeredTonight = false;
    w.nightWaveStage = 0;

    // Blood Moons occur strictly every 15 days and mark climate/season transitions!
    w.isBloodMoon = w.day % 15 === 0;
    const prevSeason = w.season;
    const nextSeason = getSeasonForDay(w.day);
    w.season = nextSeason;
    const seasonChanged = nextSeason !== prevSeason;
    const seasonMod = getSeasonModifiers(w.season);
    const coinDiffMult = getIslandCoinDifficultyMult(w.currentIsland);

    // Update seasonal Berry Bushes (bloom in Winter & Spring; dormant in Summer & Autumn)
    for (const bush of w.berryBushes ?? []) {
      if (seasonMod.hasBerries) {
        if (w.season === 'spring') {
          bush.berries = 4;
        } else {
          // Winter: initial bloom of 3, gentle daily replenishment up to 3
          bush.berries = seasonChanged ? 3 : Math.min(3, bush.berries + 1);
        }
      } else {
        bush.berries = 0;
        bush.marked = false;
        bush.forageProgress = 0;
      }
    }

    w.threatLevel = computeThreatLevel(w);
    sound.playHorn(false);

    // 1. BANKER DAILY INTEREST (1% to 10% per day depending on Kingdom level!)
    let bankInterest = 0;
    if (w.hall.level >= 1 && w.banker.balance > 0) {
      const ratePct = getBankerDailyRatePct(w.hall.level);
      w.banker.interestFraction += w.banker.balance * (ratePct / 100);
      bankInterest = Math.floor(w.banker.interestFraction);
      w.banker.interestFraction -= bankInterest;
      w.banker.balance += bankInterest;
      w.banker.lastDayYield = bankInterest;
    } else {
      w.banker.lastDayYield = 0;
    }

    // 2. Passive Hall tribute (zero in harsh Winter; tighter on Island 2+)
    if (w.hall.level >= 2 && seasonMod.farm > 0) {
      const rawTribute = Math.min(18, 1 + w.hall.level * 1.5);
      const tribute = Math.max(1, Math.round(rawTribute * coinDiffMult * Math.min(1.2, seasonMod.farm)));
      w.hall.storedTaxCoins = Math.min(80, w.hall.storedTaxCoins + tribute);
    }

    // 3. DAILY FARM GENERATION:
    // - ZERO in Winter!
    // - Scaled by season (low in Autumn, high in Spring), Island 2+ difficulty, and Freya (+50%)
    // - Stored inside farm.storedCoins up to storageCap so full farms are collected by the Banker each morning!
    const freyaMult = w.activeGod === 'freya' ? 1.5 : 1.0;
    let farmCoinsGenerated = 0;
    if (seasonMod.farm > 0) {
      for (const farm of w.farms) {
        if (farm.level <= 0) continue;
        const maxFarmers = getFarmMaxFarmers(farm.level);
        const farmersHere = Math.min(maxFarmers, countFarmersAssignedToFarm(w, farm.id));
        if (farmersHere <= 0) continue;
        const rawYield = farmersHere * (1 + farm.level * 0.78) * freyaMult * seasonMod.farm * coinDiffMult;
        const yieldCoins = Math.max(1, Math.round(rawYield));
        const storageCap = getFarmStorageCap(farm.level);
        const before = farm.storedCoins;
        farm.storedCoins = Math.min(storageCap, farm.storedCoins + yieldCoins);
        farmCoinsGenerated += Math.max(0, farm.storedCoins - before);
        farm.storedFood = Math.min(storageCap, farm.storedFood + Math.max(1, Math.round(farmersHere * farm.level * seasonMod.farm)));
      }
    }

    // 4. Kick off Banker morning farm collection round (LEFT full farms -> Bank -> RIGHT full farms -> Bank)
    if (w.hall.level >= 1) {
      w.banker.walkX = w.banker.walkX ?? w.banker.x;
      w.banker.phase = 'left_sweep';
      w.banker.targetFarmId = null;
    }

    // 5. Resource renewal is driven by idle workers (Builders plant trees, Swordsmen excavate rocks, Trees spawn wildlife)
    w.rockRegrowQueue = 0;
    w.treeRegrowQueue = 0;

    for (const enemy of w.enemies) enemy.retreating = true;

    // 6. Declining natural vagrant spawns (progressively fewer & spaced further apart by day & island difficulty!)
    const spawnIntervalDays = Math.max(1, Math.floor(1 + (w.currentIsland - 1) * 0.9 + Math.floor(w.day / 7)));
    const campWandererCap = w.currentIsland === 1 && w.day <= 6 ? 2 : 1;
    for (const camp of w.camps) {
      if (!camp.active || camp.isBrewery) continue;
      camp.daysSinceSpawn = (camp.daysSinceSpawn ?? 0) + 1;
      if (camp.daysSinceSpawn < spawnIntervalDays) continue;
      const nearbyWanderers = w.villagers.filter(
        (v) => v.role === 'wanderer' && v.homeCampId === camp.id
      ).length;
      if (nearbyWanderers < campWandererCap) {
        camp.daysSinceSpawn = 0;
        w.villagers.push({
          id: uid(w),
          x: camp.x + (Math.random() - 0.5) * 28,
          y: GROUND_Y,
          vx: 0,
          facing: Math.random() > 0.5 ? 1 : -1,
          role: 'wanderer',
          state: 'wandering',
          hp: 20,
          maxHp: 20,
          targetX: camp.x,
          targetId: null,
          homeCampId: camp.id,
          assignedFarmId: null,
          assignedTowerId: null,
          side: camp.x < CENTER_X ? -1 : 1,
          actionTimer: 2,
          animTime: 0,
          carriedCoins: 0,
          orderFlashTimer: 0,
          orderDir: 0,
        });
      }
    }

    const notes: string[] = [];
    if (bankInterest > 0) notes.push(`Banco +${bankInterest}🪙 (${getBankerDailyRatePct(w.hall.level)}%)`);
    if (farmCoinsGenerated > 0) notes.push(`Fazendas +${farmCoinsGenerated}🪙`);
    const extraNotes = notes.length > 0 ? ` · ${notes.join(' · ')}` : '';
    const seasonName = getSeasonLabel(w.season);

    if (seasonChanged) {
      const seasonDesc: Record<Season, string> = {
        summer: 'Alta produção de animais e árvores · Baixa produção de pedras',
        autumn: 'Alta produção de árvores e animais · Baixa produção de fazendas',
        winter: 'Zero fazendas! Colha frutinhas e pesque no rio para sobreviver',
        spring: 'Alta produção de fazendas, animais, árvores e frutinhas!',
      };
      showBanner(
        w,
        `NOVA ESTAÇÃO: ${seasonName} · ${t('day_short')} ${w.day}`,
        `${seasonDesc[w.season]}${extraNotes}`,
        w.season === 'winter' ? '#8fd8ff' : w.season === 'autumn' ? '#f09c42' : w.season === 'spring' ? '#7ce88c' : '#ffd86b'
      );
    } else {
      showBanner(
        w,
        w.isBloodMoon
          ? `${t('day_short')} ${w.day} — LUA DE SANGUE (${seasonName})`
          : `${t('day_short')} ${w.day} · ${seasonName} · ${t('threat_lbl')} ${w.threatLevel}`,
        w.isBloodMoon
          ? `Mudança de clima iminente! Ameaça Nv.${w.threatLevel} à noite${extraNotes}`
          : `Reino Nv.${w.hall.level}${extraNotes || ` · Dia de ${w.dayHalfMinutes} min`}`,
        w.isBloodMoon ? '#ff6b6b' : w.crest.secondaryColor
      );
    }
    syncCurrentIslandProgress(w);
    saveCampaign(w);
  }

  w.isNight = w.timeOfDay >= 0.5 && w.timeOfDay < 0.98;
  w.threatLevel = computeThreatLevel(w);
  sound.setNightMood(w.isNight);

  const isFirstNightPeaceful = w.day === 1 && w.currentIsland === 1;

  if (prevTime < 0.47 && w.timeOfDay >= 0.47) {
    if (isFirstNightPeaceful) {
      sound.playHorn(false);
      showBanner(w, t('first_night_peace'), t('first_night_sub'), '#ffe58a');
    } else {
      sound.playHorn(true);
      showBanner(
        w,
        w.isBloodMoon ? `LUA DE SANGUE · ${t('threat_lbl')} ${w.threatLevel}` : `NOITE ${w.day} · ${t('threat_lbl')} ${w.threatLevel}`,
        w.isBloodMoon
          ? 'A Lua de Sangue anuncia mudança de estação e invasão massiva!'
          : 'Ataques mais fortes a cada noite — os portais de Helheim se abrem!',
        w.isBloodMoon ? '#ff5e6c' : '#8cc8ff'
      );
    }
  }

  // Progressive Night Sub-Waves scaled by threatLevel & Island difficulty!
  // Attacks ONLY begin AFTER the first night (Day 2+ on Island 1, or any night on Island 2+)
  const queueSubWave = (multiplier: number) => {
    if (isFirstNightPeaceful) return;
    const islandBonus = Math.max(0, w.currentIsland - 1) * 0.22;
    const bloodBonus = w.isBloodMoon ? 1.45 : 1.0;
    const baseCount = Math.min(18, Math.max(1, Math.round((1 + w.threatLevel * 0.92) * (1 + islandBonus) * multiplier * bloodBonus)));
    for (const portal of w.portals) {
      if (portal.destroyed) continue;
      portal.spawnQueue += Math.max(1, Math.floor(baseCount * (0.78 + Math.random() * 0.44)));
      portal.spawnCooldown = Math.max(0.55, 1.15 - w.currentIsland * 0.06) + Math.random() * 1.1;
    }
  };

  if (!isFirstNightPeaceful && w.isNight && w.nightWaveStage === 0 && w.timeOfDay >= 0.51) {
    w.waveTriggeredTonight = true;
    queueSubWave(1.0);
    w.nightWaveStage = 1;
  } else if (!isFirstNightPeaceful && w.isNight && w.nightWaveStage === 1 && w.timeOfDay >= 0.65) {
    queueSubWave(w.threatLevel <= 2 ? 0.65 : 0.95);
    w.nightWaveStage = 2;
  } else if (!isFirstNightPeaceful && w.isNight && w.nightWaveStage === 2 && w.timeOfDay >= 0.78 && w.threatLevel >= 3) {
    queueSubWave(1.0);
    w.nightWaveStage = 3;
  } else if (!isFirstNightPeaceful && w.isNight && w.nightWaveStage === 3 && w.timeOfDay >= 0.88 && (w.currentIsland >= 2 || w.isBloodMoon)) {
    queueSubWave(0.9);
    w.nightWaveStage = 4;
  }

  for (const portal of w.portals) {
    portal.pulseTime += dt;
    portal.hitFlash = Math.max(0, portal.hitFlash - dt);
    if (portal.destroyed) continue;

    if (portal.spawnQueue > 0 && w.isNight) {
      portal.spawnCooldown -= dt;
      if (portal.spawnCooldown <= 0) {
        portal.spawnQueue -= 1;
        portal.spawnCooldown = Math.max(0.55, 1.3 - w.threatLevel * 0.05) + Math.random() * 0.85;
        const kind = pickProgressiveEnemyKind(w, portal.spawnQueue);
        spawnProgressiveEnemy(w, portal.x, portal.side, kind);
      }
    }
  }
}

/**
 * Banker Morning Farm Collection Rounds:
 * Every morning, visits ALL full LEFT-side farms -> returns & deposits in Bank
 * -> visits ALL full RIGHT-side farms -> returns & deposits in Bank.
 * Only visits farms when they have reached their coin storage cap!
 */
function updateBanker(w: WorldState, dt: number): void {
  const b = w.banker;
  if (b.walkX === undefined) b.walkX = b.x;
  if (b.facing === undefined) b.facing = 1;
  if (b.animTime === undefined) b.animTime = 0;
  if (b.carriedCoins === undefined) b.carriedCoins = 0;
  if (!b.phase) b.phase = 'idle';

  if (w.hall.level < 1) {
    b.walkX = b.x;
    b.phase = 'idle';
    return;
  }

  const walkBankerToward = (targetX: number, speed: number): boolean => {
    const dx = targetX - (b.walkX ?? b.x);
    if (Math.abs(dx) <= Math.max(2, speed * dt)) {
      b.walkX = targetX;
      return true;
    }
    b.facing = dx > 0 ? 1 : -1;
    b.walkX = (b.walkX ?? b.x) + b.facing * speed * dt;
    b.animTime = (b.animTime ?? 0) + dt * 8.5;
    return false;
  };

  const depositAtVault = () => {
    if ((b.carriedCoins ?? 0) > 0) {
      b.balance += b.carriedCoins ?? 0;
      b.carriedCoins = 0;
      sound.playCoinPickup();
      spawnBurst(w, b.x, GROUND_Y - 16, 10, '#f7d265', 'spark', 36);
    }
  };

  // Return to vault safely before nightfall
  const isEveningOrNight = w.timeOfDay >= 0.45 && w.timeOfDay < 0.98;
  if (isEveningOrNight && b.phase !== 'idle') {
    if (walkBankerToward(b.x, 58)) {
      depositAtVault();
      b.phase = 'idle';
      b.targetFarmId = null;
    }
    return;
  }

  if (b.phase === 'idle') {
    if (Math.abs((b.walkX ?? b.x) - b.x) > 2) {
      walkBankerToward(b.x, 48);
    } else {
      b.walkX = b.x;
      b.animTime = (b.animTime ?? 0) + dt * 2;
    }
    return;
  }

  const isFarmFull = (f: WorldState['farms'][number]) =>
    f.level >= 1 && f.storedCoins >= getFarmStorageCap(f.level);

  if (b.phase === 'left_sweep') {
    const fullLeft = w.farms
      .filter((f) => f.side === -1 && isFarmFull(f))
      .sort((a, c) => Math.abs(a.x - (b.walkX ?? b.x)) - Math.abs(c.x - (b.walkX ?? b.x)))[0];
    if (fullLeft) {
      b.targetFarmId = fullLeft.id;
      if (walkBankerToward(fullLeft.x, 48)) {
        b.carriedCoins = (b.carriedCoins ?? 0) + fullLeft.storedCoins;
        fullLeft.storedCoins = 0;
        sound.playCoinPickup();
        spawnBurst(w, fullLeft.x, GROUND_Y - 14, 8, '#f7d265', 'spark', 32);
      }
    } else {
      b.targetFarmId = null;
      b.phase = (b.carriedCoins ?? 0) > 0 || Math.abs((b.walkX ?? b.x) - b.x) > 4 ? 'return_from_left' : 'right_sweep';
    }
    return;
  }

  if (b.phase === 'return_from_left') {
    if (walkBankerToward(b.x, 52)) {
      depositAtVault();
      b.phase = 'right_sweep';
    }
    return;
  }

  if (b.phase === 'right_sweep') {
    const fullRight = w.farms
      .filter((f) => f.side === 1 && isFarmFull(f))
      .sort((a, c) => Math.abs(a.x - (b.walkX ?? b.x)) - Math.abs(c.x - (b.walkX ?? b.x)))[0];
    if (fullRight) {
      b.targetFarmId = fullRight.id;
      if (walkBankerToward(fullRight.x, 48)) {
        b.carriedCoins = (b.carriedCoins ?? 0) + fullRight.storedCoins;
        fullRight.storedCoins = 0;
        sound.playCoinPickup();
        spawnBurst(w, fullRight.x, GROUND_Y - 14, 8, '#f7d265', 'spark', 32);
      }
    } else {
      b.targetFarmId = null;
      b.phase = (b.carriedCoins ?? 0) > 0 || Math.abs((b.walkX ?? b.x) - b.x) > 4 ? 'return_from_right' : 'idle';
    }
    return;
  }

  if (b.phase === 'return_from_right') {
    if (walkBankerToward(b.x, 52)) {
      depositAtVault();
      b.phase = 'idle';
    }
  }
}

/**
 * Handles:
 * 1. Built Drakkar sliding/dropping into the fjord water and floating.
 * 2. Embarked archers & warriors attacking enemies passing near the boat.
 * 3. Built Breweries stocked with beer automatically attracting wanderers from BOTH sides of the map.
 */
function updateBoatAndBreweries(w: WorldState, dt: number): void {
  // 1. Boat launch animation into water
  if (w.boat.built) {
    const prevDrop = w.boat.waterDropProgress ?? 0;
    if (prevDrop < 1) {
      const nextDrop = Math.min(1, prevDrop + dt * 0.85);
      w.boat.waterDropProgress = nextDrop;
      if (prevDrop < 0.72 && nextDrop >= 0.72) {
        sound.playCoinPickup();
        spawnBurst(w, w.boat.x, GROUND_Y + 6, 18, '#a6e4ff', 'breath', 52);
      }
    }

    // 2. Embarked crew defense (archers shoot passing enemies, warriors strike nearby ground enemies!)
    w.boat.attackCooldown = Math.max(0, (w.boat.attackCooldown ?? 0) - dt);
    if (w.boat.attackCooldown <= 0 && w.enemies.length > 0) {
      let attacked = false;

      if (w.boat.crewArchers > 0) {
        let bestEnemy: Enemy | null = null;
        let bestDist = 205;
        for (const e of w.enemies) {
          const d = Math.abs(e.x - w.boat.x);
          if (d < bestDist) {
            bestDist = d;
            bestEnemy = e;
          }
        }
        if (bestEnemy) {
          const shots = Math.min(2, w.boat.crewArchers);
          for (let s = 0; s < shots; s++) {
            const aimY = bestEnemy.kind === 'hel_crow' ? bestEnemy.y - 4 : GROUND_Y - 10;
            fireArrow(
              w,
              w.boat.x + (s === 0 ? -6 : 6),
              GROUND_Y - 10,
              bestEnemy.x + bestEnemy.vx * 0.18,
              aimY,
              12
            );
          }
          w.boat.attackCooldown = Math.max(0.35, 0.85 - w.boat.crewArchers * 0.1);
          attacked = true;
        }
      }

      if (w.boat.crewWarriors > 0) {
        let closeGroundEnemy: Enemy | null = null;
        let closeDist = 60;
        for (const e of w.enemies) {
          if (e.kind === 'hel_crow') continue;
          const d = Math.abs(e.x - w.boat.x);
          if (d < closeDist) {
            closeDist = d;
            closeGroundEnemy = e;
          }
        }
        if (closeGroundEnemy) {
          const dmg = (w.activeGod === 'thor' ? 20 : 14) * Math.min(2, w.boat.crewWarriors);
          closeGroundEnemy.hp -= dmg;
          closeGroundEnemy.hitFlash = 0.14;
          sound.playHit();
          spawnBurst(w, closeGroundEnemy.x, GROUND_Y - 12, 8, '#ffd15c', 'spark', 40);
          if (closeGroundEnemy.hp <= 0) handleEnemyKilled(w, closeGroundEnemy);
          if (!attacked) {
            w.boat.attackCooldown = Math.max(0.4, 0.78 - w.boat.crewWarriors * 0.08);
          }
        }
      }
    }
  }

  // 3. Built Breweries with beer stock attract fresh wanderers from both sides of the map!
  if (!w.isNight) {
    const stockedBreweries = w.camps.filter((c) => c.isBrewery && (c.beerStock ?? 0) > 0);
    if (stockedBreweries.length > 0) {
      const activeWanderers = w.villagers.filter((v) => v.role === 'wanderer').length;
      for (const brew of stockedBreweries) {
        brew.breweryAttractTimer = (brew.breweryAttractTimer ?? 0) + dt;
        if (brew.breweryAttractTimer >= 16 && activeWanderers < 4) {
          brew.breweryAttractTimer = 0;
          // Draw wanderer from either left or right far edge (alternating sides!)
          const spawnFromLeft = Math.random() < 0.5;
          const edgeX = spawnFromLeft ? 230 : WORLD_WIDTH - 230;
          w.villagers.push({
            id: uid(w),
            x: edgeX,
            y: GROUND_Y,
            vx: 0,
            facing: spawnFromLeft ? 1 : -1,
            role: 'wanderer',
            state: 'seeking_coin',
            hp: 20,
            maxHp: 20,
            targetX: brew.x,
            targetId: brew.id,
            homeCampId: brew.id,
            assignedFarmId: null,
            assignedTowerId: null,
            side: brew.x < CENTER_X ? -1 : 1,
            actionTimer: 2,
            animTime: 0,
            carriedCoins: 0,
            orderFlashTimer: 0,
            orderDir: 0,
          });
        }
      }
    }
  }
}

function moveToward(
  entity: { x: number; vx: number; facing: 1 | -1 },
  targetX: number,
  speed: number,
  dt: number
): boolean {
  const dx = targetX - entity.x;
  if (Math.abs(dx) <= Math.max(2, speed * dt)) {
    entity.vx = 0;
    return true;
  }
  entity.facing = dx > 0 ? 1 : -1;
  entity.vx = entity.facing * speed;
  entity.x += entity.vx * dt;
  return false;
}

function pickBalancedSide(w: WorldState, role: VillagerRole): -1 | 1 {
  let left = 0;
  let right = 0;
  for (const v of w.villagers) {
    if (v.role === role && v.state !== 'embarked') {
      if (v.side === -1) left++;
      else right++;
    }
  }
  return left <= right ? -1 : 1;
}

function deliverCarriedCoinsToBanker(w: WorldState, v: Villager, dt: number): boolean {
  if (v.carriedCoins <= 0) return false;
  v.state = 'returning_coins';
  const useBanker = w.hall.level >= 1;
  const targetX = useBanker ? w.banker.x : w.hall.x;
  if (moveToward(v, targetX, 50, dt)) {
    if (useBanker) {
      w.banker.balance += v.carriedCoins;
    } else {
      w.hall.storedTaxCoins = Math.min(60, w.hall.storedTaxCoins + v.carriedCoins);
    }
    v.carriedCoins = 0;
    sound.playCoinPickup();
    spawnBurst(w, targetX, GROUND_Y - 16, 6, '#ffe066', 'spark', 26);
    v.state = 'idle';
  }
  return true;
}

function trySweepCoinsToBanker(w: WorldState, v: Villager, dt: number, isNightTime: boolean): boolean {
  // If already carrying coins, check if another loose coin is right nearby (< 42px) before heading to Banker
  if (v.carriedCoins > 0) {
    if (!isNightTime && v.carriedCoins < 5) {
      let nearbyCoin: Coin | null = null;
      let nearbyDist = 42;
      for (const c of w.coins) {
        if (!c.grounded) continue;
        if (c.claimedById !== null && c.claimedById !== v.id) continue;
        const nearWanderer =
          c.fromMonarch &&
          c.age < 5 &&
          w.villagers.some((o) => o.role === 'wanderer' && Math.abs(o.x - c.x) < 95);
        if (nearWanderer) continue;
        const d = Math.abs(c.x - v.x);
        if (d < nearbyDist) {
          nearbyDist = d;
          nearbyCoin = c;
        }
      }
      if (nearbyCoin) {
        nearbyCoin.claimedById = v.id;
        v.state = 'seeking_coin';
        if (moveToward(v, nearbyCoin.x, 52, dt)) {
          const idx = w.coins.indexOf(nearbyCoin);
          if (idx >= 0) w.coins.splice(idx, 1);
          v.carriedCoins += 1;
          sound.playCoinPickup();
        }
        return true;
      }
    }
    return deliverCarriedCoinsToBanker(w, v, dt);
  }

  if (isNightTime) return false;

  // Sweep the map for loose dropped coins (excluding coins dropped right next to unhired wanderers)
  let bestCoin: Coin | null = null;
  let bestDist = 1100;
  for (const c of w.coins) {
    if (!c.grounded) continue;
    if (c.claimedById !== null && c.claimedById !== v.id) continue;
    const nearWanderer =
      c.fromMonarch &&
      c.age < 5 &&
      w.villagers.some((o) => o.role === 'wanderer' && Math.abs(o.x - c.x) < 95);
    if (nearWanderer) continue;
    const d = Math.abs(c.x - v.x);
    if (d < bestDist) {
      bestDist = d;
      bestCoin = c;
    }
  }

  if (bestCoin) {
    bestCoin.claimedById = v.id;
    v.state = 'seeking_coin';
    if (moveToward(v, bestCoin.x, 52, dt)) {
      const idx = w.coins.indexOf(bestCoin);
      if (idx >= 0) w.coins.splice(idx, 1);
      v.carriedCoins += 1;
      sound.playCoinPickup();
    }
    return true;
  }

  return false;
}

interface ActiveBuilderTask {
  kind: BuilderTaskKind;
  id: number;
  x: number;
  side: -1 | 1;
  orderedAt: number;
}

function clearPriorityIfMatches(w: WorldState, kind: BuilderTaskKind, id: number): void {
  if (w.priorityTask && w.priorityTask.kind === kind && w.priorityTask.id === id) {
    w.priorityTask = null;
  }
}

/**
 * Assigns every available builder to an active ordered task:
 * - If the player manually prioritized a task (clicked it -> downward arrow ▼), builders on that side
 *   (and idle builders from the other side) focus on it first.
 * - Otherwise, tasks on each side are ordered strictly in FIFO contraction order (`orderedAt` ascending),
 *   and multiple builders on the same side automatically split across those tasks in order!
 */
function buildBuilderTaskAssignments(
  w: WorldState,
  isEveningOrNight: boolean
): Map<number, ActiveBuilderTask> {
  const tasks: ActiveBuilderTask[] = [];

  for (const wall of w.walls) {
    if (wall.underConstruction && (!isEveningOrNight || Math.abs(wall.x - CENTER_X) < 340)) {
      tasks.push({
        kind: 'wall',
        id: wall.id,
        x: wall.x,
        side: wall.x < CENTER_X ? -1 : 1,
        orderedAt: wall.orderedAt ?? wall.id,
      });
    }
  }
  for (const tw of w.towers) {
    if (tw.underConstruction && (!isEveningOrNight || Math.abs(tw.x - CENTER_X) < 340)) {
      tasks.push({
        kind: 'tower',
        id: tw.id,
        x: tw.x,
        side: tw.x < CENTER_X ? -1 : 1,
        orderedAt: tw.orderedAt ?? tw.id,
      });
    }
  }
  if (w.forge && w.forge.underConstruction && !w.forge.built) {
    tasks.push({
      kind: 'forge',
      id: 0,
      x: w.forge.x,
      side: w.forge.x < CENTER_X ? -1 : 1,
      orderedAt: w.forge.orderedAt ?? 0,
    });
  }
  if (w.boat.underConstruction && !w.boat.built && !isEveningOrNight) {
    tasks.push({
      kind: 'boat',
      id: 0,
      x: w.boat.x,
      side: w.boat.x < CENTER_X ? -1 : 1,
      orderedAt: w.boat.orderedAt ?? 0,
    });
  }
  if (w.dock.underConstruction && !w.dock.built && !isEveningOrNight) {
    tasks.push({
      kind: 'dock',
      id: 0,
      x: w.dock.x,
      side: w.dock.x < CENTER_X ? -1 : 1,
      orderedAt: w.dock.orderedAt ?? 0,
    });
  }
  for (const farm of w.farms) {
    if (farm.underConstruction) {
      tasks.push({
        kind: 'farm',
        id: farm.id,
        x: farm.x,
        side: farm.x < CENTER_X ? -1 : 1,
        orderedAt: farm.orderedAt ?? farm.id,
      });
    }
  }
  for (const camp of w.camps) {
    if (camp.breweryUnderConstruction && !camp.isBrewery && !isEveningOrNight) {
      tasks.push({
        kind: 'brewery',
        id: camp.id,
        x: camp.x,
        side: camp.x < CENTER_X ? -1 : 1,
        orderedAt: camp.orderedAt ?? camp.id,
      });
    }
  }
  if (!isEveningOrNight) {
    for (const r of w.rocks) {
      if (r.marked && !r.mined) {
        tasks.push({
          kind: 'rock',
          id: r.id,
          x: r.x,
          side: r.x < CENTER_X ? -1 : 1,
          orderedAt: r.orderedAt ?? r.id,
        });
      }
    }
    for (const tr of w.trees) {
      if (tr.marked && !tr.chopped) {
        tasks.push({
          kind: 'tree',
          id: tr.id,
          x: tr.x,
          side: tr.x < CENTER_X ? -1 : 1,
          orderedAt: tr.orderedAt ?? tr.id,
        });
      }
    }
  }

  // Clear stale priority if that task has already finished (or check if still active anywhere even at night)
  if (w.priorityTask && findOrderedTaskX(w, w.priorityTask.kind, w.priorityTask.id) === null) {
    w.priorityTask = null;
  }

  const prioTask = w.priorityTask
    ? tasks.find((tk) => tk.kind === w.priorityTask!.kind && tk.id === w.priorityTask!.id) ?? null
    : null;

  const byOrder = (a: ActiveBuilderTask, b: ActiveBuilderTask) => a.orderedAt - b.orderedAt || a.id - b.id;
  const leftTasks = tasks.filter((tk) => tk.side === -1).sort(byOrder);
  const rightTasks = tasks.filter((tk) => tk.side === 1).sort(byOrder);

  const activeBuilders = w.villagers
    .filter((v) => v.role === 'builder' && v.state !== 'embarked' && v.state !== 'boarding')
    .sort((a, b) => a.id - b.id);

  const leftBuilders = activeBuilders.filter((v) => v.side === -1);
  const rightBuilders = activeBuilders.filter((v) => v.side === 1);

  const assignments = new Map<number, ActiveBuilderTask>();

  const assignSide = (
    builders: Villager[],
    side: -1 | 1,
    ownTasks: ActiveBuilderTask[],
    otherTasks: ActiveBuilderTask[]
  ) => {
    if (builders.length === 0) return;

    // 1. If the manually prioritized task is on this side, all builders on this side execute it first!
    if (prioTask && prioTask.side === side) {
      for (const b of builders) assignments.set(b.id, prioTask);
      return;
    }

    // 2. Otherwise, split builders across this side's tasks strictly in FIFO contraction order!
    if (ownTasks.length > 0) {
      for (let i = 0; i < builders.length; i++) {
        assignments.set(builders[i].id, ownTasks[i % ownTasks.length]);
      }
      return;
    }

    // 3. No tasks on this side: idle builders help the other side's priority task or FIFO tasks!
    if (prioTask) {
      for (const b of builders) assignments.set(b.id, prioTask);
      return;
    }
    if (otherTasks.length > 0) {
      for (let i = 0; i < builders.length; i++) {
        assignments.set(builders[i].id, otherTasks[i % otherTasks.length]);
      }
    }
  };

  assignSide(leftBuilders, -1, leftTasks, rightTasks);
  assignSide(rightBuilders, 1, rightTasks, leftTasks);

  return assignments;
}

function updateVillagers(w: WorldState, dt: number): void {
  const isEveningOrNight = w.timeOfDay >= 0.46 && w.timeOfDay < 0.98;
  const builderAssignments = buildBuilderTaskAssignments(w, isEveningOrNight);

  for (const v of w.villagers) {
    v.animTime += dt * (Math.abs(v.vx) > 5 ? 9 : 2.5);
    v.actionTimer = Math.max(0, v.actionTimer - dt);
    v.orderFlashTimer = Math.max(0, v.orderFlashTimer - dt);

    // Already embarked inside Drakkar
    if (v.state === 'embarked') {
      v.x = w.boat.x;
      v.vx = 0;
      continue;
    }

    // Marching to board Drakkar after Ship Bell was rung!
    if (v.state === 'boarding') {
      if (moveToward(v, w.boat.x, 56, dt)) {
        const canBoard =
          (v.role === 'archer' && w.boat.crewArchers < MAX_CREW_PER_CLASS) ||
          (v.role === 'warrior' && w.boat.crewWarriors < MAX_CREW_PER_CLASS) ||
          (v.role === 'producer' && w.boat.crewProducers < MAX_CREW_PER_CLASS) ||
          (v.role === 'builder' && w.boat.crewBuilders < MAX_CREW_PER_CLASS);
        if (canBoard) {
          v.state = 'embarked';
          if (v.role === 'archer') w.boat.crewArchers += 1;
          else if (v.role === 'warrior') w.boat.crewWarriors += 1;
          else if (v.role === 'producer') w.boat.crewProducers += 1;
          else if (v.role === 'builder') w.boat.crewBuilders += 1;
          sound.playCoinPickup();
          spawnBurst(w, w.boat.x, GROUND_Y - 16, 6, w.crest.secondaryColor, 'spark', 28);
        } else {
          v.state = 'idle';
        }
      }
      continue;
    }

    // Whenever ANY subject carrying coins crosses paths with a Monarch (either walks past the other)
    // and the Monarch has pouch space, animate the coins leaping in an arc from the subject to the King!
    if (v.role !== 'wanderer' && v.carriedCoins > 0) {
      for (let mi = 0; mi < w.monarchs.length; mi++) {
        const mTarget = w.monarchs[mi];
        if (!mTarget || Math.abs(v.x - mTarget.x) >= 28) continue;
        const inFlight = countInFlightCoinsToMonarch(w, mi);
        const room = Math.max(0, mTarget.maxCoins - (mTarget.coins + inFlight));
        if (room <= 0) continue;

        const give = Math.min(v.carriedCoins, room);
        v.carriedCoins -= give;
        if (v.carriedCoins <= 0 && v.state === 'returning_coins') {
          v.state = 'idle';
        }
        sound.playCoinDrop();
        spawnBurst(w, v.x, GROUND_Y - 15, 5, '#ffe066', 'spark', 28);
        for (let ci = 0; ci < give; ci++) {
          w.flyingCoins.push({
            id: uid(w),
            startX: v.x + ((ci % 3) - 1) * 2.5,
            startY: GROUND_Y - 14,
            targetX: mTarget.x,
            targetY: GROUND_Y - 18 - mTarget.flyY,
            progress: -ci * 0.14,
            duration: 0.36,
            currency: 'coin',
            targetType: 'villager_tribute',
            targetId: mi,
          });
        }
        break;
      }
    }

    // --- WANDERER (must be hired with 1 coin OR attracted by a Brewery beer -> becomes Peasant!) ---
    if (v.role === 'wanderer') {
      // 1. Breweries stocked with beer automatically attract wanderers from BOTH sides of the map!
      const nearestBrewery = w.camps
        .filter((c) => c.isBrewery && (c.beerStock ?? 0) > 0)
        .sort((a, b) => Math.abs(a.x - v.x) - Math.abs(b.x - v.x))[0];
      if (nearestBrewery) {
        v.state = 'seeking_coin';
        if (moveToward(v, nearestBrewery.x, 40, dt)) {
          if ((nearestBrewery.beerStock ?? 0) > 0) {
            nearestBrewery.beerStock = (nearestBrewery.beerStock ?? 1) - 1;
            v.role = 'peasant';
            v.state = 'walking_to_center';
            w.stats.villagersRecruited += 1;
            markActionClassCompleted(w, 'wanderer');
            sound.playCoinPickup();
            spawnBurst(w, nearestBrewery.x, GROUND_Y - 14, 10, '#f7d265', 'spark', 36);
          }
        }
        continue;
      }

      let nearestCoin: Coin | null = null;
      let nearestDist = 95;
      for (const c of w.coins) {
        if (!c.grounded || (c.claimedById !== null && c.claimedById !== v.id)) continue;
        const d = Math.abs(c.x - v.x);
        if (d < nearestDist) {
          nearestDist = d;
          nearestCoin = c;
        }
      }
      if (nearestCoin) {
        nearestCoin.claimedById = v.id;
        v.state = 'seeking_coin';
        if (moveToward(v, nearestCoin.x, 42, dt)) {
          const idx = w.coins.indexOf(nearestCoin);
          if (idx >= 0) w.coins.splice(idx, 1);
          v.role = 'peasant';
          v.state = 'walking_to_center';
          w.stats.villagersRecruited += 1;
          markActionClassCompleted(w, 'wanderer');
          sound.playCoinPickup();
          spawnBurst(w, v.x, GROUND_Y - 12, 8, '#f7d265', 'spark', 32);
        }
        continue;
      }

      const camp = w.camps.find((c) => c.id === v.homeCampId);
      const anchorX = camp ? camp.x : v.x;
      if (v.actionTimer <= 0) {
        v.targetX = anchorX + (Math.random() - 0.5) * 48;
        v.actionTimer = 2 + Math.random() * 3.5;
      }
      moveToward(v, v.targetX, 18, dt);
      continue;
    }

    // --- PEASANT (unemployed hired subject: delivers dropped coins to Banker, or picks up stocked tool/seed!) ---
    if (v.role === 'peasant') {
      // Finish delivering any coins already carried to the Banker first so no gold is lost
      if (v.carriedCoins > 0 && deliverCarriedCoinsToBanker(w, v, dt)) continue;

      const stockedShop = w.shops
        .filter((s) => isShopUnlocked(w, s.kind) && s.stock > 0)
        .sort((a, b) => Math.abs(a.x - v.x) - Math.abs(b.x - v.x))[0];

      if (stockedShop) {
        v.state = 'seeking_tool';
        if (moveToward(v, stockedShop.x, 48, dt)) {
          if (stockedShop.stock > 0) {
            stockedShop.stock -= 1;
            markActionClassCompleted(w, `shop_${stockedShop.kind}`);
            if (stockedShop.kind === 'bow') {
              v.role = 'archer';
              v.hp = 24;
              v.maxHp = 24;
            } else if (stockedShop.kind === 'hammer') {
              v.role = 'builder';
              v.hp = 24;
              v.maxHp = 24;
            } else if (stockedShop.kind === 'sword') {
              v.role = 'warrior';
              const warriorHp = w.activeGod === 'thor' ? 86 : 64;
              v.hp = warriorHp;
              v.maxHp = warriorHp;
            } else {
              v.role = 'producer';
              v.hp = 22;
              v.maxHp = 22;
            }
            if (v.orderDir === 0) {
              v.side = pickBalancedSide(w, v.role);
            }
            v.state = 'idle';
            sound.playBuildComplete();
            spawnBurst(w, v.x, GROUND_Y - 14, 8, w.crest.secondaryColor, 'spark', 30);
          }
        }
        continue;
      }

      if (trySweepCoinsToBanker(w, v, dt, isEveningOrNight)) continue;

      const homeAnchor = v.orderDir !== 0 ? CENTER_X + v.side * 75 : CENTER_X;
      if (Math.abs(v.x - homeAnchor) > 70) {
        moveToward(v, homeAnchor + (Math.random() - 0.5) * 30, 44, dt);
      } else {
        if (v.actionTimer <= 0) {
          v.targetX = homeAnchor + (Math.random() - 0.5) * 70;
          v.actionTimer = 2.5 + Math.random() * 3;
        }
        moveToward(v, v.targetX, 20, dt);
      }
      continue;
    }

    // --- BUILDER (FIFO order + automatic side splitting + manual priority override, then repairs & sweeps coins!) ---
    if (v.role === 'builder') {
      const sideScore = (wx: number) => ((wx < CENTER_X ? -1 : 1) === v.side ? 0 : 1200);
      const odinMult = w.activeGod === 'odin' ? 1.5 : 1.0;
      const buildBuffMult = isConstructionBuffActive(w) ? 1.35 : 1.0;
      const workMult = odinMult * buildBuffMult;

      const assigned = builderAssignments.get(v.id);

      if (assigned?.kind === 'wall') {
        const buildWall = w.walls.find((wall) => wall.id === assigned.id && wall.underConstruction);
        if (buildWall) {
          v.state = 'working';
          v.targetId = buildWall.id;
          const standX = buildWall.x - buildWall.side * (12 + (v.id % 3) * 3);
          if (moveToward(v, standX, 52, dt)) {
            v.facing = buildWall.side;
            buildWall.buildProgress += dt * 0.34 * workMult;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.42;
              sound.playHammer();
              spawnBurst(w, buildWall.x, GROUND_Y - 16, 4, '#c7935b', 'wood', 28);
            }
            if (buildWall.buildProgress >= 1) {
              buildWall.underConstruction = false;
              buildWall.destroyed = false;
              buildWall.buildProgress = 0;
              buildWall.level = Math.max(1, buildWall.targetLevel);
              buildWall.previousLevel = buildWall.level;
              buildWall.maxHp = getWallMaxHp(buildWall.level, w.activeGod === 'odin');
              buildWall.hp = buildWall.maxHp;
              w.stats.wallsBuilt += 1;
              clearPriorityIfMatches(w, 'wall', buildWall.id);
              sound.playBuildComplete();
              spawnBurst(w, buildWall.x, GROUND_Y - 22, 14, '#f0c66c', 'spark', 45);
            }
          }
          continue;
        }
      }

      if (assigned?.kind === 'tower') {
        const buildTower = w.towers.find((tw) => tw.id === assigned.id && tw.underConstruction);
        if (buildTower) {
          v.state = 'working';
          v.targetId = buildTower.id;
          const standX = buildTower.x - buildTower.side * (12 + (v.id % 3) * 3);
          if (moveToward(v, standX, 52, dt)) {
            v.facing = buildTower.side;
            buildTower.buildProgress += dt * 0.3 * workMult;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.42;
              sound.playHammer();
              spawnBurst(w, buildTower.x, GROUND_Y - 18, 4, '#c7935b', 'wood', 28);
            }
            if (buildTower.buildProgress >= 1) {
              buildTower.underConstruction = false;
              buildTower.destroyed = false;
              buildTower.buildProgress = 0;
              buildTower.level = Math.max(1, buildTower.targetLevel);
              buildTower.previousLevel = buildTower.level;
              buildTower.maxHp = getTowerMaxHp(buildTower.level, w.activeGod === 'odin');
              buildTower.hp = buildTower.maxHp;
              clearPriorityIfMatches(w, 'tower', buildTower.id);
              sound.playBuildComplete();
              spawnBurst(w, buildTower.x, GROUND_Y - 26, 14, '#f0c66c', 'spark', 45);
            }
          }
          continue;
        }
      }

      if (assigned?.kind === 'forge' && w.forge && w.forge.underConstruction && !w.forge.built) {
        v.state = 'working';
        v.targetId = 0;
        const standX = w.forge.x - 12 + (v.id % 3) * 4;
        if (moveToward(v, standX, 52, dt)) {
          v.facing = w.forge.x >= v.x ? 1 : -1;
          w.forge.buildProgress += dt * 0.28 * workMult;
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.42;
            sound.playHammer();
            spawnBurst(w, w.forge.x, GROUND_Y - 14, 4, '#bcc9d6', 'stone', 26);
          }
          if (w.forge.buildProgress >= 1) {
            w.forge.buildProgress = 1;
            w.forge.underConstruction = false;
            w.forge.built = true;
            clearPriorityIfMatches(w, 'forge', 0);
            sound.playBuildComplete();
            spawnBurst(w, w.forge.x, GROUND_Y - 20, 16, '#ff9b52', 'ember', 50);
            showBanner(
              w,
              'FORJA PRONTA!',
              'Transforme Madeira + Pedra em Ferro para evoluir o Reino!',
              '#ff9b52'
            );
            saveCampaign(w);
          }
        }
        continue;
      }

      if (assigned?.kind === 'boat' && w.boat.underConstruction && !w.boat.built) {
        v.state = 'working';
        v.targetId = 0;
        if (moveToward(v, w.boat.x - 16 + (v.id % 3) * 3, 52, dt)) {
          v.facing = 1;
          w.boat.buildProgress += dt * 0.2 * workMult;
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.4;
            sound.playHammer();
            spawnBurst(w, w.boat.x, GROUND_Y - 16, 4, '#c7935b', 'wood', 30);
          }
          if (w.boat.buildProgress >= 1) {
            w.boat.buildProgress = 1;
            w.boat.underConstruction = false;
            w.boat.built = true;
            w.boat.waterDropProgress = 0;
            clearPriorityIfMatches(w, 'boat', 0);
            sound.playBuildComplete();
            spawnBurst(w, w.boat.x, GROUND_Y - 24, 18, '#ffe066', 'spark', 55);
            showBanner(w, 'DRAKKAR NA ÁGUA!', 'Toque o Sino (1🪙) e pague 10🪙 para zarpar!', '#ffe066');
            syncCurrentIslandProgress(w);
            saveCampaign(w);
          }
        }
        continue;
      }

      if (assigned?.kind === 'dock' && w.dock.underConstruction && !w.dock.built) {
        v.state = 'working';
        v.targetId = 0;
        if (moveToward(v, w.dock.x - 14 + (v.id % 3) * 3, 52, dt)) {
          v.facing = 1;
          w.dock.buildProgress += dt * 0.22 * workMult;
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.4;
            sound.playHammer();
            spawnBurst(w, w.dock.x, GROUND_Y - 12, 4, '#c7935b', 'wood', 28);
          }
          if (w.dock.buildProgress >= 1) {
            w.dock.buildProgress = 1;
            w.dock.underConstruction = false;
            w.dock.built = true;
            clearPriorityIfMatches(w, 'dock', 0);
            sound.playBuildComplete();
            spawnBurst(w, w.dock.x, GROUND_Y - 18, 16, '#ffe066', 'spark', 50);
            showBanner(w, 'PORTO CONSTRUÍDO!', 'Agora você pode navegar entre ilhas colonizadas ou novas!', '#ffe066');
            syncCurrentIslandProgress(w);
            saveCampaign(w);
          }
        }
        continue;
      }

      if (assigned?.kind === 'farm') {
        const buildFarm = w.farms.find((f) => f.id === assigned.id && f.underConstruction);
        if (buildFarm) {
          v.state = 'working';
          v.targetId = buildFarm.id;
          if (moveToward(v, buildFarm.x - buildFarm.side * (10 + (v.id % 3) * 3), 50, dt)) {
            v.facing = buildFarm.side;
            buildFarm.buildProgress += dt * 0.36 * workMult;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.45;
              sound.playHammer();
              spawnBurst(w, buildFarm.x, GROUND_Y - 10, 4, '#c7935b', 'wood', 24);
            }
            if (buildFarm.buildProgress >= 1) {
              buildFarm.underConstruction = false;
              buildFarm.buildProgress = 0;
              buildFarm.level += 1;
              clearPriorityIfMatches(w, 'farm', buildFarm.id);
              sound.playBuildComplete();
              spawnBurst(w, buildFarm.x, GROUND_Y - 16, 12, '#82e08a', 'spark', 40);
            }
          }
          continue;
        }
      }

      if (assigned?.kind === 'brewery') {
        const buildBrew = w.camps.find((c) => c.id === assigned.id && c.breweryUnderConstruction && !c.isBrewery);
        if (buildBrew) {
          v.state = 'working';
          v.targetId = buildBrew.id;
          const brewSide = buildBrew.x < CENTER_X ? -1 : 1;
          if (moveToward(v, buildBrew.x - brewSide * (12 + (v.id % 3) * 3), 50, dt)) {
            v.facing = brewSide;
            buildBrew.breweryBuildProgress = (buildBrew.breweryBuildProgress ?? 0) + dt * 0.25 * workMult;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.45;
              sound.playHammer();
              spawnBurst(w, buildBrew.x, GROUND_Y - 14, 4, '#c7935b', 'wood', 26);
            }
            if ((buildBrew.breweryBuildProgress ?? 0) >= 1) {
              buildBrew.breweryUnderConstruction = false;
              buildBrew.breweryBuildProgress = 1;
              buildBrew.isBrewery = true;
              buildBrew.beerStock = 0;
              buildBrew.beerCoinsPaid = 0;
              clearPriorityIfMatches(w, 'brewery', buildBrew.id);
              sound.playBuildComplete();
              spawnBurst(w, buildBrew.x, GROUND_Y - 20, 16, '#f7d265', 'spark', 48);
              showBanner(
                w,
                'CERVEJARIA PRONTA!',
                'Pague 4🪙 por cerveja (máx. 4) para atrair errantes de ambos os lados!',
                '#f7d265'
              );
              saveCampaign(w);
            }
          }
          continue;
        }
      }

      if (assigned?.kind === 'rock') {
        const markedRock = w.rocks.find((r) => r.id === assigned.id && r.marked && !r.mined);
        if (markedRock) {
          v.state = 'working';
          v.targetId = markedRock.id;
          const spreadOffset = ((v.id % 3) - 1) * 4;
          const standX = markedRock.x + (markedRock.x < CENTER_X ? 12 : -12) + spreadOffset;
          if (moveToward(v, standX, 48, dt)) {
            v.facing = markedRock.x < v.x ? -1 : 1;
            const spec = getRockSpec(markedRock.size ?? sizeFromVariant(markedRock.variant));
            markedRock.mineProgress += (dt / spec.time) * workMult;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.52;
              markedRock.hitShake = 0.16;
              sound.playHammer();
              spawnBurst(w, markedRock.x, GROUND_Y - 8, 4, '#a6b5c4', 'stone', 32);
            }
            if (markedRock.mineProgress >= 1) {
              markedRock.mined = true;
              markedRock.marked = false;
              markedRock.mineProgress = 0;
              w.resources.stone += spec.stone;
              clearPriorityIfMatches(w, 'rock', markedRock.id);
              sound.playBuildComplete();
              spawnBurst(w, markedRock.x, GROUND_Y - 10, 14, '#bcc9d6', 'stone', 50);
              for (let c = 0; c < spec.coins; c++) {
                const vx = ((c - (spec.coins - 1) / 2) * 18) + (Math.random() - 0.5) * 10;
                spawnCoin(w, markedRock.x, GROUND_Y - 10, vx, -64 - Math.random() * 18, false, 0.25);
              }
            }
          }
          continue;
        }
      }

      if (assigned?.kind === 'tree') {
        const markedTree = w.trees.find((tr) => tr.id === assigned.id && tr.marked && !tr.chopped);
        if (markedTree) {
          v.state = 'working';
          v.targetId = markedTree.id;
          const spreadOffset = ((v.id % 3) - 1) * 4;
          const standX = markedTree.x + (markedTree.x < CENTER_X ? 11 : -11) + spreadOffset;
          if (moveToward(v, standX, 48, dt)) {
            v.facing = markedTree.x < v.x ? -1 : 1;
            const spec = getTreeSpec(markedTree.size ?? sizeFromVariant(markedTree.variant));
            markedTree.chopProgress += (dt / spec.time) * workMult;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.52;
              markedTree.hitShake = 0.16;
              sound.playHammer();
              spawnBurst(w, markedTree.x, GROUND_Y - 12, 4, '#b8834b', 'wood', 30);
            }
            if (markedTree.chopProgress >= 1) {
              markedTree.chopped = true;
              markedTree.marked = false;
              markedTree.chopProgress = 0;
              w.resources.wood += spec.wood;
              clearPriorityIfMatches(w, 'tree', markedTree.id);
              sound.playBuildComplete();
              spawnBurst(w, markedTree.x, GROUND_Y - 22, 14, '#69946b', 'leaf', 48);
              for (let c = 0; c < spec.coins; c++) {
                const vx = ((c - (spec.coins - 1) / 2) * 16) + (Math.random() - 0.5) * 10;
                spawnCoin(w, markedTree.x, GROUND_Y - 14, vx, -62 - Math.random() * 18, false, 0.25);
              }
            }
          }
          continue;
        }
      }

      // Fallback 1: Repair damaged walls & towers when no ordered tasks are pending
      const damagedWall = w.walls
        .filter((wall) => wall.level > 0 && !wall.destroyed && wall.hp < wall.maxHp)
        .sort((a, b) => sideScore(a.x) + (a.hp / a.maxHp) * 100 - (sideScore(b.x) + (b.hp / b.maxHp) * 100))[0];
      if (damagedWall && (!isEveningOrNight || Math.abs(damagedWall.x - CENTER_X) < 350)) {
        v.state = 'working';
        const standX = damagedWall.x - damagedWall.side * 12;
        if (moveToward(v, standX, 48, dt)) {
          v.facing = damagedWall.side;
          damagedWall.hp = Math.min(damagedWall.maxHp, damagedWall.hp + dt * 22 * workMult);
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.5;
            sound.playHammer();
            spawnBurst(w, damagedWall.x, GROUND_Y - 14, 3, '#c7935b', 'wood', 22);
          }
        }
        continue;
      }

      const damagedTower = w.towers
        .filter((tw) => tw.level > 0 && !tw.destroyed && tw.hp < tw.maxHp)
        .sort((a, b) => sideScore(a.x) + (a.hp / a.maxHp) * 100 - (sideScore(b.x) + (b.hp / b.maxHp) * 100))[0];
      if (damagedTower && (!isEveningOrNight || Math.abs(damagedTower.x - CENTER_X) < 350)) {
        v.state = 'working';
        const standX = damagedTower.x - damagedTower.side * 12;
        if (moveToward(v, standX, 48, dt)) {
          v.facing = damagedTower.side;
          damagedTower.hp = Math.min(damagedTower.maxHp, damagedTower.hp + dt * 22 * workMult);
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.5;
            sound.playHammer();
            spawnBurst(w, damagedTower.x, GROUND_Y - 14, 3, '#c7935b', 'wood', 22);
          }
        }
        continue;
      }

      v.targetId = null;

      // Deliver any coins already carried to the Banker first
      if (v.carriedCoins > 0 && deliverCarriedCoinsToBanker(w, v, dt)) continue;

      // IDLE BUILDER TASK: Plant new trees at chopped tree spots (trees depend on builders to spawn!)
      if (!isEveningOrNight) {
        const plantSpot = w.trees
          .filter(
            (tr) =>
              tr.chopped &&
              !tr.marked &&
              !w.farms.some((f) => f.level > 0 && Math.abs(f.x - tr.x) < 26) &&
              !w.walls.some((wl) => wl.level > 0 && Math.abs(wl.x - tr.x) < 18) &&
              !w.towers.some((tw) => tw.level > 0 && Math.abs(tw.x - tr.x) < 18) &&
              !w.villagers.some((o) => o.id !== v.id && o.role === 'builder' && o.targetId === tr.id)
          )
          .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];

        if (plantSpot) {
          v.state = 'working';
          v.targetId = plantSpot.id;
          const standX = plantSpot.x + (v.x < plantSpot.x ? -8 : 8);
          if (moveToward(v, standX, 46, dt)) {
            v.facing = plantSpot.x >= v.x ? 1 : -1;
            const treeSeasonMult = getSeasonModifiers(w.season).tree;
            plantSpot.chopProgress += dt * 0.2 * workMult * treeSeasonMult;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.55;
              spawnBurst(w, plantSpot.x, GROUND_Y - 6, 4, '#6fa86f', 'leaf', 22);
            }
            if (plantSpot.chopProgress >= 1) {
              const roll = Math.random();
              const variant: 0 | 1 | 2 = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
              const size = sizeFromVariant(variant);
              plantSpot.variant = variant;
              plantSpot.size = size;
              plantSpot.height = heightForTreeSize(size, Math.random());
              plantSpot.chopped = false;
              plantSpot.marked = false;
              plantSpot.chopProgress = 0;
              plantSpot.hitShake = 0.22;
              v.targetId = null;
              sound.playBuildComplete();
              spawnBurst(w, plantSpot.x, GROUND_Y - 14, 10, '#78c272', 'leaf', 36);
            }
          }
          continue;
        }
      }

      // FALLBACK when nothing left to build/plant: collect dropped coins and deliver to the Banker!
      if (trySweepCoinsToBanker(w, v, dt, isEveningOrNight)) continue;

      v.targetId = null;
      v.state = isEveningOrNight ? 'fleeing' : 'idle';
      const anchor = CENTER_X + v.side * 95;
      if (Math.abs(v.x - anchor) > 65) {
        moveToward(v, anchor, 48, dt);
      } else {
        if (v.actionTimer <= 0) {
          v.targetX = anchor + (Math.random() - 0.5) * 80;
          v.actionTimer = 2.8 + Math.random() * 3;
        }
        moveToward(v, v.targetX, 20, dt);
      }
      continue;
    }

    // --- WARRIOR (defends kingdom; when idle in daytime, excavates new rocks, then sweeps coins to Banker!) ---
    if (v.role === 'warrior') {
      if (!isEveningOrNight && v.hp < v.maxHp) {
        v.hp = Math.min(v.maxHp, v.hp + dt * 4);
      }
      const defWall = getOuterDefensiveWall(w, v.side);
      const guardX = defWall
        ? defWall.x + v.side * (6 + (v.id % 3) * 6)
        : CENTER_X + v.side * (165 + (v.id % 3) * 14);

      let targetEnemy: Enemy | null = null;
      let bestDist = 115;
      for (const e of w.enemies) {
        if (e.kind === 'hel_crow') continue; // Aerial enemies are targeted by Archers & Sleipnir!
        const d = Math.abs(e.x - v.x);
        if (d < bestDist) {
          bestDist = d;
          targetEnemy = e;
        }
      }

      if (targetEnemy) {
        v.targetId = null;
        v.state = 'defending';
        if (bestDist > 13) {
          moveToward(v, targetEnemy.x, 54, dt);
        } else {
          v.vx = 0;
          v.facing = targetEnemy.x >= v.x ? 1 : -1;
          if (v.actionTimer <= 0) {
            v.actionTimer = 0.65;
            targetEnemy.hp -= w.activeGod === 'thor' ? 21 : 14;
            targetEnemy.hitFlash = 0.14;
            sound.playHit();
            spawnBurst(w, targetEnemy.x, GROUND_Y - 12, 6, w.activeGod === 'thor' ? '#ffd15c' : '#7cf7ff', 'shadow', 38);
            if (targetEnemy.hp <= 0) handleEnemyKilled(w, targetEnemy);
          }
        }
        continue;
      }

      // IDLE DAYTIME SWORDSMAN TASKS (only when no enemies & not evening/night!)
      if (!isEveningOrNight && w.enemies.length === 0) {
        if (v.carriedCoins > 0 && deliverCarriedCoinsToBanker(w, v, dt)) continue;

        const sideScore = (wx: number) => ((wx < CENTER_X ? -1 : 1) === v.side ? 0 : 1200);
        const digSpot = w.rocks
          .filter(
            (r) =>
              r.mined &&
              !r.marked &&
              !w.villagers.some((o) => o.id !== v.id && o.role === 'warrior' && o.targetId === r.id)
          )
          .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];

        if (digSpot) {
          v.state = 'working';
          v.targetId = digSpot.id;
          const standX = digSpot.x + (v.x < digSpot.x ? -9 : 9);
          if (moveToward(v, standX, 48, dt)) {
            v.facing = digSpot.x >= v.x ? 1 : -1;
            const rockSeasonMult = getSeasonModifiers(w.season).rock;
            digSpot.mineProgress += dt * 0.18 * rockSeasonMult;
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.58;
              sound.playHammer();
              spawnBurst(w, digSpot.x, GROUND_Y - 6, 4, '#b8c8d8', 'stone', 24);
            }
            if (digSpot.mineProgress >= 1) {
              const variant = Math.floor(Math.random() * 3) as 0 | 1 | 2;
              digSpot.variant = variant;
              digSpot.size = sizeFromVariant(variant);
              digSpot.mined = false;
              digSpot.marked = false;
              digSpot.mineProgress = 0;
              digSpot.hitShake = 0.22;
              v.targetId = null;
              sound.playBuildComplete();
              spawnBurst(w, digSpot.x, GROUND_Y - 10, 10, '#cfdbe6', 'stone', 38);
            }
          }
          continue;
        }

        v.targetId = null;

        // FALLBACK when no mined rocks left to excavate: collect dropped coins and bring to Banker!
        if (trySweepCoinsToBanker(w, v, dt, isEveningOrNight)) continue;
      }

      v.targetId = null;
      v.state = 'defending';
      moveToward(v, guardX, 54, dt);
      if (Math.abs(v.x - guardX) < 4) v.facing = v.side;
      continue;
    }

    // --- ARCHER (hunts wildlife, garrisons Towers, shoots ground & aerial enemies; sweeps coins to Banker when idle!) ---
    if (v.role === 'archer') {
      const defWall = getOuterDefensiveWall(w, v.side);

      // Check/assign Archer Tower on this side during evening/night or when enemies exist
      let myTower: ArcherTower | null =
        w.towers.find((tw) => tw.id === v.assignedTowerId && tw.level > 0 && !tw.destroyed && tw.side === v.side) ?? null;
      if (!myTower && (isEveningOrNight || w.enemies.length > 0)) {
        const candidateTowers = w.towers
          .filter(
            (tw) =>
              tw.side === v.side &&
              tw.level > 0 &&
              !tw.destroyed &&
              countArchersAssignedToTower(w, tw.id) < getTowerArcherCap(tw.level)
          )
          .sort((a, b) => Math.abs(b.x - CENTER_X) - Math.abs(a.x - CENTER_X));
        myTower = candidateTowers[0] ?? null;
        v.assignedTowerId = myTower ? myTower.id : null;
      } else if (!isEveningOrNight && w.enemies.length === 0) {
        v.assignedTowerId = null;
        myTower = null;
      }

      const perchedOnTower = Boolean(myTower && Math.abs(v.x - myTower.x) < 10);
      const arrowRange = perchedOnTower && myTower ? 200 + myTower.level * 12 : 185;
      const arrowDmg = perchedOnTower && myTower ? 11 + myTower.level * 2 : 11;
      const arrowOriginY = perchedOnTower && myTower ? GROUND_Y - getTowerHeight(myTower.level) - 6 : GROUND_Y - 14;

      const defensePostX = myTower
        ? myTower.x + ((v.id % 3) - 1) * 3
        : defWall
          ? defWall.x - v.side * (12 + (v.id % 3) * 8)
          : CENTER_X + v.side * (75 + (v.id % 3) * 14);

      let targetEnemy: Enemy | null = null;
      let enemyDist = arrowRange;
      for (const e of w.enemies) {
        const d = Math.abs(e.x - v.x);
        if (d < enemyDist) {
          enemyDist = d;
          targetEnemy = e;
        }
      }

      if (targetEnemy) {
        v.state = 'defending';
        if (myTower && !perchedOnTower) {
          moveToward(v, defensePostX, 58, dt);
        } else if (!myTower && defWall && ((v.side === -1 && v.x < defWall.x + 8) || (v.side === 1 && v.x > defWall.x - 8))) {
          moveToward(v, defensePostX, 56, dt);
        } else {
          v.vx = 0;
          v.facing = targetEnemy.x >= v.x ? 1 : -1;
          if (v.actionTimer <= 0) {
            v.actionTimer = Math.max(0.55, 0.86 - (perchedOnTower && myTower ? myTower.level * 0.025 : 0)) + Math.random() * 0.18;
            const aimY = targetEnemy.kind === 'hel_crow' ? targetEnemy.y - 4 : GROUND_Y - 10;
            fireArrow(w, v.x, arrowOriginY, targetEnemy.x + targetEnemy.vx * 0.22, aimY, arrowDmg);
          }
        }
        continue;
      }

      if (isEveningOrNight) {
        v.state = 'defending';
        moveToward(v, defensePostX, 56, dt);
        v.facing = v.side;
        continue;
      }

      // Finish returning swept coins to Banker if already carrying
      if (v.state === 'returning_coins' && v.carriedCoins > 0 && deliverCarriedCoinsToBanker(w, v, dt)) {
        continue;
      }

      // IDLE DAYTIME ARCHER TASK: Hunt & kill animals (animals spawn from trees!)
      let targetPrey = null;
      let preyScore = 440;
      for (const prey of w.wildlife) {
        const sameSide = (prey.x < CENTER_X ? -1 : 1) === v.side;
        const d = Math.abs(prey.x - v.x);
        const score = d + (sameSide ? 0 : 180);
        if (score < preyScore) {
          preyScore = score;
          targetPrey = prey;
        }
      }
      if (targetPrey) {
        const preyDist = Math.abs(targetPrey.x - v.x);
        v.state = 'hunting';
        if (preyDist > 96) {
          moveToward(v, targetPrey.x, 46, dt);
        } else {
          v.vx = 0;
          v.facing = targetPrey.x >= v.x ? 1 : -1;
          if (v.actionTimer <= 0) {
            v.actionTimer = 1.0;
            fireArrow(w, v.x, GROUND_Y - 14, targetPrey.x + targetPrey.vx * 0.18, GROUND_Y - 5, 10);
          }
        }
        continue;
      }

      // FALLBACK when no animals to hunt: collect dropped coins and bring to the Banker!
      if (trySweepCoinsToBanker(w, v, dt, isEveningOrNight)) continue;

      v.state = 'hunting';
      const patrolAnchor = defWall ? defWall.x + v.side * 55 : CENTER_X + v.side * 160;
      if (Math.abs(v.x - v.targetX) < 10 || v.actionTimer <= 0) {
        v.targetX = Math.max(380, Math.min(WORLD_WIDTH - 380, patrolAnchor + (Math.random() - 0.5) * 140));
        v.actionTimer = 3 + Math.random() * 3.5;
      }
      moveToward(v, v.targetX, 34, dt);
      continue;
    }

    // --- PRODUCER (Farmers: harvest farms; in Winter/Spring forage marked Berry Bushes; in Winter become river Fishermen!) ---
    if (v.role === 'producer') {
      if (isEveningOrNight) {
        v.state = 'fleeing';
        moveToward(v, CENTER_X + v.side * 55, 48, dt);
        continue;
      }

      const seasonMod = getSeasonModifiers(w.season);
      const coinDiffMult = getIslandCoinDifficultyMult(w.currentIsland);
      const isWinter = w.season === 'winter';

      // 1. In Winter & Spring, forage any player-ordered Berry Bushes first!
      if (seasonMod.hasBerries) {
        const sideScore = (wx: number) => ((wx < CENTER_X ? -1 : 1) === v.side ? 0 : 1200);
        const markedBush = (w.berryBushes ?? [])
          .filter((b) => b.marked && b.berries > 0)
          .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];

        if (markedBush) {
          v.state = 'foraging';
          v.targetId = markedBush.id;
          const standX = markedBush.x + ((v.id % 3) - 1) * 5;
          if (moveToward(v, standX, 46, dt)) {
            v.facing = markedBush.x >= v.x ? 1 : -1;
            markedBush.forageProgress += dt * (w.season === 'spring' ? 0.34 : 0.24);
            if (v.actionTimer <= 0) {
              v.actionTimer = 0.65;
              spawnBurst(w, markedBush.x, GROUND_Y - 8, 4, '#ff5c7a', 'leaf', 20);
            }
            if (markedBush.forageProgress >= 1) {
              markedBush.forageProgress = 0;
              markedBush.berries = Math.max(0, markedBush.berries - 1);
              markedBush.marked = false;
              v.targetId = null;
              const berryCoins = w.season === 'spring' ? 3 : 2;
              w.resources.food += 1;
              for (let c = 0; c < berryCoins; c++) {
                spawnCoin(
                  w,
                  markedBush.x,
                  GROUND_Y - 10,
                  ((c - (berryCoins - 1) / 2) * 18) + (Math.random() - 0.5) * 10,
                  -60 - Math.random() * 18,
                  false,
                  0.2
                );
              }
              sound.playCoinPickup();
              spawnBurst(w, markedBush.x, GROUND_Y - 12, 10, '#ff6b8a', 'spark', 34);
            }
          }
          continue;
        }
      }

      // 2. WINTER: Zero farm production! Farmers become river Fishermen casting rods into the fjord (1 coin/fish)!
      if (isWinter) {
        const defWall = getOuterDefensiveWall(w, v.side);
        const maxReach = defWall ? Math.max(95, Math.abs(defWall.x - CENTER_X) - 24) : 185;
        const fishOffset = Math.min(maxReach, 110 + (v.id % 5) * 24);
        const fishX = CENTER_X + v.side * fishOffset;
        v.state = 'fishing';
        v.targetId = null;
        if (moveToward(v, fishX, 44, dt)) {
          v.facing = v.side;
          if (v.actionTimer <= 0) {
            v.actionTimer = 17 + (w.currentIsland - 1) * 2.5;
            w.resources.food += 1;
            spawnCoin(w, v.x + v.facing * 10, GROUND_Y - 4, -v.facing * 14, -56, false, 0.2);
            sound.playCoinPickup();
            spawnBurst(w, v.x + v.facing * 12, GROUND_Y + 3, 6, '#9be2ff', 'breath', 24);
          }
        }
        continue;
      }

      // 3. NON-WINTER (Summer / Autumn / Spring): Work assigned farms and store coins up to cap for the Banker!
      let myFarm = w.farms.find((f) => f.id === v.assignedFarmId && f.level >= 1) ?? null;
      if (!myFarm) {
        const preferred = w.farms.find(
          (f) => f.side === v.side && f.level >= 1 && countFarmersAssignedToFarm(w, f.id) < getFarmMaxFarmers(f.level)
        );
        const fallback = w.farms.find(
          (f) => f.level >= 1 && countFarmersAssignedToFarm(w, f.id) < getFarmMaxFarmers(f.level)
        );
        myFarm = preferred ?? fallback ?? null;
        v.assignedFarmId = myFarm ? myFarm.id : null;
      }

      if (!myFarm) {
        if (trySweepCoinsToBanker(w, v, dt, isEveningOrNight)) continue;
        // No farm built yet: cast fishing rod into river for 1 coin each
        const fishX = CENTER_X + v.side * (120 + (v.id % 4) * 22);
        v.state = 'fishing';
        if (moveToward(v, fishX, 44, dt)) {
          v.facing = v.side;
          if (v.actionTimer <= 0) {
            v.actionTimer = 15 + (w.currentIsland - 1) * 2;
            w.resources.food += 1;
            spawnCoin(w, v.x + v.facing * 10, GROUND_Y - 4, -v.facing * 14, -56, false, 0.2);
            sound.playCoinPickup();
            spawnBurst(w, v.x + v.facing * 12, GROUND_Y + 3, 5, '#89dcff', 'breath', 24);
          }
        }
        continue;
      }

      const workX = myFarm.x + ((v.id % 5) - 2) * 8;
      v.state = 'producing';
      if (moveToward(v, workX, 44, dt)) {
        const freyaSpeed = w.activeGod === 'freya' ? 1.5 : 1.0;
        const cap = getFarmStorageCap(myFarm.level);
        if (myFarm.storedCoins < cap) {
          myFarm.cropProgress += dt * (0.036 + myFarm.level * 0.016) * freyaSpeed * seasonMod.farm * coinDiffMult;
          if (myFarm.cropProgress >= 1) {
            myFarm.cropProgress = 0;
            const foodGain = Math.max(1, Math.round(myFarm.level * seasonMod.farm));
            const coinGain = Math.max(1, Math.round(myFarm.level * 0.7 * seasonMod.farm * coinDiffMult));
            w.resources.food += foodGain;
            myFarm.storedFood = Math.min(cap, myFarm.storedFood + foodGain);
            myFarm.storedCoins = Math.min(cap, myFarm.storedCoins + coinGain);
            sound.playCoinPickup();
            spawnBurst(w, myFarm.x, GROUND_Y - 12, 8, '#f7d265', 'spark', 32);
          }
        }
      }
    }
  }
}

function handleEnemyKilled(w: WorldState, e: Enemy): void {
  const monarch = w.monarchs[0];
  if (e.stolenLoot === 'crown' && monarch) {
    monarch.crownStolenByEnemyId = null;
    monarch.crownX = e.x;
    monarch.crownY = GROUND_Y - 16;
    monarch.crownVx = (Math.random() - 0.5) * 40;
    monarch.crownVy = -80;
    monarch.crownGrounded = false;
  } else if (e.stolenLoot === 'coin' || Math.random() < 0.4) {
    spawnCoin(w, e.x, Math.min(GROUND_Y - 8, e.y - 8), (Math.random() - 0.5) * 35, -62, false, 0.25);
  }
  w.stats.draugrSlain += 1;
  spawnBurst(w, e.x, e.y - 12, 12, '#64e8ff', 'shadow', 54);
  const idx = w.enemies.indexOf(e);
  if (idx >= 0) w.enemies.splice(idx, 1);
}

function fireArrow(
  w: WorldState,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  damage: number
): void {
  const dx = targetX - fromX;
  const dist = Math.max(20, Math.abs(dx));
  const flightTime = Math.min(0.85, Math.max(0.24, dist / 215));
  const gravity = 280;
  const vx = dx / flightTime;
  const vy = (targetY - fromY - 0.5 * gravity * flightTime * flightTime) / flightTime;

  w.arrows.push({
    id: uid(w),
    x: fromX,
    y: fromY,
    vx,
    vy,
    damage,
    alive: true,
    stuckTimer: 0,
  });
  sound.playBowShot();
}

function updateEnemies(w: WorldState, dt: number): void {
  const monarch = w.monarchs[0];

  for (let i = w.enemies.length - 1; i >= 0; i--) {
    const e = w.enemies[i];
    if (!e) continue;
    e.animTime += dt * (e.kind === 'frost_troll' ? 5.5 : e.kind === 'wolf_wraith' ? 14 : 10);
    e.attackCooldown = Math.max(0, e.attackCooldown - dt);
    e.hitFlash = Math.max(0, e.hitFlash - dt);

    if (e.frozenTimer > 0) {
      e.frozenTimer = Math.max(0, e.frozenTimer - dt);
      e.vx = 0;
      continue;
    }

    if (e.stunTimer > 0) {
      e.stunTimer = Math.max(0, e.stunTimer - dt);
      e.vx = 0;
      continue;
    }

    const homePortal = w.portals.find((p) => p.side === e.side);
    const homeX = homePortal ? homePortal.x : e.side === -1 ? 200 : WORLD_WIDTH - 200;

    if (e.retreating) {
      const speed = e.kind === 'frost_troll' ? 34 : e.kind === 'hel_crow' ? 76 : 68;
      if (e.stolenLoot === 'crown' && monarch) {
        monarch.crownX = e.x;
        monarch.crownY = e.y - 19;
      }
      if (moveToward(e, homeX, speed, dt)) {
        if (e.stolenLoot === 'crown') {
          w.mode = 'gameover';
          sound.playCrownKnock();
        }
        w.enemies.splice(i, 1);
      }
      continue;
    }

    // Aerial Hel Crow hovers above ground & swoops at archers/monarch!
    if (e.kind === 'hel_crow') {
      e.y = GROUND_Y - 38 + Math.sin(w.elapsed * 5 + e.id) * 5;
      moveToward(e, CENTER_X, 62, dt);
      if (monarch && monarch.hurtCooldown <= 0 && Math.abs(e.x - monarch.x) < 16) {
        monarch.hurtCooldown = 1.1;
        w.screenShake = 0.2;
        if (monarch.coins > 0) {
          monarch.coins -= 1;
          w.resources.gold = monarch.coins;
          e.stolenLoot = 'coin';
          e.retreating = true;
          sound.playHit();
        } else if (monarch.hasCrown) {
          monarch.hasCrown = false;
          monarch.crownX = monarch.x;
          monarch.crownY = GROUND_Y - 22;
          monarch.crownVx = (Math.random() - 0.5) * 60;
          monarch.crownVy = -100;
          monarch.crownGrounded = false;
          sound.playCrownKnock();
          showBanner(w, 'SUA COROA CAIU!', 'Recolha a coroa antes que a levem!', '#ff5c6c');
        }
      }
      continue;
    }

    const looseCoin = w.coins.find((c) => c.grounded && Math.abs(c.x - e.x) < 18);
    if (looseCoin && (e.kind === 'draugr' || e.kind === 'wolf_wraith')) {
      const idx = w.coins.indexOf(looseCoin);
      if (idx >= 0) w.coins.splice(idx, 1);
      e.stolenLoot = 'coin';
      e.retreating = true;
      sound.playCoinPickup();
      continue;
    }

    if (
      monarch &&
      !monarch.hasCrown &&
      monarch.crownStolenByEnemyId === null &&
      Math.abs(e.x - monarch.crownX) < 16
    ) {
      e.stolenLoot = 'crown';
      e.retreating = true;
      monarch.crownStolenByEnemyId = e.id;
      sound.playCrownKnock();
      showBanner(w, 'UM DRAUGR ROUBOU SUA COROA!', 'Elimine-o antes que chegue ao portal!', '#ff5c6c');
      continue;
    }

    const enemyDmgScale =
      1 +
      Math.max(0, w.currentIsland - 1) * 0.24 +
      Math.floor(w.day / 15) * 0.12 +
      (w.isBloodMoon ? 0.25 : 0);

    const blockingWarrior = w.villagers.find(
      (v) => v.role === 'warrior' && v.state !== 'embarked' && Math.abs(v.x - e.x) < 14
    );
    if (blockingWarrior) {
      e.vx = 0;
      e.facing = blockingWarrior.x >= e.x ? 1 : -1;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = e.kind === 'frost_troll' ? 1.3 : 0.9;
        const baseDmg = e.kind === 'frost_troll' ? 24 : e.kind === 'draugr_brute' ? 14 : 7;
        blockingWarrior.hp -= Math.round(baseDmg * enemyDmgScale);
        sound.playHit();
        spawnBurst(w, blockingWarrior.x, GROUND_Y - 12, 4, '#d9e3ed', 'spark', 26);
        if (blockingWarrior.hp <= 0) {
          blockingWarrior.role = 'peasant';
          blockingWarrior.hp = 20;
          blockingWarrior.maxHp = 20;
          e.stolenLoot = 'coin';
          e.retreating = true;
        }
      }
      continue;
    }

    const dirToCenter: 1 | -1 = e.x < CENTER_X ? 1 : -1;
    let blockingWall: Wall | null = null;
    for (const wall of w.walls) {
      if (wall.level <= 0 || wall.destroyed || wall.hp <= 0) continue;
      const dist = (wall.x - e.x) * dirToCenter;
      if (dist > 0 && dist < 16) {
        blockingWall = wall;
        break;
      }
    }

    if (blockingWall) {
      e.vx = 0;
      e.facing = dirToCenter;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = e.kind === 'frost_troll' ? 1.4 : e.kind === 'draugr_brute' ? 1.1 : 0.85;
        const baseDmg = e.kind === 'frost_troll' ? 32 : e.kind === 'draugr_brute' ? 18 : 8;
        blockingWall.hp -= Math.round(baseDmg * enemyDmgScale);
        blockingWall.hitFlash = 0.14;
        sound.playHit();
        spawnBurst(w, blockingWall.x - dirToCenter * 4, GROUND_Y - 14, 5, '#c48f58', 'wood', 32);
        if (blockingWall.hp <= 0) {
          blockingWall.hp = 0;
          blockingWall.previousLevel = Math.max(1, blockingWall.level);
          blockingWall.level = 0;
          blockingWall.destroyed = true;
          blockingWall.maxHp = 0;
          w.screenShake = 0.25;
          spawnBurst(w, blockingWall.x, GROUND_Y - 16, 16, '#b57b42', 'wood', 58);
          showBanner(w, 'MURALHA DESTRUÍDA!', 'Pague moedas e recursos para reformá-la!', '#ff6b6b');
        }
      }
      continue;
    }

    // Archer Towers also block & absorb damage if outer wall fell!
    let blockingTower: ArcherTower | null = null;
    for (const tw of w.towers) {
      if (tw.level <= 0 || tw.destroyed || tw.hp <= 0) continue;
      const dist = (tw.x - e.x) * dirToCenter;
      if (dist > 0 && dist < 16) {
        blockingTower = tw;
        break;
      }
    }

    if (blockingTower) {
      e.vx = 0;
      e.facing = dirToCenter;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = e.kind === 'frost_troll' ? 1.4 : e.kind === 'draugr_brute' ? 1.1 : 0.85;
        const baseDmg = e.kind === 'frost_troll' ? 30 : e.kind === 'draugr_brute' ? 16 : 7;
        blockingTower.hp -= Math.round(baseDmg * enemyDmgScale);
        blockingTower.hitFlash = 0.14;
        sound.playHit();
        spawnBurst(w, blockingTower.x - dirToCenter * 4, GROUND_Y - 16, 5, '#c48f58', 'wood', 30);
        if (blockingTower.hp <= 0) {
          blockingTower.hp = 0;
          blockingTower.previousLevel = Math.max(1, blockingTower.level);
          blockingTower.level = 0;
          blockingTower.destroyed = true;
          blockingTower.maxHp = 0;
          for (const v of w.villagers) {
            if (v.assignedTowerId === blockingTower.id) v.assignedTowerId = null;
          }
          w.screenShake = 0.25;
          spawnBurst(w, blockingTower.x, GROUND_Y - 18, 16, '#b57b42', 'wood', 58);
          showBanner(w, 'TORRE DE ARQUEIROS DESTRUÍDA!', 'Pague moedas e recursos para reformá-la!', '#ff6b6b');
        }
      }
      continue;
    }

    if (monarch && monarch.flyY <= 18 && monarch.hurtCooldown <= 0 && Math.abs(e.x - monarch.x) < 15) {
      monarch.hurtCooldown = 1.05;
      w.screenShake = 0.22;
      if (monarch.coins > 0) {
        monarch.coins -= 1;
        w.resources.gold = monarch.coins;
        e.stolenLoot = 'coin';
        e.retreating = true;
        sound.playHit();
        spawnBurst(w, monarch.x, GROUND_Y - 16, 8, '#f7d265', 'spark', 46);
      } else if (monarch.hasCrown) {
        monarch.hasCrown = false;
        monarch.crownX = monarch.x;
        monarch.crownY = GROUND_Y - 22;
        monarch.crownVx = -dirToCenter * 52;
        monarch.crownVy = -105;
        monarch.crownGrounded = false;
        sound.playCrownKnock();
        spawnBurst(w, monarch.x, GROUND_Y - 22, 14, '#ffe169', 'spark', 58);
        showBanner(w, 'SUA COROA CAIU!', 'Recolha a coroa antes que a levem!', '#ff5c6c');
      }
      continue;
    }

    for (const v of w.villagers) {
      if (v.role === 'wanderer' || v.role === 'warrior' || v.state === 'embarked') continue;
      // Archers perched atop a standing tower are safe from ground melee!
      if (v.role === 'archer' && v.assignedTowerId) {
        const tw = w.towers.find((item) => item.id === v.assignedTowerId && item.level > 0 && !item.destroyed);
        if (tw && Math.abs(v.x - tw.x) < 12) continue;
      }
      if (Math.abs(v.x - e.x) < 12 && e.attackCooldown <= 0) {
        e.attackCooldown = 1.0;
        if (v.role === 'archer' || v.role === 'builder' || v.role === 'producer') {
          v.role = 'peasant';
          v.assignedFarmId = null;
          v.assignedTowerId = null;
          e.stolenLoot = 'coin';
          e.retreating = true;
          sound.playHit();
          spawnBurst(w, v.x, GROUND_Y - 12, 8, '#7cf7ff', 'shadow', 36);
        }
        break;
      }
    }

    const speedMap: Record<EnemyKind, number> = {
      draugr: 50,
      wolf_wraith: 74,
      draugr_brute: 32,
      hel_crow: 62,
      frost_troll: 24,
    };
    moveToward(e, CENTER_X, speedMap[e.kind], dt);
  }
}

function updateArrows(w: WorldState, dt: number): void {
  for (let i = w.arrows.length - 1; i >= 0; i--) {
    const a = w.arrows[i];
    if (!a.alive) {
      a.stuckTimer -= dt;
      if (a.stuckTimer <= 0) w.arrows.splice(i, 1);
      continue;
    }

    a.vy += 280 * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;

    let hit = false;
    for (let j = w.enemies.length - 1; j >= 0; j--) {
      const e = w.enemies[j];
      const hitH = e.kind === 'frost_troll' ? 32 : e.kind === 'draugr_brute' ? 24 : 18;
      const topY = e.kind === 'hel_crow' ? e.y - 12 : e.y - hitH;
      const botY = e.kind === 'hel_crow' ? e.y + 8 : e.y;
      if (Math.abs(a.x - e.x) < (e.kind === 'frost_troll' ? 14 : 10) && a.y >= topY && a.y <= botY) {
        e.hp -= a.damage;
        e.hitFlash = 0.14;
        sound.playHit();
        spawnBurst(w, a.x, a.y, 6, '#6bf3ff', 'shadow', 42);
        if (e.hp <= 0) handleEnemyKilled(w, e);
        w.arrows.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    for (let j = w.wildlife.length - 1; j >= 0; j--) {
      const prey = w.wildlife[j];
      if (Math.abs(a.x - prey.x) < 9 && a.y >= GROUND_Y - 14 && a.y <= GROUND_Y) {
        prey.hp -= a.damage;
        sound.playHit();
        if (prey.hp <= 0) {
          const dropCount = prey.kind === 'deer' ? 2 : 1;
          w.resources.food += dropCount;
          for (let c = 0; c < dropCount; c++) {
            spawnCoin(w, prey.x, GROUND_Y - 8, (Math.random() - 0.5) * 40, -65 - Math.random() * 20, false, 0.2);
          }
          spawnBurst(w, prey.x, GROUND_Y - 6, 8, '#e8dbc6', 'breath', 30);
          w.wildlife.splice(j, 1);
        }
        w.arrows.splice(i, 1);
        hit = true;
        break;
      }
    }
    if (hit) continue;

    if (a.y >= GROUND_Y) {
      a.y = GROUND_Y;
      a.alive = false;
      a.stuckTimer = 1.6;
    }
  }
}

function updateCoins(w: WorldState, dt: number): void {
  for (let i = w.coins.length - 1; i >= 0; i--) {
    const c = w.coins[i];
    c.age += dt;
    c.pickupDelay = Math.max(0, c.pickupDelay - dt);

    if (!c.grounded) {
      c.vy += 290 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.y >= GROUND_Y - 2) {
        c.y = GROUND_Y - 2;
        c.vy *= -0.38;
        c.vx *= 0.62;
        if (Math.abs(c.vy) < 16) {
          c.vy = 0;
          c.vx = 0;
          c.grounded = true;
        }
      }
    }

    if (c.pickupDelay <= 0 && Math.abs(GROUND_Y - c.y) < 22) {
      const wandererClaimed =
        c.fromMonarch &&
        c.age < 5 &&
        w.villagers.some((v) => v.role === 'wanderer' && Math.abs(v.x - c.x) < 95);
      if (!wandererClaimed) {
        let picked = false;
        for (let mi = 0; mi < w.monarchs.length; mi++) {
          const m = w.monarchs[mi];
          if (m.coins < m.maxCoins && Math.abs(m.x - c.x) < 16) {
            m.coins += 1;
            if (mi === 0) w.resources.gold = m.coins;
            sound.playCoinPickup();
            spawnBurst(w, c.x, c.y - 4, 4, '#ffe169', 'spark', 25);
            w.coins.splice(i, 1);
            picked = true;
            break;
          }
        }
        if (picked) continue;
      }
    }

    if (c.age > 90) w.coins.splice(i, 1);
  }
}

function updateWildlife(w: WorldState, dt: number): void {
  // New animals depend on standing trees to spawn and scale with the active season!
  const standingTrees = w.trees.filter((tr) => !tr.chopped);
  const seasonAnimalMult = getSeasonModifiers(w.season).animal;
  const maxWildlife =
    standingTrees.length > 0
      ? Math.min(10, Math.max(w.season === 'winter' ? 1 : 2, Math.round(Math.ceil(standingTrees.length / 2) * seasonAnimalMult)))
      : 0;
  const spawnRate = 0.45 * seasonAnimalMult * getIslandCoinDifficultyMult(w.currentIsland);
  if (!w.isNight && standingTrees.length > 0 && w.wildlife.length < maxWildlife && Math.random() < dt * spawnRate) {
    const homeTree = standingTrees[Math.floor(Math.random() * standingTrees.length)];
    const spawnX = Math.max(320, Math.min(WORLD_WIDTH - 320, homeTree.x + (Math.random() - 0.5) * 30));
    const isDeer = (homeTree.size === 'large' || Math.abs(spawnX - CENTER_X) > 290) && Math.random() < 0.38;
    w.wildlife.push({
      id: uid(w),
      kind: isDeer ? 'deer' : 'rabbit',
      x: spawnX,
      y: GROUND_Y,
      vx: 0,
      facing: Math.random() > 0.5 ? 1 : -1,
      hp: isDeer ? 16 : 8,
      aiTimer: 1 + Math.random() * 2,
      animTime: 0,
    });
    spawnBurst(w, spawnX, GROUND_Y - 8, 4, '#79a86b', 'leaf', 18);
  }

  for (const prey of w.wildlife) {
    prey.animTime += dt * (Math.abs(prey.vx) > 2 ? 9 : 2);
    prey.aiTimer -= dt;
    if (prey.aiTimer <= 0) {
      prey.aiTimer = 1.4 + Math.random() * 2.8;
      if (Math.random() < 0.55) {
        prey.facing = Math.random() > 0.5 ? 1 : -1;
        prey.vx = prey.facing * (prey.kind === 'deer' ? 24 : 18);
      } else {
        prey.vx = 0;
      }
    }
    prey.x += prey.vx * dt;
    prey.x = Math.max(320, Math.min(WORLD_WIDTH - 320, prey.x));
  }
}

function updateParticlesAndAmbience(w: WorldState, dt: number): void {
  if (w.hall.level >= 1 && Math.random() < dt * 9) {
    spawnParticle(w, {
      x: w.hall.x + (Math.random() - 0.5) * 10,
      y: GROUND_Y - 12,
      vx: (Math.random() - 0.5) * 12,
      vy: -16 - Math.random() * 18,
      size: 1,
      color: Math.random() > 0.4 ? '#ffae42' : '#ffdf78',
      alpha: 0.9,
      life: 0.8 + Math.random() * 0.6,
      maxLife: 1.4,
      kind: 'ember',
    });
  }

  for (const portal of w.portals) {
    if (portal.destroyed) continue;
    if (Math.random() < dt * (w.isNight ? 9 : 3)) {
      spawnParticle(w, {
        x: portal.x + (Math.random() - 0.5) * 16,
        y: GROUND_Y - 10 - Math.random() * 28,
        vx: (Math.random() - 0.5) * 14,
        vy: -8 - Math.random() * 16,
        size: Math.random() > 0.6 ? 2 : 1,
        color: Math.random() > 0.4 ? '#6bf3ff' : '#c06bff',
        alpha: 0.85,
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2,
        kind: 'shadow',
      });
    }
  }

  const snowW = w.viewWidth || 480;
  const snowH = Math.round((w.viewHeight || 270) * 0.78);
  for (let i = w.particles.length - 1; i >= 0; i--) {
    const p = w.particles[i];
    if (p.kind === 'snow') {
      p.x += (p.vx + Math.sin(w.elapsed * 1.4 + i) * 5) * dt;
      p.y += p.vy * dt;
      if (p.y > snowH) {
        p.y = -2;
        p.x = Math.random() * snowW;
      }
      if (p.x < 0) p.x += snowW;
      if (p.x > snowW) p.x -= snowW;
      continue;
    }

    p.life -= dt;
    if (p.life <= 0) {
      w.particles.splice(i, 1);
      continue;
    }

    if (p.kind === 'wood' || p.kind === 'leaf' || p.kind === 'stone') p.vy += 170 * dt;
    else if (p.kind === 'spark') p.vy += 120 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alpha = Math.max(0, p.life / p.maxLife);
  }

  for (const tr of w.trees) tr.hitShake = Math.max(0, tr.hitShake - dt);
  for (const r of w.rocks) r.hitShake = Math.max(0, r.hitShake - dt);
  for (const wall of w.walls) wall.hitFlash = Math.max(0, wall.hitFlash - dt);
  for (const tw of w.towers) tw.hitFlash = Math.max(0, tw.hitFlash - dt);
}

function updateFireTrailsAndLightning(w: WorldState, dt: number): void {
  for (let i = w.fireTrails.length - 1; i >= 0; i--) {
    const f = w.fireTrails[i];
    f.life -= dt;
    if (f.life <= 0) {
      w.fireTrails.splice(i, 1);
      continue;
    }
    if (Math.random() < dt * 8) {
      spawnParticle(w, {
        x: f.x + (Math.random() - 0.5) * 10,
        y: GROUND_Y - 3,
        vx: (Math.random() - 0.5) * 10,
        vy: -14 - Math.random() * 14,
        size: 1,
        color: Math.random() > 0.4 ? '#ff7d38' : '#ffe066',
        alpha: 0.9,
        life: 0.35,
        maxLife: 0.35,
        kind: 'ember',
      });
    }
    // Ground enemies walking over fire trail burn!
    for (let j = w.enemies.length - 1; j >= 0; j--) {
      const e = w.enemies[j];
      if (e.kind === 'hel_crow') continue;
      if (Math.abs(e.x - f.x) < 14) {
        e.hp -= 12 * dt;
        e.hitFlash = Math.max(e.hitFlash, 0.08);
        if (e.hp <= 0) handleEnemyKilled(w, e);
      }
    }
  }

  for (let i = w.lightningBolts.length - 1; i >= 0; i--) {
    w.lightningBolts[i].life -= dt;
    if (w.lightningBolts[i].life <= 0) {
      w.lightningBolts.splice(i, 1);
    }
  }
}

export function getTutorialTargetX(w: WorldState): number {
  const tut = w.tutorial;
  if (!tut) return CENTER_X;
  if (tut.step === 'light_fire') return w.hall.x;
  if (tut.step === 'recruit_wanderers') {
    // Point to the nearest vagrant camp that still has wanderers (closest is CENTER_X - 425)
    const campWithWanderer = w.camps
      .filter((c) => w.villagers.some((v) => v.role === 'wanderer' && Math.abs(v.x - c.x) < 95))
      .sort((a, b) => Math.abs(a.x - CENTER_X) - Math.abs(b.x - CENTER_X))[0];
    return campWithWanderer ? campWithWanderer.x : (w.camps[0]?.x ?? CENTER_X - 425);
  }
  if (tut.step === 'buy_hammer') {
    return w.shops.find((s) => s.kind === 'hammer')?.x ?? CENTER_X + 80;
  }
  if (tut.step === 'build_right_wall') {
    return w.walls.find((wall) => wall.side === 1 && wall.tier === 'inner')?.x ?? CENTER_X + 270;
  }
  if (tut.step === 'build_left_wall') {
    return w.walls.find((wall) => wall.side === -1 && wall.tier === 'inner')?.x ?? CENTER_X - 270;
  }
  if (tut.step === 'buy_bow') {
    return w.shops.find((s) => s.kind === 'bow')?.x ?? CENTER_X - 80;
  }
  if (tut.step === 'order_villager') {
    const hired =
      w.villagers.find((v) => v.role === 'archer' && v.state !== 'embarked') ??
      w.villagers.find((v) => v.role !== 'wanderer' && v.state !== 'embarked');
    return hired ? hired.x : CENTER_X;
  }
  return w.boat.x;
}

export const SPIRIT_AUTO_TEACH_INTERVAL = 5 * 60; // 5 minutes (300s) of active gameplay

export function getSpiritButtonScreenPos(viewW: number, viewH: number): { x: number; y: number } {
  return {
    x: Math.round(Math.max(200, viewW) - 18),
    y: Math.round(Math.max(180, viewH) - 18),
  };
}

export function getSpiritButtonWorldPos(w: WorldState): { x: number; y: number } {
  const vw = Math.max(200, Math.round(w.viewWidth || LOGICAL_WIDTH));
  const vh = Math.max(180, Math.round(w.viewHeight || LOGICAL_HEIGHT));
  const worldOffsetY = Math.round(vh * 0.778) - GROUND_Y;
  const m = w.monarchs[0];
  const camX = m ? m.cameraX : Math.max(0, CENTER_X - vw / 2);
  const btn = getSpiritButtonScreenPos(vw, vh);
  return {
    x: camX + btn.x,
    y: btn.y - worldOffsetY,
  };
}

export function ensureSpiritAdvisor(w: WorldState): SpiritAdvisorState {
  if (!w.spiritAdvisor) {
    const btnPos = getSpiritButtonWorldPos(w);
    w.spiritAdvisor = {
      phase: 'docked',
      topic: null,
      message: '',
      targetX: CENTER_X,
      spiritX: btnPos.x,
      spiritY: btnPos.y,
      spiritFacing: 1,
      spiritAlpha: 0,
      animProgress: 0,
      baseline: null,
      autoTeachTimer: 0,
      learnedTopics: {},
      activeTimer: 0,
      completedTimer: 0,
      manualSummon: false,
    };
  }
  return w.spiritAdvisor;
}

export function skipTutorial(w: WorldState): void {
  if (!w.tutorial || !w.tutorial.active) return;
  if (w.tutorial.returningToButton) return;
  w.tutorial.returningToButton = true;
  w.tutorial.returnProgress = 0;
  w.hasOrderedVillager = true;
  sound.playCoinDrop();
  spawnBurst(w, w.tutorial.spiritX, w.tutorial.spiritY, 12, '#7ef5ff', 'spark', 42);
}

function updateTutorial(w: WorldState, dt: number): void {
  const tut = w.tutorial;
  if (!tut || !tut.active) return;

  const m = w.monarchs[0];
  if (!m) return;

  // Handle graceful fly-back into the bottom-right blue button (on skip or farewell finish!)
  if (tut.returningToButton) {
    const btnPos = getSpiritButtonWorldPos(w);
    tut.returnProgress = Math.min(1, (tut.returnProgress ?? 0) + dt * 2.1);
    const p = tut.returnProgress;
    const ease = p * p * (3 - 2 * p);
    tut.spiritX += (btnPos.x - tut.spiritX) * Math.min(1, dt * (7 + ease * 10));
    tut.spiritY += (btnPos.y - tut.spiritY) * Math.min(1, dt * (7 + ease * 10));
    tut.spiritFacing = btnPos.x >= tut.spiritX ? 1 : -1;
    tut.spiritAlpha = Math.max(0.05, 1 - ease * 0.92);
    if (Math.random() < dt * 18) {
      spawnParticle(w, {
        x: tut.spiritX,
        y: tut.spiritY,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16,
        size: 1.5,
        color: '#7ef5ff',
        alpha: 0.9,
        life: 0.4,
        maxLife: 0.4,
        kind: 'spark',
      });
    }
    if (p >= 1) {
      spawnBurst(w, btnPos.x, btnPos.y, 16, '#7ef5ff', 'spark', 46);
      tut.active = false;
      tut.returningToButton = false;
      markTutorialCompleted();
      saveCampaign(w);
    }
    return;
  }

  // Tutorial rule: NO enemies on the map during the first-playthrough tutorial!
  if (w.enemies.length > 0) w.enemies = [];
  if (w.timeOfDay > 0.34) w.timeOfDay = 0.34;
  w.isNight = false;

  const hammerShop = w.shops.find((s) => s.kind === 'hammer');
  const bowShop = w.shops.find((s) => s.kind === 'bow');
  const rightWall = w.walls.find((wall) => wall.side === 1 && wall.tier === 'inner');
  const leftWall = w.walls.find((wall) => wall.side === -1 && wall.tier === 'inner');

  // Step progression checks
  if (tut.step === 'light_fire' && w.hall.level >= 1) {
    tut.step = 'recruit_wanderers';
    tut.fadeCycle = 0;
    sound.playCoinPickup();
    spawnBurst(w, tut.spiritX, tut.spiritY, 12, '#7ef5ff', 'spark', 45);
  } else if (tut.step === 'recruit_wanderers' && w.stats.villagersRecruited >= 2) {
    tut.step = 'buy_hammer';
    tut.fadeCycle = 0;
    sound.playCoinPickup();
    spawnBurst(w, tut.spiritX, tut.spiritY, 12, '#7ef5ff', 'spark', 45);
  } else if (
    tut.step === 'buy_hammer' &&
    ((hammerShop && hammerShop.stock >= 1) || w.villagers.some((v) => v.role === 'builder'))
  ) {
    tut.step = 'build_right_wall';
    tut.fadeCycle = 0;
    sound.playCoinPickup();
    spawnBurst(w, tut.spiritX, tut.spiritY, 12, '#7ef5ff', 'spark', 45);
  } else if (
    tut.step === 'build_right_wall' &&
    rightWall &&
    (rightWall.level >= 1 || rightWall.underConstruction)
  ) {
    tut.step = 'build_left_wall';
    tut.fadeCycle = 0;
    sound.playCoinPickup();
    spawnBurst(w, tut.spiritX, tut.spiritY, 12, '#7ef5ff', 'spark', 45);
  } else if (
    tut.step === 'build_left_wall' &&
    leftWall &&
    (leftWall.level >= 1 || leftWall.underConstruction)
  ) {
    tut.step = 'buy_bow';
    tut.fadeCycle = 0;
    sound.playCoinPickup();
    spawnBurst(w, tut.spiritX, tut.spiritY, 14, '#7ef5ff', 'spark', 50);
    // Guarantee player can forge the Bow even if they spent coins elsewhere during steps 1..5
    if (!tut.bowTributeGiven && m.coins < 2 && bowShop) {
      tut.bowTributeGiven = true;
      for (let i = 0; i < 2; i++) {
        spawnCoin(w, bowShop.x + (i === 0 ? -8 : 8), GROUND_Y - 12, (i === 0 ? -16 : 16), -62, false, 0.2);
      }
    }
  } else if (tut.step === 'buy_bow' && w.villagers.some((v) => v.role === 'archer')) {
    tut.step = 'order_villager';
    tut.fadeCycle = 0;
    sound.playCoinPickup();
    spawnBurst(w, tut.spiritX, tut.spiritY, 16, '#7ef5ff', 'spark', 55);
  } else if (tut.step === 'order_villager' && w.hasOrderedVillager) {
    tut.step = 'farewell';
    tut.farewellTimer = 6.5;
    tut.fadeCycle = 0;
    sound.playHorn(false);
    spawnBurst(w, tut.spiritX, tut.spiritY, 18, '#7ef5ff', 'spark', 60);
  } else if (tut.step === 'farewell') {
    tut.farewellTimer -= dt;
    if (tut.farewellTimer <= 0) {
      tut.returningToButton = true;
      tut.returnProgress = 0;
      return;
    }
  }

  // Initial emerge swoop directly out of the bottom-right blue button!
  if ((tut.emergingProgress ?? 1) < 1) {
    const btnPos = getSpiritButtonWorldPos(w);
    if ((tut.emergingProgress ?? 0) === 0) {
      tut.spiritX = btnPos.x;
      tut.spiritY = btnPos.y;
      spawnBurst(w, btnPos.x, btnPos.y, 14, '#7ef5ff', 'spark', 42);
    }
    tut.emergingProgress = Math.min(1, (tut.emergingProgress ?? 0) + dt * 1.8);
    const p = tut.emergingProgress;
    const ease = 1 - Math.pow(1 - p, 3);
    const goalX = m.x + 44;
    const goalY = GROUND_Y - 38;
    const arcLift = Math.sin(p * Math.PI) * 28;
    tut.spiritX = btnPos.x + (goalX - btnPos.x) * ease;
    tut.spiritY = btnPos.y + (goalY - btnPos.y) * ease - arcLift;
    tut.spiritAlpha = 0.25 + 0.7 * ease;
    tut.spiritFacing = goalX >= btnPos.x ? 1 : -1;
    return;
  }

  // Spirit floating position & ethereal vanish/reappear ahead of the horse!
  const targetX = getTutorialTargetX(w);
  const dxToTarget = targetX - m.x;
  const dirToTarget: 1 | -1 = dxToTarget >= 0 ? 1 : -1;
  const nearTarget = tut.step !== 'farewell' && Math.abs(dxToTarget) < 58;

  if (tut.step === 'farewell') {
    const desiredX = m.x + m.facing * 42;
    const desiredY = GROUND_Y - 46 + Math.sin(w.elapsed * 3.2) * 4;
    tut.spiritX += (desiredX - tut.spiritX) * Math.min(1, dt * 4.5);
    tut.spiritY += (desiredY - tut.spiritY) * Math.min(1, dt * 5);
    tut.spiritFacing = 1; // Pointing east toward the Drakkar & distant islands!
    tut.spiritAlpha = 0.92;
  } else if (nearTarget) {
    // Hover directly above the campfire / camp / tent / palisade!
    const desiredX = targetX;
    const desiredY = GROUND_Y - 48 + Math.sin(w.elapsed * 3.4) * 3.5;
    tut.spiritX += (desiredX - tut.spiritX) * Math.min(1, dt * 5.2);
    tut.spiritY += (desiredY - tut.spiritY) * Math.min(1, dt * 5.2);
    tut.spiritFacing = dirToTarget;
    tut.spiritAlpha += (0.94 - tut.spiritAlpha) * Math.min(1, dt * 5);
    tut.fadeCycle = 0;
  } else {
    // Sometimes vanishes briefly, and always reappears a few frames ahead of the horse pointing where to go!
    const prevCycle = tut.fadeCycle;
    tut.fadeCycle = (tut.fadeCycle + dt) % 8.4;
    const leadDir: 1 | -1 = Math.abs(m.vx) > 8 ? m.facing : dirToTarget;
    const desiredX = m.x + leadDir * 44;
    const desiredY = GROUND_Y - 38 + Math.sin(w.elapsed * 3.8) * 4;

    // Reappear right ahead of the horse when emerging from mist
    if (prevCycle < 7.5 && tut.fadeCycle >= 7.5) {
      tut.spiritX = desiredX;
      tut.spiritY = desiredY;
      spawnBurst(w, tut.spiritX, tut.spiritY, 8, '#7ef5ff', 'spark', 28);
    }

    const vanished = tut.fadeCycle >= 6.2 && tut.fadeCycle < 7.5;
    const targetAlpha = vanished ? 0 : 0.88;
    tut.spiritAlpha += (targetAlpha - tut.spiritAlpha) * Math.min(1, dt * 4.5);
    tut.spiritX += (desiredX - tut.spiritX) * Math.min(1, dt * 4.8);
    tut.spiritY += (desiredY - tut.spiritY) * Math.min(1, dt * 5.0);
    tut.spiritFacing = dirToTarget; // Finger ALWAYS points toward the target direction!
  }

  // Gentle drifting cyan spirit wisps
  if (tut.spiritAlpha > 0.35 && Math.random() < dt * 7) {
    spawnParticle(w, {
      x: tut.spiritX + (Math.random() - 0.5) * 10,
      y: tut.spiritY + 4 + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 8,
      vy: -8 - Math.random() * 10,
      size: 1,
      color: Math.random() > 0.4 ? '#7ef5ff' : '#d4fbff',
      alpha: tut.spiritAlpha * 0.8,
      life: 0.55,
      maxLife: 0.55,
      kind: 'spark',
    });
  }
}

// =========================================================================
// SMART CONTEXT-AWARE SPIRIT ADVISOR (ON-DEMAND + EVERY 5 MIN TEACHING)
// =========================================================================

function captureAdvisorBaseline(w: WorldState): SpiritAdvisorBaseline {
  const m = w.monarchs[0];
  return {
    wood: w.resources.wood,
    stone: w.resources.stone,
    iron: w.resources.iron,
    bankerBalance: w.banker.balance,
    monarchCoins: m ? m.coins : 0,
    hallLevel: w.hall.level,
    totalWallLevels: w.walls.reduce((sum, wall) => sum + wall.level + (wall.underConstruction ? 0.5 : 0), 0),
    brokenWalls: w.walls.filter((wall) => wall.destroyed).length,
    archers: w.villagers.filter((v) => v.role === 'archer').length,
    builders: w.villagers.filter((v) => v.role === 'builder').length,
    warriors: w.villagers.filter((v) => v.role === 'warrior').length,
    farmers: w.villagers.filter((v) => v.role === 'producer').length,
    wanderersRecruited: w.stats.villagersRecruited,
    farmsBuilt: w.farms.filter((f) => f.level > 0 || f.underConstruction).length,
    breweriesBuilt: w.camps.filter((c) => c.isBrewery || c.breweryUnderConstruction).length,
    beersStocked: w.camps.reduce((sum, c) => sum + (c.beerStock ?? 0), 0),
    boatProgress: w.boat.coinsPaid + w.boat.buildProgress * 10,
    boatBuilt: w.boat.built,
    boatCrew: w.boat.crewArchers + w.boat.crewWarriors + w.boat.crewBuilders + w.boat.crewProducers,
    sailPaid: w.boat.sailCoinsPaid,
    portalsLeft: w.portals.filter((p) => !p.destroyed).length,
    berryMarkedCount: (w.berryBushes ?? []).filter((b) => b.marked).length,
    treesMarked: w.trees.filter((tr) => tr.marked || tr.chopped).length,
    rocksMarked: w.rocks.filter((rk) => rk.marked || rk.mined).length,
    forgeBuilt: Boolean(w.forge?.built || w.forge?.underConstruction),
    towersBuilt: w.towers.filter((tw) => tw.level > 0 || tw.underConstruction).length,
  };
}

function syncNaturallyLearnedTopics(w: WorldState, adv: SpiritAdvisorState): void {
  const learned = adv.learnedTopics;
  const done = w.completedActionClasses ?? {};
  if (done.tree || w.trees.some((tr) => tr.chopped || tr.marked)) learned.cut_trees = true;
  if (done.rock || w.rocks.some((rk) => rk.mined || rk.marked)) learned.mine_stone = true;
  if (w.hall.level >= 2) learned.upgrade_hall = true;
  if (w.farms.some((f) => f.level > 0 || f.underConstruction)) learned.build_farm = true;
  if (w.banker.balance > 0) learned.deposit_banker = true;
  if (w.towers.some((tw) => tw.level > 0 || tw.underConstruction)) learned.build_tower = true;
  if (w.camps.some((c) => c.isBrewery || c.breweryUnderConstruction)) learned.build_brewery = true;
  if (w.camps.some((c) => (c.beerStock ?? 0) > 0)) learned.brew_beer = true;
  if ((w.berryBushes ?? []).some((b) => b.marked)) learned.winter_berries = true;
  if (w.forge?.built || w.forge?.underConstruction) learned.build_forge = true;
  if (w.boat.built || w.boat.underConstruction || w.boat.coinsPaid > 0) learned.build_boat = true;
  if (w.boat.bellRung || w.boat.crewArchers + w.boat.crewWarriors > 0) learned.board_boat = true;
  if (w.currentIsland >= 2) learned.sail_island = true;
  if (w.portals.some((p) => p.destroyed)) learned.attack_portal = true;
}

function findNearestByX<T extends { x: number }>(items: T[], refX: number): T | undefined {
  let best: T | undefined;
  let bestDist = Infinity;
  for (const item of items) {
    const d = Math.abs(item.x - refX);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

interface SpiritRecommendation {
  topic: SpiritAdviceTopic;
  targetX: number;
  message: string;
}

function selectBestSpiritAdvice(w: WorldState, mode: 'manual' | 'auto_5min'): SpiritRecommendation | null {
  const m = w.monarchs[0];
  if (!m) return null;
  const adv = ensureSpiritAdvisor(w);
  syncNaturallyLearnedTopics(w, adv);
  const learned = adv.learnedTopics;

  const archers = w.villagers.filter((v) => v.role === 'archer' && v.state !== 'embarked').length;
  const builders = w.villagers.filter((v) => v.role === 'builder' && v.state !== 'embarked').length;
  const warriors = w.villagers.filter((v) => v.role === 'warrior' && v.state !== 'embarked').length;
  const farmers = w.villagers.filter((v) => v.role === 'producer' && v.state !== 'embarked').length;
  const totalWorkers = archers + builders + warriors + farmers + w.villagers.filter((v) => v.role === 'peasant').length;
  const wanderers = w.villagers.filter((v) => v.role === 'wanderer');
  const brokenWall = findNearestByX(w.walls.filter((wall) => wall.destroyed), m.x);
  const uncutTree = findNearestByX(w.trees.filter((tr) => !tr.chopped && !tr.marked), m.x);
  const unminedRock = findNearestByX(w.rocks.filter((rk) => !rk.mined && !rk.marked), m.x);
  const activePortals = w.portals.filter((p) => !p.destroyed);
  const nearestPortal = findNearestByX(activePortals, m.x);
  const unbuiltFarm = findNearestByX(w.farms.filter((f) => f.level === 0 && !f.underConstruction), m.x);
  const activeFarms = w.farms.filter((f) => f.level > 0).length;
  const brewerySite = findNearestByX(
    w.camps.filter((c) => c.active && c.isBrewerySite && !c.isBrewery && !c.breweryUnderConstruction),
    m.x
  );
  const activeBrewery = findNearestByX(
    w.camps.filter((c) => c.active && c.isBrewery && (c.beerStock ?? 0) < BREWERY_MAX_BEERS),
    m.x
  );
  const unbuiltTower = findNearestByX(w.towers.filter((tw) => tw.level === 0 && !tw.underConstruction), m.x);
  const ripeBerry = findNearestByX((w.berryBushes ?? []).filter((b) => b.berries > 0 && !b.marked), m.x);
  const bowShop = w.shops.find((s) => s.kind === 'bow');
  const hammerShop = w.shops.find((s) => s.kind === 'hammer');
  const seedShop = w.shops.find((s) => s.kind === 'seed');
  const swordShop = w.shops.find((s) => s.kind === 'sword');
  const embarkedTotal = w.boat.crewArchers + w.boat.crewWarriors + w.boat.crewBuilders + w.boat.crewProducers;
  const daysToBloodMoon = w.day % 15 === 0 ? 0 : 15 - (w.day % 15);
  const weakestWall = w.walls
    .filter((wall) => !wall.destroyed && wall.level < Math.min(w.hall.level, MAX_KINGDOM_LEVEL))
    .sort((a, b) => a.level - b.level || Math.abs(a.x - m.x) - Math.abs(b.x - m.x))[0];

  // =====================================================================
  // MODE A: AUTOMATIC 5-MINUTE LESSON — teaches something NEW not yet done!
  // =====================================================================
  if (mode === 'auto_5min') {
    if (!learned.cut_trees && uncutTree) {
      return {
        topic: 'cut_trees',
        targetX: uncutTree.x,
        message: 'Pague 1 moeda em árvores para seus construtores cortarem madeira e abrirem espaço para caça!',
      };
    }
    if (!learned.mine_stone && unminedRock) {
      return {
        topic: 'mine_stone',
        targetX: unminedRock.x,
        message: 'Minere pedras pagando moedas nas rochas! Pedra é essencial para evoluir muralhas e o Reino.',
      };
    }
    if (!learned.upgrade_hall && w.hall.level < 2) {
      return {
        topic: 'upgrade_hall',
        targetX: w.hall.x,
        message: 'Evolua seu Salão do Reino para Nv.2! Isso libera Fazendas, Torres e o Banqueiro.',
      };
    }
    if (!learned.build_farm && w.hall.level >= 2 && w.season !== 'winter' && unbuiltFarm) {
      return {
        topic: 'build_farm',
        targetX: unbuiltFarm.x,
        message: 'Construa uma Fazenda e contrate fazendeiros! Quando ela encher, o Banqueiro recolhe o ouro.',
      };
    }
    if (!learned.deposit_banker && w.hall.level >= 2 && m.coins >= 8) {
      return {
        topic: 'deposit_banker',
        targetX: w.banker.x,
        message: 'Guarde moedas extras no Banqueiro! Elas rendem juros todo dia e salvam seu reino no Inverno.',
      };
    }
    if (!learned.build_tower && w.hall.level >= 2 && unbuiltTower) {
      return {
        topic: 'build_tower',
        targetX: unbuiltTower.x,
        message: 'Construa uma Torre de Arqueiros! Arqueiros no alto atiram longe sem levar dano dos Draugrs.',
      };
    }
    if (!learned.build_brewery && w.hall.level >= 2 && brewerySite) {
      return {
        topic: 'build_brewery',
        targetX: brewerySite.x,
        message: 'Transforme a 1ª barraca em Cervejaria (15 moedas + madeira/pedra) para atrair vagabundos dos dois lados!',
      };
    }
    if (!learned.winter_berries && w.season === 'winter' && ripeBerry) {
      return {
        topic: 'winter_berries',
        targetX: ripeBerry.x,
        message: 'No Inverno as fazendas congelam! Pague moitas de frutinhas para seus fazendeiros coletarem e pescarem.',
      };
    }
    if (!learned.build_forge && w.currentIsland >= 2 && w.hall.level >= 3 && w.forge && !w.forge.built) {
      return {
        topic: 'build_forge',
        targetX: w.forge.x,
        message: 'Construa a Forja para fundir Ferro! Você vai precisar dele para muralhas e tropas avançadas.',
      };
    }
    if (!learned.build_boat && w.hall.level >= 2 && !w.boat.built) {
      return {
        topic: 'build_boat',
        targetX: w.boat.x,
        message: 'Construa o Barco Drakkar na margem! Quando ficar pronto, ele cai na água pronto para levar sua tropa.',
      };
    }
    if (!learned.board_boat && w.boat.built && embarkedTotal < 3) {
      return {
        topic: 'board_boat',
        targetX: w.boat.x,
        message: 'Toque o sino do Barco Drakkar para chamar arqueiros e guerreiros — eles até defendem do convés!',
      };
    }
    if (!learned.sail_island && w.boat.built && embarkedTotal >= 3) {
      return {
        topic: 'sail_island',
        targetX: w.boat.x,
        message: 'Deposite 10 moedas no Barco Drakkar para zarpar à próxima ilha e expandir seu império nórdico!',
      };
    }
    if (!learned.attack_portal && warriors >= 4 && archers >= 4 && nearestPortal) {
      return {
        topic: 'attack_portal',
        targetX: nearestPortal.x,
        message: 'Seu exército já está forte! Use o comando de Ataque [Z] para marchar e destruir o Portal Draugr!',
      };
    }
    return null;
  }

  // =====================================================================
  // MODE B: MANUAL SUMMON — real-time strategic recommendation for current state!
  // =====================================================================

  // 1. Emergency: Broken wall
  if (brokenWall) {
    return {
      topic: 'repair_wall',
      targetX: brokenWall.x,
      message: 'Alerta! Muralha destruída — reforme essa defesa imediatamente antes que a noite chegue!',
    };
  }

  // 2. Emergency: Blood Moon coming in <= 2 days
  if (daysToBloodMoon <= 2 && (archers < 3 + w.currentIsland || weakestWall)) {
    const tgt = weakestWall ? weakestWall.x : (bowShop?.x ?? w.hall.x);
    return {
      topic: 'blood_moon_prep',
      targetX: tgt,
      message:
        daysToBloodMoon === 0
          ? 'Lua de Sangue HOJE! Reforce muralhas e mantenha arqueiros e guerreiros em ambos os lados!'
          : `Lua de Sangue em ${daysToBloodMoon} dia(s)! Fortifique muralhas e recrute tropas agora!`,
    };
  }

  // 3. Overflowing coin pouch -> Deposit in Banker!
  if (w.hall.level >= 2 && m.coins >= Math.max(18, m.maxCoins - 4)) {
    return {
      topic: 'deposit_banker',
      targetX: w.banker.x,
      message: 'Você está com muitas moedas na bolsa! Guarde no Banqueiro para não perder ouro e render juros.',
    };
  }

  // 4. Winter survival logic
  if (w.season === 'winter') {
    if (m.coins <= 4 && w.banker.balance >= 4) {
      return {
        topic: 'withdraw_banker',
        targetX: w.banker.x,
        message: `Inverno rigoroso sem renda de fazendas! Saque moedas do Banqueiro (${w.banker.balance}g guardadas).`,
      };
    }
    if (ripeBerry && m.coins >= 1) {
      return {
        topic: 'winter_berries',
        targetX: ripeBerry.x,
        message: 'Inverno: fazendas paradas! Pague moitas de frutinhas para fazendeiros coletarem e pescarem no rio.',
      };
    }
  }

  // 5. Missing essential workers
  if (builders === 0) {
    const tgt = wanderers.length > 0 ? findNearestByX(wanderers, m.x)!.x : (hammerShop?.x ?? w.hall.x);
    return {
      topic: 'hire_builder',
      targetX: tgt,
      message: 'Você está sem Construtores! Recrute um vagabundo e forje um Martelo para construir e reparar.',
    };
  }
  if (archers < Math.min(5, 2 + w.currentIsland)) {
    const tgt =
      w.villagers.some((v) => v.role === 'peasant')
        ? (bowShop?.x ?? w.hall.x)
        : (findNearestByX(wanderers, m.x)?.x ?? bowShop?.x ?? w.hall.x);
    return {
      topic: 'hire_archer',
      targetX: tgt,
      message:
        w.season === 'summer' || w.season === 'spring'
          ? `Contrate mais Arqueiros (${archers})! Nesta estação há alta caça de animais para gerar ouro rápido.`
          : `Reforce seus Arqueiros (${archers}) para proteger os muros e caçar animais pelo reino!`,
    };
  }

  // 6. Low Wood or Stone -> Cut Trees / Mine Stone (season-aware!)
  if (w.resources.wood < 6 && uncutTree) {
    return {
      topic: 'cut_trees',
      targetX: uncutTree.x,
      message:
        w.season === 'autumn'
          ? 'Outono tem alta produção de árvores! Corte árvores agora para estocar madeira.'
          : 'Sua madeira está baixa! Marque árvores próximas para seus construtores cortarem.',
    };
  }
  if (w.resources.stone < 5 && unminedRock) {
    return {
      topic: 'mine_stone',
      targetX: unminedRock.x,
      message: 'Suas pedras estão baixas! Marque rochas para minerar e conseguir evoluir muralhas e o Reino.',
    };
  }

  // 7. Need more population -> Recruit wanderers or build/stock Brewery!
  if (totalWorkers < 6 + w.hall.level * 2) {
    const nearWanderer = findNearestByX(wanderers, m.x);
    if (nearWanderer) {
      return {
        topic: 'recruit_wanderers',
        targetX: nearWanderer.x,
        message: 'Há vagabundos esperando no acampamento! Pague 1 moeda para aumentar sua população.',
      };
    }
    if (activeBrewery && m.coins >= BREWERY_BEER_COST) {
      return {
        topic: 'brew_beer',
        targetX: activeBrewery.x,
        message: 'Abasteça sua Cervejaria (4 moedas/cerveja) para atrair novos vagabundos dos dois lados do mapa!',
      };
    }
    if (brewerySite && w.hall.level >= 2) {
      return {
        topic: 'build_brewery',
        targetX: brewerySite.x,
        message: 'Poucos vagabundos aparecendo! Transforme a 1ª barraca em Cervejaria (15 moedas + madeira/pedra).',
      };
    }
  }

  // 8. Economy: Farms & Farmers (Spring/Summer/Autumn)
  if (w.season !== 'winter' && w.hall.level >= 2) {
    if (unbuiltFarm) {
      return {
        topic: 'build_farm',
        targetX: unbuiltFarm.x,
        message:
          w.season === 'spring'
            ? 'Primavera dá alta produção nas fazendas! Construa fazendas agora para multiplicar seu ouro!'
            : 'Construa uma Fazenda para gerar renda estável — o Banqueiro recolhe tudo de manhã!',
      };
    }
    if (activeFarms > 0 && farmers < activeFarms * 2 && seedShop) {
      return {
        topic: 'hire_farmer',
        targetX: seedShop.x,
        message: 'Compre bolsas de sementes para colocar mais Fazendeiros produzindo moedas antes do Inverno!',
      };
    }
  }

  // 9. Fortify weak walls
  if (weakestWall) {
    return {
      topic: 'fortify_wall',
      targetX: weakestWall.x,
      message: `Fortifique sua muralha (Nv.${weakestWall.level} → Nv.${weakestWall.level + 1}) para segurar invasões mais pesadas!`,
    };
  }

  // 10. Strong enough to attack a Portal!
  if (warriors >= 4 && archers >= 5 && nearestPortal) {
    return {
      topic: 'attack_portal',
      targetX: nearestPortal.x,
      message: `Exército pronto (${warriors} guerreiros, ${archers} arqueiros)! Ataque o Portal Draugr com [Z] + direção!`,
    };
  }

  // 11. Boat construction / Boarding / Sailing to next island
  if (w.boat.built) {
    if (embarkedTotal < 4) {
      return {
        topic: 'board_boat',
        targetX: w.boat.x,
        message: 'Barco Drakkar na água! Toque o sino do barco para embarcar arqueiros e guerreiros antes de zarpar.',
      };
    }
    return {
      topic: 'sail_island',
      targetX: w.boat.x,
      message: 'Barco pronto e tripulado! Deposite 10 moedas no Drakkar para zarpar rumo à próxima ilha!',
    };
  }
  if (!w.boat.built && w.hall.level >= 2 && (w.day >= 4 || w.currentIsland >= 2)) {
    return {
      topic: 'build_boat',
      targetX: w.boat.x,
      message: 'Já é hora de montar o Barco Drakkar! Invista moedas no casco para poder avançar de ilha.',
    };
  }

  // 12. Forge / Towers / Warriors / Kingdom Hall upgrade
  if (w.currentIsland >= 2 && w.hall.level >= 3 && w.forge && !w.forge.built) {
    return {
      topic: 'build_forge',
      targetX: w.forge.x,
      message: 'Construa a Forja para fundir Ferro e desbloquear muralhas e tropas mais resistentes!',
    };
  }
  if (unbuiltTower && w.hall.level >= 2) {
    return {
      topic: 'build_tower',
      targetX: unbuiltTower.x,
      message: 'Construa uma Torre de Arqueiros para reforçar o fogo defensivo nas fronteiras do reino!',
    };
  }
  if (w.currentIsland >= 3 && warriors < 3 && swordShop) {
    return {
      topic: 'hire_warrior',
      targetX: swordShop.x,
      message: 'Forje Espadas para formar Guerreiros capazes de liderar ataques contra os Portais Draugr!',
    };
  }
  if (w.hall.level < MAX_KINGDOM_LEVEL) {
    return {
      topic: 'upgrade_hall',
      targetX: w.hall.x,
      message: `Evolua o Salão do Reino (Nv.${w.hall.level + 1}) para desbloquear muralhas e fazendas mais fortes!`,
    };
  }

  // 13. Seasonal best-practice fallback
  if (w.season === 'winter') {
    return {
      topic: 'winter_economy',
      targetX: w.banker.x,
      message: 'Inverno: sobreviva com o ouro do Banqueiro, frutinhas e peixes até a Primavera chegar!',
    };
  }
  if (w.season === 'autumn') {
    return {
      topic: 'autumn_wood',
      targetX: uncutTree?.x ?? w.hall.x,
      message: 'Outono: aproveite a alta produção de madeira e animais para preparar reservas para o Inverno!',
    };
  }
  if (w.season === 'spring') {
    return {
      topic: 'spring_boom',
      targetX: w.farms[0]?.x ?? w.hall.x,
      message: 'Primavera: alta produção em fazendas, animais e árvores! Acumule ouro no Banqueiro!',
    };
  }
  return {
    topic: 'summer_hunt',
    targetX: bowShop?.x ?? w.hall.x,
    message: 'Verão: ótima estação para caçar com arqueiros, expandir muralhas e estocar ouro!',
  };
}

function hasPlayerExecutedAdvice(w: WorldState, adv: SpiritAdvisorState): boolean {
  const b = adv.baseline;
  const topic = adv.topic;
  if (!b || !topic) return false;
  const m = w.monarchs[0];

  switch (topic) {
    case 'cut_trees':
    case 'autumn_wood':
      return w.resources.wood > b.wood || w.trees.filter((tr) => tr.marked || tr.chopped).length > b.treesMarked;
    case 'mine_stone':
      return w.resources.stone > b.stone || w.rocks.filter((rk) => rk.marked || rk.mined).length > b.rocksMarked;
    case 'recruit_wanderers':
      return w.stats.villagersRecruited > b.wanderersRecruited;
    case 'hire_archer':
    case 'summer_hunt':
      return w.villagers.filter((v) => v.role === 'archer').length > b.archers;
    case 'hire_builder':
      return w.villagers.filter((v) => v.role === 'builder').length > b.builders;
    case 'hire_warrior':
      return w.villagers.filter((v) => v.role === 'warrior').length > b.warriors;
    case 'hire_farmer':
      return w.villagers.filter((v) => v.role === 'producer').length > b.farmers;
    case 'build_farm':
    case 'spring_boom':
      return w.farms.filter((f) => f.level > 0 || f.underConstruction).length > b.farmsBuilt;
    case 'upgrade_hall':
      return w.hall.level > b.hallLevel;
    case 'fortify_wall':
    case 'blood_moon_prep':
      return w.walls.reduce((sum, wall) => sum + wall.level + (wall.underConstruction ? 0.5 : 0), 0) > b.totalWallLevels;
    case 'repair_wall':
      return w.walls.filter((wall) => wall.destroyed).length < b.brokenWalls;
    case 'deposit_banker':
      return w.banker.balance > b.bankerBalance;
    case 'withdraw_banker':
    case 'winter_economy':
      return w.banker.balance < b.bankerBalance || (m ? m.coins > b.monarchCoins + 1 : false);
    case 'winter_berries':
      return (w.berryBushes ?? []).filter((bush) => bush.marked).length > b.berryMarkedCount;
    case 'build_brewery':
      return w.camps.filter((c) => c.isBrewery || c.breweryUnderConstruction).length > b.breweriesBuilt;
    case 'brew_beer':
      return w.camps.reduce((sum, c) => sum + (c.beerStock ?? 0), 0) > b.beersStocked;
    case 'build_forge':
      return Boolean(w.forge?.built || w.forge?.underConstruction) && !b.forgeBuilt;
    case 'build_tower':
      return w.towers.filter((tw) => tw.level > 0 || tw.underConstruction).length > b.towersBuilt;
    case 'build_boat':
      return w.boat.coinsPaid + w.boat.buildProgress * 10 > b.boatProgress || (w.boat.built && !b.boatBuilt);
    case 'board_boat':
      return w.boat.crewArchers + w.boat.crewWarriors + w.boat.crewBuilders + w.boat.crewProducers > b.boatCrew;
    case 'sail_island':
      return w.boat.sailCoinsPaid > b.sailPaid;
    case 'attack_portal':
      return w.portals.filter((p) => !p.destroyed).length < b.portalsLeft || w.activeCommand === 'attack';
    default:
      return false;
  }
}

function launchSpiritAdvice(w: WorldState, rec: SpiritRecommendation, manualSummon: boolean): void {
  const adv = ensureSpiritAdvisor(w);
  const btnPos = getSpiritButtonWorldPos(w);
  adv.phase = 'emerging';
  adv.topic = rec.topic;
  adv.message = rec.message;
  adv.targetX = rec.targetX;
  adv.spiritX = btnPos.x;
  adv.spiritY = btnPos.y;
  adv.spiritAlpha = 0.2;
  adv.animProgress = 0;
  adv.baseline = captureAdvisorBaseline(w);
  adv.activeTimer = 0;
  adv.completedTimer = 0;
  adv.autoTeachTimer = 0;
  adv.manualSummon = manualSummon;
  sound.playCoinPickup();
  spawnBurst(w, btnPos.x, btnPos.y, 16, '#7ef5ff', 'spark', 46);
}

/**
 * Dismisses the active Spirit Advisor, swooping it smoothly back into the bottom-right blue button!
 */
export function dismissSpiritAdvisor(w: WorldState): void {
  if (w.tutorial?.active) {
    skipTutorial(w);
    return;
  }
  const adv = ensureSpiritAdvisor(w);
  if (adv.phase === 'docked' || adv.phase === 'returning') return;
  if (adv.topic && !adv.manualSummon) {
    adv.learnedTopics[adv.topic] = true;
  }
  adv.phase = 'returning';
  adv.animProgress = 0;
  adv.completedTimer = 0;
  sound.playCoinDrop();
  spawnBurst(w, adv.spiritX, adv.spiritY, 10, '#7ef5ff', 'spark', 36);
}

/**
 * Bottom-right Blue Spirit Button click handler:
 * - If Spirit is docked: summons it out of the button with the smartest recommendation for the player's current stage!
 * - If Spirit is active/emerging (including initial tutorial): recalls it smoothly back into the blue button!
 */
export function summonOrDismissSpiritAdvisor(w: WorldState): 'summoned' | 'dismissed' {
  if (w.tutorial?.active) {
    skipTutorial(w);
    return 'dismissed';
  }
  const adv = ensureSpiritAdvisor(w);
  if (adv.phase === 'active' || adv.phase === 'emerging') {
    dismissSpiritAdvisor(w);
    return 'dismissed';
  }
  const rec = selectBestSpiritAdvice(w, 'manual');
  if (!rec) return 'dismissed';
  launchSpiritAdvice(w, rec, true);
  return 'summoned';
}

function updateSpiritAdvisor(w: WorldState, dt: number): void {
  if (w.tutorial?.active) return;
  const m = w.monarchs[0];
  if (!m) return;

  const adv = ensureSpiritAdvisor(w);
  const btnPos = getSpiritButtonWorldPos(w);

  if (adv.phase === 'docked') {
    adv.spiritX = btnPos.x;
    adv.spiritY = btnPos.y;
    adv.spiritAlpha = 0;
    adv.autoTeachTimer += dt;
    // Every 5 minutes (300s) of active play, automatically emerge to teach something NEW not yet done!
    if (adv.autoTeachTimer >= SPIRIT_AUTO_TEACH_INTERVAL) {
      adv.autoTeachTimer = 0;
      const rec = selectBestSpiritAdvice(w, 'auto_5min');
      if (rec) {
        launchSpiritAdvice(w, rec, false);
      }
    }
    return;
  }

  if (adv.phase === 'emerging') {
    adv.animProgress = Math.min(1, adv.animProgress + dt * 1.9);
    const p = adv.animProgress;
    const ease = 1 - Math.pow(1 - p, 3);
    const dxToTarget = adv.targetX - m.x;
    const dir: 1 | -1 = dxToTarget >= 0 ? 1 : -1;
    const goalX = Math.abs(dxToTarget) < 58 ? adv.targetX : m.x + dir * 42;
    const goalY = GROUND_Y - 44;
    const arcLift = Math.sin(p * Math.PI) * 28;
    adv.spiritX = btnPos.x + (goalX - btnPos.x) * ease;
    adv.spiritY = btnPos.y + (goalY - btnPos.y) * ease - arcLift;
    adv.spiritFacing = dir;
    adv.spiritAlpha = 0.25 + 0.7 * ease;
    if (Math.random() < dt * 14) {
      spawnParticle(w, {
        x: adv.spiritX,
        y: adv.spiritY,
        vx: (Math.random() - 0.5) * 14,
        vy: -6 - Math.random() * 10,
        size: 1.4,
        color: '#7ef5ff',
        alpha: 0.85,
        life: 0.42,
        maxLife: 0.42,
        kind: 'spark',
      });
    }
    if (p >= 1) {
      adv.phase = 'active';
      adv.spiritAlpha = 0.94;
    }
    return;
  }

  if (adv.phase === 'returning') {
    adv.animProgress = Math.min(1, adv.animProgress + dt * 2.2);
    const p = adv.animProgress;
    const ease = p * p * (3 - 2 * p);
    adv.spiritX += (btnPos.x - adv.spiritX) * Math.min(1, dt * (7.5 + ease * 10));
    adv.spiritY += (btnPos.y - adv.spiritY) * Math.min(1, dt * (7.5 + ease * 10));
    adv.spiritFacing = btnPos.x >= adv.spiritX ? 1 : -1;
    adv.spiritAlpha = Math.max(0.05, 1 - ease * 0.92);
    if (Math.random() < dt * 18) {
      spawnParticle(w, {
        x: adv.spiritX,
        y: adv.spiritY,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16,
        size: 1.5,
        color: '#7ef5ff',
        alpha: 0.9,
        life: 0.38,
        maxLife: 0.38,
        kind: 'spark',
      });
    }
    if (p >= 1) {
      spawnBurst(w, btnPos.x, btnPos.y, 16, '#7ef5ff', 'spark', 46);
      adv.phase = 'docked';
      adv.topic = null;
      adv.message = '';
      adv.baseline = null;
      adv.spiritAlpha = 0;
    }
    return;
  }

  // Phase === 'active'
  adv.activeTimer += dt;

  // Check if player executed the advised action!
  if (adv.completedTimer > 0) {
    adv.completedTimer -= dt;
    if (adv.completedTimer <= 0) {
      adv.phase = 'returning';
      adv.animProgress = 0;
    }
  } else if (hasPlayerExecutedAdvice(w, adv)) {
    if (adv.topic) adv.learnedTopics[adv.topic] = true;
    adv.message = 'Excelente, Majestade! Até a próxima invocação!';
    adv.completedTimer = 1.8;
    sound.playBuildComplete();
    spawnBurst(w, adv.spiritX, adv.spiritY, 18, '#7ef5ff', 'spark', 55);
  } else if (adv.activeTimer >= 45) {
    // Auto-return smoothly to the blue button after 45s if left unattended
    adv.phase = 'returning';
    adv.animProgress = 0;
  }

  // Hover & point toward targetX (or directly above target structure when nearby!)
  const dxToTarget = adv.targetX - m.x;
  const dirToTarget: 1 | -1 = dxToTarget >= 0 ? 1 : -1;
  const nearTarget = Math.abs(dxToTarget) < 58;
  const desiredX = nearTarget ? adv.targetX : m.x + dirToTarget * 44;
  const desiredY = (nearTarget ? GROUND_Y - 48 : GROUND_Y - 40) + Math.sin(w.elapsed * 3.5) * 3.5;
  adv.spiritX += (desiredX - adv.spiritX) * Math.min(1, dt * 5);
  adv.spiritY += (desiredY - adv.spiritY) * Math.min(1, dt * 5);
  adv.spiritFacing = dirToTarget;
  adv.spiritAlpha += (0.94 - adv.spiritAlpha) * Math.min(1, dt * 5);

  if (Math.random() < dt * 7) {
    spawnParticle(w, {
      x: adv.spiritX + (Math.random() - 0.5) * 10,
      y: adv.spiritY + 4 + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 8,
      vy: -8 - Math.random() * 10,
      size: 1,
      color: Math.random() > 0.4 ? '#7ef5ff' : '#d4fbff',
      alpha: adv.spiritAlpha * 0.8,
      life: 0.55,
      maxLife: 0.55,
      kind: 'spark',
    });
  }
}

const IDLE_REMOTE_INPUT: InputState = {
  left: false,
  right: false,
  leftJustPressed: false,
  rightJustPressed: false,
  sprint: false,
  powerJustPressed: false,
  drop: false,
  dropJustPressed: false,
  cmdZ: false,
  cmdX: false,
  cmdC: false,
  cmdV: false,
};

export function stepWorld(
  w: WorldState,
  input: InputState,
  dt: number,
  remoteInputs?: Map<string, InputState>
): void {
  w.elapsed += dt;
  w.screenShake = Math.max(0, w.screenShake - dt);

  if (w.banner) {
    w.banner.timer -= dt;
    if (w.banner.timer <= 0) w.banner = null;
  }

  if (w.mode === 'login') {
    updateParticlesAndAmbience(w, dt);
    return;
  }

  if (w.mode === 'char_select') {
    w.selectTimer = Math.max(0, w.selectTimer - dt);
    if (w.monarchs[0]) w.monarchs[0].animTime += dt * 4;
    if (w.selectTimer <= 0) confirmCharacterSelection(w);
    return;
  }

  if (w.mode === 'crest_select') {
    w.selectTimer = Math.max(0, w.selectTimer - dt);
    if (w.selectTimer <= 0) confirmCrestAndStartCampaign(w);
    return;
  }

  if (w.mode !== 'playing') return;

  updateTacticalCommands(w, input, dt);

  const monarch = w.monarchs[0];
  if (monarch) updateMonarch(w, monarch, input, dt, true);

  // Step up to 3 remote Co-op guest monarchs in the Host's campaign
  for (let i = 1; i < w.monarchs.length; i++) {
    const gm = w.monarchs[i];
    const gInput = (gm.playerUid ? remoteInputs?.get(gm.playerUid) : undefined) ?? IDLE_REMOTE_INPUT;
    updateMonarch(w, gm, gInput, dt, false);
  }

  updateFlyingCoins(w, dt);
  updateForgeAndRegrowth(w, dt);
  updateFireTrailsAndLightning(w, dt);
  updateDayNightAndWaves(w, dt);
  updateBanker(w, dt);
  updateBoatAndBreweries(w, dt);
  updateTutorial(w, dt);
  updateSpiritAdvisor(w, dt);
  updateVillagers(w, dt);
  updateEnemies(w, dt);
  updateArrows(w, dt);
  updateCoins(w, dt);
  updateWildlife(w, dt);
  updateParticlesAndAmbience(w, dt);
}
