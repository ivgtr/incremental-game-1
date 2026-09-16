import {
  COLLECT_DURATION,
  LOAD_DURATION,
  LOOT,
  STEEL_PICKAXE_COST,
  SWING,
  UNLOAD_DURATION,
  WORLD,
} from './config';
import { nextRandom, pick } from './rng';
import type { GameEvent, GameEventType, GameState, LootKind, LootStack, MiningNode } from './types';

const NODE_STOP_DISTANCE = 13;
const ELEVATOR_LOAD_X = WORLD.elevatorX - 19;

export function updateGame(state: GameState, dt: number): void {
  const step = Math.max(0, Math.min(dt, 0.1));
  state.elapsed += step;
  updateNodes(state, step);
  updateElevator(state, step);
  updateCharacter(state, step);
}

export function selectNode(state: GameState, nodeId: string): boolean {
  const node = state.floor.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return false;
  state.selection = { type: 'node', id: nodeId };
  emit(state, 'PLAYER_INPUT_MOVE', { nodeId });

  if (node.hp <= 0 || state.character.carried.length > 0) return false;
  if (!['IDLE', 'MINING', 'MOVING_TO_NODE'].includes(state.character.state)) return false;

  state.character.targetNodeId = nodeId;
  state.character.swing = null;
  state.character.facing = node.x >= state.character.x ? 1 : -1;
  state.character.state = 'MOVING_TO_NODE';
  emit(state, 'MINER_MOVE_START', { nodeId, distance: node.distanceMeters });
  return true;
}

export function moveToSelectedNode(state: GameState): boolean {
  return state.selection?.type === 'node' ? selectNode(state, state.selection.id) : false;
}

export function selectElevator(state: GameState): void {
  state.selection = { type: 'elevator' };
}

export function selectWorkbench(state: GameState): void {
  state.selection = { type: 'workbench' };
}

export function requestMine(state: GameState): boolean {
  const character = state.character;
  const node = findTargetNode(state);
  if (character.state !== 'MINING' || character.swing || !node || node.hp <= 0) return false;

  const destination = nodeDestination(node);
  if (Math.abs(character.x - destination) > 1.5) return false;

  emit(state, 'PLAYER_INPUT_MINE', { nodeId: node.id });
  character.swing = { elapsed: 0, hitApplied: false };
  character.facing = node.x >= character.x ? 1 : -1;
  emit(state, 'MINER_SWING_START', { nodeId: node.id });
  return true;
}

export function sendElevator(state: GameState): boolean {
  const elevator = state.elevator;
  if (elevator.state !== 'IDLE_BOTTOM' || elevator.cargo.length === 0) return false;
  if (state.character.state === 'LOADING') return false;

  elevator.state = 'ASCENDING';
  elevator.stateTimer = 0;
  emit(state, 'ELEVATOR_DEPART', {
    weight: cargoWeight(elevator.cargo),
    value: cargoValue(elevator.cargo),
  });
  return true;
}

export function upgradeTool(state: GameState): boolean {
  if (state.tool.level !== 1 || state.scrap < STEEL_PICKAXE_COST) return false;
  state.scrap -= STEEL_PICKAXE_COST;
  state.tool = { id: 'player-tool', slot: 'TOOL', level: 2, name: 'Steel Pickaxe', damage: 16 };
  emit(state, 'EQUIPMENT_UPGRADE', { name: state.tool.name, damage: state.tool.damage });
  return true;
}

export function canMine(state: GameState): boolean {
  const node = findTargetNode(state);
  return Boolean(state.character.state === 'MINING' && !state.character.swing && node && node.hp > 0);
}

export function cargoWeight(cargo: readonly LootStack[]): number {
  return cargo.reduce((sum, item) => sum + item.weight, 0);
}

export function cargoValue(cargo: readonly LootStack[]): number {
  return cargo.reduce((sum, item) => sum + item.value, 0);
}

export function carriedWeight(state: GameState): number {
  return cargoWeight(state.character.carried);
}

export function drainEvents(state: GameState): GameEvent[] {
  return state.events.splice(0, state.events.length);
}

function updateNodes(state: GameState, dt: number): void {
  for (const node of state.floor.nodes) {
    if (node.hp > 0 || node.respawnTimer <= 0) continue;
    node.respawnTimer = Math.max(0, node.respawnTimer - dt);
    if (node.respawnTimer === 0) node.hp = node.maxHp;
  }
}

