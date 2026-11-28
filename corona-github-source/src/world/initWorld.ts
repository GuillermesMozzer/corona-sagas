import { defaultAppearance, defaultCrest } from '../customization/presets';
import { isTutorialCompleted } from '../storage/saveSystem';
import {
  CENTER_X,
  GROUND_Y,
  LOGICAL_WIDTH,
  WORLD_WIDTH,
  type ArcherTower,
  type BankerState,
  type BerryBush,
  type BoatState,
  type CharacterAppearance,
  type Chest,
  type CrestConfig,
  type DockState,
  type ElderId,
  type ElementalStaffId,
  type FarmPlot,
  type ForgeState,
  type GodShrine,
  type Hall,
  type IslandBuffAltar,
  type IslandProgress,
  type IslandSnapshot,
  type Monarch,
  type MountShrine,
  type Portal,
  type PreciousMine,
  type ResourceSize,
  type Rock,
  type RunePuzzle,
  type StaffAltar,
  type ToolShop,
  type Tree,
  type TutorialState,
  type VagrantCamp,
  type Villager,
  type Wall,
  type WeaponShrine,
  type Wildlife,
  type WorldState,
  type YggdrasilTree,
} from '../types';
import {
  ELEMENTAL_STAFF_RECIPES,
  getIslandElementalPortalStone,
  getIslandMetalId,
  getIslandStaffAltarId,
  getIslandWeaponId,
} from './arsenal';
import { createDefaultElders } from './elders';
import { ISLAND_DEFINITIONS, getIslandDef } from './islands';

const DAY_LEN_KEY = 'corona_daymin_v1';

export function getSavedDayHalfMinutes(): number {
  try {
    const raw = window.localStorage.getItem(DAY_LEN_KEY);
    const val = Number(raw);
    if (Number.isInteger(val) && val >= 1 && val <= 6) return val;
  } catch {
    // Ignore
  }
  return 3; // Default 3 min Day + 3 min Night (configurable 1..6 min in Menu)
}

export function saveDayHalfMinutes(minutes: number): void {
  try {
    window.localStorage.setItem(DAY_LEN_KEY, String(minutes));
  } catch {
    // Ignore
  }
}

export function sizeFromVariant(variant: 0 | 1 | 2): ResourceSize {
  if (variant === 0) return 'small';
  if (variant === 1) return 'medium';
  return 'large';
}

export function heightForTreeSize(size: ResourceSize, randVal = 0.5): number {
  if (size === 'small') return 34 + Math.floor(randVal * 6);
  if (size === 'medium') return 48 + Math.floor(randVal * 8);
  return 64 + Math.floor(randVal * 10);
}

export function createDefaultTowers(uid: () => number, cx = CENTER_X): ArcherTower[] {
  const specs: Array<{ x: number; side: -1 | 1; tier: 'inner' | 'outer' }> = [
    { x: cx - 256, side: -1, tier: 'inner' },
    { x: cx + 256, side: 1, tier: 'inner' },
    { x: cx - 558, side: -1, tier: 'outer' },
    { x: cx + 558, side: 1, tier: 'outer' },
  ];
  return specs.map((s) => ({
    id: uid(),
    x: s.x,
    side: s.side,
    tier: s.tier,
    level: 0,
    destroyed: false,
    previousLevel: 0,
    hp: 0,
    maxHp: 0,
    underConstruction: false,
    buildProgress: 0,
    targetLevel: 0,
    coinsPaid: 0,
    hitFlash: 0,
  }));
}

export function createDefaultIslandBuffs(islandId: number, cx = CENTER_X): IslandBuffAltar[] {
  if (islandId < 2) return [];
  return [
    { kind: 'construction', x: cx - 495, active: false, coinsPaid: 0 },
    { kind: 'forge', x: cx + 518, active: false, coinsPaid: 0 },
  ];
}

export function createDefaultForge(_islandId: number, cx = CENTER_X): ForgeState | null {
  return {
    x: cx - 68,
    built: false,
    coinsPaid: 0,
    underConstruction: false,
    buildProgress: 0,
    smelting: false,
    smeltProgress: 0,
    smeltCoinsPaid: 0,
    smeltQueue: 0,
    armorCoinsPaid: 0,
    armorForgedSlot: null,
  };
}

