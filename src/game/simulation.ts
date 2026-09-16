import {
  AUTO_DISPATCH_MIN_WEIGHT,
  AUTO_SWING_MANUAL_SWINGS_REQUIRED,
  COLLECT_DURATION,
  LOAD_DURATION,
  LOOT,
  PLAYER_MOVE_SPEED,
  PLAYER_PACK_CAPACITY,
  PORTER_COLLECT_DURATION,
  PORTER_LOAD_DURATION,
  SWING,
  UNLOAD_DURATION,
  UPGRADE_COSTS,
  WORLD,
} from './config';
import { nextRandom, pick } from './rng';
import type {
  GameEvent,
  GameEventType,
  GameState,
  LootKind,
  LootStack,
  MiningNode,
  WorkerBody,
} from './types';

const NODE_STOP_DISTANCE = 13;
const PLAYER_LOAD_X = WORLD.elevatorX - 19;
const PORTER_LOAD_X = WORLD.elevatorX + 28;

export function updateGame(state: GameState, dt: number): void {
  const step = Math.max(0, Math.min(dt, 0.1));
  state.elapsed += step;
  updateNodes(state, step);
  updateElevator(state, step);
  updateCharacter(state, step);
  updatePorter(state, step);
  updateAutomation(state);
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
  if (!canStartSwing(state)) return false;
  const node = findTargetNode(state)!;
  emit(state, 'PLAYER_INPUT_MINE', { nodeId: node.id });
  state.stats.manualSwings += 1;
  return beginSwing(state, node);
}

export function sendElevator(state: GameState): boolean {
  if (!canDispatchElevator(state)) return false;
  return dispatchElevator(state);
}

export function upgradeTool(state: GameState): boolean {
  if (state.tool.level !== 1 || !spendScrap(state, UPGRADE_COSTS.tool)) return false;
  state.tool = { id: 'player-tool', slot: 'TOOL', level: 2, name: 'Steel Pickaxe', damage: 16 };
  emit(state, 'EQUIPMENT_CHANGED', { slot: 'TOOL', name: state.tool.name, level: 2, damage: state.tool.damage });
  return true;
}

export function upgradeBoots(state: GameState): boolean {
  if (state.tool.level !== 2 || state.boots.level !== 1 || !spendScrap(state, UPGRADE_COSTS.boots)) return false;
  state.boots = { id: 'player-boots', slot: 'BOOTS', level: 2, name: 'Runner Boots' };
  state.character.moveSpeed = PLAYER_MOVE_SPEED[2];
  emit(state, 'EQUIPMENT_CHANGED', { slot: 'BOOTS', name: state.boots.name, level: 2, moveSpeed: state.character.moveSpeed });
  return true;
}

export function unlockAutoSwing(state: GameState): boolean {
  if (
    state.boots.level !== 2 ||
    state.automation.autoSwing.unlocked ||
    state.stats.manualSwings < AUTO_SWING_MANUAL_SWINGS_REQUIRED ||
    !spendScrap(state, UPGRADE_COSTS.autoSwing)
  ) return false;

  state.automation.autoSwing = { unlocked: true, enabled: true };
  emit(state, 'AUTOMATION_UNLOCKED', { automation: 'AUTO_SWING', enabled: true });
  return true;
}

export function toggleAutoSwing(state: GameState): boolean {
  if (!state.automation.autoSwing.unlocked) return false;
  state.automation.autoSwing.enabled = !state.automation.autoSwing.enabled;
  emit(state, 'AUTOMATION_TOGGLED', { automation: 'AUTO_SWING', enabled: state.automation.autoSwing.enabled });
  return true;
}

export function upgradePack(state: GameState): boolean {
  if (!state.automation.autoSwing.unlocked || state.pack.level !== 1 || !spendScrap(state, UPGRADE_COSTS.pack)) return false;
  state.pack = { id: 'player-pack', slot: 'PACK', level: 2, name: 'Frame Pack' };
  state.character.backpackCapacity = PLAYER_PACK_CAPACITY[2];
  emit(state, 'EQUIPMENT_CHANGED', {
    slot: 'PACK', name: state.pack.name, level: 2, capacity: state.character.backpackCapacity,
  });
  return true;
}

