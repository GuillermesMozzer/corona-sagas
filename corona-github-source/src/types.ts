export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 270;
export const GROUND_Y = 210;
export const WATER_Y = 216;
export const WORLD_WIDTH = 2800;
export const CENTER_X = 1400;
export const MAX_KINGDOM_LEVEL = 10;
export const TOTAL_ISLANDS = 9;
export const MAX_FARMERS_PER_FARM = 5; // Base reference; actual cap scales with farm level (2 + level)
export const BOAT_BUILD_COST = 30;
export const BOAT_SAIL_COST = 10;
export const DOCK_BUILD_COST = 30;
export const BELL_COST = 1;
export const MAX_CREW_PER_CLASS = 4;

export type ResourceSize = 'small' | 'medium' | 'large';

export interface ResourceCost {
  coins: number;
  wood: number;
  stone: number;
  iron: number;
}

export type GameMode =
  | 'login'
  | 'slot_select'
  | 'char_select'
  | 'crest_select'
  | 'playing'
  | 'world_map'
  | 'paused'
  | 'gameover';

export type GodId = 'thor' | 'freya' | 'odin' | 'loki';
export type MountId = 'starter' | 'harpy' | 'wolf' | 'ice_horse' | 'bear' | 'fire_horse' | 'sleipnir';

export type ShieldShape = 'round' | 'kite' | 'hex' | 'heater';
export type ShieldPattern = 'valknut' | 'mjolnir' | 'axes' | 'vegvisir' | 'raven' | 'cross';

export type CharacterGender = 'king' | 'queen';

export interface CharacterAppearance {
  gender: CharacterGender;
  name: string;
  outfitIndex: number;
  hairIndex: number;
  horseIndex: number;
  crownIndex: number;
}

export interface CrestConfig {
  shape: ShieldShape;
  pattern: ShieldPattern;
  primaryColor: string;
  secondaryColor: string;
  locked: boolean;
}

export type CommandMode = 'none' | 'attack' | 'archer' | 'build' | 'produce';

export interface Resources {
  gold: number;
  diamonds: number;
  wood: number;
  stone: number;
  iron: number;
  food: number;
}

export interface Monarch {
  id: number;
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  stamina: number;
  maxStamina: number;
  exhausted: boolean;
  sprinting: boolean;
  coins: number;
  maxCoins: number;
  diamonds: number;
  mount: MountId;
  mountPowerCooldown: number;
  flyTimer: number; // Harpy aerial flight duration
  flyY: number;     // Current height above ground while flying
  roarTimer: number; // Bear roar / Ice wave visual effect timer
  wolfBiteCooldown: number;
  hasCrown: boolean;
  crownX: number;
  crownY: number;
  crownVx: number;
  crownVy: number;
  crownGrounded: boolean;
  crownStolenByEnemyId: number | null;
  animTime: number;
  dropCooldown: number;
  hurtCooldown: number;
  cameraX: number;
}

export type VillagerRole =
  | 'wanderer'
  | 'peasant'
  | 'builder'
  | 'warrior'
  | 'archer'
  | 'producer';

export type VillagerState =
  | 'idle'
  | 'wandering'
  | 'seeking_coin'
  | 'returning_coins'
  | 'walking_to_center'
  | 'seeking_tool'
  | 'working'
  | 'hunting'
  | 'defending'
  | 'producing'
  | 'boarding'
  | 'embarked'
  | 'fleeing';

export interface Villager {
  id: number;
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  role: VillagerRole;
  state: VillagerState;
  hp: number;
  maxHp: number;
  targetX: number;
  targetId: number | null;
  homeCampId: number | null;
  assignedFarmId: number | null;
  assignedTowerId?: number | null;
  side: -1 | 1;
  actionTimer: number;
  animTime: number;
  carriedCoins: number;
  orderFlashTimer: number;
  orderDir: -1 | 0 | 1;
}

export type BuilderTaskKind = 'wall' | 'tower' | 'forge' | 'boat' | 'dock' | 'farm' | 'rock' | 'tree';

