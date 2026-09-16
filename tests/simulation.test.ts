import { describe, expect, it } from 'vitest';
import { AUTO_SWING_MANUAL_SWINGS_REQUIRED, LOOT } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { restoreGameState, serializeGameState } from '../src/game/save';
import {
  cargoWeight,
  requestMine,
  selectNode,
  sendElevator,
  toggleAutoDispatch,
  unlockAutoDispatch,
  unlockAutoSwing,
  unlockPorter,
  updateGame,
  upgradeBoots,
  upgradePack,
  upgradeTool,
} from '../src/game/simulation';
import type { GameState, LootStack } from '../src/game/types';

function ticks(state: GameState, count: number): void {
  for (let index = 0; index < count; index += 1) updateGame(state, 1 / 60);
}

function makeLoot(id: string, x: number, weight = LOOT.IRON.weight, value = LOOT.IRON.value): LootStack {
  return { id, kind: 'IRON', name: 'Iron', rarity: 'COMMON', weight, value, x, y: 206 };
}

function placeAtNode(state: GameState, nodeId: string): void {
  const node = state.floor.nodes.find((candidate) => candidate.id === nodeId)!;
  state.character.x = node.x < 240 ? node.x + 13 : node.x - 13;
  state.character.targetNodeId = node.id;
  state.character.state = 'MINING';
}

