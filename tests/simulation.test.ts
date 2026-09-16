import { describe, expect, it } from 'vitest';
import { AUTO_SWING_MANUAL_SWINGS_REQUIRED, LOOT } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { restoreGameState, serializeGameState } from '../src/game/save';
import {
  cargoWeight,
  chooseAnomaly,
  requestMine,
  selectArchive,
  selectNode,
  sendElevator,
  togglePassive,
  unlockAutoDispatch,
  unlockAutoSwing,
  unlockD030,
  unlockPorter,
  updateGame,
  upgradeBoots,
  upgradePack,
  upgradeTool,
} from '../src/game/simulation';
import type { GameState, LootKind, LootStack } from '../src/game/types';

function ticks(state: GameState, count: number): void {
  for (let index = 0; index < count; index += 1) updateGame(state, 1 / 60);
}

function makeLoot(kind: LootKind, id = `test-${kind}`): LootStack {
  const item = LOOT[kind];
  return { id, kind, name: item.name, rarity: item.rarity, category: item.category, weight: item.weight, value: item.value, x: 118, y: 206 };
}

function placeAtNode(state: GameState, nodeId: string): void {
  const node = state.floor.nodes.find((candidate) => candidate.id === nodeId)!;
  state.character.x = node.x < 240 ? node.x + 13 : node.x - 13;
  state.character.targetNodeId = node.id;
  state.character.state = 'MINING';
}

function enterD030(state: GameState): void {
  state.scrap = 10000;
  state.porter.enabled = true;
  state.porter.state = 'FIND_LOOT';
  state.automation.autoDispatch = { unlocked: true, enabled: false };
  expect(unlockD030(state)).toBe(true);
  ticks(state, 180);
  expect(state.depth.current).toBe('D-030');
  expect(state.anomaly.options).toHaveLength(3);
}

function breakNode(state: GameState, nodeId: string): void {
  placeAtNode(state, nodeId);
  const node = state.floor.nodes.find((candidate) => candidate.id === nodeId)!;
  node.hp = state.tool.damage;
  expect(requestMine(state)).toBe(true);
  ticks(state, 40);
  expect(node.hp).toBe(0);
}

function advanceUntil(state: GameState, predicate: () => boolean, maxTicks = 4000): void {
  for (let index = 0; index < maxTicks && !predicate(); index += 1) ticks(state, 1);
  expect(predicate()).toBe(true);
}

