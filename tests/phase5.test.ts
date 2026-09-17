import { describe, expect, it } from 'vitest';
import { D180_EXTENSION_COST, LOOT } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import {
  applyOfflineProgress,
  armPhase5Reboot,
  assignCrew,
  generateEquipmentItem,
  phase5Floor,
  processPhase5Events,
  pushD180,
  requestPhase5Travel,
  setMinerPriority,
  setPorterPriority,
  unlockCrewOperations,
  updatePhase5,
} from '../src/game/phase5';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { drainEvents, updateGame } from '../src/game/simulation';
import type { GameState, LootKind, LootStack, Phase5DepthId } from '../src/game/types';

function step(state: GameState, seconds = 1 / 60): void {
  updateGame(state, seconds);
  updatePhase5(state, seconds);
  const events = drainEvents(state);
  processPhase5Events(state, events);
  drainEvents(state);
}

function advanceUntil(state: GameState, predicate: () => boolean, maxSteps = 30000): void {
  for (let index = 0; index < maxSteps && !predicate(); index += 1) step(state);
  expect(predicate()).toBe(true);
}

function makeLoot(kind: LootKind, id: string, depth: Phase5DepthId): LootStack {
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

function prepareRun2Crew(seed = 5001): GameState {
  const state = createGameState(seed);
  state.meta.runIndex = 2;
  state.run.scrap = 50000;
  state.run.depth.unlocked = ['D-001', 'D-030', 'D-060', 'D-100'];
  state.run.research.completed = ['DEEP_SURVEY', 'CORE_RESONANCE', 'CREW_ROUTING', 'CARGO_SCHEDULER'];
  state.run.porter.enabled = true;
  state.run.porter.state = 'FIND_LOOT';
  expect(unlockCrewOperations(state)).toBe(true);
  return state;
}

describe('Milestone 5 — First Crew Operations / Push Beyond D-100', () => {
  it('converts the existing Porter workflow into a small Crew roster', () => {
    const state = prepareRun2Crew();
    expect(state.run.phase5.crew.unlocked).toBe(true);
    expect(state.run.porter.enabled).toBe(false);
    expect(state.run.phase5.crew.members.map((member) => member.role).sort()).toEqual(['MINER', 'PORTER']);
    expect(state.run.phase5.crew.slots).toBe(2);
    expect(state.run.phase5.cargo.unlocked).toBe(true);
  });

  it('moves reassigned Crew through Central Elevator travel instead of teleporting', () => {
    const state = prepareRun2Crew(5002);
    const miner = state.run.phase5.crew.members.find((member) => member.role === 'MINER')!;
    expect(assignCrew(state, miner.id, 'D-060')).toBe(true);
    expect(miner.assignedDepth).toBe('D-001');
    expect(miner.pendingDepth).toBe('D-060');
    advanceUntil(state, () => miner.state === 'TRAVELING');
    expect(miner.assignedDepth).toBe('D-001');
    expect(state.run.elevator.state).toBe('TRAVELING');
    advanceUntil(state, () => miner.assignedDepth === 'D-060' && miner.travel === null);
    expect(miner.state).toBe('FIND_NODE');
    expect(state.run.elevator.state).toBe('IDLE_BOTTOM');
  });

  it('physically mines an offscreen Floor while the Player stays elsewhere', () => {
    const state = prepareRun2Crew(5003);
    const miner = state.run.phase5.crew.members.find((member) => member.role === 'MINER')!;
    const porter = state.run.phase5.crew.members.find((member) => member.role === 'PORTER')!;
    miner.assignedDepth = 'D-060';
    miner.state = 'FIND_NODE';
    porter.assignedDepth = 'D-001';
    state.run.depth.current = 'D-001';
    state.run.phase5.cargo.unlocked = false;
    expect(setMinerPriority(state, miner.id, 'RESEARCH')).toBe(true);
    const floor = phase5Floor(state, 'D-060');
    const crystal = floor.nodes.find((node) => node.id === 'crystal-bank')!;
    const originalHp = crystal.hp;
    advanceUntil(state, () => crystal.hp < originalHp || floor.loot.length > 0);
    expect(state.run.depth.current).toBe('D-001');
    expect(crystal.hp < originalHp || floor.loot.length > 0).toBe(true);
    expect(phase5Floor(state, 'D-030').loot).toHaveLength(0);
  });

  it('makes Porter walk a Floor-specific loot path into Floor Cargo before routing', () => {
    const state = prepareRun2Crew(5004);
    const miner = state.run.phase5.crew.members.find((member) => member.role === 'MINER')!;
    const porter = state.run.phase5.crew.members.find((member) => member.role === 'PORTER')!;
    miner.assignedDepth = 'D-001';
    miner.state = 'IDLE';
    porter.assignedDepth = 'D-060';
    porter.state = 'FIND_LOOT';
    state.run.phase5.cargo.unlocked = false;
    const floor = phase5Floor(state, 'D-060');
    floor.loot.push(makeLoot('SURVEY_CARTRIDGE', 'crew-sample', 'D-060'));
    expect(setPorterPriority(state, porter.id, 'RESEARCH')).toBe(true);
    advanceUntil(state, () => floor.cargo.some((item) => item.id === 'crew-sample'));
    expect(floor.loot.some((item) => item.id === 'crew-sample')).toBe(false);
    expect(porter.body.carried).toHaveLength(0);
  });

  it('routes Floor Cargo through the existing Elevator and only grants Data after Surface appraisal', () => {
    const state = prepareRun2Crew(5005);
    const floor = phase5Floor(state, 'D-060');
    floor.cargo.push(makeLoot('SURVEY_CARTRIDGE', 'routed-sample', 'D-060'));
    state.run.data = 0;
    expect(state.run.elevator.cargo).toHaveLength(0);
    advanceUntil(state, () => state.run.data >= 4);
    expect(floor.cargo.some((item) => item.id === 'routed-sample')).toBe(false);
    expect(state.run.data).toBeGreaterThanOrEqual(4);
    expect(state.run.phase5.cargo.deliveredLoads).toBeGreaterThan(0);
  });

  it('keeps multiple Floor state isolated while Crew operate simultaneously', () => {
    const state = prepareRun2Crew(5006);
    state.run.phase5.crew.slots = 3;
    state.run.scrap = 50000;
    const miner = state.run.phase5.crew.members.find((member) => member.role === 'MINER')!;
    const porter = state.run.phase5.crew.members.find((member) => member.role === 'PORTER')!;
    miner.assignedDepth = 'D-060'; miner.state = 'FIND_NODE';
    porter.assignedDepth = 'D-060'; porter.state = 'FIND_LOOT';
    state.run.phase5.cargo.unlocked = false;
    const untouched = phase5Floor(state, 'D-030').nodes.map((node) => node.hp);
    for (let index = 0; index < 1200; index += 1) step(state);
    expect(phase5Floor(state, 'D-030').nodes.map((node) => node.hp)).toEqual(untouched);
    expect(phase5Floor(state, 'D-060').loot.length + phase5Floor(state, 'D-060').cargo.length).toBeGreaterThan(0);
  });

  it('requires the Run 2 Crew/Cargo investment before D-180 push and preserves D-100 Reboot readiness', () => {
    const state = prepareRun2Crew(5007);
    state.run.depth.current = 'D-100';
    state.run.pendingCore = 2;
    state.run.coreChamber.rebootAvailable = true;
    state.run.phase5.ancient.signalFound = true;
    state.run.research.completed.push('ANCIENT_SURVEY');
    state.run.scrap = D180_EXTENSION_COST + 500;
    expect(pushD180(state)).toBe(true);
    expect((state.run.depth.unlocked as string[])).toContain('D-180');
    expect(state.run.pendingCore).toBe(2);
    expect(state.run.coreChamber.rebootAvailable).toBe(true);
    expect(state.run.scrap).toBe(500);
  });

  it('travels to D-180 as a persistent physical Floor with three distinct Ancient sites', () => {
    const state = prepareRun2Crew(5008);
    state.run.depth.current = 'D-100';
    (state.run.depth.unlocked as string[]).push('D-180');
    expect(requestPhase5Travel(state, 'D-180')).toBe(true);
    advanceUntil(state, () => (state.run.depth.current as string) === 'D-180' && state.run.elevator.travel === null);
    const floor = phase5Floor(state, 'D-180');
    expect(floor.nodes.map((node) => node.id)).toEqual(['ruined-workshop', 'archive-vault', 'sealed-chamber']);
    floor.nodes[0]!.hp = 7;
    const restored = restoreGameState(serializeGameState(state))!;
    expect((restored.run.depth.current as string)).toBe('D-180');
    expect(phase5Floor(restored, 'D-180').nodes[0]!.hp).toBe(7);
  });

  it('keeps an Equipment crate physical until Elevator appraisal and deterministically materializes affixes', () => {
    const state = prepareRun2Crew(5009);
    (state.run.depth.unlocked as string[]).push('D-180');
    const floor = phase5Floor(state, 'D-180');
    const crate = makeLoot('ANCIENT_TOOL_CRATE', 'equipment-crate', 'D-180');
    crate.equipmentSeed = 0x12345678;
    floor.cargo.push(crate);
    state.run.phase5.equipment.drops.push({
      lootId: crate.id,
      seed: crate.equipmentSeed,
      baseId: 'workshop-pick',
      slot: 'TOOL',
      sourceDepth: 'D-180',
    });
    expect(state.run.phase5.equipment.inventory).toHaveLength(0);
    advanceUntil(state, () => state.run.phase5.equipment.inventory.length === 1);
    const recovered = state.run.phase5.equipment.inventory[0]!;
    expect(recovered.slot).toBe('TOOL');
    expect(state.run.phase5.equipment.drops).toHaveLength(0);

    const a = createGameState(5010);
    const b = createGameState(5010);
    const itemA = generateEquipmentItem(a, 0xfeedbeef, 'sealed-cutter', 'TOOL');
    const itemB = generateEquipmentItem(b, 0xfeedbeef, 'sealed-cutter', 'TOOL');
    expect({ ...itemA, id: 'same' }).toEqual({ ...itemB, id: 'same' });
  });

  it('restores Crew assignment, in-progress task, Floor Cargo and deterministic Equipment from save v5', () => {
    const state = prepareRun2Crew(5011);
    const miner = state.run.phase5.crew.members.find((member) => member.role === 'MINER')!;
    miner.assignedDepth = 'D-060';
    miner.state = 'MINING';
    miner.targetNodeId = 'crystal-bank';
    miner.swing = { elapsed: 0.15, hitApplied: false };
    phase5Floor(state, 'D-060').cargo.push(makeLoot('CRYSTAL_MEMORY', 'waiting-cargo', 'D-060'));
    const item = generateEquipmentItem(state, 777, 'workshop-pick', 'TOOL');
    state.run.phase5.equipment.inventory.push(item);
    state.run.phase5.equipment.equippedPlayer.TOOL = item.id;

    const restored = restoreGameState(serializeGameState(state))!;
    const restoredMiner = restored.run.phase5.crew.members.find((member) => member.id === miner.id)!;
    expect(restoredMiner.assignedDepth).toBe('D-060');
    expect(restoredMiner.targetNodeId).toBe('crystal-bank');
    expect(restoredMiner.swing?.elapsed).toBeCloseTo(0.15, 5);
    expect(phase5Floor(restored, 'D-060').cargo[0]?.id).toBe('waiting-cargo');
    expect(restored.run.phase5.equipment.inventory[0]?.seed).toBe(777);
    expect(restored.run.phase5.equipment.equippedPlayer.TOOL).toBe(item.id);
  });

  it('offline progression advances only actually assigned Crew and cannot be claimed twice', () => {
    const state = prepareRun2Crew(5012);
    const miner = state.run.phase5.crew.members.find((member) => member.role === 'MINER')!;
    const porter = state.run.phase5.crew.members.find((member) => member.role === 'PORTER')!;
    miner.assignedDepth = 'D-060'; miner.state = 'FIND_NODE';
    porter.assignedDepth = 'D-001'; porter.state = 'IDLE';
    state.run.phase5.cargo.unlocked = false;
    const d030Before = phase5Floor(state, 'D-030').nodes.map((node) => node.hp);
    const d060Before = phase5Floor(state, 'D-060').nodes.map((node) => node.hp);
    const now = 1_800_000_000_000;
    state.run.phase5.offline.savedAt = now - 10_000;
    const report = applyOfflineProgress(state, now);
    expect(report?.seconds).toBeCloseTo(10, 3);
    expect(phase5Floor(state, 'D-030').nodes.map((node) => node.hp)).toEqual(d030Before);
    expect(phase5Floor(state, 'D-060').nodes.map((node) => node.hp)).not.toEqual(d060Before);
    const snapshot = serializeGameState(state);
    expect(applyOfflineProgress(state, now)).toBeNull();
    expect(serializeGameState(state)).toBe(snapshot);
  });

  it('Legacy Locker preserves one Equipment instance while Run-local Crew, Cargo and assignments reset on Reboot', () => {
    const state = prepareRun2Crew(5013);
    state.meta.protocols.push('LEGACY_LOCKER');
    const item = generateEquipmentItem(state, 9911, 'sealed-cutter', 'TOOL');
    state.run.phase5.equipment.inventory.push(item);
    state.run.phase5.equipment.equippedPlayer.TOOL = item.id;
    phase5Floor(state, 'D-060').cargo.push(makeLoot('CRYSTAL_MEMORY', 'run-local-cargo', 'D-060'));
    state.run.pendingCore = 3;
    state.run.coreChamber.rebootAvailable = true;
    state.selection = { type: 'core-chamber' };
    expect(armPhase5Reboot(state)).toBe(true);
    expect(state.run.coreChamber.rebootArmed).toBe(true);
    expect(armPhase5Reboot(state)).toBe(true);
    expect(state.meta.runIndex).toBe(3);
    expect(state.meta.legacyEquipment?.seed).toBe(9911);
    expect(state.run.phase5.equipment.inventory.some((candidate) => candidate.seed === 9911)).toBe(true);
    expect(phase5Floor(state, 'D-060').cargo).toHaveLength(0);
    expect(state.run.phase5.crew.members).toHaveLength(0);
  });
});
