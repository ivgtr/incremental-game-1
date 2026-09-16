export type CharacterState =
  | 'IDLE'
  | 'MOVING_TO_NODE'
  | 'MINING'
  | 'COLLECTING'
  | 'RETURNING'
  | 'WAITING_FOR_ELEVATOR'
  | 'LOADING';

export type PorterState =
  | 'IDLE'
  | 'FIND_LOOT'
  | 'MOVING_TO_LOOT'
  | 'COLLECTING'
  | 'RETURNING_TO_ELEVATOR'
  | 'WAITING_FOR_ELEVATOR'
  | 'LOADING';

export type ElevatorState = 'IDLE_BOTTOM' | 'LOADING' | 'ASCENDING' | 'UNLOADING' | 'DESCENDING';
export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'RELIC' | 'ANOMALY';
export type LootCategory = 'ORE' | 'VALUABLE' | 'FOSSIL' | 'RELIC' | 'ANOMALY';
export type DepthId = 'D-001' | 'D-030';
export type NodeProfile = 'NEAR' | 'MID' | 'FAR';

export type LootKind =
  | 'STONE'
  | 'IRON'
  | 'COPPER'
  | 'GOLD_NUGGET'
  | 'NATURAL_GOLD'
  | 'GEM'
  | 'OLD_COIN'
  | 'POCKET_WATCH'
  | 'TRILOBITE'
  | 'AMMONITE'
  | 'ANCIENT_FISH'
  | 'REPTILE_TOOTH'
  | 'STRANGE_VERTEBRA'
  | 'PROSPECTOR_LENS'
  | 'RHYTHM_RELAY'
  | 'HUNTER_COMPASS'
  | 'STRIDE_MODULE'
  | 'FRACTURE_CORE'
  | 'BLACK_GLASS_HEART';

export type AnomalyId =
  | 'GOLD_RUSH'
  | 'HEAVY_WORLD'
  | 'EMPTY_SHAFT'
  | 'FOSSIL_AGE'
  | 'LIVING_ROCK'
  | 'FRAGILE_REALITY';

export type PassiveId =
  | 'PROSPECTORS_EYE'
  | 'ELEVATOR_RHYTHM'
  | 'FOSSIL_HUNTER'
  | 'LONG_STRIDE'
  | 'LAST_SWING';

export interface LootStack {
  id: string;
  kind: LootKind;
  name: string;
  rarity: Rarity;
  category: LootCategory;
  weight: number;
  value: number;
  x: number;
  y: number;
}

export interface MiningNode {
  id: string;
  name: string;
  profile: NodeProfile;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  distanceMeters: number;
  commonKinds: LootKind[];
  treasureChance: number;
  valuableWeight: number;
  fossilWeight: number;
  relicWeight: number;
  anomalyWeight: number;
  yieldMin: number;
  yieldMax: number;
  respawnTimer: number;
  respawnDelay: number;
}

export interface SwingState { elapsed: number; hitApplied: boolean; }

export interface WorkerBody {
  x: number;
  y: number;
  facing: -1 | 1;
  moveSpeed: number;
  carried: LootStack[];
}

export interface Character extends WorkerBody {
  state: CharacterState;
  targetNodeId: string | null;
  backpackCapacity: number;
  swing: SwingState | null;
  collectTimer: number;
  loadingTimer: number;
}

export interface Porter extends WorkerBody {
  enabled: boolean;
  state: PorterState;
  targetLootId: string | null;
  capacity: number;
  collectTimer: number;
  loadingTimer: number;
}

export interface Elevator {
  x: number;
  state: ElevatorState;
  position: number;
  maxLoad: number;
  moveSpeed: number;
  cargo: LootStack[];
  stateTimer: number;
  rhythmBoostTrips: number;
}

