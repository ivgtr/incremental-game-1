import { COLLECTIBLE_KINDS, LOOT, PLAYER_PACK_CAPACITY } from './config';
import { createGameState, createStateFromMeta } from './createGame';
import { getModifiers } from './modifiers';
import type {
  CollectionState,
  CoreProtocolId,
  DepthId,
  FloorState,
  GameState,
  LootKind,
  LootStack,
  MetaProgression,
  MiningNode,
  PassiveId,
  ResearchId,
} from './types';

export const SAVE_KEY = 'loop-shaft:save:v4';
const V3_SAVE_KEY = 'loop-shaft:save:v3';
const V2_SAVE_KEY = 'loop-shaft:save:v2';
const LEGACY_SAVE_KEY = 'loop-shaft:m1:v1';

const DEPTHS: readonly DepthId[] = ['D-001', 'D-030', 'D-060', 'D-100'];
const PROTOCOLS: readonly CoreProtocolId[] = ['EXPERIENCED_HANDS', 'CARGO_MEMORY', 'SHAFT_BLUEPRINT', 'VETERAN_ELEVATOR', 'SURVEY_ARCHIVE'];
const PASSIVES: readonly PassiveId[] = ['PROSPECTORS_EYE', 'ELEVATOR_RHYTHM', 'FOSSIL_HUNTER', 'LONG_STRIDE', 'LAST_SWING'];
const RESEARCH_IDS: readonly ResearchId[] = ['DEEP_SURVEY', 'PRIORITY_CARGO_TAG', 'MULTI_STOP_RELAY', 'STRATA_SCANNER', 'CORE_RESONANCE'];

export function serializeGameState(state: GameState): string {
  return JSON.stringify({ ...state, events: [] });
}

export function restoreGameState(serialized: string): GameState | null {
  try {
    const raw = JSON.parse(serialized) as Record<string, unknown>;
    if (raw.version === 4) return restoreV4(raw);
    if (raw.version === 1 || raw.version === 2 || raw.version === 3) return migrateLegacy(raw);
    return null;
  } catch {
    return null;
  }
}

