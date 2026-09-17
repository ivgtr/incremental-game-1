import { COLLECTIBLE_KINDS, LOOT, PLAYER_PACK_CAPACITY } from './config';
import { createGameState, createStateFromMeta } from './createGame';
import { getModifiers } from './modifiers';
import type {
  CollectionState,
  CoreProtocolId,
  CrewMember,
  CrewMemberState,
  CrewRole,
  DepthId,
  EquipmentAffix,
  EquipmentAffixId,
  EquipmentItem,
  EquipmentRarity,
  EquipmentSlot,
  FloorState,
  GameState,
  LootKind,
  LootStack,
  MetaProgression,
  MinerPriority,
  MiningNode,
  OfflineReport,
  PassiveId,
  Phase5DepthId,
  PorterPriority,
  ResearchId,
} from './types';

export const SAVE_KEY = 'loop-shaft:save:v5';
const V4_SAVE_KEY = 'loop-shaft:save:v4';
const V3_SAVE_KEY = 'loop-shaft:save:v3';
const V2_SAVE_KEY = 'loop-shaft:save:v2';
const LEGACY_SAVE_KEY = 'loop-shaft:m1:v1';

const DEPTHS: readonly DepthId[] = ['D-001', 'D-030', 'D-060', 'D-100'];
const PHASE5_DEPTHS: readonly Phase5DepthId[] = ['D-001', 'D-030', 'D-060', 'D-100', 'D-180'];
const PROTOCOLS: readonly CoreProtocolId[] = [
  'EXPERIENCED_HANDS', 'CARGO_MEMORY', 'SHAFT_BLUEPRINT', 'VETERAN_ELEVATOR', 'SURVEY_ARCHIVE',
  'CREW_MANIFEST', 'FREIGHT_MEMORY', 'LEGACY_LOCKER',
];
const PASSIVES: readonly PassiveId[] = ['PROSPECTORS_EYE', 'ELEVATOR_RHYTHM', 'FOSSIL_HUNTER', 'LONG_STRIDE', 'LAST_SWING'];
const RESEARCH_IDS: readonly ResearchId[] = [
  'DEEP_SURVEY', 'PRIORITY_CARGO_TAG', 'MULTI_STOP_RELAY', 'STRATA_SCANNER', 'CORE_RESONANCE',
  'CREW_ROUTING', 'CARGO_SCHEDULER', 'ANCIENT_SURVEY', 'SALVAGE_ANALYSIS',
];
const CREW_STATES: readonly CrewMemberState[] = [
  'IDLE', 'FIND_NODE', 'MOVING_TO_NODE', 'MINING', 'FIND_LOOT', 'MOVING_TO_LOOT', 'COLLECTING',
  'RETURNING_TO_CARGO', 'DEPOSITING', 'MOVING_TO_ELEVATOR', 'TRAVELING',
];
const MINER_PRIORITIES: readonly MinerPriority[] = ['RESEARCH', 'RARE', 'NEAREST', 'ANY'];
const PORTER_PRIORITIES: readonly PorterPriority[] = ['CORE', 'RESEARCH', 'RELIC', 'RARE', 'VALUE', 'NEAREST'];
const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ['TOOL', 'BOOTS', 'PACK', 'LAMP'];
const EQUIPMENT_RARITIES: readonly EquipmentRarity[] = ['COMMON', 'RARE', 'EPIC', 'ANCIENT'];
const AFFIX_IDS: readonly EquipmentAffixId[] = ['POWERED_EDGE', 'RESEARCH_PRISM', 'FOSSIL_BREAKER', 'LIGHT_FRAME', 'SURVEY_LAMP', 'CARGO_HOOK', 'CORE_TUNER'];

export function serializeGameState(state: GameState): string {
  return JSON.stringify({ ...state, events: [] });
}

