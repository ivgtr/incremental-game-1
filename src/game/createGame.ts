import {
  createNodes,
  PLAYER_MOVE_SPEED,
  PLAYER_PACK_CAPACITY,
  PORTER_CAPACITY,
  PORTER_MOVE_SPEED,
  WORLD,
} from './config';
import { hashSeed } from './rng';
import type { GameState } from './types';

export function createGameState(seed = createRunSeed()): GameState {
  const runSeed = seed >>> 0 || 1;
  return {
    version: 2,
    elapsed: 0,
    runSeed,
    rngState: hashSeed(runSeed),
    lootRoll: 0,
    scrap: 0,
    character: {
      x: WORLD.elevatorX - 20,
      y: WORLD.floorY - 8,
      facing: -1,
      state: 'IDLE',
      targetNodeId: null,
      moveSpeed: PLAYER_MOVE_SPEED[1],
      backpackCapacity: PLAYER_PACK_CAPACITY[1],
      carried: [],
      swing: null,
      collectTimer: 0,
      loadingTimer: 0,
    },
    porter: {
      enabled: false,
      x: WORLD.elevatorX + 28,
      y: WORLD.floorY - 8,
      facing: 1,
      state: 'IDLE',
      targetLootId: null,
      moveSpeed: PORTER_MOVE_SPEED,
      capacity: PORTER_CAPACITY,
      carried: [],
      collectTimer: 0,
      loadingTimer: 0,
    },
    elevator: {
      x: WORLD.elevatorX,
      state: 'IDLE_BOTTOM',
      position: 0,
      maxLoad: 20,
      moveSpeed: 0.34,
      cargo: [],
      stateTimer: 0,
    },
    tool: { id: 'player-tool', slot: 'TOOL', level: 1, name: 'Rusty Pickaxe', damage: 10 },
    boots: { id: 'player-boots', slot: 'BOOTS', level: 1, name: 'Work Boots' },
    pack: { id: 'player-pack', slot: 'PACK', level: 1, name: 'Canvas Pack' },
    automation: {
      autoSwing: { unlocked: false, enabled: false },
      autoDispatch: { unlocked: false, enabled: false },
    },
    stats: { manualSwings: 0, playerDeposits: 0, porterDeposits: 0, elevatorTrips: 0 },
    floor: { id: 'D-001', seed: hashSeed(runSeed ^ 0xd001), nodes: createNodes(), loot: [] },
    selection: null,
    events: [],
    eventHistory: [],
    nextEventId: 1,
    nextLootId: 1,
  };
}

export function createRunSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || 1;
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1;
}
