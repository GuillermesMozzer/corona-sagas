import { defaultAppearance, defaultCrest } from '../customization/presets';
import {
  CENTER_X,
  GROUND_Y,
  LOGICAL_WIDTH,
  WORLD_WIDTH,
  type BoatState,
  type CharacterAppearance,
  type Chest,
  type CrestConfig,
  type DockState,
  type FarmPlot,
  type GodShrine,
  type Hall,
  type IslandProgress,
  type IslandSnapshot,
  type Monarch,
  type MountShrine,
  type Portal,
  type Rock,
  type RunePuzzle,
  type ToolShop,
  type Tree,
  type VagrantCamp,
  type Villager,
  type Wall,
  type Wildlife,
  type WorldState,
} from '../types';
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

export function generateIslandSnapshot(
  islandId: number,
  uid: () => number,
  arrivingCrew: Villager[] = []
): IslandSnapshot {
  const def = getIslandDef(islandId);

  // 4 Tool Shops — ALL start with stock: 0 (player decides with their 10 starting coins!)
  const shops: ToolShop[] = [
    { id: uid(), kind: 'sword', x: CENTER_X - 134, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
    { id: uid(), kind: 'bow', x: CENTER_X - 80, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
    { id: uid(), kind: 'hammer', x: CENTER_X + 80, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
    { id: uid(), kind: 'seed', x: CENTER_X + 134, built: false, stock: 0, maxStock: 4, coinsPaid: 0 },
  ];

  // 2 Farm plots (each holds up to 5 farmers!)
  const farms: FarmPlot[] = [
    {
      id: uid(),
      x: CENTER_X - 196,
      side: -1,
      level: 0,
      underConstruction: false,
      buildProgress: 0,
      coinsPaid: 0,
      cropProgress: 0,
    },
    {
      id: uid(),
      x: CENTER_X + 196,
      side: 1,
      level: 0,
      underConstruction: false,
      buildProgress: 0,
      coinsPaid: 0,
      cropProgress: 0,
    },
  ];

  const walls: Wall[] = [
    {
      id: uid(),
      x: CENTER_X - 270,
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
      x: CENTER_X + 270,
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
      x: CENTER_X - 575,
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
      x: CENTER_X + 575,
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

  // Harbor Cove on the East side (Boat on Island 1 needs 30 coins to build; Islands 2..7 arrive with boat ashore and need 30-coin Dock!)
  const boatX = CENTER_X + 355;
  const boat: BoatState = {
    x: boatX,
    bellX: boatX - 30,
    built: islandId > 1, // Already built the Drakkar on Island 1 to get here!
    coinsPaid: islandId > 1 ? 30 : 0,
    buildProgress: islandId > 1 ? 1 : 0,
    underConstruction: false,
    sailCoinsPaid: 0,
    bellRung: false,
    crewArchers: 0,
    crewWarriors: 0,
    crewProducers: 0,
    crewBuilders: 0,
  };

  const dock: DockState = {
    x: boatX + 42,
    required: islandId > 1,
    built: islandId === 1, // Island 1 only has the boat; new islands require building the 30-coin Dock!
    coinsPaid: 0,
    underConstruction: false,
    buildProgress: islandId === 1 ? 1 : 0,
  };

  const camps: VagrantCamp[] = [
    { id: uid(), x: CENTER_X - 425, spawnTimer: 16, active: true },
    { id: uid(), x: CENTER_X + 485, spawnTimer: 16, active: true },
    { id: uid(), x: CENTER_X - 820, spawnTimer: 22, active: true },
    { id: uid(), x: CENTER_X + 820, spawnTimer: 22, active: true },
  ];

  // God Shrine (strictly 1 per island where present, none on Island 1)
  const godShrine: GodShrine | null = def.godId
    ? {
        godId: def.godId,
        x: CENTER_X - 365,
        unlocked: false,
        diamondsPaid: 0,
        blessed: false,
        coinsPaid: 0,
      }
    : null;

  // Special Mount Shrine (strictly 1 per island 2..7, none on Island 1)
  const mountShrine: MountShrine | null = def.mountId
    ? {
        mountId: def.mountId,
        x: CENTER_X + 615,
        unlocked: false,
        diamondsPaid: 0,
        coinsPaid: 0,
      }
    : null;

  // Island Rune Puzzle / Secret (on Islands 2..7: awards +2 Diamonds + 4 Gold)
  const puzzle: RunePuzzle | null =
    def.maxDiamonds > 0
      ? {
          x: CENTER_X - 620,
          solved: false,
          coinsPaid: 0,
          diamondReward: 2,
        }
      : null;

  // Chests: max 5 diamonds total per island (0 on Island 1; on Islands 2..7: 2+1=3 in chests + 2 in rune puzzle = 5 max!)
  const chests: Chest[] = [
    {
      id: uid(),
      x: CENTER_X - 730,
      opened: false,
      coins: 6,
      diamonds: def.maxDiamonds > 0 ? 2 : 0,
    },
    {
      id: uid(),
      x: CENTER_X + 730,
      opened: false,
      coins: 6,
      diamonds: def.maxDiamonds > 0 ? Math.max(0, def.maxDiamonds - 4) : 0,
    },
  ];

  const portalHp = 140 + (islandId - 1) * 40;
  const portals: Portal[] = [
    {
      id: uid(),
      x: 210,
      side: -1,
      hp: portalHp,
      maxHp: portalHp,
      destroyed: false,
      pulseTime: 0,
      spawnQueue: 0,
      spawnCooldown: 0,
      hitFlash: 0,
    },
    {
      id: uid(),
      x: WORLD_WIDTH - 210,
      side: 1,
      hp: portalHp,
      maxHp: portalHp,
      destroyed: false,
      pulseTime: 1.7,
      spawnQueue: 0,
      spawnCooldown: 0,
      hitFlash: 0,
    },
  ];

  let seed = 4219 + islandId * 7919;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const reservedZones = [
    { x: CENTER_X, r: 315 },
    { x: boatX, r: 68 },
    { x: dock.x, r: 46 },
    ...(godShrine ? [{ x: godShrine.x, r: 42 }] : []),
    ...(mountShrine ? [{ x: mountShrine.x, r: 42 }] : []),
    ...(puzzle ? [{ x: puzzle.x, r: 42 }] : []),
    ...walls.map((w) => ({ x: w.x, r: 44 })),
    ...camps.map((c) => ({ x: c.x, r: 54 })),
    ...chests.map((c) => ({ x: c.x, r: 34 })),
    ...portals.map((p) => ({ x: p.x, r: 95 })),
  ];

  const rockPositions = [
    CENTER_X - 318,
    CENTER_X + 430,
    CENTER_X - 510,
    CENTER_X + 668,
    CENTER_X - 672,
    CENTER_X - 910,
    CENTER_X + 910,
  ];
  const rocks: Rock[] = rockPositions.map((rx, idx) => ({
    id: uid(),
    x: rx,
    variant: (idx % 3) as 0 | 1 | 2,
    marked: false,
    mined: false,
    mineProgress: 0,
    hitShake: 0,
  }));

  const rockReserved = rocks.map((r) => ({ x: r.x, r: 22 }));
  const trees: Tree[] = [];
  for (let x = 320; x <= WORLD_WIDTH - 320; x += 28 + Math.floor(rand() * 18)) {
    const blocked =
      reservedZones.some((z) => Math.abs(x - z.x) < z.r) ||
      rockReserved.some((z) => Math.abs(x - z.x) < z.r);
    if (blocked) continue;
    trees.push({
      id: uid(),
      x,
      variant: Math.floor(rand() * 3) as 0 | 1 | 2,
      height: 44 + Math.floor(rand() * 24),
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
        side: camp.x < CENTER_X ? -1 : 1,
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
      side: idx % 2 === 0 ? -1 : 1,
      actionTimer: 0,
      carriedCoins: 0,
      orderFlashTimer: 0,
      orderDir: 0,
    });
  });

  const hall: Hall = {
    x: CENTER_X,
    level: 0,
    coinsPaid: 0,
    taxTimer: 0,
    storedTaxCoins: 0,
  };

  return {
    hall,
    shops,
    walls,
    farms,
    boat,
    dock,
    godShrine,
    mountShrine,
    puzzle,
    camps,
    trees,
    rocks,
    chests,
    portals,
    villagers,
  };
}

export function createInitialWorld(
  mode: WorldState['mode'] = 'login',
  appearance: CharacterAppearance = defaultAppearance(),
  crest: CrestConfig = defaultCrest()
): WorldState {
  let nextId = 1;
  const uid = () => nextId++;

  // STRICT RULE: Game ALWAYS starts with at most 10 coins!
  const monarch: Monarch = {
    id: uid(),
    x: CENTER_X,
    y: GROUND_Y,
    vx: 0,
    facing: 1,
    stamina: 1,
    maxStamina: 1,
    exhausted: false,
    sprinting: false,
    coins: 10,
    maxCoins: 30,
    diamonds: 0,
    mount: 'starter',
    mountPowerCooldown: 0,
    flyTimer: 0,
    flyY: 0,
    roarTimer: 0,
    wolfBiteCooldown: 0,
    hasCrown: true,
    crownX: CENTER_X,
    crownY: GROUND_Y - 22,
    crownVx: 0,
    crownVy: 0,
    crownGrounded: false,
    crownStolenByEnemyId: null,
    animTime: 0,
    dropCooldown: 0,
    hurtCooldown: 0,
    cameraX: CENTER_X - LOGICAL_WIDTH / 2,
  };

  const island1 = generateIslandSnapshot(1, uid);

  const islands: IslandProgress[] = ISLAND_DEFINITIONS.map((def) => ({
    id: def.id,
    colonized: def.id === 1,
    visited: def.id === 1,
    dockBuilt: def.id === 1,
    boatBuilt: false,
    hallLevel: 0,
    wallsBuilt: 0,
    diamondsCollected: 0,
    godUnlocked: false,
    mountUnlocked: false,
  }));

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
    unlockedMounts: ['starter'],
    day: 1,
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
      wood: 0,
      stone: 0,
      iron: 0,
      food: 0,
    },
    monarchs: [monarch],
    ...island1,
    enemies: [],
    coins: [],
    flyingCoins: [],
    fireTrails: [],
    lightningBolts: [],
    arrows: [],
    wildlife,
    particles,
    activePrompt: null,
    banner:
      mode === 'playing'
        ? {
            title: 'ILHA I — COSTA DE MIDGARD',
            subtitle: 'Você tem 10 moedas: acenda a fogueira, contrate errantes e forje ferramentas!',
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