describe('Milestone 2 first automation', () => {
  it('keeps manual mining and auto swing on the same hit-frame damage path', () => {
    const manual = createGameState(1234);
    placeAtNode(manual, 'scrap-ledge');
    const manualNode = manual.floor.nodes[0]!;
    const manualBefore = manualNode.hp;
    expect(requestMine(manual)).toBe(true);
    ticks(manual, 8);
    expect(manualNode.hp).toBe(manualBefore);
    ticks(manual, 8);
    expect(manualNode.hp).toBe(manualBefore - manual.tool.damage);

    const automatic = createGameState(1234);
    placeAtNode(automatic, 'scrap-ledge');
    automatic.automation.autoSwing = { unlocked: true, enabled: true };
    const autoNode = automatic.floor.nodes[0]!;
    const autoBefore = autoNode.hp;
    ticks(automatic, 1);
    expect(automatic.character.swing).not.toBeNull();
    expect(autoNode.hp).toBe(autoBefore);
    ticks(automatic, 10);
    expect(autoNode.hp).toBe(autoBefore);
    ticks(automatic, 3);
    expect(autoNode.hp).toBe(autoBefore - automatic.tool.damage);
    expect(automatic.eventHistory.some((event) => event.type === 'AUTO_SWING_TRIGGER')).toBe(true);
    expect(automatic.eventHistory.some((event) => event.type === 'MINER_SWING_START')).toBe(true);
  });

  it('does not auto swing while moving or after a depleted node', () => {
    const state = createGameState(18);
    state.automation.autoSwing = { unlocked: true, enabled: true };
    selectNode(state, 'fossil-crack');
    ticks(state, 20);
    expect(state.character.state).toBe('MOVING_TO_NODE');
    expect(state.character.swing).toBeNull();

    placeAtNode(state, 'fossil-crack');
    const node = state.floor.nodes.find((candidate) => candidate.id === 'fossil-crack')!;
    node.hp = state.tool.damage;
    ticks(state, 1);
    ticks(state, 40);
    expect(node.hp).toBe(0);
    expect(state.character.swing).toBeNull();
    const swingStarts = state.eventHistory.filter((event) => event.type === 'MINER_SWING_START').length;
    ticks(state, 120);
    expect(state.eventHistory.filter((event) => event.type === 'MINER_SWING_START')).toHaveLength(swingStarts);
  });

  it('makes the porter walk to physical loot before pickup and back before deposit', () => {
    const state = createGameState(55);
    state.porter.enabled = true;
    state.porter.state = 'FIND_LOOT';
    state.floor.loot.push(makeLoot('loot-test', 118));

    ticks(state, 1);
    expect(state.porter.state).toBe('MOVING_TO_LOOT');
    ticks(state, 30);
    expect(state.floor.loot).toHaveLength(1);
    expect(state.porter.carried).toHaveLength(0);

    for (let index = 0; index < 600 && state.porter.carried.length === 0; index += 1) ticks(state, 1);
    expect(state.floor.loot).toHaveLength(0);
    expect(state.porter.carried).toHaveLength(1);
    expect(state.porter.x).toBeCloseTo(118, 0);
    expect(cargoWeight(state.elevator.cargo)).toBe(0);

    for (let index = 0; index < 900 && state.elevator.cargo.length === 0; index += 1) ticks(state, 1);
    expect(state.porter.carried).toHaveLength(0);
    expect(state.elevator.cargo).toHaveLength(1);
    expect(state.elevator.state).toBe('IDLE_BOTTOM');
    expect(state.eventHistory.some((event) => event.type === 'PORTER_JOB_ASSIGNED')).toBe(true);
    expect(state.eventHistory.some((event) => event.type === 'PORTER_PICKUP')).toBe(true);
    expect(state.eventHistory.some((event) => event.type === 'PORTER_DEPOSIT')).toBe(true);
  });

  it('allows floor loot to visibly accumulate when transport cannot keep up', () => {
    const state = createGameState(77);
    state.porter.enabled = true;
    state.porter.state = 'FIND_LOOT';
    state.porter.moveSpeed = 1;
    state.floor.loot.push(
      makeLoot('loot-1', 118), makeLoot('loot-2', 118), makeLoot('loot-3', 118),
      makeLoot('loot-4', 438), makeLoot('loot-5', 438), makeLoot('loot-6', 438),
    );
    ticks(state, 300);
    expect(state.floor.loot.length).toBeGreaterThanOrEqual(5);
    expect(state.elevator.cargo).toHaveLength(0);
  });

  it('keeps SEND manual until auto dispatch is enabled, then uses the real elevator trip', () => {
    const state = createGameState(91);
    state.elevator.cargo.push(makeLoot('cargo-a', 240, 5.5, 20), makeLoot('cargo-b', 240, 5.5, 30));
    state.automation.autoDispatch = { unlocked: true, enabled: false };
    ticks(state, 120);
    expect(state.elevator.state).toBe('IDLE_BOTTOM');
    expect(state.scrap).toBe(0);

    expect(toggleAutoDispatch(state)).toBe(true);
    ticks(state, 1);
    expect(state.elevator.state).toBe('ASCENDING');
    expect(state.eventHistory.some((event) => event.type === 'AUTO_DISPATCH_TRIGGER')).toBe(true);
    ticks(state, 100);
    expect(state.scrap).toBe(0);
    for (let index = 0; index < 400 && state.scrap === 0; index += 1) ticks(state, 1);
    expect(state.scrap).toBe(50);
  });

  it('makes Tool, Boots, and Pack materially change simulation parameters', () => {
    const state = createGameState(9);
    state.scrap = 5000;
    state.stats.manualSwings = AUTO_SWING_MANUAL_SWINGS_REQUIRED;
    expect(upgradeTool(state)).toBe(true);
    expect(state.tool.damage).toBe(16);

    const oldSpeed = state.character.moveSpeed;
    expect(upgradeBoots(state)).toBe(true);
    expect(state.character.moveSpeed).toBeGreaterThan(oldSpeed * 1.4);

    expect(unlockAutoSwing(state)).toBe(true);
    const oldCapacity = state.character.backpackCapacity;
    expect(upgradePack(state)).toBe(true);
    expect(state.character.backpackCapacity).toBeGreaterThan(oldCapacity * 1.5);

    expect(unlockPorter(state)).toBe(true);
    expect(state.porter.enabled).toBe(true);
    expect(unlockAutoDispatch(state)).toBe(true);
    expect(state.automation.autoDispatch.enabled).toBe(false);
  });

  it('gives near/mid/far veins distinct hardness, yield, value mix and rare chance', () => {
    const state = createGameState(44);
    const [near, mid, far] = state.floor.nodes;
    expect(near!.profile).toBe('NEAR');
    expect(mid!.profile).toBe('MID');
    expect(far!.profile).toBe('FAR');
    expect(near!.maxHp).toBeLessThan(mid!.maxHp);
    expect(mid!.maxHp).toBeLessThan(far!.maxHp);
    expect(near!.distanceMeters).toBeLessThan(mid!.distanceMeters);
    expect(mid!.distanceMeters).toBeLessThan(far!.distanceMeters);
    expect(near!.yieldMax).toBeLessThan(far!.yieldMin + 1);
    expect(near!.rareChance).toBeLessThan(mid!.rareChance);
    expect(mid!.rareChance).toBeLessThan(far!.rareChance);
  });

  it('preserves deterministic loot rolls from the same run seed', () => {
    const breakNode = () => {
      const state = createGameState(2026);
      placeAtNode(state, 'fossil-crack');
      const node = state.floor.nodes.find((candidate) => candidate.id === 'fossil-crack')!;
      node.hp = state.tool.damage;
      requestMine(state);
      ticks(state, 40);
      return state;
    };
    const first = breakNode();
    const second = breakNode();
    expect(second.floor.loot.map((item) => item.kind)).toEqual(first.floor.loot.map((item) => item.kind));
    expect(second.lootRoll).toBe(first.lootRoll);
    expect(second.rngState).toBe(first.rngState);
  });

  it('restores player movement, porter work, elevator travel and automation state', () => {
    let moving = createGameState(99);
    selectNode(moving, 'copper-pocket');
    ticks(moving, 45);
    const movingX = moving.character.x;
    moving = restoreGameState(serializeGameState(moving))!;
    expect(moving.character.state).toBe('MOVING_TO_NODE');
    expect(moving.character.x).toBe(movingX);

    let porter = createGameState(100);
    porter.porter.enabled = true;
    porter.porter.state = 'FIND_LOOT';
    porter.floor.loot.push(makeLoot('restore-loot', 118));
    ticks(porter, 40);
    porter = restoreGameState(serializeGameState(porter))!;
    expect(porter.porter.state).toBe('MOVING_TO_LOOT');
    expect(porter.porter.targetLootId).toBe('restore-loot');

    let elevator = createGameState(101);
    elevator.elevator.cargo.push(makeLoot('restore-cargo', 240, 2, 25));
    expect(sendElevator(elevator)).toBe(true);
    ticks(elevator, 50);
    const position = elevator.elevator.position;
    elevator = restoreGameState(serializeGameState(elevator))!;
    expect(elevator.elevator.state).toBe('ASCENDING');
    expect(elevator.elevator.position).toBe(position);

    let automatic = createGameState(102);
    automatic.automation.autoSwing = { unlocked: true, enabled: true };
    placeAtNode(automatic, 'scrap-ledge');
    automatic = restoreGameState(serializeGameState(automatic))!;
    ticks(automatic, 1);
    expect(automatic.character.swing).not.toBeNull();
    expect(automatic.automation.autoSwing.enabled).toBe(true);
  });
});
