import type { AnomalyId, LootKind, MiningNode, PassiveId, Rarity, LootCategory } from './types';

export const WORLD = { width: 480, height: 270, floorY: 210, elevatorX: 240, workbenchX: 202, topY: 52, elevatorBottomY: 190 } as const;
export const SWING = { total: 0.44, hitAt: 0.2 } as const;
export const COLLECT_DURATION = 0.42;
export const PORTER_COLLECT_DURATION = 0.3;
export const LOAD_DURATION = 0.68;
export const PORTER_LOAD_DURATION = 0.52;
export const UNLOAD_DURATION = 0.95;
export const SAVE_INTERVAL = 5;
export const PLAYER_MOVE_SPEED = { 1: 42, 2: 66 } as const;
export const PLAYER_PACK_CAPACITY = { 1: 8, 2: 15 } as const;
export const PORTER_MOVE_SPEED = 36;
export const PORTER_CAPACITY = 7;
export const BASE_ELEVATOR_CAPACITY = 20;
export const BASE_ELEVATOR_SPEED = 0.34;
export const AUTO_DISPATCH_MIN_WEIGHT = 11;
export const D030_EXTENSION_COST = 2200;
export const DEPTH_TRANSITION_DURATION = 2.4;

export const UPGRADE_COSTS = { tool: 90, boots: 160, autoSwing: 180, pack: 450, porter: 700, autoDispatch: 1400 } as const;
export const AUTO_SWING_MANUAL_SWINGS_REQUIRED = 6;

export interface LootDefinition {
  name: string;
  rarity: Rarity;
  category: LootCategory;
  weight: number;
  value: number;
  passive?: PassiveId;
}

export const LOOT: Record<LootKind, LootDefinition> = {
  STONE: { name: 'Stone', rarity: 'COMMON', category: 'ORE', weight: 2.2, value: 5 },
  IRON: { name: 'Iron', rarity: 'COMMON', category: 'ORE', weight: 2, value: 12 },
  COPPER: { name: 'Copper', rarity: 'UNCOMMON', category: 'ORE', weight: 1.7, value: 18 },
  GOLD_NUGGET: { name: 'Gold Nugget', rarity: 'RARE', category: 'VALUABLE', weight: 0.8, value: 82 },
  NATURAL_GOLD: { name: 'Natural Gold', rarity: 'EPIC', category: 'VALUABLE', weight: 1, value: 130 },
  GEM: { name: 'Deep Gem', rarity: 'EPIC', category: 'VALUABLE', weight: 0.45, value: 165 },
  OLD_COIN: { name: 'Ancient Coin', rarity: 'RARE', category: 'VALUABLE', weight: 0.3, value: 92 },
  POCKET_WATCH: { name: 'Pocket Watch', rarity: 'RARE', category: 'VALUABLE', weight: 0.55, value: 105 },
  TRILOBITE: { name: 'Trilobite', rarity: 'RARE', category: 'FOSSIL', weight: 1.1, value: 42 },
  AMMONITE: { name: 'Ammonite', rarity: 'RARE', category: 'FOSSIL', weight: 1.2, value: 46 },
  ANCIENT_FISH: { name: 'Ancient Fish', rarity: 'EPIC', category: 'FOSSIL', weight: 1.4, value: 65 },
  REPTILE_TOOTH: { name: 'Reptile Tooth', rarity: 'EPIC', category: 'FOSSIL', weight: 0.65, value: 72 },
  STRANGE_VERTEBRA: { name: 'Strange Vertebra', rarity: 'RELIC', category: 'FOSSIL', weight: 1.5, value: 90 },
  PROSPECTOR_LENS: { name: "Prospector's Lens", rarity: 'RELIC', category: 'RELIC', weight: 0.7, value: 35, passive: 'PROSPECTORS_EYE' },
  RHYTHM_RELAY: { name: 'Rhythm Relay', rarity: 'RELIC', category: 'RELIC', weight: 0.9, value: 35, passive: 'ELEVATOR_RHYTHM' },
  HUNTER_COMPASS: { name: 'Hunter Compass', rarity: 'RELIC', category: 'RELIC', weight: 0.65, value: 35, passive: 'FOSSIL_HUNTER' },
  STRIDE_MODULE: { name: 'Stride Module', rarity: 'RELIC', category: 'RELIC', weight: 0.85, value: 35, passive: 'LONG_STRIDE' },
  FRACTURE_CORE: { name: 'Fracture Core', rarity: 'RELIC', category: 'RELIC', weight: 1.1, value: 35, passive: 'LAST_SWING' },
  BLACK_GLASS_HEART: { name: 'Black Glass Heart', rarity: 'ANOMALY', category: 'ANOMALY', weight: 1.25, value: 180 },
};

