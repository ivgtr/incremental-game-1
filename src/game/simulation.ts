import {
  ANOMALY_KINDS,
  ANOMALY_POOL,
  AUTO_DISPATCH_MIN_WEIGHT,
  AUTO_SWING_MANUAL_SWINGS_REQUIRED,
  COLLECT_DURATION,
  createD030Nodes,
  D030_EXTENSION_COST,
  FOSSIL_KINDS,
  LOAD_DURATION,
  LOOT,
  PLAYER_PACK_CAPACITY,
  PORTER_COLLECT_DURATION,
  PORTER_LOAD_DURATION,
  RELIC_KINDS,
  SWING,
  UNLOAD_DURATION,
  UPGRADE_COSTS,
  VALUABLE_KINDS,
  WORLD,
} from './config';
import { appraisalMultiplier, getModifiers } from './modifiers';
import { hashSeed, nextRandom, pick } from './rng';
import type {
  AnomalyId,
  GameEvent,
  GameEventType,
  GameState,
  LootCategory,
  LootKind,
  LootStack,
  MiningNode,
  PassiveId,
  Rarity,
  WorkerBody,
} from './types';

const NODE_STOP_DISTANCE = 13;
const PLAYER_LOAD_X = WORLD.elevatorX - 19;
const PORTER_LOAD_X = WORLD.elevatorX + 28;
const RARITY_RANK: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, RELIC: 4, ANOMALY: 5 };

export function updateGame(state: GameState, dt: number): void {
  const step = Math.max(0, Math.min(dt, 0.1));
  state.elapsed += step;
  applyEffectiveParameters(state);
  if (updateDepthTransition(state, step)) return;
  updateNodes(state, step);
  updateElevator(state, step);
  updateCharacter(state, step);
  updatePorter(state, step);
  updateAutomation(state);
}

