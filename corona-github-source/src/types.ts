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

export type CommandMode = 'none' | 'attack' | 'archer' | 'build' | 'produce' | 'spear';

export type ElderId = 'bard' | 'forge_elder' | 'builder_elder' | 'beast_elder' | 'war_elder';
export type ElderState = 'cottage' | 'walking' | 'riding';

export interface Elder {
  id: ElderId;
  cottageX: number;
  x: number;
  vx: number;
  facing: -1 | 1;
  state: ElderState;
  rescued: boolean;
  rescueCoinsPaid: number;
  ridingMonarchId: number | null;
  targetX: number;
  animTime: number;
  abilityTimer: number;
  activeCooldown: number;
}

export type ElementalStoneKind = 'fire' | 'ice' | 'thunder';
export type ElementalStaffId = 'staff_fire' | 'staff_ice' | 'staff_thunder';

export type WeaponId =
  | 'freya_bow'
  | 'tyr_shield'
  | 'thor_hammer'
  | 'odin_gungnir'
  | 'loki_staff'
  | 'ymir_rune'
  | 'surtr_blade'
  | 'heimdall_horn'
  | 'baldr_scepter'
  | ElementalStaffId;

export type PreciousMetalId =
  | 'copper'
  | 'bronze'
  | 'silver'
  | 'frost_steel'
  | 'mithril'
  | 'dwarf_gold'
  | 'obsidian'
  | 'jotun_iron'
  | 'asgard_uru';

export type ArmorSlot =
  | 'gloves'
  | 'boots'
  | 'cloak'
  | 'helmet'
  | 'chestplate'
  | 'pauldrons'
  | 'greaves'
  | 'belt'
  | 'royal_aegis';

export interface Resources {
  gold: number;
  diamonds: number;
  wood: number;
  stone: number;
  iron: number;
  food: number;
  preciousOres?: Partial<Record<PreciousMetalId, number>>;
  elementalStones?: Partial<Record<ElementalStoneKind, number>>;
  yggdrasilWood?: number;
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
  weapon?: WeaponId | null;
  weaponCooldown?: number;
  armor?: Partial<Record<ArmorSlot, PreciousMetalId>>;
  crownShieldReady?: boolean;
  ridingElderId?: ElderId | null;
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
  playerUid?: string;
  playerName?: string;
  appearance?: CharacterAppearance;
}

export type VillagerRole =
  | 'wanderer'
  | 'peasant'
  | 'builder'
  | 'warrior'
  | 'spearman'
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
  | 'assaulting'
  | 'producing'
  | 'foraging'
  | 'fishing'
  | 'boarding'
  | 'embarked'
  | 'tribute_march'
  | 'tribute_ascending'
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
  assaultPortalId?: number | null;
  side: -1 | 1;
  actionTimer: number;
  animTime: number;
  carriedCoins: number;
  orderFlashTimer: number;
  orderDir: -1 | 0 | 1;
  isSummoned?: boolean;
  summonLife?: number;
  ascendY?: number;
}

export type Season = 'summer' | 'autumn' | 'winter' | 'spring';

export type BuilderTaskKind = 'wall' | 'tower' | 'forge' | 'boat' | 'dock' | 'farm' | 'brewery' | 'rock' | 'tree' | 'mine' | 'yggdrasil';

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
  spectralNightShield?: boolean;
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

export type ToolShopKind = 'bow' | 'hammer' | 'sword' | 'spear' | 'seed';

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
  x: number; // Fixed vault desk X
  walkX?: number; // Live walking X during morning farm collection rounds
  facing?: 1 | -1;
  animTime?: number;
  carriedCoins?: number;
  phase?: 'idle' | 'left_sweep' | 'return_from_left' | 'right_sweep' | 'return_from_right';
  targetFarmId?: number | null;
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
  armorCoinsPaid?: number;
  armorForgedSlot?: ArmorSlot | null;
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
  crewSpearmen?: number;
  crewProducers: number;
  crewBuilders: number;
  waterDropProgress?: number; // 0 = on land, 0..1 = launching into fjord, 1 = floating in water
  attackCooldown?: number; // Cooldown for embarked archers & warriors defending the boat
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
  revealed?: boolean;
  conquered?: boolean;
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
  blessed: boolean;  // Paid activation coins + completed tribute ritual
  coinsPaid: number;
  ritualActive?: boolean;
  tributeNeeded?: number;
  tributeCompleted?: number;
  tributeQueueIds?: number[];
  ascenderId?: number | null;
  ascendProgress?: number;
}