export function restoreGameState(serialized: string): GameState | null {
  try {
    const raw = JSON.parse(serialized) as Record<string, unknown>;
    if (raw.version === 5) return restoreStructured(raw, true);
    if (raw.version === 4) return restoreStructured(raw, false);
    if (raw.version === 1 || raw.version === 2 || raw.version === 3) return migrateLegacy(raw);
    return null;
  } catch {
    return null;
  }
}

function restoreStructured(raw: Record<string, unknown>, hasPhase5: boolean): GameState | null {
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
    bestDepth: normalizeBestDepth(rawMeta.bestDepth, 'D-001') as DepthId,
    equipmentDiscoveries: normalizeLooseStringArray(rawMeta.equipmentDiscoveries),
    ancientDiscoveries: normalizeLooseStringArray(rawMeta.ancientDiscoveries),
    legacyEquipment: normalizeEquipmentItem(rawMeta.legacyEquipment),
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
    for (const depth of PHASE5_DEPTHS) {
      const saved = asRecord(rawFloors[depth]);
      const fallbackFloor = (run.floors as Record<string, FloorState>)[depth];
      if (saved && fallbackFloor) (run.floors as Record<string, FloorState>)[depth] = normalizeFloor(saved, fallbackFloor);
    }
  }
  const rawDepth = asRecord(rawRun.depth);
  if (rawDepth) {
    run.depth.current = normalizePhase5Depth(rawDepth.current, run.depth.current) as DepthId;
    run.depth.unlocked = uniquePhase5Depths(rawDepth.unlocked, run.depth.current as Phase5DepthId) as DepthId[];
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
  if (hasPhase5) normalizePhase5Run(run, rawRun.phase5);

  base.elapsed = Math.max(0, numberOr(raw.elapsed, 0));
  base.selection = null;
  base.events = [];
  base.eventHistory = Array.isArray(raw.eventHistory) ? (raw.eventHistory as GameState['eventHistory']).slice(-260) : [];
  base.nextEventId = Math.max(1, Math.floor(numberOr(raw.nextEventId, base.eventHistory.at(-1)?.id ? base.eventHistory.at(-1)!.id + 1 : 1)));
  normalizeEffectiveState(base);
  return base;
}