export function selectNode(state: GameState, nodeId: string): boolean {
  if (state.depth.current === 'D-030' && !state.anomaly.selected) {
    state.selection = { type: 'scanner' };
    return false;
  }
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
export function selectElevator(state: GameState): void { state.selection = { type: 'elevator' }; }
export function selectWorkbench(state: GameState): void { state.selection = { type: 'workbench' }; }
export function selectScanner(state: GameState): void { if (state.depth.current === 'D-030') state.selection = { type: 'scanner' }; }
export function selectArchive(state: GameState): void { if (state.depth.current === 'D-030') state.selection = { type: 'archive' }; }

export function requestMine(state: GameState): boolean {
  if (!canStartSwing(state)) return false;
  const node = findTargetNode(state)!;
  emit(state, 'PLAYER_INPUT_MINE', { nodeId: node.id });
  state.stats.manualSwings += 1;
  return beginSwing(state, node);
}

export function sendElevator(state: GameState): boolean {
  return canDispatchElevator(state) ? dispatchElevator(state) : false;
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
  applyEffectiveParameters(state);
  emit(state, 'EQUIPMENT_CHANGED', { slot: 'BOOTS', name: state.boots.name, level: 2, moveSpeed: state.character.moveSpeed });
  return true;
}

export function unlockAutoSwing(state: GameState): boolean {
  if (state.boots.level !== 2 || state.automation.autoSwing.unlocked
    || state.stats.manualSwings < AUTO_SWING_MANUAL_SWINGS_REQUIRED || !spendScrap(state, UPGRADE_COSTS.autoSwing)) return false;
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
  emit(state, 'EQUIPMENT_CHANGED', { slot: 'PACK', name: state.pack.name, level: 2, capacity: state.character.backpackCapacity });
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
  emit(state, 'AUTOMATION_TOGGLED', { automation: 'AUTO_DISPATCH', enabled: state.automation.autoDispatch.enabled });
  return true;
}

export function canExtendShaft(state: GameState): boolean {
  return state.depth.current === 'D-001'
    && !state.depth.unlockedD030
    && state.automation.autoDispatch.unlocked
    && state.porter.enabled
    && state.scrap >= D030_EXTENSION_COST
    && state.elevator.state === 'IDLE_BOTTOM'
    && state.elevator.cargo.length === 0
    && state.floor.loot.length === 0
    && state.character.carried.length === 0
    && state.porter.carried.length === 0
    && state.character.state !== 'LOADING'
    && state.porter.state !== 'LOADING';
}

export function unlockD030(state: GameState): boolean {
  if (!canExtendShaft(state)) return false;
  state.scrap -= D030_EXTENSION_COST;
  state.depth.unlockedD030 = true;
  state.depth.transitionRemaining = state.depth.transitionDuration;
  state.character.state = 'IDLE';
  state.character.targetNodeId = null;
  state.character.swing = null;
  state.porter.state = state.porter.enabled ? 'FIND_LOOT' : 'IDLE';
  state.selection = null;
  emit(state, 'DEPTH_UNLOCKED', { depth: 'D-030', cost: D030_EXTENSION_COST });
  return true;
}

export function chooseAnomaly(state: GameState, anomaly: AnomalyId): boolean {
  if (state.depth.current !== 'D-030' || state.anomaly.selected || !state.anomaly.options.includes(anomaly)) return false;
  state.anomaly.selected = anomaly;
  applyEffectiveParameters(state);
  state.selection = null;
  emit(state, 'ANOMALY_SELECTED', { anomaly });
  return true;
}

export function togglePassive(state: GameState, passive: PassiveId): boolean {
  if (state.selection?.type !== 'archive' || !state.passives.unlocked.includes(passive)) return false;
  const index = state.passives.active.indexOf(passive);
  if (index >= 0) {
    state.passives.active.splice(index, 1);
    applyEffectiveParameters(state);
    emit(state, 'PASSIVE_EQUIPPED', { passive, enabled: false });
    return true;
  }
  if (state.passives.active.length >= 2) return false;
  state.passives.active.push(passive);
  applyEffectiveParameters(state);
  emit(state, 'PASSIVE_EQUIPPED', { passive, enabled: true });
  return true;
}

export function canMine(state: GameState): boolean { return canStartSwing(state); }
export function cargoWeight(cargo: readonly LootStack[]): number { return cargo.reduce((sum, item) => sum + item.weight, 0); }
export function cargoValue(cargo: readonly LootStack[]): number { return cargo.reduce((sum, item) => sum + item.value, 0); }
export function carriedWeight(state: GameState): number { return cargoWeight(state.character.carried); }
export function porterWeight(state: GameState): number { return cargoWeight(state.porter.carried); }
export function drainEvents(state: GameState): GameEvent[] { return state.events.splice(0, state.events.length); }

export function effectiveTreasureChance(state: GameState, node: MiningNode): number {
  const modifiers = getModifiers(state);
  return Math.min(0.95, node.treasureChance * modifiers.treasureChanceMultiplier);
}

function updateDepthTransition(state: GameState, dt: number): boolean {
  if (state.depth.transitionRemaining <= 0) return false;
  state.depth.transitionRemaining = Math.max(0, state.depth.transitionRemaining - dt);
  if (state.depth.transitionRemaining === 0) enterD030(state);
  return true;
}

function enterD030(state: GameState): void {
  const seed = hashSeed(state.runSeed ^ 0xd030);
  state.depth.current = 'D-030';
  state.floor = { id: 'D-030', seed, nodes: createD030Nodes(), loot: [] };
  state.character.x = WORLD.elevatorX - 20;
  state.character.state = 'IDLE';
  state.character.targetNodeId = null;
  state.character.swing = null;
  state.porter.x = WORLD.elevatorX + 28;
  state.porter.state = state.porter.enabled ? 'FIND_LOOT' : 'IDLE';
  state.porter.targetLootId = null;
  state.elevator.position = 0;
  state.elevator.state = 'IDLE_BOTTOM';
  state.anomaly.options = generateAnomalyOptions(state.runSeed, seed);
  state.anomaly.selected = null;
  state.selection = { type: 'scanner' };
  emit(state, 'DEPTH_ENTERED', { depth: 'D-030', floorSeed: seed });
  emit(state, 'ANOMALY_OPTIONS_GENERATED', {
    a: state.anomaly.options[0] ?? '', b: state.anomaly.options[1] ?? '', c: state.anomaly.options[2] ?? '',
  });
}

function generateAnomalyOptions(runSeed: number, floorSeed: number): AnomalyId[] {
  const pool = [...ANOMALY_POOL];
  let seed = hashSeed(runSeed ^ floorSeed ^ 0xa30a1);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    seed = hashSeed(seed ^ i);
    const j = seed % (i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, 3);
}

function applyEffectiveParameters(state: GameState): void {
  const modifiers = getModifiers(state);
  state.character.moveSpeed = modifiers.playerMoveSpeed;
  state.porter.moveSpeed = modifiers.porterMoveSpeed;
  state.elevator.maxLoad = modifiers.elevatorCapacity;
  state.elevator.moveSpeed = modifiers.elevatorSpeed;
}

function updateNodes(state: GameState, dt: number): void {
  const speed = getModifiers(state).respawnSpeedMultiplier;
  for (const node of state.floor.nodes) {
    if (node.hp > 0 || node.respawnTimer <= 0) continue;
    node.respawnTimer = Math.max(0, node.respawnTimer - dt * speed);
    if (node.respawnTimer === 0) node.hp = node.maxHp;
  }
}

function updateElevator(state: GameState, dt: number): void {
  const elevator = state.elevator;
  elevator.stateTimer += dt;
  if (elevator.state === 'ASCENDING') {
    elevator.position = Math.min(1, elevator.position + elevator.moveSpeed * dt);
    if (elevator.position >= 1) {
      elevator.position = 1; elevator.state = 'UNLOADING'; elevator.stateTimer = 0;
      emit(state, 'ELEVATOR_ARRIVE_SURFACE', { weight: cargoWeight(elevator.cargo), value: cargoValue(elevator.cargo) });
    }
    return;
  }
  if (elevator.state === 'UNLOADING') {
    if (elevator.stateTimer < UNLOAD_DURATION) return;
    appraiseCargo(state, [...elevator.cargo]);
    elevator.cargo = [];
    state.stats.elevatorTrips += 1;
    elevator.state = 'DESCENDING'; elevator.stateTimer = 0;
    return;
  }
  if (elevator.state === 'DESCENDING') {
    elevator.position = Math.max(0, elevator.position - elevator.moveSpeed * dt);
    if (elevator.position <= 0) {
      elevator.position = 0; elevator.state = 'IDLE_BOTTOM'; elevator.stateTimer = 0;
      if (elevator.rhythmBoostTrips > 0) elevator.rhythmBoostTrips -= 1;
      emit(state, 'ELEVATOR_RETURN');
    }
  }
}

function appraiseCargo(state: GameState, cargo: LootStack[]): void {
  let scrapGain = 0;
  for (const item of cargo) {
    emit(state, 'LOOT_APPRAISE', { id: item.id, name: item.name, category: item.category, rarity: item.rarity });
    if (item.category === 'FOSSIL' || item.category === 'RELIC' || item.category === 'ANOMALY') registerCollection(state, item);
    if (item.category === 'RELIC') unlockPassiveFromLoot(state, item.kind);
    scrapGain += Math.round(item.value * appraisalMultiplier(state, item.category));
  }
  if (scrapGain > 0) {
    state.scrap += scrapGain;
    emit(state, 'RESOURCE_GAIN', { resource: 'Scrap', amount: scrapGain, total: state.scrap });
  }
}

function registerCollection(state: GameState, item: LootStack): void {
  const existing = state.collection.entries.find((entry) => entry.kind === item.kind);
  if (existing) {
    existing.count += 1;
    if (!existing.discovered) {
      existing.discovered = true;
      emit(state, 'COLLECTION_REGISTERED', { kind: item.kind, name: item.name, rarity: item.rarity, category: item.category });
    } else {
      emit(state, 'COLLECTION_DUPLICATE', { kind: item.kind, name: item.name, count: existing.count });
    }
    return;
  }
  state.collection.entries.push({ kind: item.kind, name: item.name, rarity: item.rarity, category: item.category, discovered: true, count: 1 });
  emit(state, 'COLLECTION_REGISTERED', { kind: item.kind, name: item.name, rarity: item.rarity, category: item.category });
}

function unlockPassiveFromLoot(state: GameState, kind: LootKind): void {
  const passive = LOOT[kind].passive;
  if (!passive || state.passives.unlocked.includes(passive)) return;
  state.passives.unlocked.push(passive);
  emit(state, 'PASSIVE_UNLOCKED', { passive, source: kind });
  if (state.passives.active.length < 2) {
    state.passives.active.push(passive);
    applyEffectiveParameters(state);
    emit(state, 'PASSIVE_EQUIPPED', { passive, enabled: true, auto: true });
  }
}

function updateCharacter(state: GameState, dt: number): void {
  const character = state.character;
  switch (character.state) {
    case 'MOVING_TO_NODE': {
      const node = findTargetNode(state);
      if (!node || node.hp <= 0) { character.state = 'IDLE'; return; }
      character.facing = node.x >= character.x ? 1 : -1;
      if (moveToward(character, nodeDestination(node), dt)) { character.state = 'MINING'; emit(state, 'MINER_ARRIVE', { nodeId: node.id }); }
      return;
    }
    case 'MINING': {
      const node = findTargetNode(state);
      if (!node) { character.state = 'IDLE'; character.swing = null; return; }
      if (!character.swing) return;
      character.swing.elapsed += dt;
      if (!character.swing.hitApplied && character.swing.elapsed >= SWING.hitAt) {
        character.swing.hitApplied = true; applyMiningHit(state, node);
      }
      if (character.swing.elapsed >= SWING.total) {
        character.swing = null;
        if (node.hp <= 0 && !state.porter.enabled) { character.state = 'COLLECTING'; character.collectTimer = 0; }
      }
      return;
    }
    case 'COLLECTING': {
      character.collectTimer += dt;
      if (character.collectTimer < COLLECT_DURATION) return;
      pickUpNearbyLoot(state); character.collectTimer = 0;
      if (character.carried.length > 0) {
        character.state = 'RETURNING'; character.facing = PLAYER_LOAD_X >= character.x ? 1 : -1;
        emit(state, 'MINER_RETURN', { weight: cargoWeight(character.carried) });
      } else character.state = 'IDLE';
      return;
    }
    case 'RETURNING':
      character.facing = PLAYER_LOAD_X >= character.x ? 1 : -1;
      if (moveToward(character, PLAYER_LOAD_X, dt)) beginCharacterLoadingOrWait(state);
      return;
    case 'WAITING_FOR_ELEVATOR':
      if (character.carried.length === 0) { character.state = 'IDLE'; return; }
      if (state.elevator.state === 'IDLE_BOTTOM' && canAnyFit(character.carried, availableElevatorCapacity(state))) beginCharacterLoading(state);
      return;
    case 'LOADING':
      character.loadingTimer += dt;
      if (character.loadingTimer >= LOAD_DURATION) finishCharacterLoading(state);
      return;
    case 'IDLE': return;
  }
}

function updatePorter(state: GameState, dt: number): void {
  const porter = state.porter;
  if (!porter.enabled) return;
  switch (porter.state) {
    case 'IDLE': porter.state = 'FIND_LOOT'; return;
    case 'FIND_LOOT': {
      if (porter.carried.length > 0) { porter.state = 'RETURNING_TO_ELEVATOR'; return; }
      const target = findPorterTarget(state); if (!target) return;
      porter.targetLootId = target.id; porter.facing = target.x >= porter.x ? 1 : -1; porter.state = 'MOVING_TO_LOOT';
      emit(state, 'PORTER_JOB_ASSIGNED', { lootId: target.id, x: target.x, value: target.value, rarity: target.rarity });
      return;
    }
    case 'MOVING_TO_LOOT': {
      const target = findPorterTargetById(state);
      if (!target) { porter.targetLootId = null; porter.state = 'FIND_LOOT'; return; }
      porter.facing = target.x >= porter.x ? 1 : -1;
      if (moveToward(porter, target.x, dt)) { porter.state = 'COLLECTING'; porter.collectTimer = 0; }
      return;
    }
    case 'COLLECTING': {
      const target = findPorterTargetById(state);
      if (!target) { porter.targetLootId = null; porter.state = 'FIND_LOOT'; return; }
      porter.collectTimer += dt; if (porter.collectTimer < PORTER_COLLECT_DURATION) return;
      pickUpPorterLoot(state, target); porter.collectTimer = 0; porter.targetLootId = null;
      if (porter.carried.length > 0) { porter.state = 'RETURNING_TO_ELEVATOR'; porter.facing = PORTER_LOAD_X >= porter.x ? 1 : -1; }
      else porter.state = 'FIND_LOOT';
      return;
    }
    case 'RETURNING_TO_ELEVATOR':
      porter.facing = PORTER_LOAD_X >= porter.x ? 1 : -1;
      if (moveToward(porter, PORTER_LOAD_X, dt)) beginPorterLoadingOrWait(state);
      return;
    case 'WAITING_FOR_ELEVATOR':
      if (porter.carried.length === 0) { porter.state = 'FIND_LOOT'; return; }
      if (state.elevator.state === 'IDLE_BOTTOM' && canAnyFit(porter.carried, availableElevatorCapacity(state))) beginPorterLoading(state);
      return;
    case 'LOADING':
      porter.loadingTimer += dt;
      if (porter.loadingTimer >= PORTER_LOAD_DURATION) finishPorterLoading(state);
      return;
  }
}

function updateAutomation(state: GameState): void {
  if (state.depth.current === 'D-030' && !state.anomaly.selected) return;
  if (state.automation.autoSwing.unlocked && state.automation.autoSwing.enabled && canStartSwing(state)) {
    const node = findTargetNode(state)!; emit(state, 'AUTO_SWING_TRIGGER', { nodeId: node.id }); beginSwing(state, node);
  }
  if (!state.automation.autoDispatch.unlocked || !state.automation.autoDispatch.enabled || !canDispatchElevator(state)) return;
  const weight = cargoWeight(state.elevator.cargo);
  const full = weight >= state.elevator.maxLoad - 0.01;
  const playerBlocked = state.character.state === 'WAITING_FOR_ELEVATOR' && !canAnyFit(state.character.carried, availableElevatorCapacity(state));
  const porterBlocked = state.porter.state === 'WAITING_FOR_ELEVATOR' && !canAnyFit(state.porter.carried, availableElevatorCapacity(state));
  if (weight < Math.min(AUTO_DISPATCH_MIN_WEIGHT, state.elevator.maxLoad) && !full && !playerBlocked && !porterBlocked) return;
  emit(state, 'AUTO_DISPATCH_TRIGGER', { weight, threshold: AUTO_DISPATCH_MIN_WEIGHT }); dispatchElevator(state);
}

function canStartSwing(state: GameState): boolean {
  const character = state.character; const node = findTargetNode(state);
  if (state.depth.transitionRemaining > 0 || (state.depth.current === 'D-030' && !state.anomaly.selected)) return false;
  if (character.state !== 'MINING' || character.swing || !node || node.hp <= 0) return false;
  return Math.abs(character.x - nodeDestination(node)) <= 1.5;
}

function beginSwing(state: GameState, node: MiningNode): boolean {
  if (!canStartSwing(state)) return false;
  state.character.swing = { elapsed: 0, hitApplied: false }; state.character.facing = node.x >= state.character.x ? 1 : -1;
  emit(state, 'MINER_SWING_START', { nodeId: node.id }); return true;
}

function applyMiningHit(state: GameState, node: MiningNode): void {
  const modifiers = getModifiers(state);
  let damage = state.tool.damage * modifiers.miningDamageMultiplier;
  if (state.passives.active.includes('LAST_SWING') && node.hp / node.maxHp <= 0.1) damage *= 2.6;
  damage = Math.max(1, Math.round(damage));
  emit(state, 'MINER_SWING_HIT', { nodeId: node.id, damage });
  node.hp = Math.max(0, node.hp - damage);
  emit(state, 'NODE_DAMAGE', { nodeId: node.id, hp: node.hp, maxHp: node.maxHp });
  if (node.hp > 0) return;
  node.respawnTimer = node.respawnDelay; emit(state, 'NODE_BREAK', { nodeId: node.id }); spawnLoot(state, node);
}

function spawnLoot(state: GameState, node: MiningNode): void {
  const modifiers = getModifiers(state);
  const baseRange = Math.max(1, node.yieldMax - node.yieldMin + 1);
  const baseCommon = node.yieldMin + Math.floor(nextRandom(state) * baseRange);
  const commonCount = Math.max(1, Math.round(baseCommon * modifiers.commonYieldMultiplier));
  const spawned: LootStack[] = [];
  for (let index = 0; index < commonCount; index += 1) {
    const kind = pick(state, node.commonKinds);
    spawned.push(createLoot(state, kind, node.x + (nextRandom(state) - 0.5) * 18, node.y - 4));
  }

  if (state.depth.current === 'D-030') state.discovery.d030NodeBreaks += 1;
  const chance = effectiveTreasureChance(state, node);
  const roll = nextRandom(state);
  const firstDiscoverySafeguard = state.depth.current === 'D-030' && state.discovery.foundThisRun === 0
    && state.discovery.d030NodeBreaks >= state.discovery.firstDiscoveryBreak;
  const fossilSeen = state.collection.entries.some((entry) => entry.category === 'FOSSIL' && entry.discovered);
  const fossilSafeguard = state.depth.current === 'D-030' && !fossilSeen
    && state.discovery.d030NodeBreaks >= state.discovery.firstFossilBreak;
  const relicSafeguard = state.depth.current === 'D-030' && state.passives.unlocked.length === 0
    && state.discovery.d030NodeBreaks >= state.discovery.firstRelicBreak;
  const safeguard = firstDiscoverySafeguard || fossilSafeguard || relicSafeguard;
  const found = roll < chance || safeguard;
  emit(state, 'TREASURE_ROLL', { nodeId: node.id, roll: Number(roll.toFixed(5)), chance: Number(chance.toFixed(5)), found, safeguard });
  emit(state, 'LOOT_ROLL', { nodeId: node.id, roll: Number(roll.toFixed(5)), chance: Number(chance.toFixed(5)), rare: found });
  if (found) {
    const category = relicSafeguard ? 'RELIC' : fossilSafeguard ? 'FOSSIL' : chooseTreasureCategory(state, node);
    const kind = pickTreasureKind(state, category);
    const treasure = createLoot(state, kind, node.x + (nextRandom(state) - 0.5) * 14, node.y - 7);
    spawned.push(treasure);
    if (state.depth.current === 'D-030') {
      state.discovery.foundThisRun += 1;
      emit(state, 'DISCOVERY_FOUND', { id: treasure.id, name: treasure.name, rarity: treasure.rarity, category: treasure.category, nodeId: node.id });
    }
  }
  state.floor.loot.push(...spawned);
  for (const item of spawned) emit(state, 'LOOT_SPAWN', { id: item.id, name: item.name, rarity: item.rarity, category: item.category, value: item.value, x: item.x, y: item.y });
}

function chooseTreasureCategory(state: GameState, node: MiningNode): LootCategory {
  const modifiers = getModifiers(state);
  const weights: Array<[LootCategory, number]> = [
    ['VALUABLE', node.valuableWeight * modifiers.valuableWeightMultiplier],
    ['FOSSIL', node.fossilWeight * modifiers.fossilWeightMultiplier],
    ['RELIC', node.relicWeight * modifiers.relicWeightMultiplier],
    ['ANOMALY', node.anomalyWeight * modifiers.anomalyWeightMultiplier],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return 'VALUABLE';
  let roll = nextRandom(state) * total;
  for (const [category, weight] of weights) { roll -= weight; if (roll <= 0) return category; }
  return 'VALUABLE';
}

function pickTreasureKind(state: GameState, category: LootCategory): LootKind {
  switch (category) {
    case 'VALUABLE': return pick(state, VALUABLE_KINDS);
    case 'FOSSIL': return pick(state, FOSSIL_KINDS);
    case 'RELIC': return pick(state, RELIC_KINDS);
    case 'ANOMALY': return pick(state, ANOMALY_KINDS);
    case 'ORE': return 'IRON';
  }
}

function createLoot(state: GameState, kind: LootKind, x: number, y: number): LootStack {
  const definition = LOOT[kind];
  return { id: `loot-${state.nextLootId++}`, kind, name: definition.name, rarity: definition.rarity, category: definition.category, weight: definition.weight, value: definition.value, x, y };
}

function pickUpNearbyLoot(state: GameState): void {
  const character = state.character; const node = findTargetNode(state); if (!node) return;
  const nearby = state.floor.loot.filter((item) => Math.abs(item.x - node.x) <= 28)
    .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.id.localeCompare(b.id));
  for (const item of nearby) {
    if (cargoWeight(character.carried) + item.weight > character.backpackCapacity + 0.001) continue;
    character.carried.push(item); removeFloorLoot(state, item.id);
    emit(state, 'LOOT_PICKUP', { id: item.id, name: item.name, weight: item.weight, value: item.value, rarity: item.rarity });
  }
}

function findPorterTarget(state: GameState): LootStack | undefined {
  return [...state.floor.loot].sort((a, b) => {
    const rarity = RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
    if (rarity) return rarity;
    const distance = Math.abs(a.x - state.porter.x) - Math.abs(b.x - state.porter.x);
    return distance || a.id.localeCompare(b.id);
  })[0];
}

function findPorterTargetById(state: GameState): LootStack | undefined {
  const id = state.porter.targetLootId; return id ? state.floor.loot.find((item) => item.id === id) : undefined;
}

function pickUpPorterLoot(state: GameState, target: LootStack): void {
  const porter = state.porter;
  const candidates = [target, ...state.floor.loot.filter((item) => item.id !== target.id && Math.abs(item.x - target.x) <= 16)
    .sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || Math.abs(a.x - target.x) - Math.abs(b.x - target.x) || a.id.localeCompare(b.id))];
  for (const item of candidates) {
    if (!state.floor.loot.some((candidate) => candidate.id === item.id)) continue;
    if (cargoWeight(porter.carried) + item.weight > porter.capacity + 0.001) continue;
    porter.carried.push(item); removeFloorLoot(state, item.id);
    emit(state, 'PORTER_PICKUP', { id: item.id, name: item.name, weight: item.weight, value: item.value, rarity: item.rarity });
  }
}

