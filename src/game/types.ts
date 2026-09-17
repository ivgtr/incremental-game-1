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

export type ElevatorState = 'IDLE_BOTTOM' | 'LOADING' | 'ASCENDING' | 'UNLOADING' | 'DESCENDING' | 'TRAVELING';
export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'RELIC' | 'ANOMALY';
export type LootCategory = 'ORE' | 'VALUABLE' | 'FOSSIL' | 'RELIC' | 'ANOMALY' | 'RESEARCH' | 'CORE';
export type DepthId = 'D-001' | 'D-030' | 'D-060' | 'D-100';
export type NodeProfile = 'NEAR' | 'MID' | 'FAR' | 'CORE';

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
  | 'BLACK_GLASS_HEART'
  | 'CRYSTAL_MEMORY'
  | 'SURVEY_CARTRIDGE'
  | 'DAMAGED_RESEARCH_LOG'
  | 'RESONANCE_SHARD'
  | 'UNKNOWN_INSTRUMENT'
  | 'CORE_FRAGMENT'
  | 'CORE_MATRIX';

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

export type ResearchId =
  | 'DEEP_SURVEY'
  | 'PRIORITY_CARGO_TAG'
  | 'MULTI_STOP_RELAY'
  | 'STRATA_SCANNER'
  | 'CORE_RESONANCE';

export type CoreProtocolId =
  | 'EXPERIENCED_HANDS'
  | 'CARGO_MEMORY'
  | 'SHAFT_BLUEPRINT'
  | 'VETERAN_ELEVATOR'
  | 'SURVEY_ARCHIVE';

export interface LootStack {
  id: string;
  kind: LootKind;
  name: string;
  rarity: Rarity;
  category: LootCategory;
  weight: number;
  value: number;
  dataValue: number;
  coreValue: number;
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
  researchWeight: number;
  coreWeight: number;
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

export interface FloorTravelState {
  from: DepthId;
  to: DepthId;
  remaining: number;
  duration: number;
  viaSurface: boolean;
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
  travel: FloorTravelState | null;
}

export interface ToolEquipment {
  id: 'player-tool'; slot: 'TOOL'; level: 1 | 2; name: 'Rusty Pickaxe' | 'Steel Pickaxe'; damage: number;
}
export interface BootsEquipment { id: 'player-boots'; slot: 'BOOTS'; level: 1 | 2; name: 'Work Boots' | 'Runner Boots'; }
export interface PackEquipment { id: 'player-pack'; slot: 'PACK'; level: 1 | 2; name: 'Canvas Pack' | 'Frame Pack'; }
export interface AutomationToggle { unlocked: boolean; enabled: boolean; }
export interface AutomationState { autoSwing: AutomationToggle; autoDispatch: AutomationToggle; }
export interface ProgressionStats { manualSwings: number; playerDeposits: number; porterDeposits: number; elevatorTrips: number; floorTrips: number; }

export interface FloorState {
  id: DepthId;
  seed: number;
  nodes: MiningNode[];
  loot: LootStack[];
}

export interface DepthProgress {
  current: DepthId;
  unlocked: DepthId[];
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
  d060NodeBreaks: number;
  d100CoreBreaks: number;
  foundThisRun: number;
  firstDiscoveryBreak: number;
  firstFossilBreak: number;
  firstRelicBreak: number;
  firstResearchBreak: number;
}

export interface ActiveResearch {
  id: ResearchId;
  remaining: number;
  duration: number;
}
export interface ResearchState {
  completed: ResearchId[];
  active: ActiveResearch | null;
}

export interface CoreChamberState {
  discovered: boolean;
  shellBroken: boolean;
  rebootAvailable: boolean;
  rebootArmed: boolean;
}

export interface RunState {
  seed: number;
  rngState: number;
  lootRoll: number;
  scrap: number;
  data: number;
  pendingCore: number;
  character: Character;
  porter: Porter;
  elevator: Elevator;
  tool: ToolEquipment;
  boots: BootsEquipment;
  pack: PackEquipment;
  automation: AutomationState;
  stats: ProgressionStats;
  floors: Record<DepthId, FloorState>;
  depth: DepthProgress;
  anomaly: AnomalyState;
  research: ResearchState;
  coreChamber: CoreChamberState;
  discovery: DiscoveryState;
  nextLootId: number;
}

export interface MetaProgression {
  seed: number;
  runIndex: number;
  core: number;
  protocols: CoreProtocolId[];
  collection: CollectionState;
  passives: PassiveState;
  bestDepth: DepthId;
}

export type Selection =
  | { type: 'node'; id: string }
  | { type: 'elevator' }
  | { type: 'workbench' }
  | { type: 'scanner' }
  | { type: 'archive' }
  | { type: 'research' }
  | { type: 'core-console' }
  | { type: 'core-chamber' }
  | null;

export type GameEventType =
  | 'PLAYER_INPUT_MOVE' | 'MINER_MOVE_START' | 'MINER_ARRIVE' | 'PLAYER_INPUT_MINE'
  | 'AUTO_SWING_TRIGGER' | 'MINER_SWING_START' | 'MINER_SWING_HIT' | 'NODE_DAMAGE' | 'NODE_BREAK'
  | 'LOOT_ROLL' | 'TREASURE_ROLL' | 'DISCOVERY_FOUND' | 'LOOT_SPAWN' | 'LOOT_PICKUP' | 'MINER_RETURN'
  | 'LOOT_DEPOSIT' | 'PORTER_JOB_ASSIGNED' | 'PORTER_PICKUP' | 'PORTER_DEPOSIT'
  | 'AUTO_DISPATCH_TRIGGER' | 'ELEVATOR_DEPART' | 'ELEVATOR_ARRIVE_SURFACE' | 'LOOT_APPRAISE'
  | 'RESOURCE_GAIN' | 'DATA_GAIN' | 'CORE_CHARGE_GAINED' | 'ELEVATOR_RETURN'
  | 'EQUIPMENT_UPGRADE' | 'EQUIPMENT_CHANGED' | 'AUTOMATION_UNLOCKED' | 'AUTOMATION_TOGGLED' | 'PORTER_UNLOCKED'
  | 'DEPTH_UNLOCKED' | 'FLOOR_TRAVEL_REQUESTED' | 'ELEVATOR_TRAVEL_STARTED' | 'DEPTH_ENTERED'
  | 'ANOMALY_OPTIONS_GENERATED' | 'ANOMALY_SELECTED'
  | 'COLLECTION_REGISTERED' | 'COLLECTION_DUPLICATE' | 'PASSIVE_UNLOCKED' | 'PASSIVE_EQUIPPED'
  | 'RESEARCH_STARTED' | 'RESEARCH_COMPLETED'
  | 'CORE_CHAMBER_DISCOVERED' | 'REBOOT_AVAILABLE' | 'REBOOT_ARMED' | 'REBOOT_COMMITTED'
  | 'CORE_GAINED' | 'CORE_PROTOCOL_PURCHASED' | 'RUN_STARTED';

export interface GameEvent {
  id: number;
  type: GameEventType;
  at: number;
  data?: Record<string, string | number | boolean>;
}

export interface GameState {
  version: 4;
  elapsed: number;
  run: RunState;
  meta: MetaProgression;
  selection: Selection;
  events: GameEvent[];
  eventHistory: GameEvent[];
  nextEventId: number;
}
