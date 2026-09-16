import type { GameState } from './types';

export function hashSeed(seed: number): number {
  let x = seed | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function nextRandom(state: GameState): number {
  let x = state.run.rngState || 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.run.rngState = x >>> 0;
  state.run.lootRoll += 1;
  return state.run.rngState / 0x100000000;
}

export function pick<T>(state: GameState, values: readonly T[]): T {
  const index = Math.min(values.length - 1, Math.floor(nextRandom(state) * values.length));
  const value = values[index];
  if (value === undefined) throw new Error('Cannot pick from an empty collection.');
  return value;
}