function restoreV4(raw: Record<string, unknown>): GameState | null {
  const rawMeta = asRecord(raw.meta);
  const rawRun = asRecord(raw.run);
  if (!rawMeta || !rawRun) return null;
  const metaSeed = numberOr(rawMeta.seed, 1) >>> 0 || 1;
  const fallback = createGameState(metaSeed);
  const meta: MetaProgression = {
    seed: metaSeed,
    runIndex: Math.max(1, Math.floor(numberOr(rawMeta.runIndex, 1))),
    core: Math.max(0, Math.floor(numberOr(rawMeta.core, 0))),
    protocols: normalizeStringArray(rawMeta.protocols, PROTOCOLS),
    collection: normalizeCollection(rawMeta.collection, fallback.meta.collection),
    passives: normalizePassives(rawMeta.passives),
    bestDepth: normalizeDepth(rawMeta.bestDepth, 'D-001'),
  };
  const base = createStateFromMeta(meta);
  const run = base.run;
  run.seed = numberOr(rawRun.seed, run.seed) >>> 0 || 1;
  run.rngState = numberOr(rawRun.rngState, run.rngState) >>> 0 || 1;
  run.lootRoll = Math.max(0, Math.floor(numberOr(rawRun.lootRoll, 0)));
  run.scrap = Math.max(0, Math.floor(numberOr(rawRun.scrap, 0)));
  run.data = Math.max(0, Math.floor(numberOr(rawRun.data, 0)));
  run.pendingCore = Math.max(0, Math.floor(numberOr(rawRun.pendingCore, 0)));
  run.nextLootId = Math.max(1, Math.floor(numberOr(rawRun.nextLootId, 1)));

  const character = asRecord(rawRun.character);
  if (character) run.character = { ...run.character, ...(character as Partial<typeof run.character>), carried: normalizeLootArray(character.carried) };
  const porter = asRecord(rawRun.porter);
  if (porter) run.porter = { ...run.porter, ...(porter as Partial<typeof run.porter>), carried: normalizeLootArray(porter.carried) };
  const elevator = asRecord(rawRun.elevator);
  if (elevator) {
    const travel = asRecord(elevator.travel);
    run.elevator = {
      ...run.elevator,
      ...(elevator as Partial<typeof run.elevator>),
      cargo: normalizeLootArray(elevator.cargo),
      travel: travel ? {
        from: normalizeDepth(travel.from, run.depth.current),
        to: normalizeDepth(travel.to, run.depth.current),
        remaining: Math.max(0, numberOr(travel.remaining, 0)),
        duration: Math.max(0.01, numberOr(travel.duration, 2.8)),
        viaSurface: Boolean(travel.viaSurface),
      } : null,
    };
  }

  const tool = asRecord(rawRun.tool); if (tool) run.tool = { ...run.tool, ...(tool as Partial<typeof run.tool>) };
  const boots = asRecord(rawRun.boots); if (boots) run.boots = { ...run.boots, ...(boots as Partial<typeof run.boots>) };
  const pack = asRecord(rawRun.pack); if (pack) run.pack = { ...run.pack, ...(pack as Partial<typeof run.pack>) };
  const automation = asRecord(rawRun.automation); if (automation) run.automation = { ...run.automation, ...(automation as Partial<typeof run.automation>) };
  const stats = asRecord(rawRun.stats); if (stats) run.stats = { ...run.stats, ...(stats as Partial<typeof run.stats>) };

  const rawFloors = asRecord(rawRun.floors);
  if (rawFloors) {
    for (const depth of DEPTHS) {
      const saved = asRecord(rawFloors[depth]);
      if (saved) run.floors[depth] = normalizeFloor(saved, run.floors[depth]);
    }
  }
  const rawDepth = asRecord(rawRun.depth);
  if (rawDepth) {
    run.depth.current = normalizeDepth(rawDepth.current, run.depth.current);
    run.depth.unlocked = uniqueDepths(rawDepth.unlocked, run.depth.current);
  }
  const anomaly = asRecord(rawRun.anomaly); if (anomaly) run.anomaly = { ...run.anomaly, ...(anomaly as Partial<typeof run.anomaly>) };
  const research = asRecord(rawRun.research);
  if (research) {
    run.research.completed = normalizeStringArray(research.completed, RESEARCH_IDS);
    const active = asRecord(research.active);
    if (active && RESEARCH_IDS.includes(active.id as ResearchId)) {
      run.research.active = {
        id: active.id as ResearchId,
        remaining: Math.max(0, numberOr(active.remaining, 0)),
        duration: Math.max(0.01, numberOr(active.duration, 1)),
      };
    } else run.research.active = null;
  }
  const chamber = asRecord(rawRun.coreChamber); if (chamber) run.coreChamber = { ...run.coreChamber, ...(chamber as Partial<typeof run.coreChamber>) };
  const discovery = asRecord(rawRun.discovery); if (discovery) run.discovery = { ...run.discovery, ...(discovery as Partial<typeof run.discovery>) };

  base.elapsed = Math.max(0, numberOr(raw.elapsed, 0));
  base.selection = null;
  base.events = [];
  base.eventHistory = Array.isArray(raw.eventHistory) ? (raw.eventHistory as GameState['eventHistory']).slice(-220) : [];
  base.nextEventId = Math.max(1, Math.floor(numberOr(raw.nextEventId, base.eventHistory.at(-1)?.id ? base.eventHistory.at(-1)!.id + 1 : 1)));
  normalizeEffectiveState(base);
  return base;
}