export function unlockPorter(state: GameState): boolean {
  if (state.pack.level !== 2 || state.porter.enabled || !spendScrap(state, UPGRADE_COSTS.porter)) return false;
  state.porter.enabled = true;
  state.porter.state = 'FIND_LOOT';
  emit(state, 'PORTER_UNLOCKED', { capacity: state.porter.capacity, moveSpeed: state.porter.moveSpeed });
  return true;
}

export function unlockAutoDispatch(state: GameState): boolean {
  if (!state.porter.enabled || state.automation.autoDispatch.unlocked || !spendScrap(state, UPGRADE_COSTS.autoDispatch)) return false;
  state.automation.autoDispatch = { unlocked: true, enabled: false };
  emit(state, 'AUTOMATION_UNLOCKED', { automation: 'AUTO_DISPATCH', enabled: false });
  return true;
}

export function toggleAutoDispatch(state: GameState): boolean {
  if (!state.automation.autoDispatch.unlocked) return false;
  state.automation.autoDispatch.enabled = !state.automation.autoDispatch.enabled;
  emit(state, 'AUTOMATION_TOGGLED', {
    automation: 'AUTO_DISPATCH', enabled: state.automation.autoDispatch.enabled,
  });
  return true;
}

export function canMine(state: GameState): boolean {
  return canStartSwing(state);
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

export function porterWeight(state: GameState): number {
  return cargoWeight(state.porter.carried);
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
        weight: cargoWeight(elevator.cargo), value: cargoValue(elevator.cargo),
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
    state.stats.elevatorTrips += 1;
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
        if (node.hp <= 0 && !state.porter.enabled) {
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
        character.facing = PLAYER_LOAD_X >= character.x ? 1 : -1;
        emit(state, 'MINER_RETURN', { weight: cargoWeight(character.carried) });
      } else {
        character.state = 'IDLE';
      }
      return;
    }

    case 'RETURNING': {
      character.facing = PLAYER_LOAD_X >= character.x ? 1 : -1;
      if (moveToward(character, PLAYER_LOAD_X, dt)) beginCharacterLoadingOrWait(state);
      return;
    }

    case 'WAITING_FOR_ELEVATOR': {
      if (character.carried.length === 0) {
        character.state = 'IDLE';
        return;
      }
      if (state.elevator.state === 'IDLE_BOTTOM' && canAnyFit(character.carried, availableElevatorCapacity(state))) {
        beginCharacterLoading(state);
      }
      return;
    }

    case 'LOADING': {
      character.loadingTimer += dt;
      if (character.loadingTimer < LOAD_DURATION) return;
      finishCharacterLoading(state);
      return;
    }

    case 'IDLE':
      return;
  }
}