function removeFloorLoot(state: GameState, id: string): void {
  const index = state.floor.loot.findIndex((candidate) => candidate.id === id); if (index >= 0) state.floor.loot.splice(index, 1);
}

function beginCharacterLoadingOrWait(state: GameState): void {
  if (state.elevator.state === 'IDLE_BOTTOM' && canAnyFit(state.character.carried, availableElevatorCapacity(state))) beginCharacterLoading(state);
  else state.character.state = 'WAITING_FOR_ELEVATOR';
}
function beginCharacterLoading(state: GameState): void {
  state.character.state = 'LOADING'; state.character.loadingTimer = 0; state.elevator.state = 'LOADING'; state.elevator.stateTimer = 0;
}
function finishCharacterLoading(state: GameState): void {
  const { deposited, remaining } = depositIntoElevator(state, state.character.carried);
  state.character.carried = remaining; state.character.loadingTimer = 0; state.elevator.state = 'IDLE_BOTTOM'; state.elevator.stateTimer = 0;
  if (deposited.length > 0) {
    state.stats.playerDeposits += 1;
    emit(state, 'LOOT_DEPOSIT', { carrier: 'PLAYER', items: deposited.length, weight: cargoWeight(deposited), estimatedValue: cargoValue(deposited) });
  }
  state.character.state = remaining.length > 0 ? 'WAITING_FOR_ELEVATOR' : 'IDLE';
}
function beginPorterLoadingOrWait(state: GameState): void {
  if (state.elevator.state === 'IDLE_BOTTOM' && canAnyFit(state.porter.carried, availableElevatorCapacity(state))) beginPorterLoading(state);
  else state.porter.state = 'WAITING_FOR_ELEVATOR';
}
function beginPorterLoading(state: GameState): void {
  state.porter.state = 'LOADING'; state.porter.loadingTimer = 0; state.elevator.state = 'LOADING'; state.elevator.stateTimer = 0;
}
function finishPorterLoading(state: GameState): void {
  const { deposited, remaining } = depositIntoElevator(state, state.porter.carried);
  state.porter.carried = remaining; state.porter.loadingTimer = 0; state.elevator.state = 'IDLE_BOTTOM'; state.elevator.stateTimer = 0;
  if (deposited.length > 0) {
    state.stats.porterDeposits += 1;
    const payload = { carrier: 'PORTER', items: deposited.length, weight: cargoWeight(deposited), estimatedValue: cargoValue(deposited) };
    emit(state, 'PORTER_DEPOSIT', payload); emit(state, 'LOOT_DEPOSIT', payload);
  }
  state.porter.state = remaining.length > 0 ? 'WAITING_FOR_ELEVATOR' : 'FIND_LOOT';
}