export interface PriorityTaskRef {
  kind: BuilderTaskKind;
  id: number;
}

export interface Wall {
  id: number;
  x: number;
  side: -1 | 1;
  tier: 'inner' | 'outer';
  level: number;
  destroyed: boolean;
  previousLevel: number;
  hp: number;
  maxHp: number;
  underConstruction: boolean;
  buildProgress: number;
  targetLevel: number;
  coinsPaid: number;
  hitFlash: number;
  orderedAt?: number;
}

export interface ArcherTower {
  id: number;
  x: number;
  side: -1 | 1;
  tier: 'inner' | 'outer';
  level: number; // 0 = unbuilt plot, 1..10 matches Kingdom level
  destroyed: boolean;
  previousLevel: number;
  hp: number;
  maxHp: number;
  underConstruction: boolean;
  buildProgress: number;
  targetLevel: number;
  coinsPaid: number;
  hitFlash: number;
  orderedAt?: number;
}

export type ToolShopKind = 'bow' | 'hammer' | 'sword' | 'seed';

export interface ToolShop {
  id: number;
  kind: ToolShopKind;
  x: number;
  built: boolean;
  stock: number;
  maxStock: number;
  coinsPaid: number;
}

export interface FarmPlot {
  id: number;
  x: number;
  side: -1 | 1;
  level: number; // 0 = unbuilt, 1..10 matches Kingdom level (unlocked at Hall Lv >= 2)
  underConstruction: boolean;
  buildProgress: number;
  coinsPaid: number;
  cropProgress: number;
  storedFood: number;
  storedCoins: number;
  orderedAt?: number;
}

export interface Hall {
  x: number;
  level: number; // 0 = unlit campfire, 1..10 = Kingdom levels (max 2 on Island 1, +1 per next island)
  coinsPaid: number;
  taxTimer: number;
  storedTaxCoins: number; // Treasury coins deposited by workers & daily tribute!
}

export interface BankerState {
  x: number;
  balance: number;
  interestFraction: number;
  lastDayYield: number;
}

export interface ForgeState {
  x: number;
  built: boolean;
  coinsPaid: number;
  underConstruction: boolean;
  buildProgress: number;
  smelting: boolean;
  smeltProgress: number;
  smeltCoinsPaid: number;
  smeltQueue: number;
  orderedAt?: number;
}

export interface IslandBuffAltar {
  kind: 'construction' | 'forge';
  x: number;
  active: boolean;
  coinsPaid: number;
}

export interface BoatState {
  x: number;
  bellX: number;
  built: boolean;
  coinsPaid: number; // 0..30 to build Drakkar
  buildProgress: number; // 0..1 builder construction progress
  underConstruction: boolean;
  sailCoinsPaid: number; // 0..10 to depart!
  bellRung: boolean;
  crewArchers: number;
  crewWarriors: number;
  crewProducers: number;
  crewBuilders: number;
  orderedAt?: number;
}

export interface DockState {
  x: number;
  required: boolean; // False on Island 1 (starts with boat), true on Islands 2..9!
  built: boolean;
  coinsPaid: number; // 0..30 to construct port on new islands
  underConstruction: boolean;
  buildProgress: number;
  orderedAt?: number;
}

export interface IslandProgress {
  id: number;
  colonized: boolean;
  visited: boolean;
  dockBuilt: boolean;
  boatBuilt: boolean;
  hallLevel: number;
  wallsBuilt: number;
  diamondsCollected: number;
  godUnlocked: boolean;
  mountUnlocked: boolean;
  constructionBuff: boolean;
  forgeBuff: boolean;
  snapshot?: IslandSnapshot;
}

export interface GodShrine {
  godId: GodId;
  x: number;
  unlocked: boolean; // Paid 3 diamonds
  diamondsPaid: number;
  blessed: boolean;  // Paid activation coins
  coinsPaid: number;
}

export interface MountShrine {
  mountId: MountId;
  x: number;
  unlocked: boolean; // Paid required diamonds
  diamondsPaid: number;
  coinsPaid: number;
}