function updateElevator(state: GameState, dt: number): void {
  const elevator = state.elevator;
  elevator.stateTimer += dt;

  if (elevator.state === 'ASCENDING') {
    elevator.position = Math.min(1, elevator.position + elevator.moveSpeed * dt);
    if (elevator.position >= 1) {
      elevator.position = 1;
      elevator.state = 'UNLOADING';
      elevator.stateTimer = 0;
      emit(state, 'ELEVATOR_ARRIVE_SURFACE', {
        weight: cargoWeight(elevator.cargo),
        value: cargoValue(elevator.cargo),
      });
    }
    return;
  }

  if (elevator.state === 'UNLOADING') {
    if (elevator.stateTimer < UNLOAD_DURATION) return;
    const value = cargoValue(elevator.cargo);
    const items = elevator.cargo.length;
    emit(state, 'LOOT_APPRAISE', { items, value });
    elevator.cargo = [];
    if (value > 0) {
      state.scrap += value;
      emit(state, 'RESOURCE_GAIN', { resource: 'Scrap', amount: value, total: state.scrap });
    }
    elevator.state = 'DESCENDING';
    elevator.stateTimer = 0;
    return;
  }

  if (elevator.state === 'DESCENDING') {
    elevator.position = Math.max(0, elevator.position - elevator.moveSpeed * dt);
    if (elevator.position <= 0) {
      elevator.position = 0;
      elevator.state = 'IDLE_BOTTOM';
      elevator.stateTimer = 0;
      emit(state, 'ELEVATOR_RETURN');
    }
  }
}

function updateCharacter(state: GameState, dt: number): void {
  const character = state.character;

  switch (character.state) {
    case 'MOVING_TO_NODE': {
      const node = findTargetNode(state);
      if (!node || node.hp <= 0) {
        character.state = 'IDLE';
        return;
      }
      character.facing = node.x >= character.x ? 1 : -1;
      if (moveToward(character, nodeDestination(node), dt)) {
        character.state = 'MINING';
        emit(state, 'MINER_ARRIVE', { nodeId: node.id });
      }
      return;
    }

    case 'MINING': {
      const node = findTargetNode(state);
      if (!node) {
        character.state = 'IDLE';
        character.swing = null;
        return;
      }
      if (!character.swing) return;

      character.swing.elapsed += dt;
      if (!character.swing.hitApplied && character.swing.elapsed >= SWING.hitAt) {
        character.swing.hitApplied = true;
        applyMiningHit(state, node);
      }
      if (character.swing.elapsed >= SWING.total) {
        character.swing = null;
        if (node.hp <= 0) {
          character.state = 'COLLECTING';
          character.collectTimer = 0;
        }
      }
      return;
    }

    case 'COLLECTING': {
      character.collectTimer += dt;
      if (character.collectTimer < COLLECT_DURATION) return;
      pickUpNearbyLoot(state);
      character.collectTimer = 0;
      if (character.carried.length > 0) {
        character.state = 'RETURNING';
        character.facing = ELEVATOR_LOAD_X >= character.x ? 1 : -1;
        emit(state, 'MINER_RETURN', { weight: cargoWeight(character.carried) });
      } else {
        character.state = 'IDLE';
      }
      return;
    }

    case 'RETURNING': {
      character.facing = ELEVATOR_LOAD_X >= character.x ? 1 : -1;
      if (moveToward(character, ELEVATOR_LOAD_X, dt)) beginLoadingOrWait(state);
      return;
    }

    case 'WAITING_FOR_ELEVATOR': {
      if (character.carried.length === 0) {
        character.state = 'IDLE';
        return;
      }
      if (state.elevator.state === 'IDLE_BOTTOM' && availableElevatorCapacity(state) > 0.01) {
        beginLoading(state);
      }
      return;
    }

    case 'LOADING': {
      character.loadingTimer += dt;
      if (character.loadingTimer < LOAD_DURATION) return;
      finishLoading(state);
      return;
    }

    case 'IDLE':
      return;
  }
}

function applyMiningHit(state: GameState, node: MiningNode): void {
  emit(state, 'MINER_SWING_HIT', { nodeId: node.id, damage: state.tool.damage });
  node.hp = Math.max(0, node.hp - state.tool.damage);
  emit(state, 'NODE_DAMAGE', { nodeId: node.id, hp: node.hp, maxHp: node.maxHp });
  if (node.hp > 0) return;

  node.respawnTimer = node.respawnDelay;
  emit(state, 'NODE_BREAK', { nodeId: node.id });
  spawnLoot(state, node);
}

