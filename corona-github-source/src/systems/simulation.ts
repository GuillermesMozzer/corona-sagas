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
  MAX_CREW_PER_CLASS,
  MAX_KINGDOM_LEVEL,
  WORLD_WIDTH,
  type ArcherTower,
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
  type ToolShopKind,
  type Villager,
  type VillagerRole,
  type Wall,
  type WorldState,
} from '../types';
import { generateIslandSnapshot, heightForTreeSize, sizeFromVariant } from '../world/initWorld';
import { getIslandDef } from '../world/islands';
import { GOD_DEFS, MOUNT_DEFS } from '../world/mountsAndGods';

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

export function getDockBuildResourceCost(): ResourceCost {
  return { coins: DOCK_BUILD_COST, wood: 12, stone: 10, iron: 2 };
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
    Math.round(w.day + (islandDef.difficultyBase - 1) * 2.5 + (w.isBloodMoon ? 3 : 0))
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
    };
    w.dock = { ...nextSnap.dock };
    w.godShrine = nextSnap.godShrine ? { ...nextSnap.godShrine } : null;
    w.mountShrine = nextSnap.mountShrine ? { ...nextSnap.mountShrine } : null;
    w.puzzle = nextSnap.puzzle ? { ...nextSnap.puzzle } : null;
    w.camps = nextSnap.camps.map((c) => ({ ...c }));
    w.trees = nextSnap.trees.map((tr) => ({ ...tr }));
    w.rocks = nextSnap.rocks.map((r) => ({ ...r }));
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
    // Fresh unexplored island! Boat arrives ashore; Dock must be built!
    const fresh = generateIslandSnapshot(targetIslandId, () => uid(w), embarkedCrew);
    w.hall = fresh.hall;
    w.forge = fresh.forge;
    w.shops = fresh.shops;
    w.walls = fresh.walls;
    w.towers = fresh.towers;
    w.farms = fresh.farms;
    w.islandBuffs = fresh.islandBuffs;
    w.boat = fresh.boat;
    w.dock = fresh.dock;
    w.godShrine = fresh.godShrine;
    w.mountShrine = fresh.mountShrine;
    w.puzzle = fresh.puzzle;
    w.camps = fresh.camps;
    w.trees = fresh.trees;
    w.rocks = fresh.rocks;
    w.chests = fresh.chests;
    w.portals = fresh.portals;
    w.villagers = fresh.villagers;
    w.rockRegrowQueue = fresh.rockRegrowQueue;
    w.rockRegrowTimer = fresh.rockRegrowTimer;
    w.treeRegrowQueue = fresh.treeRegrowQueue;
    w.treeRegrowTimer = fresh.treeRegrowTimer;
  }

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
  showBanner(
    w,
    def.name[lang],
    w.dock.built ? def.subtitle[lang] : 'Construa o Porto (30🪙 + Madeira/Pedra/Ferro) e ative os Buffs da ilha!',
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

export function withdrawFromBanker(w: WorldState): boolean {
  const m = w.monarchs[0];
  if (!m || w.mode !== 'playing' || w.hall.level < 1) return false;
  if (Math.abs(m.x - w.banker.x) > 46) return false;
  if (w.banker.balance <= 0) return false;
  const room = m.maxCoins - m.coins;
  if (room <= 0) {
    showBanner(w, 'BOLSA CHEIA', `Sua bolsa comporta até ${m.maxCoins} moedas!`, '#ffe066');
    return false;
  }
  const take = Math.min(5, w.banker.balance, room);
  w.banker.balance -= take;
  m.coins += take;
  w.resources.gold = m.coins;
  sound.playCoinPickup();
  spawnBurst(w, w.banker.x, GROUND_Y - 18, 8, '#ffe066', 'spark', 40);
  saveCampaign(w);
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

function computeActivePrompt(w: WorldState, m: Monarch): FloatingPrompt | null {
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
    } else if (resCost.coins > 0 && w.hall.coinsPaid + pending < resCost.coins) {
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
      bestDist = bankDist;
      best = {
        x: w.banker.x,
        y: GROUND_Y - 40,
        label: `${t('prompt_banker')} (+${ratePct}%/dia)`,
        cost: 1,
        paid: 0,
        pending: 0,
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
        if (w.forge.coinsPaid + pending < fCost.coins) {
          bestDist = forgeDist;
          best = {
            x: w.forge.x,
            y: GROUND_Y - 42,
            label: t('prompt_forge_build'),
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
        if (w.forge.smeltCoinsPaid + pending < sCost.coins) {
          const outIron = getForgeIronOutput(w);
          bestDist = forgeDist;
          best = {
            x: w.forge.x,
            y: GROUND_Y - 42,
            label: `${t('prompt_forge_smelt')} (+${outIron})`,
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
        if (shop.coinsPaid + pending < shopCost) {
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
        if (farm.coinsPaid + pending < fCost.coins) {
          bestDist = d;
          best = {
            x: farm.x,
            y: GROUND_Y - 40,
            label:
              farm.level === 0
                ? t('prompt_farm_build')
                : `${t('prompt_farm_upgrade')} Nv.${farm.level + 1}`,
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
        if (tower.coinsPaid + pending < tCost.coins) {
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
        if (buff.coinsPaid + pending < bCost.coins) {
          bestDist = d;
          best = {
            x: buff.x,
            y: GROUND_Y - 46,
            label:
              buff.kind === 'construction'
                ? t('prompt_buff_construction')
                : t('prompt_buff_forge'),
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
      const dockCost = getDockBuildResourceCost();
      const pending = countPendingFlyingCoins(w, 'dock_build', 0);
      if (w.dock.coinsPaid + pending < dockCost.coins) {
        bestDist = d;
        best = {
          x: w.dock.x,
          y: GROUND_Y - 40,
          label: t('prompt_dock_build'),
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
      if (w.boat.coinsPaid + pending < boatCost.coins) {
        bestDist = boatDist;
        best = {
          x: w.boat.x,
          y: GROUND_Y - 48,
          label: t('prompt_boat_build'),
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
      if (w.boat.sailCoinsPaid + pending < BOAT_SAIL_COST) {
        bestDist = boatDist;
        best = {
          x: w.boat.x,
          y: GROUND_Y - 52,
          label: t('prompt_boat_sail'),
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
        if (pending < BELL_COST) {
          bestDist = bellDist;
          best = {
            x: w.boat.bellX,
            y: GROUND_Y - 38,
            label: t('prompt_boat_bell'),
            cost: BELL_COST,
            paid: 0,
            pending,
            targetType: 'boat_bell',
            targetId: 0,
          };
        }
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
        if (wall.coinsPaid + pending < wCost.coins) {
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
        if (w.godShrine.diamondsPaid + pending < godDef.diamondCost) {
          bestDist = d;
          best = {
            x: w.godShrine.x,
            y: GROUND_Y - 48,
            label: `${godDef.name.toUpperCase()} (${godDef.diamondCost}◆)`,
            cost: godDef.diamondCost,
            paid: w.godShrine.diamondsPaid,
            pending,
            currency: 'diamond',
            targetType: 'god_shrine',
            targetId: 0,
          };
        }
      } else if (w.activeGod !== w.godShrine.godId) {
        if (w.godShrine.coinsPaid + pending < godDef.coinCost) {
          bestDist = d;
          best = {
            x: w.godShrine.x,
            y: GROUND_Y - 48,
            label: `INVOCAR ${godDef.name.toUpperCase()}`,
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
        if (w.mountShrine.diamondsPaid + pending < mountDef.diamondCost) {
          bestDist = d;
          best = {
            x: w.mountShrine.x,
            y: GROUND_Y - 42,
            label: `${mountDef.name[lang].toUpperCase()} (${mountDef.diamondCost}◆)`,
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
        if (w.mountShrine.coinsPaid + pending < coinCost) {
          bestDist = d;
          best = {
            x: w.mountShrine.x,
            y: GROUND_Y - 42,
            label: `${alreadyTamed ? 'MONTAR' : 'DOMAR'} ${mountDef.name[lang].toUpperCase()}`,
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
      if (w.puzzle.coinsPaid + pending < 3) {
        bestDist = d;
        best = {
          x: w.puzzle.x,
          y: GROUND_Y - 42,
          label: 'ENIGMA RÚNICO (+2◆)',
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

  // 8. Nearest wanderer
  for (const v of w.villagers) {
    if (v.role !== 'wanderer') continue;
    const d = Math.abs(m.x - v.x);
    if (d < 28 && d < bestDist) {
      bestDist = d;
      best = {
        x: v.x,
        y: GROUND_Y - 32,
        label: t('prompt_recruit'),
        cost: 1,
        paid: 0,
        pending: 0,
        targetType: 'wanderer',
        targetId: v.id,
      };
    }
  }

  // 9. Rocks (3 sizes: P +5 / 30s, M +7 / 45s, G +15 / 90s)
  for (const rock of w.rocks) {
    if (rock.mined || rock.marked) continue;
    const d = Math.abs(m.x - rock.x);
    if (d < 26 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'rock', rock.id);
      if (pending < 1) {
        const spec = getRockSpec(rock.size ?? sizeFromVariant(rock.variant));
        bestDist = d;
        best = {
          x: rock.x,
          y: GROUND_Y - 28,
          label: `${t('prompt_rock')} ${t(spec.sizeKey)} (+${spec.stone} · ${spec.time}s)`,
          cost: 1,
          paid: 0,
          pending,
          targetType: 'rock',
          targetId: rock.id,
        };
      }
    }
  }

  // 10. Trees (3 sizes: P +4 / 20s, M +7 / 35s, G +12 / 60s)
  for (const tree of w.trees) {
    if (tree.chopped || tree.marked) continue;
    const d = Math.abs(m.x - tree.x);
    if (d < 26 && d < bestDist) {
      const pending = countPendingFlyingCoins(w, 'tree', tree.id);
      if (pending < 1) {
        const spec = getTreeSpec(tree.size ?? sizeFromVariant(tree.variant));
        bestDist = d;
        best = {
          x: tree.x,
          y: GROUND_Y - 46,
          label: `${t('prompt_tree')} ${t(spec.sizeKey)} (+${spec.wood} · ${spec.time}s)`,
          cost: 1,
          paid: 0,
          pending,
          targetType: 'tree',
          targetId: tree.id,
        };
      }
    }
  }

  return best;
}

function getSlotWorldPos(prompt: FloatingPrompt, slotIndex: number): { x: number; y: number } {
  if (prompt.cost > 9 || prompt.targetType === 'banker') {
    return { x: prompt.x, y: prompt.y - 4 };
  }
  const slotStep = 10;
  const slotsW = prompt.cost * slotStep - 2;
  const startX = prompt.x - slotsW / 2 + 3;
  return {
    x: startX + slotIndex * slotStep,
    y: prompt.y - 4,
  };
}

function applyFlyingCoinArrival(w: WorldState, fc: FlyingCoin): void {
  sound.playCoinSlot();
  spawnBurst(w, fc.targetX, fc.targetY, 6, fc.currency === 'diamond' ? '#7ef5ff' : '#ffe066', 'spark', 28);

  if (fc.targetType === 'banker') {
    w.banker.balance += 1;
    spawnBurst(w, w.banker.x, GROUND_Y - 18, 5, '#ffe066', 'spark', 24);
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
      consumeMaterials(w, resCost);
      w.hall.coinsPaid = 0;
      w.hall.level += 1;
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
        tower.targetLevel = tower.destroyed ? Math.max(1, tower.previousLevel) : tower.level + 1;
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
        sound.playHammer();
        showBanner(w, 'CASCO DO DRAKKAR PAGO!', 'Seus construtores estão finalizando o barco!', '#efc462');
      }
    }
    return;
  }

  if (fc.targetType === 'dock_build') {
    if (w.dock.required && !w.dock.built && !w.dock.underConstruction) {
      const dockCost = getDockBuildResourceCost();
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
        sound.playHammer();
        showBanner(w, 'PORTO PAGO!', 'Seus construtores estão erguendo o cais!', '#efc462');
      }
    }
    return;
  }

  if (fc.targetType === 'boat_bell') {
    ringShipBell(w);
    return;
  }

  if (fc.targetType === 'boat_sail') {
    if (w.boat.built && w.dock.built) {
      w.boat.sailCoinsPaid = Math.min(BOAT_SAIL_COST, w.boat.sailCoinsPaid + 1);
      if (w.boat.sailCoinsPaid >= BOAT_SAIL_COST) {
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
        wall.targetLevel = wall.destroyed ? Math.max(1, wall.previousLevel) : wall.level + 1;
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
      sound.playHammer();
      spawnBurst(w, tree.x, GROUND_Y - 18, 6, '#e5c16b', 'spark', 22);
    }
    return;
  }

  if (fc.targetType === 'rock') {
    const rock = w.rocks.find((r) => r.id === fc.targetId);
    if (rock && !rock.mined && !rock.marked) {
      rock.marked = true;
      sound.playHammer();
      spawnBurst(w, rock.x, GROUND_Y - 12, 6, '#cfdbe6', 'stone', 24);
    }
  }
}

function handleCoinDrop(w: WorldState, m: Monarch): void {
  if (m.dropCooldown > 0) return;

  const prompt = w.activePrompt;

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
    w.resources.diamonds = m.diamonds;
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
      duration: 0.32,
      currency: 'diamond',
      targetType: prompt.targetType,
      targetId: prompt.targetId,
    });
    return;
  }

  if (m.coins <= 0) return;

  m.coins -= 1;
  w.resources.gold = m.coins;
  m.dropCooldown = prompt?.targetType === 'banker' ? 0.09 : 0.16;
  sound.playCoinDrop();

  if (prompt && prompt.targetType !== 'wanderer') {
    const nextSlotIndex = Math.min(Math.max(0, prompt.cost - 1), prompt.paid + prompt.pending);
    const slotPos = getSlotWorldPos(prompt, nextSlotIndex);
    w.flyingCoins.push({
      id: uid(w),
      startX: m.x + m.facing * 4,
      startY: GROUND_Y - 16 - m.flyY,
      targetX: slotPos.x,
      targetY: slotPos.y,
      progress: 0,
      duration: prompt.targetType === 'banker' ? 0.22 : 0.3,
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

function updateMonarch(w: WorldState, m: Monarch, input: InputState, dt: number): void {
  m.dropCooldown = Math.max(0, m.dropCooldown - dt);
  m.hurtCooldown = Math.max(0, m.hurtCooldown - dt);
  m.mountPowerCooldown = Math.max(0, m.mountPowerCooldown - dt);
  m.roarTimer = Math.max(0, m.roarTimer - dt);
  m.wolfBiteCooldown = Math.max(0, m.wolfBiteCooldown - dt);

  const mountDef = MOUNT_DEFS[m.mount] ?? MOUNT_DEFS.starter;
  const lokiSpeedMult = w.activeGod === 'loki' ? 1.25 : 1.0;
  const lokiStaminaMult = w.activeGod === 'loki' ? 0.78 : 1.0;

  // Trigger mount active power via Shift / Attack button
  if (input.powerJustPressed) {
    triggerMountPower(w);
  }

  // Harpy smooth aerial elevation while flyTimer > 0
  if (m.flyTimer > 0) {
    m.flyTimer = Math.max(0, m.flyTimer - dt);
    m.flyY = Math.min(48, m.flyY + dt * 165);
  } else if (m.flyY > 0) {
    m.flyY = Math.max(0, m.flyY - dt * 135);
  }

  const commanding = w.activeCommand !== 'none';
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
    if (m.flyY <= 2) sound.playHoof(m.sprinting);
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

  // Open wilderness chests (gold + diamonds up to 5 per island!)
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
          m.diamonds += grant;
          w.resources.diamonds = m.diamonds;
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
    w.resources.gold = m.coins;
    sound.playCoinPickup();
    spawnBurst(w, w.hall.x, GROUND_Y - 22, 6, '#f7d265', 'spark', 32);
  }

  // Collect stored farm coins when riding past built farms!
  for (const farm of w.farms) {
    if (farm.level >= 1 && farm.storedCoins > 0 && Math.abs(m.x - farm.x) < 26 && m.coins < m.maxCoins) {
      const take = Math.min(farm.storedCoins, m.maxCoins - m.coins);
      farm.storedCoins -= take;
      m.coins += take;
      w.resources.gold = m.coins;
      sound.playCoinPickup();
      spawnBurst(w, farm.x, GROUND_Y - 16, 6, '#f7d265', 'spark', 28);
    }
  }

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

  w.activePrompt = computeActivePrompt(w, m);

  if (input.dropJustPressed || (input.drop && m.dropCooldown <= 0)) {
    handleCoinDrop(w, m);
  }
}

function updateFlyingCoins(w: WorldState, dt: number): void {
  for (let i = w.flyingCoins.length - 1; i >= 0; i--) {
    const fc = w.flyingCoins[i];
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

  // 2. Gradual Rock sprouting (starts Day 3, 1 by 1 slowly!)
  if (w.rockRegrowQueue > 0) {
    w.rockRegrowTimer -= dt;
    if (w.rockRegrowTimer <= 0) {
      w.rockRegrowTimer = 22 + Math.random() * 14;
      const minedRocks = w.rocks.filter((r) => r.mined);
      if (minedRocks.length > 0) {
        const pick = minedRocks[Math.floor(Math.random() * minedRocks.length)];
        const variant = Math.floor(Math.random() * 3) as 0 | 1 | 2;
        pick.variant = variant;
        pick.size = sizeFromVariant(variant);
        pick.mined = false;
        pick.marked = false;
        pick.mineProgress = 0;
        pick.hitShake = 0.2;
        w.rockRegrowQueue -= 1;
        spawnBurst(w, pick.x, GROUND_Y - 8, 8, '#bcc9d6', 'stone', 32);
      } else {
        w.rockRegrowQueue = 0;
      }
    }
  }

  // 3. Gradual Tree sprouting (every 5 days, little by little!)
  if (w.treeRegrowQueue > 0) {
    w.treeRegrowTimer -= dt;
    if (w.treeRegrowTimer <= 0) {
      w.treeRegrowTimer = 18 + Math.random() * 14;
      const choppedTrees = w.trees.filter((tr) => tr.chopped);
      if (choppedTrees.length > 0) {
        const pick = choppedTrees[Math.floor(Math.random() * choppedTrees.length)];
        const roll = Math.random();
        const variant: 0 | 1 | 2 = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
        const size = sizeFromVariant(variant);
        pick.variant = variant;
        pick.size = size;
        pick.height = heightForTreeSize(size, Math.random());
        pick.chopped = false;
        pick.marked = false;
        pick.chopProgress = 0;
        pick.hitShake = 0.2;
        w.treeRegrowQueue -= 1;
        spawnBurst(w, pick.x, GROUND_Y - 14, 8, '#69946b', 'leaf', 30);
      } else {
        w.treeRegrowQueue = 0;
      }
    }
  }
}

function pickProgressiveEnemyKind(w: WorldState, indexInQueue: number): EnemyKind {
  const threat = w.threatLevel;
  if ((w.isBloodMoon && w.day >= 4 && indexInQueue === 0) || (threat >= 8 && indexInQueue === 0 && Math.random() < 0.4)) {
    return 'frost_troll';
  }
  if (threat >= 4 && Math.random() < Math.min(0.28, 0.1 + (threat - 4) * 0.03)) {
    return 'hel_crow'; // Flying aerial enemy!
  }
  if (threat >= 3 && Math.random() < Math.min(0.32, 0.15 + (threat - 3) * 0.03)) {
    return 'draugr_brute';
  }
  if (threat >= 2 && Math.random() < Math.min(0.3, 0.12 + (threat - 2) * 0.03)) {
    return 'wolf_wraith';
  }
  return 'draugr';
}

function spawnProgressiveEnemy(w: WorldState, portalX: number, side: -1 | 1, kind: EnemyKind): void {
  const threatScale = 1 + Math.max(0, w.threatLevel - 2) * 0.08;
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
    w.isBloodMoon = w.day % 4 === 0;
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

    // 2. Passive Hall tribute (scales with Kingdom level Lv 2..10)
    if (w.hall.level >= 2) {
      const tribute = Math.min(20, 1 + w.hall.level * 2);
      w.hall.storedTaxCoins = Math.min(80, w.hall.storedTaxCoins + tribute);
    }

    // 3. DAILY FARM GENERATION: scales with Farm level (1..10), farmer count (2+level), storage cap & Freya (+50%)!
    const freyaMult = w.activeGod === 'freya' ? 1.5 : 1.0;
    let farmCoinsGenerated = 0;
    for (const farm of w.farms) {
      if (farm.level <= 0) continue;
      const maxFarmers = getFarmMaxFarmers(farm.level);
      const farmersHere = Math.min(maxFarmers, countFarmersAssignedToFarm(w, farm.id));
      if (farmersHere <= 0) continue;
      const yieldCoins = Math.round(farmersHere * (1 + farm.level * 0.85) * freyaMult);
      const storageCap = getFarmStorageCap(farm.level);
      farmCoinsGenerated += yieldCoins;
      const groundDrop = Math.min(8, yieldCoins);
      for (let c = 0; c < groundDrop; c++) {
        spawnCoin(
          w,
          farm.x + (Math.random() - 0.5) * 28,
          GROUND_Y - 12,
          (Math.random() - 0.5) * 45,
          -55 - Math.random() * 25,
          false,
          0.2
        );
      }
      const remainder = yieldCoins - groundDrop;
      if (remainder > 0) {
        farm.storedCoins = Math.min(storageCap, farm.storedCoins + remainder);
      }
      farm.storedFood = Math.min(storageCap, farm.storedFood + farmersHere * farm.level);
    }

    // 4. GRADUAL RESOURCE REGROWTH:
    // Rocks begin sprouting from Day 3 onward, little by little (1-2 per day)
    if (w.day >= 3) {
      const minedCount = w.rocks.filter((r) => r.mined).length;
      if (minedCount > 0) {
        const toAdd = minedCount >= 5 ? 2 : 1;
        w.rockRegrowQueue = Math.min(minedCount, w.rockRegrowQueue + toAdd);
        if (w.rockRegrowTimer <= 0) w.rockRegrowTimer = 10 + Math.random() * 10;
      }
    }
    // Trees sprout every 5 days, little by little (2-3 every 5 days)
    if (w.day % 5 === 0) {
      const choppedCount = w.trees.filter((tr) => tr.chopped).length;
      if (choppedCount > 0) {
        const toAdd = Math.min(3, choppedCount);
        w.treeRegrowQueue = Math.min(choppedCount, w.treeRegrowQueue + toAdd);
        if (w.treeRegrowTimer <= 0) w.treeRegrowTimer = 12 + Math.random() * 10;
      }
    }

    for (const enemy of w.enemies) enemy.retreating = true;

    for (const camp of w.camps) {
      if (!camp.active) continue;
      const nearbyWanderers = w.villagers.filter(
        (v) => v.role === 'wanderer' && v.homeCampId === camp.id
      ).length;
      if (nearbyWanderers < 2) {
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
    showBanner(
      w,
      w.isBloodMoon ? `${t('day_short')} ${w.day} — LUA DE SANGUE` : `${t('day_short')} ${w.day} · ${t('threat_lbl')} ${w.threatLevel}`,
      w.isBloodMoon
        ? `Ameaça Nv.${w.threatLevel} à noite! Reforce muros e torres${extraNotes}`
        : `Reino Nv.${w.hall.level}${extraNotes || ` · Dia de ${w.dayHalfMinutes} min`}`,
      w.isBloodMoon ? '#ff6b6b' : w.crest.secondaryColor
    );
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
        'Ataques mais fortes a cada noite — os portais de Helheim se abrem!',
        w.isBloodMoon ? '#ff5e6c' : '#8cc8ff'
      );
    }
  }

  // Progressive Night Sub-Waves scaled by threatLevel!
  // Attacks ONLY begin AFTER the first night (Day 2+ on Island 1, or any night on Island 2+)
  const queueSubWave = (multiplier: number) => {
    if (isFirstNightPeaceful) return;
    const baseCount = Math.min(12, Math.max(1, Math.round((1 + w.threatLevel * 0.85) * multiplier)));
    for (const portal of w.portals) {
      if (portal.destroyed) continue;
      portal.spawnQueue += Math.max(1, Math.floor(baseCount * (0.75 + Math.random() * 0.45)));
      portal.spawnCooldown = 1.1 + Math.random() * 1.4;
    }
  };

  if (!isFirstNightPeaceful && w.isNight && w.nightWaveStage === 0 && w.timeOfDay >= 0.51) {
    w.waveTriggeredTonight = true;
    queueSubWave(1.0);
    w.nightWaveStage = 1;
  } else if (!isFirstNightPeaceful && w.isNight && w.nightWaveStage === 1 && w.timeOfDay >= 0.67) {
    queueSubWave(w.threatLevel <= 2 ? 0.6 : 0.9);
    w.nightWaveStage = 2;
  } else if (!isFirstNightPeaceful && w.isNight && w.nightWaveStage === 2 && w.timeOfDay >= 0.81 && w.threatLevel >= 3) {
    queueSubWave(0.95);
    w.nightWaveStage = 3;
  }

  for (const portal of w.portals) {
    portal.pulseTime += dt;
    portal.hitFlash = Math.max(0, portal.hitFlash - dt);
    if (portal.destroyed) continue;

    if (portal.spawnQueue > 0 && w.isNight) {
      portal.spawnCooldown -= dt;
      if (portal.spawnCooldown <= 0) {
        portal.spawnQueue -= 1;
        portal.spawnCooldown = Math.max(0.65, 1.35 - w.threatLevel * 0.05) + Math.random() * 0.9;
        const kind = pickProgressiveEnemyKind(w, portal.spawnQueue);
        spawnProgressiveEnemy(w, portal.x, portal.side, kind);
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

function trySweepCoinsToHall(w: WorldState, v: Villager, dt: number): boolean {
  // If carrying coins, return them to the central Hall (Prefeitura)!
  if (v.carriedCoins > 0) {
    v.state = 'returning_coins';
    if (moveToward(v, w.hall.x, 48, dt)) {
      w.hall.storedTaxCoins = Math.min(60, w.hall.storedTaxCoins + v.carriedCoins);
      v.carriedCoins = 0;
      sound.playCoinPickup();
      spawnBurst(w, w.hall.x, GROUND_Y - 14, 5, '#ffe066', 'spark', 24);
      v.state = 'idle';
    }
    return true;
  }

  // Otherwise sweep map for unclaimed loose coins (outside immediate recruitment range of wanderers)
  let bestCoin: Coin | null = null;
  let bestDist = 420;
  for (const c of w.coins) {
    if (!c.grounded) continue;
    if (c.claimedById !== null && c.claimedById !== v.id) continue;
    if (c.fromMonarch && c.age < 6) continue;
    const d = Math.abs(c.x - v.x);
    if (d < bestDist) {
      bestDist = d;
      bestCoin = c;
    }
  }

  if (bestCoin) {
    bestCoin.claimedById = v.id;
    v.state = 'seeking_coin';
    if (moveToward(v, bestCoin.x, 48, dt)) {
      const idx = w.coins.indexOf(bestCoin);
      if (idx >= 0) w.coins.splice(idx, 1);
      v.carriedCoins += 1;
      sound.playCoinPickup();
    }
    return true;
  }

  return false;
}

function updateVillagers(w: WorldState, dt: number): void {
  const monarch = w.monarchs[0];
  const isEveningOrNight = w.timeOfDay >= 0.46 && w.timeOfDay < 0.98;

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

    // Hand carried coins to Monarch if crossing paths
    if (v.carriedCoins > 0 && monarch && Math.abs(v.x - monarch.x) < 26 && monarch.coins < monarch.maxCoins) {
      const give = Math.min(v.carriedCoins, monarch.maxCoins - monarch.coins);
      v.carriedCoins -= give;
      monarch.coins += give;
      w.resources.gold = monarch.coins;
      sound.playCoinPickup();
      spawnBurst(w, v.x, GROUND_Y - 16, 4, '#f7d265', 'spark', 24);
    }

    // --- WANDERER (must be hired with 1 coin -> becomes Peasant with NO profession yet!) ---
    if (v.role === 'wanderer') {
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

    // --- PEASANT (only gets profession AFTER picking up an unlocked stocked tool/seed; also sweeps coins to Hall!) ---
    if (v.role === 'peasant') {
      const stockedShop = w.shops
        .filter((s) => isShopUnlocked(w, s.kind) && s.stock > 0)
        .sort((a, b) => Math.abs(a.x - v.x) - Math.abs(b.x - v.x))[0];

      if (stockedShop) {
        v.state = 'seeking_tool';
        if (moveToward(v, stockedShop.x, 48, dt)) {
          if (stockedShop.stock > 0) {
            stockedShop.stock -= 1;
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

      if (!isEveningOrNight && trySweepCoinsToHall(w, v, dt)) continue;

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

    // --- BUILDER (walls, towers, forge, boat, dock, farms, proportional multi-builder rocks/trees, then sweeps coins!) ---
    if (v.role === 'builder') {
      const sideScore = (wx: number) => ((wx < CENTER_X ? -1 : 1) === v.side ? 0 : 1200);
      const odinMult = w.activeGod === 'odin' ? 1.5 : 1.0;
      const buildBuffMult = isConstructionBuffActive(w) ? 1.35 : 1.0;
      const workMult = odinMult * buildBuffMult;

      // Priority 1: Walls under construction or ruined
      const buildWall = w.walls
        .filter((wall) => wall.underConstruction)
        .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];

      if (buildWall && (!isEveningOrNight || Math.abs(buildWall.x - CENTER_X) < 340)) {
        v.state = 'working';
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
            sound.playBuildComplete();
            spawnBurst(w, buildWall.x, GROUND_Y - 22, 14, '#f0c66c', 'spark', 45);
          }
        }
        continue;
      }

      // Priority 1b: Archer Towers under construction
      const buildTower = w.towers
        .filter((tw) => tw.underConstruction)
        .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];

      if (buildTower && (!isEveningOrNight || Math.abs(buildTower.x - CENTER_X) < 340)) {
        v.state = 'working';
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
            sound.playBuildComplete();
            spawnBurst(w, buildTower.x, GROUND_Y - 26, 14, '#f0c66c', 'spark', 45);
          }
        }
        continue;
      }

      // Priority 1c: Forge under construction (Island 2+)
      if (w.forge && w.forge.underConstruction && !w.forge.built) {
        v.state = 'working';
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

      // Priority 2: Boat Construction OR Dock Construction
      if (w.boat.underConstruction && !w.boat.built && !isEveningOrNight) {
        v.state = 'working';
        if (moveToward(v, w.boat.x - 16, 52, dt)) {
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
            sound.playBuildComplete();
            spawnBurst(w, w.boat.x, GROUND_Y - 24, 18, '#ffe066', 'spark', 55);
            showBanner(w, 'DRAKKAR PRONTO!', 'Toque o Sino (1 moeda) e pague 10 moedas para zarpar!', '#ffe066');
            syncCurrentIslandProgress(w);
            saveCampaign(w);
          }
        }
        continue;
      }

      if (w.dock.underConstruction && !w.dock.built && !isEveningOrNight) {
        v.state = 'working';
        if (moveToward(v, w.dock.x - 14, 52, dt)) {
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
            sound.playBuildComplete();
            spawnBurst(w, w.dock.x, GROUND_Y - 18, 16, '#ffe066', 'spark', 50);
            showBanner(w, 'PORTO CONSTRUÍDO!', 'Agora você pode navegar entre ilhas colonizadas ou novas!', '#ffe066');
            syncCurrentIslandProgress(w);
            saveCampaign(w);
          }
        }
        continue;
      }

      // Priority 3: Farms under construction
      const buildFarm = w.farms
        .filter((f) => f.underConstruction)
        .sort((a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x)))[0];
      if (buildFarm) {
        v.state = 'working';
        if (moveToward(v, buildFarm.x - buildFarm.side * 10, 50, dt)) {
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
            sound.playBuildComplete();
            spawnBurst(w, buildFarm.x, GROUND_Y - 16, 12, '#82e08a', 'spark', 40);
          }
        }
        continue;
      }

      // Priority 4: Repair damaged walls & towers
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

      // Priority 5: Break marked rocks & chop marked trees (daytime, automatic multi-builder proportional speedup!)
      if (!isEveningOrNight) {
        // Count how many builders are already targeting each rock/tree so idle builders spread first, then pile on proportionally!
        const markedRocks = w.rocks.filter((r) => r.marked && !r.mined);
        const markedTrees = w.trees.filter((tr) => tr.marked && !tr.chopped);

        const markedRock = markedRocks.sort(
          (a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x))
        )[0];
        const markedTree = markedTrees.sort(
          (a, b) => sideScore(a.x) + Math.abs(a.x - v.x) - (sideScore(b.x) + Math.abs(b.x - v.x))
        )[0];

        const treeDist = markedTree ? sideScore(markedTree.x) + Math.abs(markedTree.x - v.x) : Infinity;
        const rockDist = markedRock ? sideScore(markedRock.x) + Math.abs(markedRock.x - v.x) : Infinity;

        if (markedRock && rockDist <= treeDist) {
          v.state = 'working';
          v.targetId = markedRock.id;
          const spreadOffset = ((v.id % 3) - 1) * 4;
          const standX = markedRock.x + (markedRock.x < CENTER_X ? 12 : -12) + spreadOffset;
          if (moveToward(v, standX, 48, dt)) {
            v.facing = markedRock.x < v.x ? -1 : 1;
            const spec = getRockSpec(markedRock.size ?? sizeFromVariant(markedRock.variant));
            // Exact proportional rate: 1 builder takes spec.time seconds; N builders take spec.time / N seconds!
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

        if (markedTree) {
          v.state = 'working';
          v.targetId = markedTree.id;
          const spreadOffset = ((v.id % 3) - 1) * 4;
          const standX = markedTree.x + (markedTree.x < CENTER_X ? 11 : -11) + spreadOffset;
          if (moveToward(v, standX, 48, dt)) {
            v.facing = markedTree.x < v.x ? -1 : 1;
            const spec = getTreeSpec(markedTree.size ?? sizeFromVariant(markedTree.variant));
            // Exact proportional rate: 1 builder takes spec.time seconds; N builders take spec.time / N seconds!
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

        v.targetId = null;

        // Priority 6 (AFTER finishing tasks): Sweep map for loose coins and deposit at central Hall!
        if (trySweepCoinsToHall(w, v, dt)) continue;
      }

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

    // --- WARRIOR ---
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

      v.state = 'defending';
      moveToward(v, guardX, 54, dt);
      if (Math.abs(v.x - guardX) < 4) v.facing = v.side;
      continue;
    }

    // --- ARCHER (hunts, garrisons Archer Towers for range/dmg boost, shoots ground & aerial Hel Crows!) ---
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

      const looseCoin = w.coins.find((c) => c.grounded && !c.fromMonarch && Math.abs(c.x - v.x) < 55);
      if (looseCoin && v.carriedCoins < 4) {
        if (moveToward(v, looseCoin.x, 46, dt)) {
          const idx = w.coins.indexOf(looseCoin);
          if (idx >= 0) w.coins.splice(idx, 1);
          v.carriedCoins += 1;
          sound.playCoinPickup();
        }
        continue;
      }

      let targetPrey = null;
      let preyDist = 165;
      for (const prey of w.wildlife) {
        const d = Math.abs(prey.x - v.x);
        if (d < preyDist) {
          preyDist = d;
          targetPrey = prey;
        }
      }
      if (targetPrey) {
        v.state = 'hunting';
        if (preyDist > 92) {
          moveToward(v, targetPrey.x, 42, dt);
        } else {
          v.vx = 0;
          v.facing = targetPrey.x >= v.x ? 1 : -1;
          if (v.actionTimer <= 0) {
            v.actionTimer = 1.05;
            fireArrow(w, v.x, GROUND_Y - 14, targetPrey.x + targetPrey.vx * 0.18, GROUND_Y - 5, 10);
          }
        }
        continue;
      }

      v.state = 'hunting';
      const patrolAnchor = defWall ? defWall.x + v.side * 55 : CENTER_X + v.side * 160;
      if (Math.abs(v.x - v.targetX) < 10 || v.actionTimer <= 0) {
        v.targetX = Math.max(380, Math.min(WORLD_WIDTH - 380, patrolAnchor + (Math.random() - 0.5) * 140));
        v.actionTimer = 3 + Math.random() * 3.5;
      }
      moveToward(v, v.targetX, 34, dt);
      continue;
    }

    // --- PRODUCER (Farmers: capacity scales 2+level up to 12, storage cap scales level*12 up to 120!) ---
    if (v.role === 'producer') {
      if (isEveningOrNight) {
        v.state = 'fleeing';
        moveToward(v, CENTER_X + v.side * 55, 48, dt);
        continue;
      }

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

      const workX = myFarm ? myFarm.x + ((v.id % 5) - 2) * 8 : CENTER_X + v.side * 190;
      v.state = 'producing';
      if (moveToward(v, workX, 44, dt)) {
        if (myFarm && myFarm.level >= 1) {
          const freyaSpeed = w.activeGod === 'freya' ? 1.5 : 1.0;
          const cap = getFarmStorageCap(myFarm.level);
          myFarm.cropProgress += dt * (0.038 + myFarm.level * 0.018) * freyaSpeed;
          if (myFarm.cropProgress >= 1) {
            myFarm.cropProgress = 0;
            const foodGain = Math.max(1, myFarm.level);
            const coinGain = Math.max(1, Math.ceil(myFarm.level * 0.7));
            w.resources.food += foodGain;
            myFarm.storedFood = Math.min(cap, myFarm.storedFood + foodGain);
            if (v.carriedCoins < 6) {
              v.carriedCoins = Math.min(6, v.carriedCoins + coinGain);
            } else {
              myFarm.storedCoins = Math.min(cap, myFarm.storedCoins + coinGain);
            }
            sound.playCoinPickup();
            spawnBurst(w, myFarm.x, GROUND_Y - 12, 8, '#f7d265', 'spark', 32);
          }
        } else if (v.actionTimer <= 0) {
          // Fjord fishing before farm is built
          v.actionTimer = 14;
          w.resources.food += 1;
          v.carriedCoins = Math.min(6, v.carriedCoins + 1);
          spawnBurst(w, v.x, GROUND_Y - 6, 5, '#89dcff', 'spark', 24);
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

    const blockingWarrior = w.villagers.find(
      (v) => v.role === 'warrior' && v.state !== 'embarked' && Math.abs(v.x - e.x) < 14
    );
    if (blockingWarrior) {
      e.vx = 0;
      e.facing = blockingWarrior.x >= e.x ? 1 : -1;
      if (e.attackCooldown <= 0) {
        e.attackCooldown = e.kind === 'frost_troll' ? 1.3 : 0.9;
        const dmg = e.kind === 'frost_troll' ? 24 : e.kind === 'draugr_brute' ? 14 : 7;
        blockingWarrior.hp -= dmg;
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
        const dmg = e.kind === 'frost_troll' ? 32 : e.kind === 'draugr_brute' ? 18 : 8;
        blockingWall.hp -= dmg;
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
        const dmg = e.kind === 'frost_troll' ? 30 : e.kind === 'draugr_brute' ? 16 : 7;
        blockingTower.hp -= dmg;
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
  const monarch = w.monarchs[0];
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

    if (
      monarch &&
      c.pickupDelay <= 0 &&
      monarch.coins < monarch.maxCoins &&
      Math.abs(monarch.x - c.x) < 16 &&
      Math.abs(GROUND_Y - c.y) < 22
    ) {
      const wandererClaimed =
        c.fromMonarch &&
        c.age < 5 &&
        w.villagers.some((v) => v.role === 'wanderer' && Math.abs(v.x - c.x) < 95);
      if (!wandererClaimed) {
        monarch.coins += 1;
        w.resources.gold = monarch.coins;
        sound.playCoinPickup();
        spawnBurst(w, c.x, c.y - 4, 4, '#ffe169', 'spark', 25);
        w.coins.splice(i, 1);
        continue;
      }
    }

    if (c.age > 90) w.coins.splice(i, 1);
  }
}

function updateWildlife(w: WorldState, dt: number): void {
  if (!w.isNight && w.wildlife.length < 7 && Math.random() < dt * 0.45) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const spawnX = CENTER_X + side * (170 + Math.random() * 440);
    const blockedByForest = w.trees.some((tr) => !tr.chopped && Math.abs(tr.x - spawnX) < 28);
    if (!blockedByForest) {
      const isDeer = Math.abs(spawnX - CENTER_X) > 290 && Math.random() < 0.35;
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
    }
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

export function skipTutorial(w: WorldState): void {
  if (!w.tutorial) return;
  w.tutorial.active = false;
  w.hasOrderedVillager = true;
  markTutorialCompleted();
  saveCampaign(w);
}

function updateTutorial(w: WorldState, dt: number): void {
  const tut = w.tutorial;
  if (!tut || !tut.active) return;

  const m = w.monarchs[0];
  if (!m) return;

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
    // Guarantee player can forge the Bow after spending all 10 starting coins on steps 1..5!
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
    tut.farewellTimer = 7.0;
    tut.fadeCycle = 0;
    sound.playHorn(false);
    spawnBurst(w, tut.spiritX, tut.spiritY, 18, '#7ef5ff', 'spark', 60);
  } else if (tut.step === 'farewell') {
    tut.farewellTimer -= dt;
    if (tut.farewellTimer <= 0) {
      spawnBurst(w, tut.spiritX, tut.spiritY, 22, '#7ef5ff', 'spark', 68);
      tut.active = false;
      markTutorialCompleted();
      saveCampaign(w);
      return;
    }
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
    tut.spiritAlpha = Math.min(0.92, tut.farewellTimer < 1.2 ? tut.farewellTimer / 1.2 : 0.92);
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

export function stepWorld(w: WorldState, input: InputState, dt: number): void {
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
  if (monarch) updateMonarch(w, monarch, input, dt);

  updateFlyingCoins(w, dt);
  updateForgeAndRegrowth(w, dt);
  updateFireTrailsAndLightning(w, dt);
  updateDayNightAndWaves(w, dt);
  updateTutorial(w, dt);
  updateVillagers(w, dt);
  updateEnemies(w, dt);
  updateArrows(w, dt);
  updateCoins(w, dt);
  updateWildlife(w, dt);
  updateParticlesAndAmbience(w, dt);
}