function depositIntoElevator(state: GameState, carried: readonly LootStack[]): { deposited: LootStack[]; remaining: LootStack[] } {
  let remainingCapacity = availableElevatorCapacity(state); const deposited: LootStack[] = []; const remaining: LootStack[] = [];
  for (const item of carried) {
    if (item.weight <= remainingCapacity + 0.001) { deposited.push(item); remainingCapacity -= item.weight; }
    else remaining.push(item);
  }
  state.elevator.cargo.push(...deposited); return { deposited, remaining };
}

function canDispatchElevator(state: GameState): boolean {
  return state.elevator.state === 'IDLE_BOTTOM' && state.elevator.cargo.length > 0
    && state.character.state !== 'LOADING' && state.porter.state !== 'LOADING';
}

function dispatchElevator(state: GameState): boolean {
  if (!canDispatchElevator(state)) return false;
  const loadRatio = cargoWeight(state.elevator.cargo) / Math.max(0.01, state.elevator.maxLoad);
  if (state.passives.active.includes('ELEVATOR_RHYTHM') && loadRatio >= 0.85) state.elevator.rhythmBoostTrips = 1;
  applyEffectiveParameters(state);
  state.elevator.state = 'ASCENDING'; state.elevator.stateTimer = 0;
  emit(state, 'ELEVATOR_DEPART', { weight: cargoWeight(state.elevator.cargo), value: cargoValue(state.elevator.cargo), rhythm: state.elevator.rhythmBoostTrips > 0 });
  return true;
}