export function createDefaultWeaponShrine(islandId: number, cx = CENTER_X): WeaponShrine {
  return {
    weaponId: getIslandWeaponId(islandId),
    x: cx - 910,
    coinsPaid: 0,
    claimedByPlayerUid: null,
  };
}

export function createDefaultPreciousMine(
  islandId: number,
  uid: () => number,
  cx = CENTER_X
): PreciousMine {
  return {
    id: uid(),
    metalId: getIslandMetalId(islandId),
    x: cx + 910,
    marked: false,
    mineProgress: 0,
    coinsPaid: 0,
    hitShake: 0,
  };
}

export function createDefaultStaffAltars(
  cx = CENTER_X,
  forgedStaves: ElementalStaffId[] = [],
  islandId = 1
): StaffAltar[] {
  const staffId = getIslandStaffAltarId(islandId);
  if (!staffId) return [];
  const forgedSet = new Set(forgedStaves);
  const rec = ELEMENTAL_STAFF_RECIPES[staffId];
  return [
    {
      staffId,
      x: cx + rec.altarOffset,
      diamondsPaid: forgedSet.has(staffId) ? rec.diamondCost : 0,
      coinsPaid: forgedSet.has(staffId) ? rec.coinCost : 0,
      forged: forgedSet.has(staffId),
    },
  ];
}

export function createDefaultYggdrasilTree(
  islandId: number,
  uid: () => number,
  cx = CENTER_X
): YggdrasilTree | null {
  if (islandId !== 6) return null;
  return {
    id: uid(),
    x: cx + 1340,
    marked: false,
    harvestProgress: 0,
    coinsPaid: 0,
    hitShake: 0,
  };
}