export interface RunePuzzle {
  x: number;
  solved: boolean;
  coinsPaid: number; // 3 coins -> unlocks secret +2 Diamonds + 4 Gold!
  diamondReward: number;
}

export interface FireTrail {
  x: number;
  life: number;
  maxLife: number;
}

export interface LightningBolt {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  life: number;
}

export interface IslandSnapshot {
  hall: Hall;
  forge: ForgeState | null;
  shops: ToolShop[];
  walls: Wall[];
  towers: ArcherTower[];
  farms: FarmPlot[];
  islandBuffs: IslandBuffAltar[];
  boat: BoatState;
  dock: DockState;
  godShrine: GodShrine | null;
  mountShrine: MountShrine | null;
  puzzle: RunePuzzle | null;
  camps: VagrantCamp[];
  trees: Tree[];
  rocks: Rock[];
  chests: Chest[];
  portals: Portal[];
  villagers: Villager[];
  rockRegrowQueue: number;
  rockRegrowTimer: number;
  treeRegrowQueue: number;
  treeRegrowTimer: number;
}

export interface VagrantCamp {
  id: number;
  x: number;
  spawnTimer: number;
  active: boolean;
}

export interface Tree {
  id: number;
  x: number;
  variant: 0 | 1 | 2;
  size: ResourceSize;
  height: number;
  marked: boolean;
  chopped: boolean;
  chopProgress: number;
  swayOffset: number;
  hitShake: number;
  orderedAt?: number;
}

export interface Rock {
  id: number;
  x: number;
  variant: 0 | 1 | 2;
  size: ResourceSize;
  marked: boolean;
  mined: boolean;
  mineProgress: number;
  hitShake: number;
  orderedAt?: number;
}

export interface Chest {
  id: number;
  x: number;
  opened: boolean;
  coins: number;
  diamonds: number;
}

export interface Portal {
  id: number;
  x: number;
  side: -1 | 1;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  pulseTime: number;
  spawnQueue: number;
  spawnCooldown: number;
  hitFlash: number;
}

export type EnemyKind = 'draugr' | 'wolf_wraith' | 'draugr_brute' | 'hel_crow' | 'frost_troll';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  side: -1 | 1;
  retreating: boolean;
  stolenLoot: 'none' | 'coin' | 'crown';
  attackCooldown: number;
  animTime: number;
  hitFlash: number;
  frozenTimer: number;
  stunTimer: number;
}

export interface Coin {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  age: number;
  fromMonarch: boolean;
  claimedById: number | null;
  pickupDelay: number;
}

export type PromptTargetType =
  | 'hall'
  | 'banker'
  | 'forge_build'
  | 'forge_smelt'
  | 'shop'
  | 'wall'
  | 'tower'
  | 'farm'
  | 'buff_construction'
  | 'buff_forge'
  | 'tree'
  | 'rock'
  | 'wanderer'
  | 'boat_build'
  | 'boat_sail'
  | 'boat_bell'
  | 'dock_build'
  | 'god_shrine'
  | 'mount_shrine'
  | 'puzzle';

export interface FlyingCoin {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  duration: number;
  currency: 'coin' | 'diamond';
  targetType: PromptTargetType;
  targetId: number;
}

export interface Arrow {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  alive: boolean;
  stuckTimer: number;
}

export interface Wildlife {
  id: number;
  kind: 'rabbit' | 'deer';
  x: number;
  y: number;
  vx: number;
  facing: 1 | -1;
  hp: number;
  aiTimer: number;
  animTime: number;
}

export type ParticleKind = 'snow' | 'ember' | 'spark' | 'wood' | 'stone' | 'shadow' | 'leaf' | 'breath' | 'ring';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  kind: ParticleKind;
}

export interface FloatingPrompt {
  x: number;
  y: number;
  label: string;
  cost: number;
  paid: number;
  pending: number;
  currency?: 'coin' | 'diamond';
  woodCost?: number;
  stoneCost?: number;
  ironCost?: number;
  blockedReason?: string;
  canWithdraw?: boolean;
  bankBalance?: number;
  bankRatePct?: number;
  targetType: PromptTargetType;
  targetId: number;
}