describe('Milestone 3 — D-030 discovery and build choice', () => {
  it('generates deterministic anomaly options without consuming loot RNG', () => {
    const a = createGameState(20260916);
    const b = createGameState(20260916);
    const beforeA = a.rngState;
    const beforeB = b.rngState;
    enterD030(a);
    enterD030(b);
    expect(a.anomaly.options).toEqual(b.anomaly.options);
    expect(a.rngState).toBe(beforeA);
    expect(b.rngState).toBe(beforeB);

    const restored = restoreGameState(serializeGameState(a))!;
    expect(restored.anomaly.options).toEqual(a.anomaly.options);
  });

  it('locks anomaly selection and changes real simulation parameters', () => {
    const heavy = createGameState(11);
    enterD030(heavy);
    heavy.anomaly.options = ['HEAVY_WORLD', 'GOLD_RUSH', 'EMPTY_SHAFT'];
    expect(chooseAnomaly(heavy, 'HEAVY_WORLD')).toBe(true);
    ticks(heavy, 1);
    expect(heavy.porter.moveSpeed).toBeLessThan(30);
    expect(chooseAnomaly(heavy, 'GOLD_RUSH')).toBe(false);

    const empty = createGameState(12);
    enterD030(empty);
    empty.anomaly.options = ['EMPTY_SHAFT', 'FOSSIL_AGE', 'LIVING_ROCK'];
    chooseAnomaly(empty, 'EMPTY_SHAFT');
    ticks(empty, 1);
    expect(empty.elevator.maxLoad).toBeLessThan(15);
    expect(empty.elevator.moveSpeed).toBeGreaterThan(0.6);
  });

  it('keeps treasure rolls deterministic for the same seed and input sequence', () => {
    const run = () => {
      const state = createGameState(4444);
      enterD030(state);
      chooseAnomaly(state, state.anomaly.options[0]!);
      state.porter.enabled = false;
      state.discovery.firstDiscoveryBreak = 99;
      state.discovery.firstFossilBreak = 99;
      state.discovery.firstRelicBreak = 99;
      breakNode(state, 'black-glass-fault');
      return state;
    };
    const a = run();
    const b = run();
    expect(a.floor.loot.map((item) => item.kind)).toEqual(b.floor.loot.map((item) => item.kind));
    expect(a.rngState).toBe(b.rngState);
    expect(a.lootRoll).toBe(b.lootRoll);
  });

  it('keeps a fossil physical until Porter and elevator appraisal finish', () => {
    const state = createGameState(55);
    enterD030(state);
    chooseAnomaly(state, state.anomaly.options[0]!);
    state.discovery.firstDiscoveryBreak = 1;
    state.discovery.firstFossilBreak = 1;
    state.discovery.firstRelicBreak = 99;
    breakNode(state, 'fossil-seam');
    const fossil = state.floor.loot.find((item) => item.category === 'FOSSIL');
    expect(fossil).toBeDefined();
    expect(state.collection.entries.some((entry) => entry.discovered)).toBe(false);

    advanceUntil(state, () => state.porter.carried.some((item) => item.id === fossil!.id));
    expect(state.collection.entries.some((entry) => entry.discovered)).toBe(false);
    advanceUntil(state, () => state.elevator.cargo.some((item) => item.id === fossil!.id));
    expect(state.collection.entries.some((entry) => entry.discovered)).toBe(false);

    expect(sendElevator(state)).toBe(true);
    advanceUntil(state, () => state.collection.entries.some((entry) => entry.kind === fossil!.kind && entry.discovered));
    const entry = state.collection.entries.find((candidate) => candidate.kind === fossil!.kind)!;
    expect(entry.count).toBe(1);
  });

  it('registers collection duplicates only after a second surface appraisal', () => {
    const state = createGameState(90);
    enterD030(state);
    chooseAnomaly(state, state.anomaly.options[0]!);
    state.elevator.cargo.push(makeLoot('AMMONITE', 'a'));
    sendElevator(state);
    advanceUntil(state, () => state.collection.entries.find((entry) => entry.kind === 'AMMONITE')!.count === 1);
    state.elevator.cargo.push(makeLoot('AMMONITE', 'b'));
    advanceUntil(state, () => state.elevator.state === 'IDLE_BOTTOM');
    sendElevator(state);
    advanceUntil(state, () => state.collection.entries.find((entry) => entry.kind === 'AMMONITE')!.count === 2);
    expect(state.eventHistory.some((event) => event.type === 'COLLECTION_DUPLICATE')).toBe(true);
  });

  it('unlocks a passive only when its Relic is appraised at the surface', () => {
    const state = createGameState(77);
    enterD030(state);
    chooseAnomaly(state, state.anomaly.options[0]!);
    const relic = makeLoot('PROSPECTOR_LENS');
    state.floor.loot.push(relic);
    expect(state.passives.unlocked).toHaveLength(0);
    state.porter.enabled = true;
    state.porter.state = 'FIND_LOOT';
    advanceUntil(state, () => state.elevator.cargo.some((item) => item.kind === 'PROSPECTOR_LENS'));
    expect(state.passives.unlocked).toHaveLength(0);
    sendElevator(state);
    advanceUntil(state, () => state.passives.unlocked.includes('PROSPECTORS_EYE'));
    expect(state.passives.active).toContain('PROSPECTORS_EYE');
  });

  it('enforces two passive slots and makes Long Stride affect movement simulation', () => {
    const state = createGameState(81);
    enterD030(state);
    chooseAnomaly(state, state.anomaly.options[0]!);
    state.passives.unlocked = ['LONG_STRIDE', 'LAST_SWING', 'PROSPECTORS_EYE'];
    state.passives.active = [];
    selectArchive(state);
    const baseSpeed = state.character.moveSpeed;
    expect(togglePassive(state, 'LONG_STRIDE')).toBe(true);
    expect(state.character.moveSpeed).toBeGreaterThan(baseSpeed);
    expect(togglePassive(state, 'LAST_SWING')).toBe(true);
    expect(togglePassive(state, 'PROSPECTORS_EYE')).toBe(false);
    expect(state.passives.active).toHaveLength(2);
    state.character.carried.push(makeLoot('IRON'));
    ticks(state, 1);
    expect(state.character.moveSpeed).toBeLessThan(baseSpeed * 1.1);
  });

  it('restores rare floor loot, porter carried loot, elevator cargo, anomaly and build', () => {
    let floor = createGameState(91);
    enterD030(floor);
    chooseAnomaly(floor, floor.anomaly.options[0]!);
    floor.floor.loot.push(makeLoot('TRILOBITE'));
    floor = restoreGameState(serializeGameState(floor))!;
    expect(floor.floor.loot.some((item) => item.kind === 'TRILOBITE')).toBe(true);
    expect(floor.anomaly.selected).not.toBeNull();

    let porter = createGameState(92);
    enterD030(porter);
    chooseAnomaly(porter, porter.anomaly.options[0]!);
    porter.porter.carried.push(makeLoot('AMMONITE'));
    porter.porter.state = 'RETURNING_TO_ELEVATOR';
    porter = restoreGameState(serializeGameState(porter))!;
    expect(porter.porter.carried[0]?.kind).toBe('AMMONITE');

    let elevator = createGameState(93);
    enterD030(elevator);
    chooseAnomaly(elevator, elevator.anomaly.options[0]!);
    elevator.elevator.cargo.push(makeLoot('RHYTHM_RELAY'));
    elevator.passives.unlocked = ['LONG_STRIDE'];
    elevator.passives.active = ['LONG_STRIDE'];
    sendElevator(elevator);
    ticks(elevator, 30);
    elevator = restoreGameState(serializeGameState(elevator))!;
    expect(elevator.elevator.cargo[0]?.kind).toBe('RHYTHM_RELAY');
    expect(elevator.passives.unlocked).not.toContain('ELEVATOR_RHYTHM');
    expect(elevator.passives.active).toEqual(['LONG_STRIDE']);
  });

  it('keeps Phase 2 manual swing, upgrades and porter path intact', () => {
    const state = createGameState(7);
    placeAtNode(state, 'scrap-ledge');
    const node = state.floor.nodes[0]!;
    expect(requestMine(state)).toBe(true);
    ticks(state, 14);
    expect(node.hp).toBeLessThan(node.maxHp);

    state.scrap = 5000;
    state.stats.manualSwings = AUTO_SWING_MANUAL_SWINGS_REQUIRED;
    expect(upgradeTool(state)).toBe(true);
    expect(upgradeBoots(state)).toBe(true);
    expect(unlockAutoSwing(state)).toBe(true);
    expect(upgradePack(state)).toBe(true);
    expect(unlockPorter(state)).toBe(true);
    expect(unlockAutoDispatch(state)).toBe(true);
    expect(state.automation.autoDispatch.enabled).toBe(false);

    state.floor.loot.push(makeLoot('IRON', 'porter-regression'));
    ticks(state, 1);
    expect(['MOVING_TO_LOOT', 'COLLECTING', 'RETURNING_TO_ELEVATOR', 'LOADING', 'FIND_LOOT']).toContain(state.porter.state);
    expect(cargoWeight(state.elevator.cargo)).toBeGreaterThanOrEqual(0);
  });
});
