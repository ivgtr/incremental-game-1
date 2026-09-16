import type { LootKind, MiningNode } from './types';

export const WORLD = {
  width: 480,
  height: 270,
  floorY: 210,
  elevatorX: 240,
  workbenchX: 202,
  topY: 52,
  elevatorBottomY: 190,
} as const;

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
export const AUTO_DISPATCH_MIN_WEIGHT = 11;

export const UPGRADE_COSTS = {
  tool: 70,
  boots: 90,
  autoSwing: 120,
  pack: 150,
  porter: 220,
  autoDispatch: 280,
} as const;

export const AUTO_SWING_MANUAL_SWINGS_REQUIRED = 6;

export const LOOT: Record<LootKind, { name: string; rarity: 'COMMON' | 'UNCOMMON' | 'RARE'; weight: number; value: number }> = {
  STONE: { name: 'Stone', rarity: 'COMMON', weight: 2.2, value: 5 },
  IRON: { name: 'Iron', rarity: 'COMMON', weight: 2, value: 12 },
  COPPER: { name: 'Copper', rarity: 'UNCOMMON', weight: 1.7, value: 18 },
  GOLD_NUGGET: { name: 'Gold Nugget', rarity: 'RARE', weight: 0.8, value: 72 },
  FOSSIL: { name: 'Fossil', rarity: 'RARE', weight: 1.1, value: 58 },
  OLD_COIN: { name: 'Old Coin', rarity: 'RARE', weight: 0.3, value: 82 },
};

export function createNodes(): MiningNode[] {
  return [
    {
      id: 'scrap-ledge', name: 'Scrap Ledge', profile: 'NEAR', x: 118, y: WORLD.floorY,
      hp: 30, maxHp: 30, distanceMeters: 9,
      commonKinds: ['STONE', 'IRON'], rareKinds: ['OLD_COIN'], rareChance: 0.01,
      yieldMin: 2, yieldMax: 3, respawnTimer: 0, respawnDelay: 6,
    },
    {
      id: 'copper-pocket', name: 'Copper Pocket', profile: 'MID', x: 356, y: WORLD.floorY,
      hp: 54, maxHp: 54, distanceMeters: 17,
      commonKinds: ['IRON', 'COPPER'], rareKinds: ['GOLD_NUGGET'], rareChance: 0.04,
      yieldMin: 3, yieldMax: 4, respawnTimer: 0, respawnDelay: 9,
    },
    {
      id: 'fossil-crack', name: 'Fossil Crack', profile: 'FAR', x: 438, y: WORLD.floorY,
      hp: 96, maxHp: 96, distanceMeters: 29,
      commonKinds: ['COPPER', 'IRON'], rareKinds: ['FOSSIL', 'OLD_COIN', 'GOLD_NUGGET'], rareChance: 0.12,
      yieldMin: 4, yieldMax: 6, respawnTimer: 0, respawnDelay: 12,
    },
  ];
}