export interface BannerNotice {
  title: string;
  subtitle: string;
  timer: number;
  maxTimer: number;
  accent: string;
}

export interface CommandFeedback {
  mode: CommandMode;
  side: -1 | 1;
  text: string;
  timer: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  leftJustPressed: boolean;
  rightJustPressed: boolean;
  sprint: boolean;
  powerJustPressed: boolean;
  drop: boolean;
  dropJustPressed: boolean;
  cmdZ: boolean;
  cmdX: boolean;
  cmdC: boolean;
  cmdV: boolean;
}

export interface TouchIndicator {
  x: number;
  y: number;
  side: -1 | 1;
  sprinting: boolean;
  timer: number;
}

export type TutorialStep =
  | 'light_fire'
  | 'recruit_wanderers'
  | 'buy_hammer'
  | 'build_right_wall'
  | 'build_left_wall'
  | 'buy_bow'
  | 'order_villager'
  | 'farewell';

export interface TutorialState {
  active: boolean;
  step: TutorialStep;
  spiritX: number;
  spiritY: number;
  spiritFacing: 1 | -1;
  spiritAlpha: number;
  fadeCycle: number;
  farewellTimer: number;
  bowTributeGiven: boolean;
}

export interface DiscoveredHudItems {
  diamond?: boolean;
  coin?: boolean;
  wood?: boolean;
  stone?: boolean;
  iron?: boolean;
  sword?: boolean;
  hammer?: boolean;
  bow?: boolean;
  seed?: boolean;
}

export interface WorldState {
  mode: GameMode;
  saveSlot: number;
  tutorial: TutorialState | null;
  selectedVillagerId?: number | null;
  hasOrderedVillager?: boolean;
  nextOrderSeq?: number;
  priorityTask?: PriorityTaskRef | null;
  discoveredHud?: DiscoveredHudItems;
  worldMapContext: 'inspect' | 'sail';
  viewWidth: number;
  viewHeight: number;
  selectTimer: number;
  appearance: CharacterAppearance;
  crest: CrestConfig;
  activeCommand: CommandMode;
  touchCommandMode: CommandMode;
  commandFeedback: CommandFeedback | null;
  touchIndicator: TouchIndicator | null;
  currentIsland: number;
  islands: IslandProgress[];
  unlockedGods: GodId[];
  activeGod: GodId | null;
  thorActivated: boolean;
  unlockedMounts: MountId[];
  day: number;
  dayHalfMinutes: number;
  timeOfDay: number;
  threatLevel: number;
  isNight: boolean;
  isBloodMoon: boolean;
  nightWaveStage: number;
  waveTriggeredTonight: boolean;
  elapsed: number;
  nextId: number;
  resources: Resources;
  monarchs: Monarch[];
  hall: Hall;
  banker: BankerState;
  forge: ForgeState | null;
  shops: ToolShop[];
  walls: Wall[];
  towers: ArcherTower[];
  farms: FarmPlot[];
  islandBuffs: IslandBuffAltar[];
  boat: BoatState;
  dock: DockState;
  godShrine: GodShrine | null;
  mountShrine: MountShrine | null;
  puzzle: RunePuzzle | null;
  camps: VagrantCamp[];
  trees: Tree[];
  rocks: Rock[];
  rockRegrowQueue: number;
  rockRegrowTimer: number;
  treeRegrowQueue: number;
  treeRegrowTimer: number;
  chests: Chest[];
  portals: Portal[];
  villagers: Villager[];
  enemies: Enemy[];
  coins: Coin[];
  flyingCoins: FlyingCoin[];
  fireTrails: FireTrail[];
  lightningBolts: LightningBolt[];
  arrows: Arrow[];
  wildlife: Wildlife[];
  particles: Particle[];
  activePrompt: FloatingPrompt | null;
  banner: BannerNotice | null;
  screenShake: number;
  stats: {
    daysSurvived: number;
    draugrSlain: number;
    villagersRecruited: number;
    wallsBuilt: number;
  };
}