function normalizePhase5Run(run: GameState['run'], value: unknown): void {
  const raw = asRecord(value);
  if (!raw) return;
  const rawCrew = asRecord(raw.crew);
  if (rawCrew) {
    run.phase5.crew.unlocked = Boolean(rawCrew.unlocked);
    run.phase5.crew.slots = Math.max(run.phase5.crew.unlocked ? 2 : 0, Math.min(4, Math.floor(numberOr(rawCrew.slots, run.phase5.crew.slots))));
    run.phase5.crew.nextCrewId = Math.max(1, Math.floor(numberOr(rawCrew.nextCrewId, run.phase5.crew.nextCrewId)));
    if (Array.isArray(rawCrew.members)) run.phase5.crew.members = rawCrew.members.flatMap((entry) => normalizeCrewMember(entry));
  }
  const rawCargo = asRecord(raw.cargo);
  if (rawCargo) {
    run.phase5.cargo.unlocked = Boolean(rawCargo.unlocked);
    const priority = rawCargo.priority;
    if (priority === 'BALANCED' || priority === 'CORE' || priority === 'RESEARCH' || priority === 'ANCIENT') run.phase5.cargo.priority = priority;
    const route = asRecord(rawCargo.route);
    run.phase5.cargo.route = route ? {
      targetDepth: normalizePhase5Depth(route.targetDepth, 'D-001'),
      remaining: Math.max(0, numberOr(route.remaining, 0)),
      duration: Math.max(0.01, numberOr(route.duration, 2.4)),
    } : null;
    run.phase5.cargo.lastServedDepth = rawCargo.lastServedDepth ? normalizePhase5Depth(rawCargo.lastServedDepth, 'D-001') : null;
    run.phase5.cargo.deliveredLoads = Math.max(0, Math.floor(numberOr(rawCargo.deliveredLoads, 0)));
  }
  const rawEquipment = asRecord(raw.equipment);
  if (rawEquipment) {
    run.phase5.equipment.inventory = Array.isArray(rawEquipment.inventory) ? rawEquipment.inventory.flatMap((entry) => {
      const item = normalizeEquipmentItem(entry);
      return item ? [item] : [];
    }) : [];
    run.phase5.equipment.nextItemId = Math.max(1, Math.floor(numberOr(rawEquipment.nextItemId, 1)));
    const equipped = asRecord(rawEquipment.equippedPlayer);
    run.phase5.equipment.equippedPlayer = {};
    if (equipped) {
      for (const slot of EQUIPMENT_SLOTS) {
        const id = equipped[slot];
        if (typeof id === 'string' && run.phase5.equipment.inventory.some((item) => item.id === id && item.slot === slot)) run.phase5.equipment.equippedPlayer[slot] = id;
      }
    }
    run.phase5.equipment.drops = Array.isArray(rawEquipment.drops) ? rawEquipment.drops.flatMap((entry) => {
      const drop = asRecord(entry);
      if (!drop || typeof drop.lootId !== 'string' || typeof drop.baseId !== 'string') return [];
      const slot = normalizeEquipmentSlot(drop.slot);
      if (!slot) return [];
      return [{
        lootId: drop.lootId,
        seed: numberOr(drop.seed, 1) >>> 0 || 1,
        baseId: drop.baseId,
        slot,
        sourceDepth: normalizePhase5Depth(drop.sourceDepth, 'D-180'),
      }];
    }) : [];
  }
  const rawAncient = asRecord(raw.ancient);
  if (rawAncient) {
    run.phase5.ancient.signalFound = Boolean(rawAncient.signalFound);
    run.phase5.ancient.pushCommitted = Boolean(rawAncient.pushCommitted);
    run.phase5.ancient.unlocked = Boolean(rawAncient.unlocked);
    run.phase5.ancient.discoveries = normalizeLooseStringArray(rawAncient.discoveries);
  }
  const rawOffline = asRecord(raw.offline);
  if (rawOffline) {
    run.phase5.offline.savedAt = Math.max(0, numberOr(rawOffline.savedAt, 0));
    run.phase5.offline.processedAt = Math.max(0, numberOr(rawOffline.processedAt, 0));
    run.phase5.offline.lastReport = normalizeOfflineReport(rawOffline.lastReport);
  }
}

