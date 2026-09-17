import { describe, expect, it } from 'vitest';
import {
  BORE_INSTALL_COST,
  D250_EXTENSION_COST,
  D400_EXTENSION_COST,
  D650_SHAFT_COST,
  DEEP_COMPONENTS_REQUIRED,
  FREIGHT_INSTALL_COST,
  LOOT,
  RAIL_INSTALL_COST,
  RAIL_PARTS_REQUIRED,
} from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import {
  canInstallBore,
  canStartD650Construction,
  canStartFreightConstruction,
  canStartRailConstruction,
  canUnlockD250,
  canUnlockD400,
  DEEP_IDS,
  installBore,
  setFreightPriority,
  setRailPriority,
  startD650Construction,
  startFreightConstruction,
  startRailConstruction,
  unlockD250,
  unlockD400,
} from '../src/game/deepGame';
import { applyOfflineProgress, armPhase5Reboot, processPhase5Events, updatePhase5 } from '../src/game/phase5';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { drainEvents, updateGame } from '../src/game/simulation';
import type { DepthId, GameState, LootKind, LootStack } from '../src/game/types';

function makeLoot(kind: LootKind, id: string, depth: DepthId): LootStack {
  const definition = LOOT[kind];
  return {
    id,
    kind,
    name: definition.name,
    rarity: definition.rarity,
    category: definition.category,
    weight: definition.weight,
    value: definition.value,
    dataValue: definition.dataValue ?? 0,
    coreValue: definition.coreValue ?? 0,
    x: 112,
    y: 206,
    originDepth: depth,
  };
}

function flushEvents(state: GameState): void {
  for (let pass = 0; pass < 6; pass += 1) {
    const events = drainEvents(state);
    if (events.length === 0) return;
    processPhase5Events(state, events);
  }
}

function step(state: GameState, seconds = 1 / 30): void {
  updateGame(state, seconds);
  updatePhase5(state, seconds);
  flushEvents(state);
}

function advanceUntil(state: GameState, predicate: () => boolean, maxSteps = 30000): void {
  for (let index = 0; index < maxSteps && !predicate(); index += 1) step(state);
  expect(predicate()).toBe(true);
}

function prepareD250(seed = 6101): GameState {
  const state = createGameState(seed);
  state.meta.runIndex = 3;
  state.run.depth.unlocked = ['D-001', 'D-030', 'D-060', 'D-100', 'D-180'];
  state.run.phase5.ancient.unlocked = true;
  state.run.phase5.crew.unlocked = true;
  state.run.phase5.cargo.unlocked = true;
  state.run.deepProgress.lostSignalFound = true;
  state.run.deepProgress.lostSampleDelivered = true;
  state.run.research.completed = ['LOST_SURVEY'];
  state.run.scrap = D250_EXTENSION_COST + RAIL_INSTALL_COST + FREIGHT_INSTALL_COST + D400_EXTENSION_COST + BORE_INSTALL_COST + D650_SHAFT_COST + 100000;
  expect(canUnlockD250(state)).toBe(true);
  expect(unlockD250(state)).toBe(true);
  state.run.research.completed.push('RAIL_LOGISTICS');
  state.run.deepProgress.railPartsDelivered = RAIL_PARTS_REQUIRED;
  return state;
}

function prepareRail(seed = 6201): GameState {
  const state = prepareD250(seed);
  expect(canStartRailConstruction(state)).toBe(true);
  expect(startRailConstruction(state)).toBe(true);
  advanceUntil(state, () => state.run.logistics.lines.find((line) => line.id === DEEP_IDS.D250_LINE)?.state === 'READY');
  return state;
}

function prepareFreight(seed = 6301): GameState {
  const state = prepareRail(seed);
  state.run.research.completed.push('FREIGHT_ARCHITECTURE');
  expect(canStartFreightConstruction(state)).toBe(true);
  expect(startFreightConstruction(state)).toBe(true);
  advanceUntil(state, () => state.run.logistics.freightCage.state === 'IDLE');
  return state;
}

function prepareD400(seed = 6401): GameState {
  const state = prepareFreight(seed);
  state.run.deepProgress.nullSampleDelivered = true;
  state.run.research.completed.push('NULL_GEOMETRY');
  expect(canUnlockD400(state)).toBe(true);
  expect(unlockD400(state)).toBe(true);
  state.run.research.completed.push('REMOTE_BORE_CONTROL');
  return state;
}