function updatePorter(state: GameState, dt: number): void {
  const porter = state.porter;
  if (!porter.enabled) return;

  switch (porter.state) {
    case 'IDLE':
      porter.state = 'FIND_LOOT';
      return;

    case 'FIND_LOOT': {
      if (porter.carried.length > 0) {
        porter.state = 'RETURNING_TO_ELEVATOR';
        return;
      }
      const target = findPorterTarget(state);
      if (!target) return;
      porter.targetLootId = target.id;
      porter.facing = target.x >= porter.x ? 1 : -1;
      porter.state = 'MOVING_TO_LOOT';
      emit(state, 'PORTER_JOB_ASSIGNED', { lootId: target.id, x: target.x, value: target.value });
      return;
    }

    case 'MOVING_TO_LOOT': {
      const target = findPorterTargetById(state);
      if (!target) {
        porter.targetLootId = null;
        porter.state = 'FIND_LOOT';
        return;
      }
      porter.facing = target.x >= porter.x ? 1 : -1;
      if (moveToward(porter, target.x, dt)) {
        porter.state = 'COLLECTING';
        porter.collectTimer = 0;
      }
      return;
    }

    case 'COLLECTING': {
      const target = findPorterTargetById(state);
      if (!target) {
        porter.targetLootId = null;
        porter.state = 'FIND_LOOT';
        return;
      }
      porter.collectTimer += dt;
      if (porter.collectTimer < PORTER_COLLECT_DURATION) return;
      pickUpPorterLoot(state, target);
      porter.collectTimer = 0;
      porter.targetLootId = null;
      if (porter.carried.length > 0) {
        porter.state = 'RETURNING_TO_ELEVATOR';
        porter.facing = PORTER_LOAD_X >= porter.x ? 1 : -1;
      } else {
        porter.state = 'FIND_LOOT';
      }
      return;
    }

    case 'RETURNING_TO_ELEVATOR': {
      porter.facing = PORTER_LOAD_X >= porter.x ? 1 : -1;
      if (moveToward(porter, PORTER_LOAD_X, dt)) beginPorterLoadingOrWait(state);
      return;
    }

    case 'WAITING_FOR_ELEVATOR': {
      if (porter.carried.length === 0) {
        porter.state = 'FIND_LOOT';
        return;
      }
      if (state.elevator.state === 'IDLE_BOTTOM' && canAnyFit(porter.carried, availableElevatorCapacity(state))) {
        beginPorterLoading(state);
      }
      return;
    }

    case 'LOADING': {
      porter.loadingTimer += dt;
      if (porter.loadingTimer < PORTER_LOAD_DURATION) return;
      finishPorterLoading(state);
      return;
    }
  }
}

function updateAutomation(state: GameState): void {
  if (state.automation.autoSwing.unlocked && state.automation.autoSwing.enabled && canStartSwing(state)) {
    const node = findTargetNode(state)!;
    emit(state, 'AUTO_SWING_TRIGGER', { nodeId: node.id });
    beginSwing(state, node);
  }

  if (!state.automation.autoDispatch.unlocked || !state.automation.autoDispatch.enabled) return;
  if (!canDispatchElevator(state)) return;

  const weight = cargoWeight(state.elevator.cargo);
  const full = weight >= state.elevator.maxLoad - 0.01;
  const playerBlocked = state.character.state === 'WAITING_FOR_ELEVATOR'
    && !canAnyFit(state.character.carried, availableElevatorCapacity(state));
  const porterBlocked = state.porter.state === 'WAITING_FOR_ELEVATOR'
    && !canAnyFit(state.porter.carried, availableElevatorCapacity(state));

  if (weight < Math.min(AUTO_DISPATCH_MIN_WEIGHT, state.elevator.maxLoad) && !full && !playerBlocked && !porterBlocked) return;
  emit(state, 'AUTO_DISPATCH_TRIGGER', { weight, threshold: AUTO_DISPATCH_MIN_WEIGHT });
  dispatchElevator(state);
}

function canStartSwing(state: GameState): boolean {
  const character = state.character;
  const node = findTargetNode(state);
  if (character.state !== 'MINING' || character.swing || !node || node.hp <= 0) return false;
  return Math.abs(character.x - nodeDestination(node)) <= 1.5;
}