export const VALUABLE_KINDS: readonly LootKind[] = ['GOLD_NUGGET', 'NATURAL_GOLD', 'GEM', 'OLD_COIN', 'POCKET_WATCH'];
export const FOSSIL_KINDS: readonly LootKind[] = ['TRILOBITE', 'AMMONITE', 'ANCIENT_FISH', 'REPTILE_TOOTH', 'STRANGE_VERTEBRA'];
export const RELIC_KINDS: readonly LootKind[] = ['PROSPECTOR_LENS', 'RHYTHM_RELAY', 'HUNTER_COMPASS', 'STRIDE_MODULE', 'FRACTURE_CORE'];
export const ANOMALY_KINDS: readonly LootKind[] = ['BLACK_GLASS_HEART'];
export const COLLECTIBLE_KINDS: readonly LootKind[] = [...FOSSIL_KINDS, ...RELIC_KINDS, ...ANOMALY_KINDS];

export const ANOMALIES: Record<AnomalyId, { name: string; description: string }> = {
  GOLD_RUSH: { name: 'Gold Rush', description: 'Less ordinary ore. Valuable finds become much more common.' },
  HEAVY_WORLD: { name: 'Heavy World', description: 'Workers move slowly, but everything appraises for more.' },
  EMPTY_SHAFT: { name: 'Empty Shaft', description: 'Lift capacity shrinks; ascent and descent become much faster.' },
  FOSSIL_AGE: { name: 'Fossil Age', description: 'Fossils surge while ordinary metal loses appraisal value.' },
  LIVING_ROCK: { name: 'Living Rock', description: 'Broken nodes knit themselves back together rapidly.' },
  FRAGILE_REALITY: { name: 'Fragile Reality', description: 'Nodes break faster and anomalous objects surface more often.' },
};
export const ANOMALY_POOL = Object.keys(ANOMALIES) as AnomalyId[];

export const PASSIVES: Record<PassiveId, { name: string; description: string }> = {
  PROSPECTORS_EYE: { name: "Prospector's Eye", description: 'Read exact treasure odds and fossil/relic traces before committing.' },
  ELEVATOR_RHYTHM: { name: 'Elevator Rhythm', description: 'Dispatch at 85%+ load to accelerate that round trip.' },
  FOSSIL_HUNTER: { name: 'Fossil Hunter', description: 'Fossil odds rise sharply, but ordinary ore appraises lower.' },
  LONG_STRIDE: { name: 'Long Stride', description: 'The miner moves much faster while carrying nothing.' },
  LAST_SWING: { name: 'Last Swing', description: 'Hits against nodes at 10% HP or lower deal heavy finishing damage.' },
};

export function createD001Nodes(): MiningNode[] {
  return [
    node('scrap-ledge', 'Scrap Ledge', 'NEAR', 118, 30, 9, ['STONE', 'IRON'], 0.01, [1, 0, 0, 0], 2, 3, 6),
    node('copper-pocket', 'Copper Pocket', 'MID', 356, 54, 17, ['IRON', 'COPPER'], 0.04, [1, 0, 0, 0], 3, 4, 9),
    node('fossil-crack', 'Fossil Crack', 'FAR', 438, 96, 29, ['COPPER', 'IRON'], 0.12, [1, 0, 0, 0], 4, 6, 12),
  ];
}

export function createD030Nodes(): MiningNode[] {
  return [
    node('dense-vein', 'Dense Vein', 'NEAR', 103, 92, 10, ['IRON', 'COPPER'], 0.08, [0.74, 0.14, 0.1, 0.02], 5, 7, 10),
    node('fossil-seam', 'Fossil Seam', 'MID', 360, 76, 19, ['STONE', 'IRON'], 0.22, [0.2, 0.62, 0.14, 0.04], 2, 4, 11),
    node('black-glass-fault', 'Black Glass Fault', 'FAR', 440, 132, 31, ['COPPER', 'IRON'], 0.29, [0.42, 0.12, 0.34, 0.12], 3, 5, 14),
  ];
}

function node(id: string, name: string, profile: MiningNode['profile'], x: number, hp: number, distanceMeters: number,
  commonKinds: LootKind[], treasureChance: number, weights: readonly [number, number, number, number],
  yieldMin: number, yieldMax: number, respawnDelay: number): MiningNode {
  return {
    id, name, profile, x, y: WORLD.floorY, hp, maxHp: hp, distanceMeters, commonKinds, treasureChance,
    valuableWeight: weights[0], fossilWeight: weights[1], relicWeight: weights[2], anomalyWeight: weights[3],
    yieldMin, yieldMax, respawnTimer: 0, respawnDelay,
  };
}