describe('Milestone 6 — Deep Network / Industrial Depths', () => {
  it('generalizes DepthId and creates persistent Floors through D-650', () => {
    const state = createGameState(6001);
    expect(Object.keys(state.run.floors)).toEqual(['D-001', 'D-030', 'D-060', 'D-100', 'D-180', 'D-250', 'D-400', 'D-650']);
    expect(state.run.floors['D-250'].nodes.map((node) => node.id)).toEqual(['lost-depot', 'hanging-vein', 'forgotten-terminal']);
    expect(state.run.floors['D-400'].nodes.filter((node) => node.access === 'REMOTE_ONLY').map((node) => node.id)).toEqual(['echo-pocket', 'fracture-well']);
  });

  it('migrates a v5-shaped save into v6 without inventing unlocked Deep progress', () => {
    const source = createGameState(6002);
    source.meta.runIndex = 2;
    source.run.depth.unlocked = ['D-001', 'D-030', 'D-060', 'D-100', 'D-180'];
    source.run.phase5.crew.unlocked = true;
    const raw = JSON.parse(serializeGameState(source)) as Record<string, unknown>;
    raw.version = 5;
    const rawRun = raw.run as Record<string, unknown>;
    delete rawRun.logistics;
    delete rawRun.engineer;
    delete rawRun.deepAutomation;
    delete rawRun.deepProgress;
    const rawMeta = raw.meta as Record<string, unknown>;
    delete rawMeta.deepDiscoveries;
    const restored = restoreGameState(JSON.stringify(raw))!;
    expect(restored.version).toBe(6);
    expect(restored.run.depth.unlocked).toContain('D-180');
    expect(restored.run.deepProgress.d250Unlocked).toBe(false);
    expect(restored.run.logistics.lines).toHaveLength(0);
    expect(restored.run.phase5.crew.unlocked).toBe(true);
  });

  it('does not let Scrap alone unlock D-250; the Lost Signal analysis is required', () => {
    const state = createGameState(6003);
    state.meta.runIndex = 3;
    state.run.depth.unlocked = ['D-001', 'D-030', 'D-060', 'D-100', 'D-180'];
    state.run.scrap = 1_000_000;
    state.run.research.completed.push('LOST_SURVEY');
    expect(canUnlockD250(state)).toBe(false);
    state.run.deepProgress.lostSampleDelivered = true;
    expect(canUnlockD250(state)).toBe(true);
  });

  it('constructs Rail through an Engineer job instead of unlocking throughput instantly', () => {
    const state = prepareD250(6004);
    expect(startRailConstruction(state)).toBe(true);
    const line = state.run.logistics.lines.find((candidate) => candidate.id === DEEP_IDS.D250_LINE)!;
    expect(line.state).toBe('BUILDING');
    expect(state.run.engineer.job?.kind).toBe('RAIL_INSTALL');
    advanceUntil(state, () => line.state === 'READY');
    expect(state.run.engineer.job).toBeNull();
    expect(state.run.logistics.railCarts).toHaveLength(1);
  });

  it('moves the same Cargo identity through Rail Stop, Minecart and Cargo Hub', () => {
    const state = prepareRail(6005);
    const item = makeLoot('ANCIENT_ALLOY', 'physical-alloy', 'D-250');
    state.run.floors['D-250'].cargo.push(item);
    advanceUntil(state, () => state.run.logistics.railCarts[0]?.cargo.some((candidate) => candidate.id === item.id));
    expect(state.run.floors['D-250'].cargo.some((candidate) => candidate.id === item.id)).toBe(false);
    expect(state.run.logistics.railCarts[0]?.cargo[0]).toBe(item);
    advanceUntil(state, () => state.run.logistics.cargoHubs[0]?.buffer.some((candidate) => candidate.id === item.id));
    expect(state.run.logistics.cargoHubs[0]?.buffer.some((candidate) => candidate === item)).toBe(true);
  });

  it('keeps upstream Cargo waiting when the Rail Stop buffer cannot accept it', () => {
    const state = prepareRail(6006);
    const line = state.run.logistics.lines[0]!;
    const heavy = makeLoot('ANCIENT_ALLOY', 'too-heavy', 'D-250');
    line.maxInputWeight = Math.max(0, heavy.weight - 0.1);
    state.run.floors['D-250'].cargo.push(heavy);
    for (let index = 0; index < 120; index += 1) step(state);
    expect(state.run.floors['D-250'].cargo.some((item) => item.id === heavy.id)).toBe(true);
    expect(line.inputBuffer.some((item) => item.id === heavy.id)).toBe(false);
  });

  it('uses contextual Rail priority instead of a routing DSL', () => {
    const state = prepareRail(6007);
    const line = state.run.logistics.lines[0]!;
    expect(setRailPriority(state, line.id, 'RARE')).toBe(true);
    const bulk = makeLoot('ANCIENT_ALLOY', 'bulk', 'D-250');
    const rare = makeLoot('ANCIENT_TOOL_CRATE', 'rare', 'D-250');
    rare.equipmentSeed = 123;
    state.run.floors['D-250'].cargo.push(bulk, rare);
    for (let index = 0; index < 5; index += 1) step(state);
    expect(line.inputBuffer.some((item) => item.id === rare.id)).toBe(true);
    expect(state.run.floors['D-250'].cargo.some((item) => item.id === bulk.id)).toBe(true);
  });

  it('restores a moving Rail Cart at the same position with the same Cargo', () => {
    const state = prepareRail(6008);
    const line = state.run.logistics.lines[0]!;
    const cart = state.run.logistics.railCarts[0]!;
    const item = makeLoot('ANCIENT_ALLOY', 'saved-cart-cargo', 'D-250');
    cart.state = 'TRAVELING_TO_HUB';
    cart.position = 0.43;
    cart.stateTimer = 1.37;
    cart.cargo = [item];
    line.inputBuffer = [];
    const restored = restoreGameState(serializeGameState(state))!;
    expect(restored.run.logistics.railCarts[0]?.state).toBe('TRAVELING_TO_HUB');
    expect(restored.run.logistics.railCarts[0]?.position).toBeCloseTo(0.43, 5);
    expect(restored.run.logistics.railCarts[0]?.cargo[0]?.id).toBe(item.id);
  });

  it('builds a distinct cargo-only Freight Cage and appraises bulk only after reaching Surface', () => {
    const state = prepareFreight(6009);
    expect(setFreightPriority(state, 'BULK')).toBe(true);
    const hub = state.run.logistics.cargoHubs.find((candidate) => candidate.depth === 'D-250')!;
    const item = makeLoot('ANCIENT_ALLOY', 'freight-alloy', 'D-250');
    hub.buffer.push(item);
    const scrapBefore = state.run.scrap;
    advanceUntil(state, () => state.run.logistics.freightCage.cargo.some((candidate) => candidate.id === item.id));
    expect(state.run.scrap).toBe(scrapBefore);
    advanceUntil(state, () => state.run.scrap > scrapBefore);
    expect(state.run.logistics.freightCage.cargo).toHaveLength(0);
  });

  it('restores Freight motion and Cargo without appraising it early', () => {
    const state = prepareFreight(6010);
    const item = makeLoot('ANCIENT_ALLOY', 'saved-freight', 'D-250');
    state.run.logistics.freightCage.state = 'ASCENDING';
    state.run.logistics.freightCage.targetDepth = 'D-250';
    state.run.logistics.freightCage.position = 0.61;
    state.run.logistics.freightCage.stateTimer = 2.1;
    state.run.logistics.freightCage.cargo = [item];
    const restored = restoreGameState(serializeGameState(state))!;
    expect(restored.run.logistics.freightCage.state).toBe('ASCENDING');
    expect(restored.run.logistics.freightCage.position).toBeCloseTo(0.61, 5);
    expect(restored.run.logistics.freightCage.cargo[0]?.id).toBe(item.id);
  });

  it('requires Null analysis and existing vertical logistics before D-400', () => {
    const state = prepareFreight(6011);
    state.run.research.completed.push('NULL_GEOMETRY');
    expect(canUnlockD400(state)).toBe(false);
    state.run.deepProgress.nullSampleDelivered = true;
    expect(canUnlockD400(state)).toBe(true);
  });

  it('installs a Remote Bore through Engineer and damages the same persistent MiningNode', () => {
    const state = prepareD400(6012);
    expect(canInstallBore(state, 'echo-pocket')).toBe(true);
    expect(installBore(state, 'echo-pocket')).toBe(true);
    const bore = state.run.deepAutomation.bores[0]!;
    expect(bore.state).toBe('INSTALLING');
    expect(state.run.engineer.job?.kind).toBe('BORE_INSTALL');
    advanceUntil(state, () => bore.state === 'IDLE' || bore.state === 'DRILLING');
    const node = state.run.floors['D-400'].nodes.find((candidate) => candidate.id === 'echo-pocket')!;
    const hpBefore = node.hp;
    advanceUntil(state, () => node.hp < hpBefore);
    expect(node.hp).toBeLessThan(hpBefore);
  });

  it('stops Bore progression when its physical logistics connection is not READY', () => {
    const state = prepareD400(6013);
    expect(installBore(state, 'echo-pocket')).toBe(true);
    const bore = state.run.deepAutomation.bores[0]!;
    advanceUntil(state, () => bore.state === 'IDLE' || bore.state === 'DRILLING');
    const line = state.run.logistics.lines.find((candidate) => candidate.id === DEEP_IDS.D400_LINE)!;
    line.state = 'BUILDING';
    const node = state.run.floors['D-400'].nodes.find((candidate) => candidate.id === 'echo-pocket')!;
    const hpBefore = node.hp;
    for (let index = 0; index < 180; index += 1) step(state);
    expect(node.hp).toBe(hpBefore);
    expect(bore.state).toBe('BLOCKED');
  });

  it('restores an in-progress Bore cycle with target and progress intact', () => {
    const state = prepareD400(6014);
    expect(installBore(state, 'fracture-well')).toBe(true);
    const bore = state.run.deepAutomation.bores[0]!;
    advanceUntil(state, () => bore.state === 'DRILLING');
    bore.cycleProgress = 0.41;
    const restored = restoreGameState(serializeGameState(state))!;
    const restoredBore = restored.run.deepAutomation.bores[0]!;
    expect(restoredBore.targetNodeId).toBe('fracture-well');
    expect(restoredBore.cycleProgress).toBeCloseTo(0.41, 5);
    expect(restoredBore.state).toBe('DRILLING');
  });

  it('requires delivered Deep Components and Deep Shaft research before D-650 construction', () => {
    const state = prepareD400(6015);
    state.run.research.completed.push('DEEP_SHAFT_GEOMETRY');
    expect(canStartD650Construction(state)).toBe(false);
    state.run.deepProgress.deepComponentsDelivered = DEEP_COMPONENTS_REQUIRED;
    expect(canStartD650Construction(state)).toBe(true);
    expect(startD650Construction(state)).toBe(true);
    expect(state.run.depth.unlocked).not.toContain('D-650');
    advanceUntil(state, () => state.run.deepProgress.d650Unlocked);
    expect(state.run.depth.unlocked).toContain('D-650');
  });

  it('Reboot atomically clears run-local Rail/Freight/Bore state while retained Protocols restore blueprints', () => {
    const state = prepareD400(6016);
    state.meta.protocols.push('RAIL_BLUEPRINT', 'FREIGHT_CHARTER', 'ENGINEER_LICENSE', 'BORE_MEMORY');
    expect(installBore(state, 'echo-pocket')).toBe(true);
    state.run.pendingCore = 4;
    state.run.coreChamber.rebootAvailable = true;
    state.selection = { type: 'core-chamber' };
    expect(armPhase5Reboot(state)).toBe(true);
    expect(armPhase5Reboot(state)).toBe(true);
    expect(state.run.logistics.lines).toHaveLength(0);
    expect(state.run.logistics.freightCage.state).toBe('UNBUILT');
    expect(state.run.deepAutomation.bores).toHaveLength(0);
    expect(state.run.engineer.job).toBeNull();
    expect(state.run.deepProgress.railBlueprint).toBe(true);
    expect(state.run.deepProgress.freightBlueprint).toBe(true);
    expect(state.run.deepProgress.boreBlueprint).toBe(true);
    expect(state.run.engineer.unlocked).toBe(true);
  });

  it('offline simulation cannot create Deep output from a disconnected Site and cannot be claimed twice', () => {
    const state = prepareD400(6017);
    expect(installBore(state, 'echo-pocket')).toBe(true);
    const bore = state.run.deepAutomation.bores[0]!;
    advanceUntil(state, () => bore.state === 'IDLE' || bore.state === 'DRILLING');
    const line = state.run.logistics.lines.find((candidate) => candidate.id === DEEP_IDS.D400_LINE)!;
    line.state = 'BUILDING';
    const node = state.run.floors['D-400'].nodes.find((candidate) => candidate.id === 'echo-pocket')!;
    const hpBefore = node.hp;
    const now = 1_900_000_000_000;
    state.run.phase5.offline.savedAt = now - 10_000;
    const report = applyOfflineProgress(state, now);
    expect(report?.seconds).toBeCloseTo(10, 3);
    expect(node.hp).toBe(hpBefore);
    const snapshot = serializeGameState(state);
    expect(applyOfflineProgress(state, now)).toBeNull();
    expect(serializeGameState(state)).toBe(snapshot);
  });
});