function beginSwing(state: GameState, node: MiningNode): boolean {
  if (!canStartSwing(state)) return false;
  state.character.swing = { elapsed: 0, hitApplied: false };
  state.character.facing = node.x >= state.character.x ? 1 : -1;
  emit(state, 'MINER_SWING_START', { nodeId: node.id });
  return true;
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
  const range = Math.max(1, node.yieldMax - node.yieldMin + 1);
  const commonCount = node.yieldMin + Math.floor(nextRandom(state) * range);
  const spawned: LootStack[] = [];

  for (let index = 0; index < commonCount; index += 1) {
    const kind = pick(state, node.commonKinds);
    spawned.push(createLoot(state, kind, node.x + (nextRandom(state) - 0.5) * 18, node.y - 4));
  }

  const rareRoll = nextRandom(state);
  const hasRare = rareRoll < node.rareChance;
  emit(state, 'LOOT_ROLL', {
    nodeId: node.id, roll: Number(rareRoll.toFixed(5)), chance: node.rareChance, rare: hasRare,
  });

  if (hasRare) {
    const kind = pick(state, node.rareKinds);
    spawned.push(createLoot(state, kind, node.x + (nextRandom(state) - 0.5) * 14, node.y - 7));
  }

  state.floor.loot.push(...spawned);
  for (const item of spawned) {
    emit(state, 'LOOT_SPAWN', {
      id: item.id, name: item.name, rarity: item.rarity, value: item.value, x: item.x, y: item.y,
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
    .sort((a, b) => Number(b.rarity === 'RARE') - Number(a.rarity === 'RARE') || a.id.localeCompare(b.id));

  for (const item of nearby) {
    if (cargoWeight(character.carried) + item.weight > character.backpackCapacity + 0.001) continue;
    character.carried.push(item);
    removeFloorLoot(state, item.id);
    emit(state, 'LOOT_PICKUP', { id: item.id, name: item.name, weight: item.weight, value: item.value });
  }
}

function findPorterTarget(state: GameState): LootStack | undefined {
  return [...state.floor.loot].sort((a, b) => {
    const distance = Math.abs(a.x - state.porter.x) - Math.abs(b.x - state.porter.x);
    return distance || a.id.localeCompare(b.id);
  })[0];
}

function findPorterTargetById(state: GameState): LootStack | undefined {
  const id = state.porter.targetLootId;
  return id ? state.floor.loot.find((item) => item.id === id) : undefined;
}

function pickUpPorterLoot(state: GameState, target: LootStack): void {
  const porter = state.porter;
  const candidates = [
    target,
    ...state.floor.loot
      .filter((item) => item.id !== target.id && Math.abs(item.x - target.x) <= 16)
      .sort((a, b) => Math.abs(a.x - target.x) - Math.abs(b.x - target.x) || a.id.localeCompare(b.id)),
  ];

  for (const item of candidates) {
    if (!state.floor.loot.some((candidate) => candidate.id === item.id)) continue;
    if (cargoWeight(porter.carried) + item.weight > porter.capacity + 0.001) continue;
    porter.carried.push(item);
    removeFloorLoot(state, item.id);
    emit(state, 'PORTER_PICKUP', { id: item.id, name: item.name, weight: item.weight, value: item.value });
  }
}

function removeFloorLoot(state: GameState, id: string): void {
  const index = state.floor.loot.findIndex((candidate) => candidate.id === id);
  if (index >= 0) state.floor.loot.splice(index, 1);
}

function beginCharacterLoadingOrWait(state: GameState): void {
  if (state.elevator.state === 'IDLE_BOTTOM' && canAnyFit(state.character.carried, availableElevatorCapacity(state))) {
    beginCharacterLoading(state);
  } else {
    state.character.state = 'WAITING_FOR_ELEVATOR';
  }
}

function beginCharacterLoading(state: GameState): void {
  state.character.state = 'LOADING';
  state.character.loadingTimer = 0;
  state.elevator.state = 'LOADING';
  state.elevator.stateTimer = 0;
}

function finishCharacterLoading(state: GameState): void {
  const { deposited, remaining } = depositIntoElevator(state, state.character.carried);
  state.character.carried = remaining;
  state.character.loadingTimer = 0;
  state.elevator.state = 'IDLE_BOTTOM';
  state.elevator.stateTimer = 0;

  if (deposited.length > 0) {
    state.stats.playerDeposits += 1;
    emit(state, 'LOOT_DEPOSIT', {
      carrier: 'PLAYER', items: deposited.length, weight: cargoWeight(deposited), estimatedValue: cargoValue(deposited),
    });
  }

  state.character.state = remaining.length > 0 ? 'WAITING_FOR_ELEVATOR' : 'IDLE';
}

function beginPorterLoadingOrWait(state: GameState): void {
  if (state.elevator.state === 'IDLE_BOTTOM' && canAnyFit(state.porter.carried, availableElevatorCapacity(state))) {
    beginPorterLoading(state);
  } else {
    state.porter.state = 'WAITING_FOR_ELEVATOR';
  }
}

function beginPorterLoading(state: GameState): void {
  state.porter.state = 'LOADING';
  state.porter.loadingTimer = 0;
  state.elevator.state = 'LOADING';
  state.elevator.stateTimer = 0;
}

function finishPorterLoading(state: GameState): void {
  const { deposited, remaining } = depositIntoElevator(state, state.porter.carried);
  state.porter.carried = remaining;
  state.porter.loadingTimer = 0;
  state.elevator.state = 'IDLE_BOTTOM';
  state.elevator.stateTimer = 0;

  if (deposited.length > 0) {
    state.stats.porterDeposits += 1;
    const payload = {
      carrier: 'PORTER', items: deposited.length, weight: cargoWeight(deposited), estimatedValue: cargoValue(deposited),
    };
    emit(state, 'PORTER_DEPOSIT', payload);
    emit(state, 'LOOT_DEPOSIT', payload);
  }

  state.porter.state = remaining.length > 0 ? 'WAITING_FOR_ELEVATOR' : 'FIND_LOOT';
}

function depositIntoElevator(state: GameState, carried: readonly LootStack[]): { deposited: LootStack[]; remaining: LootStack[] } {
  let remainingCapacity = availableElevatorCapacity(state);
  const deposited: LootStack[] = [];
  const remaining: LootStack[] = [];

  for (const item of carried) {
    if (item.weight <= remainingCapacity + 0.001) {
      deposited.push(item);
      remainingCapacity -= item.weight;
    } else {
      remaining.push(item);
    }
  }
  state.elevator.cargo.push(...deposited);
  return { deposited, remaining };
}

function canDispatchElevator(state: GameState): boolean {
  return state.elevator.state === 'IDLE_BOTTOM'
    && state.elevator.cargo.length > 0
    && state.character.state !== 'LOADING'
    && state.porter.state !== 'LOADING';
}

function dispatchElevator(state: GameState): boolean {
  if (!canDispatchElevator(state)) return false;
  state.elevator.state = 'ASCENDING';
  state.elevator.stateTimer = 0;
  emit(state, 'ELEVATOR_DEPART', {
    weight: cargoWeight(state.elevator.cargo), value: cargoValue(state.elevator.cargo),
  });
  return true;
}

function availableElevatorCapacity(state: GameState): number {
  return Math.max(0, state.elevator.maxLoad - cargoWeight(state.elevator.cargo));
}

function canAnyFit(items: readonly LootStack[], capacity: number): boolean {
  return items.some((item) => item.weight <= capacity + 0.001);
}

function moveToward(worker: WorkerBody, destination: number, dt: number): boolean {
  const delta = destination - worker.x;
  const distance = Math.abs(delta);
  if (distance <= 0.5) {
    worker.x = destination;
    return true;
  }
  const step = worker.moveSpeed * dt;
  if (step >= distance) {
    worker.x = destination;
    return true;
  }
  worker.x += Math.sign(delta) * step;
  return false;
}

function nodeDestination(node: MiningNode): number {
  return node.x < WORLD.elevatorX ? node.x + NODE_STOP_DISTANCE : node.x - NODE_STOP_DISTANCE;
}

function findTargetNode(state: GameState): MiningNode | undefined {
  const id = state.character.targetNodeId;
  return id ? state.floor.nodes.find((node) => node.id === id) : undefined;
}

function spendScrap(state: GameState, cost: number): boolean {
  if (state.scrap < cost) return false;
  state.scrap -= cost;
  return true;
}

function emit(state: GameState, type: GameEventType, data?: Record<string, string | number | boolean>): void {
  const event: GameEvent = { id: state.nextEventId++, type, at: state.elapsed, ...(data ? { data } : {}) };
  state.events.push(event);
  state.eventHistory.push(event);
  if (state.eventHistory.length > 100) state.eventHistory.splice(0, state.eventHistory.length - 100);
}
