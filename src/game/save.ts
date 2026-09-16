import type { GameState } from './types';

export const SAVE_KEY = 'loop-shaft:m1:v1';

export function serializeGameState(state: GameState): string {
  return JSON.stringify({ ...state, events: [] });
}

export function restoreGameState(serialized: string): GameState | null {
  try {
    const value = JSON.parse(serialized) as Partial<GameState>;
    if (value.version !== 1 || !value.character || !value.elevator || !value.floor || !value.tool) return null;
    if (!Array.isArray(value.floor.nodes) || !Array.isArray(value.floor.loot)) return null;
    return {
      ...(value as GameState),
      events: [],
      eventHistory: Array.isArray(value.eventHistory) ? value.eventHistory.slice(-80) : [],
    };
  } catch {
    return null;
  }
}

export function saveToStorage(state: GameState): void {
  localStorage.setItem(SAVE_KEY, serializeGameState(state));
}

export function loadFromStorage(): GameState | null {
  const serialized = localStorage.getItem(SAVE_KEY);
  return serialized ? restoreGameState(serialized) : null;
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
