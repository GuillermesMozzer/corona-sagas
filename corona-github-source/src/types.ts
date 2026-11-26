export const LOGICAL_WIDTH = 480;
export const LOGICAL_HEIGHT = 270;
export const GROUND_Y = 210;
export const WATER_Y = 216;
export const WORLD_WIDTH = 2800;
export const CENTER_X = 1400;
export const DAY_DURATION = 720; // 720s = 6 min day (0..0.5) + 6 min night (0.5..1.0)

export type GameMode =
  | 'login'
  | 'char_select'
  | 'crest_select'
  | 'playing'
  | 'paused'
  | 'gameover';

export type ShieldShape = 'round' | 'kite' | 'hex' | 'heater';
export type ShieldPattern = 'valknut' | 'mjolnir' | 'axes' | 'vegvisir' | 'raven' | 'cross';

export interface CharacterAppearance {
  outfitIndex: number; // 0..3
  hairIndex: number;   // 0..3
  horseIndex: number;  // 0..3 (starter horses only, slow & no superpowers)
  crownIndex: number;  // 0..2
}

export interface CrestConfig {
  shape: ShieldShape;
  pattern: ShieldPattern;
  primaryColor: string;   // Background of shield + kingdom banners/tunics
  secondaryColor: string; // Nordic pattern + trim/accents
  locked: boolean;
}

export type CommandMode = 'none' | 'attack' | 'archer' | 'build' | 'produce';

export interface Resources {
  gold: number;
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
  | 'walking_to_center'
  | 'seeking_tool'
  | 'working'
  | 'hunting'
  | 'defending'
  | 'producing'
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
  side: -1 | 1; // Assigned side via Z/X/C/V tactical commands
  actionTimer: number;
  animTime: number;
  carriedCoins: number;
  orderFlashTimer: number;
  orderDir: -1 | 0 | 1;
}

export interface Wall {
  id: number;
  x: number;
  side: -1 | 1;
  tier: 'inner' | 'outer';
  level: number; // 0 = mound or ruined, 1 = palisade, 2 = reinforced palisade, 3 = bastion
  destroyed: boolean; // True when previously built wall was smashed -> builders repair it!
  previousLevel: number;
  hp: number;
  maxHp: number;
  underConstruction: boolean;
  buildProgress: number; // 0..1
  targetLevel: number;
  coinsPaid: number;
  hitFlash: number;
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
  level: number; // 0 = unbuilt fertile soil, 1 = farmstead, 2 = fortified Nordic farm
  underConstruction: boolean;
  buildProgress: number;
  coinsPaid: number;
  cropProgress: number; // 0..1 -> spawns coins when full
}

export interface Hall {
  x: number;
  level: number; // 0 = unlit campfire, 1 = lit campfire, 2 = wooden hall, 3 = jarl mead hall
  coinsPaid: number;
  taxTimer: number;
  storedTaxCoins: number;
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
  height: number;
  marked: boolean;
  chopped: boolean;
  chopProgress: number; // 0..1
  swayOffset: number;
  hitShake: number;
}

export interface Rock {
  id: number;
  x: number;
  variant: 0 | 1 | 2;
  marked: boolean;
  mined: boolean;
  mineProgress: number; // 0..1
  hitShake: number;
}

export interface Chest {
  id: number;
  x: number;
  opened: boolean;
  coins: number;
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

export type EnemyKind = 'draugr' | 'draugr_brute';

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

export type PromptTargetType = 'hall' | 'shop' | 'wall' | 'farm' | 'tree' | 'rock' | 'wanderer';

export interface FlyingCoin {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0..1
  duration: number;
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
  pending: number; // Coins currently flying toward this placeholder
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
  drop: boolean;
  dropJustPressed: boolean;
  cmdZ: boolean; // Attack / Warriors
  cmdX: boolean; // Archers / Hunters
  cmdC: boolean; // Builders / Construction
  cmdV: boolean; // Producers / Farmers & Fishers
}

export interface TouchIndicator {
  x: number;
  y: number;
  side: -1 | 1;
  sprinting: boolean;
  timer: number;
}

export interface WorldState {
  mode: GameMode;
  selectTimer: number; // 20s for char_select, 30s for crest_select
  appearance: CharacterAppearance;
  crest: CrestConfig;
  activeCommand: CommandMode;
  touchCommandMode: CommandMode; // Activated by tapping top pixel-art icons
  commandFeedback: CommandFeedback | null;
  touchIndicator: TouchIndicator | null;
  day: number;
  timeOfDay: number; // 0..0.5 = 6min Day, 0.5..1.0 = 6min Night
  isNight: boolean;
  isBloodMoon: boolean;
  nightWaveStage: number; // 0..3 sub-waves paced across the 6-minute night
  waveTriggeredTonight: boolean;
  elapsed: number;
  nextId: number;
  resources: Resources;
  monarchs: Monarch[];
  hall: Hall;
  shops: ToolShop[];
  walls: Wall[];
  farms: FarmPlot[];
  camps: VagrantCamp[];
  trees: Tree[];
  rocks: Rock[];
  chests: Chest[];
  portals: Portal[];
  villagers: Villager[];
  enemies: Enemy[];
  coins: Coin[];
  flyingCoins: FlyingCoin[];
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