function spawnLoot(state: GameState, node: MiningNode): void {
  const commonCount = 2 + Math.floor(nextRandom(state) * 2);
  const spawned: LootStack[] = [];

  for (let index = 0; index < commonCount; index += 1) {
    const kind = pick(state, node.commonKinds);
    spawned.push(createLoot(state, kind, node.x + (nextRandom(state) - 0.5) * 18, node.y - 4));
  }

  const rareRoll = nextRandom(state);
  const hasRare = rareRoll < node.rareChance;
  emit(state, 'LOOT_ROLL', {
    nodeId: node.id,
    roll: Number(rareRoll.toFixed(5)),
    chance: node.rareChance,
    rare: hasRare,
  });

  if (hasRare) {
    const kind = pick(state, node.rareKinds);
    spawned.push(createLoot(state, kind, node.x + (nextRandom(state) - 0.5) * 14, node.y - 7));
  }

  state.floor.loot.push(...spawned);
  for (const item of spawned) {
    emit(state, 'LOOT_SPAWN', {
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      value: item.value,
      x: item.x,
      y: item.y,
    });
  }
}

function createLoot(state: GameState, kind: LootKind, x: number, y: number): LootStack {
  const definition = LOOT[kind];
  return {
    id: `loot-${state.nextLootId++}`,
    kind,
    name: definition.name,
    rarity: definition.rarity,
    weight: definition.weight,
    value: definition.value,
    x,
    y,
  };
}

function pickUpNearbyLoot(state: GameState): void {
  const character = state.character;
  const node = findTargetNode(state);
  if (!node) return;

  const nearby = state.floor.loot
    .filter((item) => Math.abs(item.x - node.x) <= 28)
    .sort((a, b) => Number(b.rarity === 'RARE') - Number(a.rarity === 'RARE'));

  for (const item of nearby) {
    const nextWeight = cargoWeight(character.carried) + item.weight;
    if (nextWeight > character.backpackCapacity + 0.001) continue;
    character.carried.push(item);
    const index = state.floor.loot.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) state.floor.loot.splice(index, 1);
    emit(state, 'LOOT_PICKUP', { id: item.id, name: item.name, weight: item.weight, value: item.value });
  }
}

function beginLoadingOrWait(state: GameState): void {
  if (state.elevator.state === 'IDLE_BOTTOM' && availableElevatorCapacity(state) > 0.01) {
    beginLoading(state);
  } else {
    state.character.state = 'WAITING_FOR_ELEVATOR';
  }
}

function beginLoading(state: GameState): void {
  state.character.state = 'LOADING';
  state.character.loadingTimer = 0;
  state.elevator.state = 'LOADING';
  state.elevator.stateTimer = 0;
}

function finishLoading(state: GameState): void {
  const capacity = availableElevatorCapacity(state);
  let remaining = capacity;
  const deposited: LootStack[] = [];
  const stillCarried: LootStack[] = [];

  for (const item of state.character.carried) {
    if (item.weight <= remaining + 0.001) {
      deposited.push(item);
      remaining -= item.weight;
    } else {
      stillCarried.push(item);
    }
  }

  state.character.carried = stillCarried;
  state.elevator.cargo.push(...deposited);
  state.elevator.state = 'IDLE_BOTTOM';
  state.elevator.stateTimer = 0;
  state.character.loadingTimer = 0;

  if (deposited.length > 0) {
    emit(state, 'LOOT_DEPOSIT', {
      items: deposited.length,
      weight: cargoWeight(deposited),
      estimatedValue: cargoValue(deposited),
    });
  }

  state.character.state = stillCarried.length > 0 ? 'WAITING_FOR_ELEVATOR' : 'IDLE';
}

function availableElevatorCapacity(state: GameState): number {
  return Math.max(0, state.elevator.maxLoad - cargoWeight(state.elevator.cargo));
}

function moveToward(character: GameState['character'], destination: number, dt: number): boolean {
  const delta = destination - character.x;
  const distance = Math.abs(delta);
  if (distance <= 0.5) {
    character.x = destination;
    return true;
  }
  const step = character.moveSpeed * dt;
  if (step >= distance) {
    character.x = destination;
    return true;
  }
  character.x += Math.sign(delta) * step;
  return false;
}

function nodeDestination(node: MiningNode): number {
  return node.x < WORLD.elevatorX ? node.x + NODE_STOP_DISTANCE : node.x - NODE_STOP_DISTANCE;
}

function findTargetNode(state: GameState): MiningNode | undefined {
  const id = state.character.targetNodeId;
  return id ? state.floor.nodes.find((node) => node.id === id) : undefined;
}

function emit(
  state: GameState,
  type: GameEventType,
  data?: Record<string, string | number | boolean>,
): void {
  const event: GameEvent = { id: state.nextEventId++, type, at: state.elapsed, ...(data ? { data } : {}) };
  state.events.push(event);
  state.eventHistory.push(event);
  if (state.eventHistory.length > 80) state.eventHistory.splice(0, state.eventHistory.length - 80);
}