function normalizeCrewMember(value: unknown): CrewMember[] {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string') return [];
  const role: CrewRole = raw.role === 'PORTER' ? 'PORTER' : raw.role === 'MINER' ? 'MINER' : 'MINER';
  const rawBody = asRecord(raw.body);
  const state = typeof raw.state === 'string' && CREW_STATES.includes(raw.state as CrewMemberState) ? raw.state as CrewMemberState : role === 'MINER' ? 'FIND_NODE' : 'FIND_LOOT';
  const travel = asRecord(raw.travel);
  const equipment = asRecord(raw.equipment);
  return [{
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : raw.id,
    role,
    assignedDepth: normalizePhase5Depth(raw.assignedDepth, 'D-001'),
    pendingDepth: raw.pendingDepth ? normalizePhase5Depth(raw.pendingDepth, 'D-001') : null,
    state,
    body: {
      x: numberOr(rawBody?.x, 240),
      y: numberOr(rawBody?.y, 202),
      facing: numberOr(rawBody?.facing, 1) < 0 ? -1 : 1,
      moveSpeed: Math.max(1, numberOr(rawBody?.moveSpeed, role === 'MINER' ? 31 : 34)),
      carried: normalizeLootArray(rawBody?.carried),
    },
    targetNodeId: typeof raw.targetNodeId === 'string' ? raw.targetNodeId : null,
    targetLootId: typeof raw.targetLootId === 'string' ? raw.targetLootId : null,
    swing: normalizeSwing(raw.swing),
    collectTimer: Math.max(0, numberOr(raw.collectTimer, 0)),
    loadingTimer: Math.max(0, numberOr(raw.loadingTimer, 0)),
    capacity: Math.max(0, numberOr(raw.capacity, role === 'PORTER' ? 8 : 0)),
    minerPriority: typeof raw.minerPriority === 'string' && MINER_PRIORITIES.includes(raw.minerPriority as MinerPriority) ? raw.minerPriority as MinerPriority : 'ANY',
    porterPriority: typeof raw.porterPriority === 'string' && PORTER_PRIORITIES.includes(raw.porterPriority as PorterPriority) ? raw.porterPriority as PorterPriority : 'NEAREST',
    travel: travel ? {
      from: normalizePhase5Depth(travel.from, 'D-001'),
      to: normalizePhase5Depth(travel.to, 'D-001'),
      remaining: Math.max(0, numberOr(travel.remaining, 0)),
      duration: Math.max(0.01, numberOr(travel.duration, 3.4)),
    } : null,
    equipment: {
      ...(typeof equipment?.TOOL === 'string' ? { TOOL: equipment.TOOL } : {}),
      ...(typeof equipment?.LAMP === 'string' ? { LAMP: equipment.LAMP } : {}),
    },
  }];
}

function normalizeSwing(value: unknown): CrewMember['swing'] {
  const raw = asRecord(value);
  if (!raw) return null;
  return { elapsed: Math.max(0, numberOr(raw.elapsed, 0)), hitApplied: Boolean(raw.hitApplied) };
}

function normalizeEquipmentItem(value: unknown): EquipmentItem | null {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string' || typeof raw.baseId !== 'string' || typeof raw.name !== 'string') return null;
  const slot = normalizeEquipmentSlot(raw.slot);
  const rarity = typeof raw.rarity === 'string' && EQUIPMENT_RARITIES.includes(raw.rarity as EquipmentRarity) ? raw.rarity as EquipmentRarity : null;
  if (!slot || !rarity) return null;
  return {
    id: raw.id,
    baseId: raw.baseId,
    name: raw.name,
    slot,
    rarity,
    level: Math.max(1, Math.floor(numberOr(raw.level, 1))),
    affixes: Array.isArray(raw.affixes) ? raw.affixes.flatMap((entry) => normalizeAffix(entry)) : [],
    seed: numberOr(raw.seed, 1) >>> 0 || 1,
  };
}

function normalizeAffix(value: unknown): EquipmentAffix[] {
  const raw = asRecord(value);
  if (!raw || typeof raw.id !== 'string' || !AFFIX_IDS.includes(raw.id as EquipmentAffixId)) return [];
  return [{
    id: raw.id as EquipmentAffixId,
    name: typeof raw.name === 'string' ? raw.name : raw.id,
    value: numberOr(raw.value, 0),
    description: typeof raw.description === 'string' ? raw.description : '',
  }];
}

function normalizeEquipmentSlot(value: unknown): EquipmentSlot | null {
  return typeof value === 'string' && EQUIPMENT_SLOTS.includes(value as EquipmentSlot) ? value as EquipmentSlot : null;
}

