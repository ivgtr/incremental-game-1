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

export const SWING = {
  total: 0.44,
  hitAt: 0.2,
} as const;

export const COLLECT_DURATION = 0.42;
export const LOAD_DURATION = 0.68;
export const UNLOAD_DURATION = 0.95;
export const SAVE_INTERVAL = 5;
export const STEEL_PICKAXE_COST = 90;

export const LOOT: Record<LootKind, { name: string; rarity: 'COMMON' | 'UNCOMMON' | 'RARE'; weight: number; value: number }> = {
  STONE: { name: 'Stone', rarity: 'COMMON', weight: 2.2, value: 5 },
  IRON: { name: 'Iron', rarity: 'COMMON', weight: 2, value: 11 },
  COPPER: { name: 'Copper', rarity: 'UNCOMMON', weight: 1.7, value: 15 },
  GOLD_NUGGET: { name: 'Gold Nugget', rarity: 'RARE', weight: 0.8, value: 62 },
  FOSSIL: { name: 'Fossil', rarity: 'RARE', weight: 1.1, value: 48 },
  OLD_COIN: { name: 'Old Coin', rarity: 'RARE', weight: 0.3, value: 74 },
};

export function createNodes(): MiningNode[] {
  return [
    {
      id: 'scrap-ledge',
      name: 'Scrap Ledge',
      x: 84,
      y: WORLD.floorY,
      hp: 30,
      maxHp: 30,
      distanceMeters: 9,
      commonKinds: ['STONE', 'IRON'],
      rareKinds: ['OLD_COIN'],
      rareChance: 0.012,
      respawnTimer: 0,
      respawnDelay: 9,
    },
    {
      id: 'copper-pocket',
      name: 'Copper Pocket',
      x: 356,
      y: WORLD.floorY,
      hp: 45,
      maxHp: 45,
      distanceMeters: 17,
      commonKinds: ['IRON', 'COPPER'],
      rareKinds: ['GOLD_NUGGET'],
      rareChance: 0.03,
      respawnTimer: 0,
      respawnDelay: 11,
    },
    {
      id: 'fossil-crack',
      name: 'Fossil Crack',
      x: 430,
      y: WORLD.floorY,
      hp: 60,
      maxHp: 60,
      distanceMeters: 27,
      commonKinds: ['STONE', 'COPPER'],
      rareKinds: ['FOSSIL', 'OLD_COIN', 'GOLD_NUGGET'],
      rareChance: 0.09,
      respawnTimer: 0,
      respawnDelay: 14,
    },
  ];
}
