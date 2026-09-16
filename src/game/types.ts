export type CharacterState =
  | 'IDLE'
  | 'MOVING_TO_NODE'
  | 'MINING'
  | 'COLLECTING'
  | 'RETURNING'
  | 'WAITING_FOR_ELEVATOR'
  | 'LOADING';

export type ElevatorState =
  | 'IDLE_BOTTOM'
  | 'LOADING'
  | 'ASCENDING'
  | 'UNLOADING'
  | 'DESCENDING';

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE';

export type LootKind = 'STONE' | 'IRON' | 'COPPER' | 'GOLD_NUGGET' | 'FOSSIL' | 'OLD_COIN';

export interface LootStack {
  id: string;
  kind: LootKind;
  name: string;
  rarity: Rarity;
  weight: number;
  value: number;
  x: number;
  y: number;
}

export interface MiningNode {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  distanceMeters: number;
  commonKinds: LootKind[];
  rareKinds: LootKind[];
  rareChance: number;
  respawnTimer: number;
  respawnDelay: number;
}

export interface SwingState {
  elapsed: number;
  hitApplied: boolean;
}

export interface Character {
  x: number;
  y: number;
  facing: -1 | 1;
  state: CharacterState;
  targetNodeId: string | null;
  moveSpeed: number;
  backpackCapacity: number;
  carried: LootStack[];
  swing: SwingState | null;
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
}

export interface ToolEquipment {
  id: 'player-tool';
  slot: 'TOOL';
  level: 1 | 2;
  name: 'Rusty Pickaxe' | 'Steel Pickaxe';
  damage: number;
}

export interface Floor {
  id: 'D-001';
  seed: number;
  nodes: MiningNode[];
  loot: LootStack[];
}

export type Selection =
  | { type: 'node'; id: string }
  | { type: 'elevator' }
  | { type: 'workbench' }
  | null;

export type GameEventType =
  | 'PLAYER_INPUT_MOVE'
  | 'MINER_MOVE_START'
  | 'MINER_ARRIVE'
  | 'PLAYER_INPUT_MINE'
  | 'MINER_SWING_START'
  | 'MINER_SWING_HIT'
  | 'NODE_DAMAGE'
  | 'NODE_BREAK'
  | 'LOOT_ROLL'
  | 'LOOT_SPAWN'
  | 'LOOT_PICKUP'
  | 'MINER_RETURN'
  | 'LOOT_DEPOSIT'
  | 'ELEVATOR_DEPART'
  | 'ELEVATOR_ARRIVE_SURFACE'
  | 'LOOT_APPRAISE'
  | 'RESOURCE_GAIN'
  | 'ELEVATOR_RETURN'
  | 'EQUIPMENT_UPGRADE';

export interface GameEvent {
  id: number;
  type: GameEventType;
  at: number;
  data?: Record<string, string | number | boolean>;
}

export interface GameState {
  version: 1;
  elapsed: number;
  runSeed: number;
  rngState: number;
  lootRoll: number;
  scrap: number;
  character: Character;
  elevator: Elevator;
  tool: ToolEquipment;
  floor: Floor;
  selection: Selection;
  events: GameEvent[];
  eventHistory: GameEvent[];
  nextEventId: number;
  nextLootId: number;
}