function migrateLegacy(raw: Record<string, unknown>): GameState | null {
  const rawFloor = asRecord(raw.floor);
  const rawCharacter = asRecord(raw.character);
  const rawElevator = asRecord(raw.elevator);
  if (!rawFloor || !rawCharacter || !rawElevator) return null;
  const seed = numberOr(raw.runSeed, 1) >>> 0 || 1;
  const state = createGameState(seed);
  const depthRecord = asRecord(raw.depth);
  const floorId = normalizeDepth(rawFloor.id ?? depthRecord?.current, 'D-001');
  const safeFloorId: DepthId = floorId === 'D-030' ? 'D-030' : 'D-001';

  state.run.scrap = Math.max(0, Math.floor(numberOr(raw.scrap, 0)));
  state.run.rngState = numberOr(raw.rngState, state.run.rngState) >>> 0 || 1;
  state.run.lootRoll = Math.max(0, Math.floor(numberOr(raw.lootRoll, 0)));
  state.run.character = { ...state.run.character, ...(rawCharacter as Partial<typeof state.run.character>), carried: normalizeLootArray(rawCharacter.carried) };
  const rawPorter = asRecord(raw.porter);
  if (rawPorter) state.run.porter = { ...state.run.porter, ...(rawPorter as Partial<typeof state.run.porter>), carried: normalizeLootArray(rawPorter.carried) };
  state.run.elevator = { ...state.run.elevator, ...(rawElevator as Partial<typeof state.run.elevator>), cargo: normalizeLootArray(rawElevator.cargo), travel: null };
  const rawTool = asRecord(raw.tool); if (rawTool) state.run.tool = { ...state.run.tool, ...(rawTool as Partial<typeof state.run.tool>) };
  const rawBoots = asRecord(raw.boots); if (rawBoots) state.run.boots = { ...state.run.boots, ...(rawBoots as Partial<typeof state.run.boots>) };
  const rawPack = asRecord(raw.pack); if (rawPack) state.run.pack = { ...state.run.pack, ...(rawPack as Partial<typeof state.run.pack>) };
  const rawAutomation = asRecord(raw.automation); if (rawAutomation) state.run.automation = { ...state.run.automation, ...(rawAutomation as Partial<typeof state.run.automation>) };
  const rawStats = asRecord(raw.stats); if (rawStats) state.run.stats = { ...state.run.stats, ...(rawStats as Partial<typeof state.run.stats>), floorTrips: 0 };
  state.run.floors[safeFloorId] = normalizeFloor(rawFloor, state.run.floors[safeFloorId]);
  state.run.depth.current = safeFloorId;
  state.run.depth.unlocked = safeFloorId === 'D-030' || Boolean(depthRecord?.unlockedD030) ? ['D-001', 'D-030'] : ['D-001'];
  const anomaly = asRecord(raw.anomaly); if (anomaly) state.run.anomaly = { ...state.run.anomaly, ...(anomaly as Partial<typeof state.run.anomaly>) };
  const discovery = asRecord(raw.discovery); if (discovery) state.run.discovery = { ...state.run.discovery, ...(discovery as Partial<typeof state.run.discovery>) };
  state.meta.collection = normalizeCollection(raw.collection, state.meta.collection);
  state.meta.passives = normalizePassives(raw.passives);
  state.meta.bestDepth = safeFloorId;
  state.elapsed = Math.max(0, numberOr(raw.elapsed, 0));
  state.eventHistory = Array.isArray(raw.eventHistory) ? (raw.eventHistory as GameState['eventHistory']).slice(-220) : [];
  state.nextEventId = Math.max(1, Math.floor(numberOr(raw.nextEventId, state.eventHistory.at(-1)?.id ? state.eventHistory.at(-1)!.id + 1 : 1)));
  state.run.nextLootId = Math.max(1, Math.floor(numberOr(raw.nextLootId, 1)));
  normalizeEffectiveState(state);
  return state;
}

function normalizeFloor(saved: Record<string, unknown>, fallback: FloorState): FloorState {
  const savedNodes = Array.isArray(saved.nodes) ? saved.nodes : [];
  return {
    id: fallback.id,
    seed: numberOr(saved.seed, fallback.seed),
    nodes: fallback.nodes.map((node) => normalizeNode(savedNodes.find((candidate) => asRecord(candidate)?.id === node.id), node)),
    loot: normalizeLootArray(saved.loot),
  };
}