export interface WeaponShrine {
  weaponId: WeaponId;
  x: number;
  coinsPaid: number;
  claimedByPlayerUid?: string | null;
}

export interface PreciousMine {
  id: number;
  metalId: PreciousMetalId;
  x: number;
  marked: boolean;
  mineProgress: number;
  coinsPaid: number;
  hitShake: number;
  orderedAt?: number;
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

export interface BerryBush {
  id: number;
  x: number;
  berries: number; // 0 = bare, 1..4 = ripe harvests available in Winter & Spring
  marked: boolean; // Player paid 1 coin to order foraging
  forageProgress: number; // 0..1
  orderedAt?: number;
}

export interface YggdrasilTree {
  id: number;
  x: number;
  marked: boolean;
  harvestProgress: number;
  coinsPaid: number;
  hitShake: number;
  orderedAt?: number;
}

export interface StaffAltar {
  staffId: ElementalStaffId;
  x: number;
  diamondsPaid: number;
  coinsPaid: number;
  forged: boolean;
}

export interface MagicProjectile {
  id: number;
  kind: 'fireball' | 'ice_orb' | 'ice_shard';
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
  targetEnemyId?: number | null;
}

export interface IslandLocalResources {
  wood: number;
  stone: number;
  iron: number;
  food: number;
  preciousOres: Partial<Record<PreciousMetalId, number>>;
}

export interface IslandSnapshot {
  worldWidth?: number;
  centerX?: number;
  islandResources?: IslandLocalResources;
  bankerBalance?: number;
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
  weaponShrine?: WeaponShrine | null;
  preciousMine?: PreciousMine | null;
  yggdrasilTree?: YggdrasilTree | null;
  staffAltars?: StaffAltar[];
  mountShrine: MountShrine | null;
  puzzle: RunePuzzle | null;
  elders?: Elder[];
  camps: VagrantCamp[];
  trees: Tree[];
  rocks: Rock[];
  berryBushes?: BerryBush[];
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
  isBrewerySite?: boolean; // First innermost camp on each side can become a Brewery!
  isBrewery?: boolean;
  breweryCoinsPaid?: number; // 0..15 coins + wood + stone
  breweryUnderConstruction?: boolean;
  breweryBuildProgress?: number; // 0..1
  beerStock?: number; // 0..4 beers (4 coins each)
  beerCoinsPaid?: number; // 0..4
  breweryAttractTimer?: number;
  daysSinceSpawn?: number;
  orderedAt?: number;
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
  elementalStone?: ElementalStoneKind | null;
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
  | 'banker_withdraw'
  | 'villager_tribute'
  | 'forge_build'
  | 'forge_smelt'
  | 'forge_armor'
  | 'forge_convert'
  | 'shop'
  | 'wall'
  | 'tower'
  | 'farm'
  | 'buff_construction'
  | 'buff_forge'
  | 'tree'
  | 'rock'
  | 'precious_mine'
  | 'yggdrasil'
  | 'staff_altar'
  | 'berry_bush'
  | 'brewery_build'
  | 'brewery_beer'
  | 'wanderer'
  | 'boat_build'
  | 'boat_sail'
  | 'boat_bell'
  | 'dock_build'
  | 'god_shrine'
  | 'weapon_shrine'
  | 'mount_shrine'
  | 'elder_rescue'
  | 'elder_summon'
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
  charmed?: boolean;
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
  actionClass?: string;
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
  weaponJustPressed?: boolean;
  elderJustPressed?: boolean;
  drop: boolean;
  dropJustPressed: boolean;
  cmdZ: boolean;
  cmdX: boolean;
  cmdC: boolean;
  cmdV: boolean;
  cmdB?: boolean;
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
  emergingProgress?: number;
  returningToButton?: boolean;
  returnProgress?: number;
}

export type SpiritAdviceTopic =
  | 'cut_trees'
  | 'mine_stone'
  | 'recruit_wanderers'
  | 'hire_archer'
  | 'hire_builder'
  | 'hire_warrior'
  | 'hire_farmer'
  | 'build_farm'
  | 'upgrade_hall'
  | 'fortify_wall'
  | 'repair_wall'
  | 'deposit_banker'
  | 'withdraw_banker'
  | 'winter_berries'
  | 'winter_economy'
  | 'spring_boom'
  | 'autumn_wood'
  | 'summer_hunt'
  | 'build_brewery'
  | 'brew_beer'
  | 'build_forge'
  | 'build_tower'
  | 'build_boat'
  | 'board_boat'
  | 'sail_island'
  | 'attack_portal'
  | 'blood_moon_prep';

export interface SpiritAdvisorBaseline {
  wood: number;
  stone: number;
  iron: number;
  bankerBalance: number;
  monarchCoins: number;
  hallLevel: number;
  totalWallLevels: number;
  brokenWalls: number;
  archers: number;
  builders: number;
  warriors: number;
  farmers: number;
  wanderersRecruited: number;
  farmsBuilt: number;
  breweriesBuilt: number;
  beersStocked: number;
  boatProgress: number;
  boatBuilt: boolean;
  boatCrew: number;
  sailPaid: number;
  portalsLeft: number;
  berryMarkedCount: number;
  treesMarked: number;
  rocksMarked: number;
  forgeBuilt: boolean;
  towersBuilt: number;
}

export interface SpiritAdvisorState {
  phase: 'docked' | 'emerging' | 'active' | 'returning';
  topic: SpiritAdviceTopic | null;
  message: string;
  targetX: number;
  spiritX: number;
  spiritY: number;
  spiritFacing: 1 | -1;
  spiritAlpha: number;
  animProgress: number;
  baseline: SpiritAdvisorBaseline | null;
  autoTeachTimer: number;
  learnedTopics: Record<string, boolean>;
  activeTimer: number;
  completedTimer: number;
  manualSummon: boolean;
}

export interface DiscoveredHudItems {
  diamond?: boolean;
  coin?: boolean;
  wood?: boolean;
  stone?: boolean;
  iron?: boolean;
  sword?: boolean;
  spear?: boolean;
  hammer?: boolean;
  bow?: boolean;
  seed?: boolean;
}

export interface WorldState {
  mode: GameMode;
  saveSlot: number;
  tutorial: TutorialState | null;
  spiritAdvisor?: SpiritAdvisorState;
  selectedVillagerId?: number | null;
  hasOrderedVillager?: boolean;
  nextOrderSeq?: number;
  priorityTask?: PriorityTaskRef | null;
  discoveredHud?: DiscoveredHudItems;
  completedActionClasses?: Record<string, boolean>;
  localPlayerUid?: string;
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
  season?: Season;
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
  worldWidth?: number;
  centerX?: number;
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
  weaponShrine?: WeaponShrine | null;
  preciousMine?: PreciousMine | null;
  yggdrasilTree?: YggdrasilTree | null;
  staffAltars?: StaffAltar[];
  forgedStaves?: ElementalStaffId[];
  mountShrine: MountShrine | null;
  puzzle: RunePuzzle | null;
  elders?: Elder[];
  camps: VagrantCamp[];
  trees: Tree[];
  rocks: Rock[];
  berryBushes?: BerryBush[];
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
  magicProjectiles?: MagicProjectile[];
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

export function getWorldWidth(w: { worldWidth?: number } | null | undefined): number {
  return w && typeof w.worldWidth === 'number' && w.worldWidth >= 2000 ? w.worldWidth : WORLD_WIDTH;
}

export function getCenterX(w: { centerX?: number; hall?: { x: number }; worldWidth?: number } | null | undefined): number {
  if (!w) return CENTER_X;
  if (typeof w.centerX === 'number' && w.centerX >= 800) return w.centerX;
  if (w.hall && typeof w.hall.x === 'number' && w.hall.x >= 800) return w.hall.x;
  if (typeof w.worldWidth === 'number' && w.worldWidth >= 2000) return Math.round(w.worldWidth / 2);
  return CENTER_X;
}

