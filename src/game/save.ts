import { createD001Nodes, createD030Nodes, LOOT, PLAYER_PACK_CAPACITY } from './config';
import { createGameState } from './createGame';
import { getModifiers } from './modifiers';
import type { GameState, LootKind, LootStack, MiningNode } from './types';

export const SAVE_KEY = 'loop-shaft:save:v3';
const V2_SAVE_KEY = 'loop-shaft:save:v2';
const LEGACY_SAVE_KEY = 'loop-shaft:m1:v1';

export function serializeGameState(state: GameState): string {
  return JSON.stringify({ ...state, events: [] });
}

export function restoreGameState(serialized: string): GameState | null {
  try {
    const raw = JSON.parse(serialized) as Record<string, unknown>;
    if (raw.version !== 1 && raw.version !== 2 && raw.version !== 3) return null;
    if (!raw.character || !raw.elevator || !raw.floor || !raw.tool) return null;
    const rawFloor = raw.floor as Record<string, unknown>;
    if (!Array.isArray(rawFloor.nodes) || !Array.isArray(rawFloor.loot)) return null;

    const runSeed = typeof raw.runSeed === 'number' ? raw.runSeed : 1;
    const base = createGameState(runSeed);
    const savedDepth = (raw.depth ?? {}) as Partial<GameState['depth']>;
    const floorId = rawFloor.id === 'D-030' || savedDepth.current === 'D-030' ? 'D-030' : 'D-001';
    const defaultNodes = floorId === 'D-030' ? createD030Nodes() : createD001Nodes();
    const character = raw.character as Partial<GameState['character']>;
    const porter = (raw.porter ?? {}) as Partial<GameState['porter']>;
    const elevator = raw.elevator as Partial<GameState['elevator']>;
    const automation = (raw.automation ?? {}) as Partial<GameState['automation']>;
    const autoSwing = (automation.autoSwing ?? {}) as Partial<GameState['automation']['autoSwing']>;
    const autoDispatch = (automation.autoDispatch ?? {}) as Partial<GameState['automation']['autoDispatch']>;

    const restored: GameState = {
      ...base,
      ...(raw as Partial<GameState>),
      version: 3,
      character: { ...base.character, ...character, carried: normalizeLootArray(character.carried) },
      porter: { ...base.porter, ...porter, carried: normalizeLootArray(porter.carried) },
      elevator: { ...base.elevator, ...elevator, cargo: normalizeLootArray(elevator.cargo) },
      tool: { ...base.tool, ...(raw.tool as Partial<GameState['tool']>) },
      boots: { ...base.boots, ...((raw.boots ?? {}) as Partial<GameState['boots']>) },
      pack: { ...base.pack, ...((raw.pack ?? {}) as Partial<GameState['pack']>) },
      automation: {
        autoSwing: { ...base.automation.autoSwing, ...autoSwing },
        autoDispatch: { ...base.automation.autoDispatch, ...autoDispatch },
      },
      stats: { ...base.stats, ...((raw.stats ?? {}) as Partial<GameState['stats']>) },
      floor: {
        id: floorId,
        seed: typeof rawFloor.seed === 'number' ? rawFloor.seed : base.floor.seed,
        nodes: rawFloor.nodes.map((value) => normalizeNode(value, defaultNodes)),
        loot: normalizeLootArray(rawFloor.loot),
      },
      depth: {
        ...base.depth,
        ...savedDepth,
        current: floorId,
        unlockedD030: floorId === 'D-030' || Boolean(savedDepth.unlockedD030),
      },
      anomaly: { ...base.anomaly, ...((raw.anomaly ?? {}) as Partial<GameState['anomaly']>) },
      collection: normalizeCollection(raw.collection, base.collection),
      passives: { ...base.passives, ...((raw.passives ?? {}) as Partial<GameState['passives']>) },
      discovery: { ...base.discovery, ...((raw.discovery ?? {}) as Partial<GameState['discovery']>) },
      events: [],
      eventHistory: Array.isArray(raw.eventHistory) ? (raw.eventHistory as GameState['eventHistory']).slice(-160) : [],
    };

    if (raw.version === 1) {
      restored.stats.manualSwings = restored.eventHistory.filter((event) => event.type === 'PLAYER_INPUT_MINE').length;
      restored.stats.playerDeposits = restored.eventHistory.filter((event) => event.type === 'LOOT_DEPOSIT').length;
    }
    if (raw.version !== 3) {
      restored.depth.current = 'D-001';
      restored.depth.unlockedD030 = false;
      restored.depth.transitionRemaining = 0;
      restored.anomaly = { options: [], selected: null };
      restored.collection = base.collection;
      restored.passives = { unlocked: [], active: [] };
    }

    restored.character.backpackCapacity = PLAYER_PACK_CAPACITY[restored.pack.level];
    const modifiers = getModifiers(restored);
    restored.character.moveSpeed = modifiers.playerMoveSpeed;
    restored.porter.moveSpeed = modifiers.porterMoveSpeed;
    restored.elevator.maxLoad = modifiers.elevatorCapacity;
    restored.elevator.moveSpeed = modifiers.elevatorSpeed;
    return restored;
  } catch {
    return null;
  }
}

function normalizeCollection(value: unknown, fallback: GameState['collection']): GameState['collection'] {
  const raw = (value ?? {}) as Partial<GameState['collection']>;
  const saved = Array.isArray(raw.entries) ? raw.entries : [];
  return {
    entries: fallback.entries.map((entry) => {
      const match = saved.find((candidate) => candidate.kind === entry.kind);
      if (!match) return entry;
      return {
        ...entry,
        ...match,
        discovered: typeof match.discovered === 'boolean' ? match.discovered : match.count > 0,
        count: typeof match.count === 'number' ? match.count : 0,
      };
    }),
  };
}

function normalizeNode(value: unknown, defaults: MiningNode[]): MiningNode {
  const saved = (value ?? {}) as Partial<MiningNode> & { rareChance?: number };
  const fallback = defaults.find((node) => node.id === saved.id) ?? defaults[0]!;
  return {
    ...fallback,
    ...saved,
    treasureChance: typeof saved.treasureChance === 'number' ? saved.treasureChance : saved.rareChance ?? fallback.treasureChance,
  };
}

function normalizeLootArray(value: unknown): LootStack[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const saved = entry as Partial<LootStack> & { kind?: string };
    const kind = normalizeLootKind(saved.kind);
    if (!kind) return [];
    const definition = LOOT[kind];
    return [{
      id: typeof saved.id === 'string' ? saved.id : 'loot-migrated',
      kind,
      name: definition.name,
      rarity: definition.rarity,
      category: definition.category,
      weight: typeof saved.weight === 'number' ? saved.weight : definition.weight,
      value: typeof saved.value === 'number' ? saved.value : definition.value,
      x: typeof saved.x === 'number' ? saved.x : 0,
      y: typeof saved.y === 'number' ? saved.y : 0,
    } satisfies LootStack];
  });
}

function normalizeLootKind(value: string | undefined): LootKind | null {
  if (value === 'FOSSIL') return 'TRILOBITE';
  return value && value in LOOT ? value as LootKind : null;
}

export function saveToStorage(state: GameState): void { localStorage.setItem(SAVE_KEY, serializeGameState(state)); }
export function loadFromStorage(): GameState | null {
  for (const key of [SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY]) {
    const serialized = localStorage.getItem(key);
    if (serialized) return restoreGameState(serialized);
  }
  return null;
}
export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY); localStorage.removeItem(V2_SAVE_KEY); localStorage.removeItem(LEGACY_SAVE_KEY);
}