function normalizeNode(value: unknown, fallback: MiningNode): MiningNode {
  const saved = asRecord(value);
  if (!saved) return fallback;
  return {
    ...fallback,
    ...(saved as Partial<MiningNode>),
    treasureChance: typeof saved.treasureChance === 'number' ? saved.treasureChance : numberOr(saved.rareChance, fallback.treasureChance),
    researchWeight: numberOr(saved.researchWeight, fallback.researchWeight),
    coreWeight: numberOr(saved.coreWeight, fallback.coreWeight),
  };
}

function normalizeLootArray(value: unknown): LootStack[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const saved = asRecord(entry);
    if (!saved) return [];
    const kind = normalizeLootKind(saved.kind);
    if (!kind) return [];
    const definition = LOOT[kind];
    return [{
      id: typeof saved.id === 'string' ? saved.id : 'loot-migrated',
      kind,
      name: definition.name,
      rarity: definition.rarity,
      category: definition.category,
      weight: numberOr(saved.weight, definition.weight),
      value: numberOr(saved.value, definition.value),
      dataValue: numberOr(saved.dataValue, definition.dataValue ?? 0),
      coreValue: numberOr(saved.coreValue, definition.coreValue ?? 0),
      x: numberOr(saved.x, 0),
      y: numberOr(saved.y, 0),
    } satisfies LootStack];
  });
}

function normalizeCollection(value: unknown, fallback: CollectionState): CollectionState {
  const raw = asRecord(value);
  const saved = Array.isArray(raw?.entries) ? raw.entries : [];
  return {
    entries: COLLECTIBLE_KINDS.map((kind) => {
      const base = fallback.entries.find((entry) => entry.kind === kind) ?? {
        kind, name: LOOT[kind].name, rarity: LOOT[kind].rarity, category: LOOT[kind].category, discovered: false, count: 0,
      };
      const match = saved.map(asRecord).find((candidate) => candidate?.kind === kind);
      return match ? {
        ...base,
        discovered: typeof match.discovered === 'boolean' ? match.discovered : numberOr(match.count, 0) > 0,
        count: Math.max(0, Math.floor(numberOr(match.count, 0))),
      } : base;
    }),
  };
}

function normalizePassives(value: unknown): MetaProgression['passives'] {
  const raw = asRecord(value);
  const unlocked = normalizeStringArray(raw?.unlocked, PASSIVES);
  return { unlocked, active: normalizeStringArray(raw?.active, PASSIVES).filter((id) => unlocked.includes(id)).slice(0, 2) };
}

function normalizeLootKind(value: unknown): LootKind | null {
  if (value === 'FOSSIL') return 'TRILOBITE';
  return typeof value === 'string' && value in LOOT ? value as LootKind : null;
}
function normalizeDepth(value: unknown, fallback: DepthId): DepthId {
  return typeof value === 'string' && DEPTHS.includes(value as DepthId) ? value as DepthId : fallback;
}
function uniqueDepths(value: unknown, current: DepthId): DepthId[] {
  const depths = normalizeStringArray(value, DEPTHS);
  if (!depths.includes('D-001')) depths.unshift('D-001');
  if (!depths.includes(current)) depths.push(current);
  return DEPTHS.filter((depth) => depths.includes(depth));
}
function normalizeStringArray<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T)))];
}
function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function numberOr(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

function normalizeEffectiveState(state: GameState): void {
  state.run.character.backpackCapacity = PLAYER_PACK_CAPACITY[state.run.pack.level];
  const modifiers = getModifiers(state);
  state.run.character.moveSpeed = modifiers.playerMoveSpeed;
  state.run.porter.moveSpeed = modifiers.porterMoveSpeed;
  state.run.elevator.maxLoad = modifiers.elevatorCapacity;
  state.run.elevator.moveSpeed = modifiers.elevatorSpeed;
}

export function saveToStorage(state: GameState): void { localStorage.setItem(SAVE_KEY, serializeGameState(state)); }
export function loadFromStorage(): GameState | null {
  for (const key of [SAVE_KEY, V3_SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY]) {
    const serialized = localStorage.getItem(key);
    if (serialized) return restoreGameState(serialized);
  }
  return null;
}
export function clearSave(): void {
  for (const key of [SAVE_KEY, V3_SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY]) localStorage.removeItem(key);
}