export interface ToolEquipment {
  id: 'player-tool'; slot: 'TOOL'; level: 1 | 2; name: 'Rusty Pickaxe' | 'Steel Pickaxe'; damage: number;
}
export interface BootsEquipment { id: 'player-boots'; slot: 'BOOTS'; level: 1 | 2; name: 'Work Boots' | 'Runner Boots'; }
export interface PackEquipment { id: 'player-pack'; slot: 'PACK'; level: 1 | 2; name: 'Canvas Pack' | 'Frame Pack'; }
export interface AutomationToggle { unlocked: boolean; enabled: boolean; }
export interface AutomationState { autoSwing: AutomationToggle; autoDispatch: AutomationToggle; }
export interface ProgressionStats { manualSwings: number; playerDeposits: number; porterDeposits: number; elevatorTrips: number; }

export interface Floor {
  id: DepthId;
  seed: number;
  nodes: MiningNode[];
  loot: LootStack[];
}

export interface DepthProgress {
  unlockedD030: boolean;
  current: DepthId;
  transitionRemaining: number;
  transitionDuration: number;
}

export interface AnomalyState {
  options: AnomalyId[];
  selected: AnomalyId | null;
}

export interface CollectionEntry {
  kind: LootKind;
  name: string;
  rarity: Rarity;
  category: LootCategory;
  discovered: boolean;
  count: number;
}

export interface CollectionState { entries: CollectionEntry[]; }
export interface PassiveState { unlocked: PassiveId[]; active: PassiveId[]; }
export interface DiscoveryState {
  d030NodeBreaks: number;
  foundThisRun: number;
  firstDiscoveryBreak: number;
  firstFossilBreak: number;
  firstRelicBreak: number;
}

export type Selection =
  | { type: 'node'; id: string }
  | { type: 'elevator' }
  | { type: 'workbench' }
  | { type: 'scanner' }
  | { type: 'archive' }
  | null;

export type GameEventType =
  | 'PLAYER_INPUT_MOVE' | 'MINER_MOVE_START' | 'MINER_ARRIVE' | 'PLAYER_INPUT_MINE'
  | 'AUTO_SWING_TRIGGER' | 'MINER_SWING_START' | 'MINER_SWING_HIT' | 'NODE_DAMAGE' | 'NODE_BREAK'
  | 'LOOT_ROLL' | 'TREASURE_ROLL' | 'DISCOVERY_FOUND' | 'LOOT_SPAWN' | 'LOOT_PICKUP' | 'MINER_RETURN'
  | 'LOOT_DEPOSIT' | 'PORTER_JOB_ASSIGNED' | 'PORTER_PICKUP' | 'PORTER_DEPOSIT'
  | 'AUTO_DISPATCH_TRIGGER' | 'ELEVATOR_DEPART' | 'ELEVATOR_ARRIVE_SURFACE' | 'LOOT_APPRAISE'
  | 'RESOURCE_GAIN' | 'ELEVATOR_RETURN' | 'EQUIPMENT_UPGRADE' | 'EQUIPMENT_CHANGED'
  | 'AUTOMATION_UNLOCKED' | 'AUTOMATION_TOGGLED' | 'PORTER_UNLOCKED'
  | 'DEPTH_UNLOCKED' | 'DEPTH_ENTERED' | 'ANOMALY_OPTIONS_GENERATED' | 'ANOMALY_SELECTED'
  | 'COLLECTION_REGISTERED' | 'COLLECTION_DUPLICATE' | 'PASSIVE_UNLOCKED' | 'PASSIVE_EQUIPPED';

export interface GameEvent {
  id: number;
  type: GameEventType;
  at: number;
  data?: Record<string, string | number | boolean>;
}

export interface GameState {
  version: 3;
  elapsed: number;
  runSeed: number;
  rngState: number;
  lootRoll: number;
  scrap: number;
  character: Character;
  porter: Porter;
  elevator: Elevator;
  tool: ToolEquipment;
  boots: BootsEquipment;
  pack: PackEquipment;
  automation: AutomationState;
  stats: ProgressionStats;
  floor: Floor;
  depth: DepthProgress;
  anomaly: AnomalyState;
  collection: CollectionState;
  passives: PassiveState;
  discovery: DiscoveryState;
  selection: Selection;
  events: GameEvent[];
  eventHistory: GameEvent[];
  nextEventId: number;
  nextLootId: number;
}
