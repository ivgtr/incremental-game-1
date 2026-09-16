import { PLAYER_MOVE_SPEED, PLAYER_PACK_CAPACITY } from './config';
import { createGameState } from './createGame';
import type { GameState } from './types';

export const SAVE_KEY = 'loop-shaft:save:v2';
const LEGACY_SAVE_KEY = 'loop-shaft:m1:v1';

export function serializeGameState(state: GameState): string {
  return JSON.stringify({ ...state, events: [] });
}

export function restoreGameState(serialized: string): GameState | null {
  try {
    const raw = JSON.parse(serialized) as Record<string, unknown>;
    if (raw.version !== 1 && raw.version !== 2) return null;
    if (!raw.character || !raw.elevator || !raw.floor || !raw.tool) return null;

    const floor = raw.floor as Partial<GameState['floor']>;
    if (!Array.isArray(floor.nodes) || !Array.isArray(floor.loot)) return null;

    const runSeed = typeof raw.runSeed === 'number' ? raw.runSeed : 1;
    const base = createGameState(runSeed);
    const character = raw.character as Partial<GameState['character']>;
    const porter = (raw.porter ?? {}) as Partial<GameState['porter']>;
    const elevator = raw.elevator as Partial<GameState['elevator']>;
    const automation = (raw.automation ?? {}) as Partial<GameState['automation']>;
    const autoSwing = (automation.autoSwing ?? {}) as Partial<GameState['automation']['autoSwing']>;
    const autoDispatch = (automation.autoDispatch ?? {}) as Partial<GameState['automation']['autoDispatch']>;
    const stats = (raw.stats ?? {}) as Partial<GameState['stats']>;

    const restored: GameState = {
      ...base,
      ...(raw as Partial<GameState>),
      version: 2,
      character: { ...base.character, ...character },
      porter: { ...base.porter, ...porter },
      elevator: { ...base.elevator, ...elevator },
      tool: { ...base.tool, ...(raw.tool as Partial<GameState['tool']>) },
      boots: { ...base.boots, ...((raw.boots ?? {}) as Partial<GameState['boots']>) },
      pack: { ...base.pack, ...((raw.pack ?? {}) as Partial<GameState['pack']>) },
      automation: {
        autoSwing: { ...base.automation.autoSwing, ...autoSwing },
        autoDispatch: { ...base.automation.autoDispatch, ...autoDispatch },
      },
      stats: { ...base.stats, ...stats },
      floor: {
        ...base.floor,
        ...floor,
        nodes: floor.nodes.map((node) => {
          const savedNode = node as Partial<GameState['floor']['nodes'][number]>;
          const defaultNode = base.floor.nodes.find((candidate) => candidate.id === savedNode.id);
          return { ...(defaultNode ?? base.floor.nodes[0]!), ...savedNode };
        }),
        loot: floor.loot,
      },
      events: [],
      eventHistory: Array.isArray(raw.eventHistory)
        ? (raw.eventHistory as GameState['eventHistory']).slice(-100)
        : [],
    };

    if (raw.version === 1) {
      restored.stats.manualSwings = restored.eventHistory.filter((event) => event.type === 'PLAYER_INPUT_MINE').length;
      restored.stats.playerDeposits = restored.eventHistory.filter((event) => event.type === 'LOOT_DEPOSIT').length;
    }

    restored.character.moveSpeed = PLAYER_MOVE_SPEED[restored.boots.level];
    restored.character.backpackCapacity = PLAYER_PACK_CAPACITY[restored.pack.level];
    return restored;
  } catch {
    return null;
  }
}

export function saveToStorage(state: GameState): void {
  localStorage.setItem(SAVE_KEY, serializeGameState(state));
}

export function loadFromStorage(): GameState | null {
  const current = localStorage.getItem(SAVE_KEY);
  if (current) return restoreGameState(current);
  const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
  return legacy ? restoreGameState(legacy) : null;
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(LEGACY_SAVE_KEY);
}
