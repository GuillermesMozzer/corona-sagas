import { defaultAppearance, defaultCrest } from '../customization/presets';
import {
  CENTER_X,
  GROUND_Y,
  LOGICAL_WIDTH,
  WORLD_WIDTH,
  type CharacterAppearance,
  type Chest,
  type CrestConfig,
  type FarmPlot,
  type Monarch,
  type Portal,
  type Rock,
  type ToolShop,
  type Tree,
  type VagrantCamp,
  type Villager,
  type Wall,
  type Wildlife,
  type WorldState,
} from '../types';

export function createInitialWorld(
  mode: WorldState['mode'] = 'login',
  appearance: CharacterAppearance = defaultAppearance(),
  crest: CrestConfig = defaultCrest()
): WorldState {
  let nextId = 1;
  const uid = () => nextId++;

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
    coins: 12,
    maxCoins: 24,
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

  // 4 Class Tool Shops near the central hall
  const shops: ToolShop[] = [
    {
      id: uid(),
      kind: 'sword',
      x: CENTER_X - 134,
      built: false,
      stock: 0,
      maxStock: 4,
      coinsPaid: 0,
    },
    {
      id: uid(),
      kind: 'bow',
      x: CENTER_X - 80,
      built: false,
      stock: 0,
      maxStock: 4,
      coinsPaid: 0,
    },
    {
      id: uid(),
      kind: 'hammer',
      x: CENTER_X + 80,
      built: false,
      stock: 0,
      maxStock: 4,
      coinsPaid: 0,
    },
    {
      id: uid(),
      kind: 'seed',
      x: CENTER_X + 134,
      built: false,
      stock: 0,
      maxStock: 4,
      coinsPaid: 0,
    },
  ];

  // Production / Farm plots on left & right inside inner walls
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

  const camps: VagrantCamp[] = [
    { id: uid(), x: CENTER_X - 425, spawnTimer: 16, active: true },
    { id: uid(), x: CENTER_X + 425, spawnTimer: 16, active: true },
    { id: uid(), x: CENTER_X - 820, spawnTimer: 22, active: true },
    { id: uid(), x: CENTER_X + 820, spawnTimer: 22, active: true },
  ];

  const chests: Chest[] = [
    { id: uid(), x: CENTER_X - 710, opened: false, coins: 7 },
    { id: uid(), x: CENTER_X + 710, opened: false, coins: 7 },
  ];

  const portals: Portal[] = [
    {
      id: uid(),
      x: 210,
      side: -1,
      hp: 140,
      maxHp: 140,
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
      hp: 140,
      maxHp: 140,
      destroyed: false,
      pulseTime: 1.7,
      spawnQueue: 0,
      spawnCooldown: 0,
      hitFlash: 0,
    },
  ];

  let seed = 4219;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const reservedZones = [
    { x: CENTER_X, r: 315 },
    ...walls.map((w) => ({ x: w.x, r: 44 })),
    ...camps.map((c) => ({ x: c.x, r: 54 })),
    ...chests.map((c) => ({ x: c.x, r: 34 })),
    ...portals.map((p) => ({ x: p.x, r: 95 })),
  ];

  // Rocks / Stone outcrops (accessible both near clearing borders & forest)
  const rockPositions = [
    CENTER_X - 335,
    CENTER_X + 335,
    CENTER_X - 505,
    CENTER_X + 505,
    CENTER_X - 650,
    CENTER_X + 650,
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
        side: camp.x < CENTER_X ? -1 : 1,
        actionTimer: 1 + rand() * 3,
        animTime: rand() * 5,
        carriedCoins: 0,
        orderFlashTimer: 0,
        orderDir: 0,
      });
    }
  }

  const wildlife: Wildlife[] = [
    {
      id: uid(),
      kind: 'rabbit',
      x: CENTER_X - 210,
      y: GROUND_Y,
      vx: 0,
      facing: 1,
      hp: 8,
      aiTimer: 1.2,
      animTime: 0,
    },
    {
      id: uid(),
      kind: 'rabbit',
      x: CENTER_X + 215,
      y: GROUND_Y,
      vx: 0,
      facing: -1,
      hp: 8,
      aiTimer: 2.1,
      animTime: 1.5,
    },
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
    selectTimer: mode === 'char_select' ? 20 : mode === 'crest_select' ? 30 : 0,
    appearance: { ...appearance },
    crest: { ...crest },
    activeCommand: 'none',
    touchCommandMode: 'none',
    commandFeedback: null,
    touchIndicator: null,
    day: 1,
    timeOfDay: 0.03,
    isNight: false,
    isBloodMoon: false,
    nightWaveStage: 0,
    waveTriggeredTonight: false,
    elapsed: 0,
    nextId,
    resources: {
      gold: monarch.coins,
      wood: 0,
      stone: 0,
      iron: 0,
      food: 0,
    },
    monarchs: [monarch],
    hall: {
      x: CENTER_X,
      level: 0,
      coinsPaid: 0,
      taxTimer: 0,
      storedTaxCoins: 0,
    },
    shops,
    walls,
    farms,
    camps,
    trees,
    rocks,
    chests,
    portals,
    villagers,
    enemies: [],
    coins: [],
    flyingCoins: [],
    arrows: [],
    wildlife,
    particles,
    activePrompt: null,
    banner:
      mode === 'playing'
        ? {
            title: 'DIA I — COSTA DE MIDGARD',
            subtitle: 'Acenda a fogueira central e use Z/X/C/V + ←/→ para comandar suas tropas',
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