function normalizeOfflineReport(value: unknown): OfflineReport | null {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.entries)) return null;
  return {
    seconds: Math.max(0, numberOr(raw.seconds, 0)),
    createdAt: Math.max(0, numberOr(raw.createdAt, 0)),
    entries: raw.entries.flatMap((entry) => {
      const row = asRecord(entry);
      if (!row) return [];
      return [{
        depth: normalizePhase5Depth(row.depth, 'D-001'),
        loads: Math.max(0, Math.floor(numberOr(row.loads, 0))),
        data: Math.max(0, Math.floor(numberOr(row.data, 0))),
        scrap: Math.max(0, Math.floor(numberOr(row.scrap, 0))),
        core: Math.max(0, Math.floor(numberOr(row.core, 0))),
        equipment: Math.max(0, Math.floor(numberOr(row.equipment, 0))),
      }];
    }),
  };
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
  state.eventHistory = Array.isArray(raw.eventHistory) ? (raw.eventHistory as GameState['eventHistory']).slice(-260) : [];
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
    cargo: normalizeLootArray(saved.cargo),
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
    const originDepth = saved.originDepth ? normalizePhase5Depth(saved.originDepth, 'D-001') : undefined;
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
      ...(originDepth ? { originDepth } : {}),
      ...(typeof saved.sourceCrewId === 'string' ? { sourceCrewId: saved.sourceCrewId } : {}),
      ...(typeof saved.equipmentSeed === 'number' ? { equipmentSeed: saved.equipmentSeed >>> 0 } : {}),
    } satisfies LootStack];
  });
}

function normalizeCollection(value: unknown, fallback: CollectionState): CollectionState {
  const raw = asRecord(value);
  const saved = Array.isArray(raw?.entries) ? raw.entries : [];
  const baseKinds = [...COLLECTIBLE_KINDS];
  const extraKinds = saved.map(asRecord).flatMap((candidate) => {
    const kind = normalizeLootKind(candidate?.kind);
    return kind && !baseKinds.includes(kind) ? [kind] : [];
  });
  return {
    entries: [...baseKinds, ...extraKinds].map((kind) => {
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
function normalizePhase5Depth(value: unknown, fallback: Phase5DepthId): Phase5DepthId {
  return typeof value === 'string' && PHASE5_DEPTHS.includes(value as Phase5DepthId) ? value as Phase5DepthId : fallback;
}
function normalizeBestDepth(value: unknown, fallback: Phase5DepthId): Phase5DepthId { return normalizePhase5Depth(value, fallback); }
function uniquePhase5Depths(value: unknown, current: Phase5DepthId): Phase5DepthId[] {
  const depths = normalizeStringArray(value, PHASE5_DEPTHS);
  if (!depths.includes('D-001')) depths.unshift('D-001');
  if (!depths.includes(current)) depths.push(current);
  return PHASE5_DEPTHS.filter((depth) => depths.includes(depth));
}
function normalizeStringArray<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T)))];
}
function normalizeLooseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))];
}
function asRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function numberOr(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }

function normalizeEffectiveState(state: GameState): void {
  state.run.character.backpackCapacity = PLAYER_PACK_CAPACITY[state.run.pack.level];
  const packId = state.run.phase5.equipment.equippedPlayer.PACK;
  const rarePack = packId ? state.run.phase5.equipment.inventory.find((item) => item.id === packId) : undefined;
  if (rarePack) state.run.character.backpackCapacity += 2 + rarePack.level * 2;
  const modifiers = getModifiers(state);
  state.run.character.moveSpeed = modifiers.playerMoveSpeed;
  state.run.porter.moveSpeed = modifiers.porterMoveSpeed;
  state.run.elevator.maxLoad = modifiers.elevatorCapacity;
  state.run.elevator.moveSpeed = modifiers.elevatorSpeed;
}

export function saveToStorage(state: GameState): void {
  state.run.phase5.offline.savedAt = Date.now();
  localStorage.setItem(SAVE_KEY, serializeGameState(state));
}
export function loadFromStorage(): GameState | null {
  for (const key of [SAVE_KEY, V4_SAVE_KEY, V3_SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY]) {
    const serialized = localStorage.getItem(key);
    if (serialized) return restoreGameState(serialized);
  }
  return null;
}
export function clearSave(): void {
  for (const key of [SAVE_KEY, V4_SAVE_KEY, V3_SAVE_KEY, V2_SAVE_KEY, LEGACY_SAVE_KEY]) localStorage.removeItem(key);
}