function availableElevatorCapacity(state: GameState): number { return Math.max(0, state.elevator.maxLoad - cargoWeight(state.elevator.cargo)); }
function canAnyFit(items: readonly LootStack[], capacity: number): boolean { return items.some((item) => item.weight <= capacity + 0.001); }
function moveToward(worker: WorkerBody, destination: number, dt: number): boolean {
  const delta = destination - worker.x; const distance = Math.abs(delta);
  if (distance <= 0.5) { worker.x = destination; return true; }
  const step = worker.moveSpeed * dt;
  if (step >= distance) { worker.x = destination; return true; }
  worker.x += Math.sign(delta) * step; return false;
}
function nodeDestination(node: MiningNode): number { return node.x < WORLD.elevatorX ? node.x + NODE_STOP_DISTANCE : node.x - NODE_STOP_DISTANCE; }
function findTargetNode(state: GameState): MiningNode | undefined {
  const id = state.character.targetNodeId; return id ? state.floor.nodes.find((node) => node.id === id) : undefined;
}
function spendScrap(state: GameState, cost: number): boolean { if (state.scrap < cost) return false; state.scrap -= cost; return true; }
function emit(state: GameState, type: GameEventType, data?: Record<string, string | number | boolean>): void {
  const event: GameEvent = { id: state.nextEventId++, type, at: state.elapsed, ...(data ? { data } : {}) };
  state.events.push(event); state.eventHistory.push(event);
  if (state.eventHistory.length > 160) state.eventHistory.splice(0, state.eventHistory.length - 160);
}
