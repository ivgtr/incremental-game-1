import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { restoreGameState, serializeGameState } from '../src/game/save';
import {
  cargoWeight,
  requestMine,
  selectNode,
  sendElevator,
  updateGame,
} from '../src/game/simulation';

function ticks(state: ReturnType<typeof createGameState>, count: number): void {
  for (let index = 0; index < count; index += 1) updateGame(state, 1 / 60);
}

describe('Milestone 1 simulation', () => {
  it('applies mining damage only on the hit frame', () => {
    const state = createGameState(1234);
    const node = state.floor.nodes[0]!;
    state.character.x = node.x + 13;
    state.character.targetNodeId = node.id;
    state.character.state = 'MINING';

    const before = node.hp;
    expect(requestMine(state)).toBe(true);
    ticks(state, 8);
    expect(node.hp).toBe(before);
    ticks(state, 8);
    expect(node.hp).toBe(before - state.tool.damage);
  });

  it('keeps loot physical until elevator delivery and only then grants Scrap', () => {
    const state = createGameState(0x12345678);
    expect(sendElevator(state)).toBe(false);
    selectNode(state, 'scrap-ledge');
    for (let index = 0; index < 600 && state.character.state !== 'MINING'; index += 1) ticks(state, 1);

    const node = state.floor.nodes.find((candidate) => candidate.id === 'scrap-ledge')!;
    node.hp = state.tool.damage;
    expect(requestMine(state)).toBe(true);
    ticks(state, 28);
    expect(state.floor.loot.length).toBeGreaterThan(0);
    expect(state.scrap).toBe(0);

    for (let index = 0; index < 700 && cargoWeight(state.elevator.cargo) === 0; index += 1) ticks(state, 1);
    expect(cargoWeight(state.elevator.cargo)).toBeGreaterThan(0);
    expect(state.scrap).toBe(0);
    expect(state.elevator.state).toBe('IDLE_BOTTOM');

    expect(sendElevator(state)).toBe(true);
    ticks(state, 100);
    expect(state.scrap).toBe(0);
    for (let index = 0; index < 400 && state.scrap === 0; index += 1) ticks(state, 1);
    expect(state.scrap).toBeGreaterThan(0);
  });

  it('replays the same rare loot from the same run seed', () => {
    const breakFossil = () => {
      const state = createGameState(9);
      const node = state.floor.nodes.find((candidate) => candidate.id === 'fossil-crack')!;
      state.character.x = node.x - 13;
      state.character.targetNodeId = node.id;
      state.character.state = 'MINING';
      node.hp = state.tool.damage;
      requestMine(state);
      ticks(state, 40);
      return state;
    };

    const first = breakFossil();
    const second = breakFossil();
    const firstRare = first.floor.loot.find((item) => item.rarity === 'RARE');
    const secondRare = second.floor.loot.find((item) => item.rarity === 'RARE');

    expect(firstRare?.kind).toBe('GOLD_NUGGET');
    expect(secondRare?.kind).toBe(firstRare?.kind);
    expect(second.lootRoll).toBe(first.lootRoll);
  });

  it('continues an in-flight task after save restoration', () => {
    let state = createGameState(99);
    selectNode(state, 'copper-pocket');
    ticks(state, 45);
    const x = state.character.x;

    state = restoreGameState(serializeGameState(state))!;
    expect(state.character.state).toBe('MOVING_TO_NODE');
    expect(state.character.x).toBe(x);

    for (let index = 0; index < 600 && state.character.state !== 'MINING'; index += 1) ticks(state, 1);
    expect(state.character.state).toBe('MINING');
  });
});