export function generateIslandSnapshot(
  islandId: number,
  uid: () => number,
  arrivingCrew: Villager[] = [],
  rescuedElders: ElderId[] = [],
  forgedStaves: ElementalStaffId[] = []
): IslandSnapshot {
  const def = getIslandDef(islandId);
  const mapW = def.worldWidth || WORLD_WIDTH;
  const cx = Math.round(mapW / 2);

  // 5 Tool Shops — Hammer, Bow & Spear unlock at Kingdom Lv 1; Seed at Lv 2; Sword at Island 3+ after Thor!
  const shops: ToolShop[] = [
    { id: uid(), kind: 'spear', x: cx - 182, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
    { id: uid(), kind: 'sword', x: cx - 146, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
    { id: uid(), kind: 'bow', x: cx - 108, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
    { id: uid(), kind: 'hammer', x: cx + 108, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
    { id: uid(), kind: 'seed', x: cx + 154, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
  ];

  // 2 Farm plots (unlock at Kingdom Lv 2; scale Lv 1..10 with Hall level!)
  const farms: FarmPlot[] = [
    {
      id: uid(),
      x: cx - 208,
      side: -1,
      level: 0,
      underConstruction: false,
      buildProgress: 0,
      coinsPaid: 0,
      cropProgress: 0,
      storedFood: 0,
      storedCoins: 0,
    },
    {
      id: uid(),
      x: cx + 208,
      side: 1,
      level: 0,
      underConstruction: false,
      buildProgress: 0,
      coinsPaid: 0,
      cropProgress: 0,
      storedFood: 0,
      storedCoins: 0,
    },
  ];

  // 4 Archer Towers positioned right behind inner & outer walls!
  const towers: ArcherTower[] = createDefaultTowers(uid, cx);

  const walls: Wall[] = [
    {
      id: uid(),
      x: cx - 284,
      side: -1,
      tier: 'inner',
      level: 0,
      destroyed: false,
      previousLevel: 0,
      hp: 0,
      maxHp: 0,
      underConstruction: false,
      buildProgress: 0,
      targetLevel: 0,
      coinsPaid: 0,
      hitFlash: 0,
    },
    {
      id: uid(),
      x: cx + 284,
      side: 1,
      tier: 'inner',
      level: 0,
      destroyed: false,
      previousLevel: 0,
      hp: 0,
      maxHp: 0,
      underConstruction: false,
      buildProgress: 0,
      targetLevel: 0,
      coinsPaid: 0,
      hitFlash: 0,
    },
    {
      id: uid(),
      x: cx - 588,
      side: -1,
      tier: 'outer',
      level: 0,
      destroyed: false,
      previousLevel: 0,
      hp: 0,
      maxHp: 0,
      underConstruction: false,
      buildProgress: 0,
      targetLevel: 0,
      coinsPaid: 0,
      hitFlash: 0,
    },
    {
      id: uid(),
      x: cx + 588,
      side: 1,
      tier: 'outer',
      level: 0,
      destroyed: false,
      previousLevel: 0,
      hp: 0,
      maxHp: 0,
      underConstruction: false,
      buildProgress: 0,
      targetLevel: 0,
      coinsPaid: 0,
      hitFlash: 0,
    },
  ];

  const forge = createDefaultForge(islandId, cx);
  const islandBuffs = createDefaultIslandBuffs(islandId, cx);

  // Harbor Cove on the East side (Boat on Island 1 needs 30 coins to build; Islands 2..9 arrive with boat ashore and need Dock!)
  const boatX = cx + 365;
  const boat: BoatState = {
    x: boatX,
    bellX: boatX - 30,
    built: islandId > 1,
    coinsPaid: islandId > 1 ? 30 : 0,
    buildProgress: islandId > 1 ? 1 : 0,
    underConstruction: false,
    sailCoinsPaid: 0,
    bellRung: false,
    crewArchers: 0,
    crewWarriors: 0,
    crewSpearmen: 0,
    crewProducers: 0,
    crewBuilders: 0,
    waterDropProgress: islandId > 1 ? 1 : 0,
    attackCooldown: 0,
  };

  const dock: DockState = {
    x: boatX + 42,
    required: islandId > 1,
    built: islandId === 1,
    coinsPaid: 0,
    underConstruction: false,
    buildProgress: islandId === 1 ? 1 : 0,
  };

  const camps: VagrantCamp[] = [
    {
      id: uid(),
      x: cx - 425,
      spawnTimer: 16,
      active: true,
      isBrewerySite: true,
      isBrewery: false,
      breweryCoinsPaid: 0,
      breweryUnderConstruction: false,
      breweryBuildProgress: 0,
      beerStock: 0,
      beerCoinsPaid: 0,
      breweryAttractTimer: 0,
      daysSinceSpawn: 0,
    },
    {
      id: uid(),
      x: cx + 475,
      spawnTimer: 16,
      active: true,
      isBrewerySite: true,
      isBrewery: false,
      breweryCoinsPaid: 0,
      breweryUnderConstruction: false,
      breweryBuildProgress: 0,
      beerStock: 0,
      beerCoinsPaid: 0,
      breweryAttractTimer: 0,
      daysSinceSpawn: 0,
    },
    { id: uid(), x: cx - 820, spawnTimer: 22, active: true, isBrewerySite: false, daysSinceSpawn: 0 },
    { id: uid(), x: cx + 820, spawnTimer: 22, active: true, isBrewerySite: false, daysSinceSpawn: 0 },
  ];

  // Larger islands (3..9) feature additional outer vagrant camps across the wider frontier!
  if (mapW >= 4000) {
    camps.push({ id: uid(), x: cx - 1220, spawnTimer: 24, active: true, isBrewerySite: false, daysSinceSpawn: 0 });
    camps.push({ id: uid(), x: cx + 1220, spawnTimer: 24, active: true, isBrewerySite: false, daysSinceSpawn: 0 });
  }
  if (mapW >= 5800) {
    camps.push({ id: uid(), x: cx - 1820, spawnTimer: 26, active: true, isBrewerySite: false, daysSinceSpawn: 0 });
    camps.push({ id: uid(), x: cx + 1820, spawnTimer: 26, active: true, isBrewerySite: false, daysSinceSpawn: 0 });
  }

  // God Shrine (strictly 1 per island where present, none on Island 1)
  const godShrine: GodShrine | null = def.godId
    ? {
        godId: def.godId,
        x: cx - 365,
        unlocked: false,
        diamondsPaid: 0,
        blessed: false,
        coinsPaid: 0,
      }
    : null;

  // 1 Unique Divine Weapon / Magic Shrine per island (Islands 1..9)
  const weaponShrine = createDefaultWeaponShrine(islandId, cx);

  // 1 Unique Precious Metal Mine per island (Islands 1..9 -> Builders mine ore to forge Armor!)
  const preciousMine = createDefaultPreciousMine(islandId, uid, cx);

  // 1 Exclusive Unrescued Elder on Islands 2, 3, 4, 5, 8 (plus any already-rescued Elders!)
  const elders = createDefaultElders(cx, rescuedElders, islandId);

  // Giant World Tree Yggdrasil (exclusively on Island 6 -> source of Sacred Yggdrasil Wood!)
  const yggdrasilTree = createDefaultYggdrasilTree(islandId, uid, cx);

  // 1 Exclusive Elemental Staff Forge on Islands 6 (Fire), 7 (Ice), 9 (Thunder) — never overlapping an Elder!
  const staffAltars = createDefaultStaffAltars(cx, forgedStaves, islandId);

  // Special Mount Shrine
  const mountShrine: MountShrine | null = def.mountId
    ? {
        mountId: def.mountId,
        x: cx + 640,
        unlocked: false,
        diamondsPaid: 0,
        coinsPaid: 0,
      }
    : null;

  // Island Rune Puzzle / Secret (on Islands 2..9: awards +2 Diamonds + 4 Gold)
  const puzzle: RunePuzzle | null =
    def.maxDiamonds > 0
      ? {
          x: cx - 640,
          solved: false,
          coinsPaid: 0,
          diamondReward: 2,
        }
      : null;

  // Chests: Island 1 is the basic starter island (coins only, NO diamond chests!); Islands 2..9 grant diamonds!
  const chests: Chest[] = [
    {
      id: uid(),
      x: cx - 730,
      opened: false,
      coins: 6,
      diamonds: def.maxDiamonds > 0 ? 2 : 0,
    },
    {
      id: uid(),
      x: cx + 730,
      opened: false,
      coins: 6,
      diamonds: def.maxDiamonds > 0 ? Math.max(1, def.maxDiamonds - 4) : 0,
    },
  ];
  if (mapW >= 4600) {
    chests.push({ id: uid(), x: cx - 1460, opened: false, coins: 8, diamonds: 0 });
    chests.push({ id: uid(), x: cx + 1460, opened: false, coins: 8, diamonds: 0 });
  }

  // Progressively more enemy portals as islands grow wider (Island 1: 2 -> Island 9: 8!)
  const portalHp = 140 + (islandId - 1) * 40;
  const totalPortals = Math.max(2, def.portalCount);
  const leftCount = Math.floor(totalPortals / 2);
  const rightCount = totalPortals - leftCount;
  const portals: Portal[] = [];

  const leftOuter = 265; // Just inland from the Western Beach / Ocean edge
  const leftInner = Math.max(leftOuter + 140, cx - 1060);
  for (let i = 0; i < leftCount; i++) {
    const frac = leftCount === 1 ? 0 : i / (leftCount - 1);
    const px = Math.round(leftOuter + frac * (leftInner - leftOuter));
    portals.push({
      id: uid(),
      x: px,
      side: -1,
      hp: portalHp + (leftCount - 1 - i) * 20,
      maxHp: portalHp + (leftCount - 1 - i) * 20,
      destroyed: false,
      pulseTime: i * 1.1,
      spawnQueue: 0,
      spawnCooldown: 0,
      hitFlash: 0,
      elementalStone: null,
    });
  }

  const rightOuter = mapW - 265; // Just before the Eastern Mountain Cliff wall
  const rightInner = Math.min(rightOuter - 140, cx + 1060);
  for (let i = 0; i < rightCount; i++) {
    const frac = rightCount === 1 ? 0 : i / (rightCount - 1);
    const px = Math.round(rightInner + frac * (rightOuter - rightInner));
    portals.push({
      id: uid(),
      x: px,
      side: 1,
      hp: portalHp + i * 20,
      maxHp: portalHp + i * 20,
      destroyed: false,
      pulseTime: 1.7 + i * 1.1,
      spawnQueue: 0,
      spawnCooldown: 0,
      hitFlash: 0,
      elementalStone: null,
    });
  }

  // Strictly 3 Elemental Portals across the entire saga (Island 1: Red Fire, Island 3: Blue Ice, Island 5: Yellow Thunder!)
  const islandStone = getIslandElementalPortalStone(islandId);
  if (islandStone && portals.length > 0) {
    // Pick the innermost right portal on Island 1/5, innermost left portal on Island 3
    const preferred =
      islandStone === 'ice'
        ? portals.filter((p) => p.side === -1).sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0]
        : portals.filter((p) => p.side === 1).sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))[0];
    if (preferred) preferred.elementalStone = islandStone;
  }

  let seed = 4219 + islandId * 7919;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const reservedZones = [
    { x: cx, r: 320 },
    { x: boatX, r: 68 },
    { x: dock.x, r: 46 },
    ...(godShrine ? [{ x: godShrine.x, r: 42 }] : []),
    { x: weaponShrine.x, r: 46 },
    { x: preciousMine.x, r: 52 },
    ...(yggdrasilTree ? [{ x: yggdrasilTree.x, r: 85 }] : []),
    ...elders.map((el) => ({ x: el.cottageX, r: 38 })),
    ...(mountShrine ? [{ x: mountShrine.x, r: 42 }] : []),
    ...(puzzle ? [{ x: puzzle.x, r: 42 }] : []),
    ...islandBuffs.map((b) => ({ x: b.x, r: 34 })),
    ...towers.map((tw) => ({ x: tw.x, r: 24 })),
    ...walls.map((w) => ({ x: w.x, r: 40 })),
    ...camps.map((c) => ({ x: c.x, r: 52 })),
    ...chests.map((c) => ({ x: c.x, r: 34 })),
    ...portals.map((p) => ({ x: p.x, r: 95 })),
  ];

  // Rocks with 3 sizes: small (5 stone / 30s), medium (7 stone / 45s), large (15 stone / 90s)
  const rockSpecs: Array<{ x: number; variant: 0 | 1 | 2 }> = [
    { x: cx - 395, variant: 0 },
    { x: cx + 435, variant: 1 },
    { x: cx - 462, variant: 1 },
    { x: cx + 768, variant: 2 },
    { x: cx - 768, variant: 2 },
    { x: cx - 855, variant: 0 },
    { x: cx + 855, variant: 1 },
    { x: cx - 945, variant: 2 },
    { x: cx + 945, variant: 0 },
  ];
  // Extra rocky outcrops across wider islands (Islands 2..9)
  for (let offset = 1140; cx - offset > 320; offset += 290) {
    const vLeft = ((Math.floor(offset / 290) + islandId) % 3) as 0 | 1 | 2;
    const vRight = ((Math.floor(offset / 290) + islandId + 1) % 3) as 0 | 1 | 2;
    const lx = cx - offset;
    const rx = cx + offset;
    if (!reservedZones.some((z) => Math.abs(lx - z.x) < z.r)) {
      rockSpecs.push({ x: lx, variant: vLeft });
    }
    if (!reservedZones.some((z) => Math.abs(rx - z.x) < z.r)) {
      rockSpecs.push({ x: rx, variant: vRight });
    }
  }
  const rocks: Rock[] = rockSpecs.map((spec) => ({
    id: uid(),
    x: spec.x,
    variant: spec.variant,
    size: sizeFromVariant(spec.variant),
    marked: false,
    mined: false,
    mineProgress: 0,
    hitShake: 0,
  }));

  const rockReserved = rocks.map((r) => ({ x: r.x, r: 22 }));
  const trees: Tree[] = [];
  for (let x = 250; x <= mapW - 250; x += 30 + Math.floor(rand() * 18)) {
    const blocked =
      reservedZones.some((z) => Math.abs(x - z.x) < z.r) ||
      rockReserved.some((z) => Math.abs(x - z.x) < z.r);
    if (blocked) continue;
    const roll = rand();
    const variant: 0 | 1 | 2 = roll < 0.36 ? 0 : roll < 0.72 ? 1 : 2;
    const size = sizeFromVariant(variant);
    trees.push({
      id: uid(),
      x,
      variant,
      size,
      height: heightForTreeSize(size, rand()),
      marked: false,
      chopped: false,
      chopProgress: 0,
      swayOffset: rand() * Math.PI * 2,
      hitShake: 0,
    });
  }

  const villagers: Villager[] = [];
  for (const camp of camps) {
    for (let i = 0; i < 2; i++) {
      const offset = (i === 0 ? -16 : 16) + (rand() - 0.5) * 8;
      villagers.push({
        id: uid(),
        x: camp.x + offset,
        y: GROUND_Y,
        vx: 0,
        facing: i === 0 ? 1 : -1,
        role: 'wanderer',
        state: 'wandering',
        hp: 20,
        maxHp: 20,
        targetX: camp.x + offset,
        targetId: null,
        homeCampId: camp.id,
        assignedFarmId: null,
        assignedTowerId: null,
        side: camp.x < cx ? -1 : 1,
        actionTimer: 1 + rand() * 3,
        animTime: rand() * 5,
        carriedCoins: 0,
        orderFlashTimer: 0,
        orderDir: 0,
      });
    }
  }

  // Disembark arriving crew near the boat on the new island!
  arrivingCrew.forEach((member, idx) => {
    villagers.push({
      ...member,
      id: uid(),
      x: boatX - 18 - (idx % 6) * 8,
      y: GROUND_Y,
      vx: 0,
      state: 'idle',
      homeCampId: null,
      assignedFarmId: null,
      assignedTowerId: null,
      side: idx % 2 === 0 ? -1 : 1,
      actionTimer: 0,
      carriedCoins: 0,
      orderFlashTimer: 0,
      orderDir: 0,
    });
  });

  const hall: Hall = {
    x: cx,
    level: 0,
    coinsPaid: 0,
    taxTimer: 0,
    storedTaxCoins: 0,
  };

  // Berry bushes bloom in Winter and Spring (dormant in Summer/Autumn)
  const berryBushPositions = [
    cx - 310,
    cx - 590,
    cx - 755,
    cx + 310,
    cx + 590,
    cx + 755,
  ];
  if (mapW >= 4000) {
    berryBushPositions.push(cx - 1080, cx + 1080);
  }
  const berryBushes: BerryBush[] = berryBushPositions.map((bx) => ({
    id: uid(),
    x: bx,
    berries: 0,
    marked: false,
    forageProgress: 0,
  }));

  return {
    worldWidth: mapW,
    centerX: cx,
    islandResources: { wood: 0, stone: 0, iron: 0, food: 0, preciousOres: {} },
    bankerBalance: 0,
    hall,
    forge,
    shops,
    walls,
    towers,
    farms,
    islandBuffs,
    boat,
    dock,
    godShrine,
    weaponShrine,
    preciousMine,
    yggdrasilTree,
    staffAltars,
    mountShrine,
    puzzle,
    elders,
    camps,
    trees,
    rocks,
    berryBushes,
    chests,
    portals,
    villagers,
    rockRegrowQueue: 0,
    rockRegrowTimer: 0,
    treeRegrowQueue: 0,
    treeRegrowTimer: 0,
  };
}

export function createInitialWorld(
  mode: WorldState['mode'] = 'login',
  appearance: CharacterAppearance = defaultAppearance(),
  crest: CrestConfig = defaultCrest(),
  saveSlot = 0
): WorldState {
  let nextId = 1;
  const uid = () => nextId++;

  const enableTutorial = mode !== 'login' && !isTutorialCompleted();
  const startX = enableTutorial ? CENTER_X - 150 : CENTER_X;

  const tutorial: TutorialState | null = enableTutorial
    ? {
        active: true,
        step: 'light_fire',
        spiritX: startX + 200,
        spiritY: GROUND_Y + 24,
        spiritFacing: 1,
        spiritAlpha: 0.2,
        fadeCycle: 0,
        farewellTimer: 0,
        bowTributeGiven: false,
        emergingProgress: 0,
        returningToButton: false,
        returnProgress: 0,
      }
    : null;

  // Players start with 12 coins: enough to light campfire (2) + recruit 2 wanderers (2) + hammer (2) + 2 palisades (4) + first bow/archer (2)
  const monarch: Monarch = {
    id: uid(),
    x: startX,
    y: GROUND_Y,
    vx: 0,
    facing: 1,
    stamina: 1,
    maxStamina: 1,
    exhausted: false,
    sprinting: false,
    coins: 12,
    maxCoins: 30,
    diamonds: 0,
    mount: 'starter',
    mountPowerCooldown: 0,
    flyTimer: 0,
    flyY: 0,
    roarTimer: 0,
    wolfBiteCooldown: 0,
    weapon: null,
    weaponCooldown: 0,
    armor: {},
    crownShieldReady: false,
    ridingElderId: null,
    hasCrown: true,
    crownX: startX,
    crownY: GROUND_Y - 22,
    crownVx: 0,
    crownVy: 0,
    crownGrounded: false,
    crownStolenByEnemyId: null,
    animTime: 0,
    dropCooldown: 0,
    hurtCooldown: 0,
    cameraX: startX - LOGICAL_WIDTH / 2,
  };

  const island1 = generateIslandSnapshot(1, uid);

  const islands: IslandProgress[] = ISLAND_DEFINITIONS.map((def) => ({
    id: def.id,
    colonized: def.id === 1,
    visited: def.id === 1,
    // Strictly 2 new islands revealed at the start (2 and 3); Islands 4..9 remain shrouded in clouds until conquest!
    revealed: def.id === 1 || def.id === 2 || def.id === 3,
    conquered: false,
    dockBuilt: def.id === 1,
    boatBuilt: false,
    hallLevel: 0,
    wallsBuilt: 0,
    diamondsCollected: 0,
    godUnlocked: false,
    mountUnlocked: false,
    constructionBuff: false,
    forgeBuff: false,
  }));

  const banker: BankerState = {
    x: CENTER_X + 68,
    walkX: CENTER_X + 68,
    facing: 1,
    animTime: 0,
    carriedCoins: 0,
    phase: 'idle',
    targetFarmId: null,
    balance: 0,
    interestFraction: 0,
    lastDayYield: 0,
  };

  const wildlife: Wildlife[] = [
    { id: uid(), kind: 'rabbit', x: CENTER_X - 210, y: GROUND_Y, vx: 0, facing: 1, hp: 8, aiTimer: 1.2, animTime: 0 },
    { id: uid(), kind: 'rabbit', x: CENTER_X + 215, y: GROUND_Y, vx: 0, facing: -1, hp: 8, aiTimer: 2.1, animTime: 1.5 },
  ];

  const particles: WorldState['particles'] = [];
  for (let i = 0; i < 52; i++) {
    particles.push({
      x: Math.random() * LOGICAL_WIDTH,
      y: Math.random() * GROUND_Y,
      vx: -6 - Math.random() * 10,
      vy: 10 + Math.random() * 14,
      size: Math.random() > 0.72 ? 2 : 1,
      color: '#dcebf7',
      alpha: 0.35 + Math.random() * 0.45,
      life: 10,
      maxLife: 10,
      kind: 'snow',
    });
  }

  return {
    mode,
    saveSlot,
    tutorial,
    selectedVillagerId: null,
    hasOrderedVillager: false,
    worldMapContext: 'inspect',
    viewWidth: LOGICAL_WIDTH,
    viewHeight: 270,
    selectTimer: mode === 'char_select' ? 20 : mode === 'crest_select' ? 30 : 0,
    appearance: { ...appearance },
    crest: { ...crest },
    activeCommand: 'none',
    touchCommandMode: 'none',
    commandFeedback: null,
    touchIndicator: null,
    currentIsland: 1,
    islands,
    unlockedGods: [],
    activeGod: null,
    thorActivated: false,
    unlockedMounts: ['starter'],
    day: 1,
    season: 'summer',
    dayHalfMinutes: getSavedDayHalfMinutes(),
    timeOfDay: 0.03,
    threatLevel: 1,
    isNight: false,
    isBloodMoon: false,
    nightWaveStage: 0,
    waveTriggeredTonight: false,
    elapsed: 0,
    nextId,
    resources: {
      gold: monarch.coins,
      diamonds: 0,
      wood: 4,
      stone: 2,
      iron: 0,
      food: 0,
      preciousOres: {},
      elementalStones: {},
      yggdrasilWood: 0,
    },
    forgedStaves: [],
    monarchs: [monarch],
    banker,
    ...island1,
    enemies: [],
    coins: [],
    flyingCoins: [],
    fireTrails: [],
    lightningBolts: [],
    magicProjectiles: [],
    arrows: [],
    wildlife,
    particles,
    activePrompt: null,
    banner:
      mode === 'playing'
        ? {
            title: 'ILHA I — COSTA DE MIDGARD',
            subtitle: 'Você tem 12 moedas: acenda a fogueira, contrate errantes e forje ferramentas!',
            timer: 5.0,
            maxTimer: 5.0,
            accent: crest.secondaryColor,
          }
        : null,
    screenShake: 0,
    stats: {
      daysSurvived: 1,
      draugrSlain: 0,
      villagersRecruited: 0,
      wallsBuilt: 0,
    },
  };
}
