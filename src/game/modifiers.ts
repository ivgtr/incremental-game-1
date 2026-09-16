import {
  BASE_ELEVATOR_CAPACITY,
  BASE_ELEVATOR_SPEED,
  PLAYER_MOVE_SPEED,
  PORTER_MOVE_SPEED,
} from './config';
import type { GameState, LootCategory } from './types';

export interface EffectiveModifiers {
  playerMoveSpeed: number;
  porterMoveSpeed: number;
  elevatorCapacity: number;
  elevatorSpeed: number;
  miningDamageMultiplier: number;
  commonYieldMultiplier: number;
  treasureChanceMultiplier: number;
  valuableWeightMultiplier: number;
  fossilWeightMultiplier: number;
  relicWeightMultiplier: number;
  anomalyWeightMultiplier: number;
  researchWeightMultiplier: number;
  respawnSpeedMultiplier: number;
}

export function getModifiers(state: GameState): EffectiveModifiers {
  const run = state.run;
  let playerMoveSpeed = PLAYER_MOVE_SPEED[run.boots.level];
  let porterMoveSpeed = PORTER_MOVE_SPEED;
  let elevatorCapacity = BASE_ELEVATOR_CAPACITY;
  let elevatorSpeed = BASE_ELEVATOR_SPEED;
  let miningDamageMultiplier = 1;
  let commonYieldMultiplier = 1;
  let treasureChanceMultiplier = 1;
  let valuableWeightMultiplier = 1;
  let fossilWeightMultiplier = 1;
  let relicWeightMultiplier = 1;
  let anomalyWeightMultiplier = 1;
  let researchWeightMultiplier = 1;
  let respawnSpeedMultiplier = 1;

  if (state.meta.passives.active.includes('LONG_STRIDE') && run.character.carried.length === 0) playerMoveSpeed *= 1.65;
  if (state.meta.passives.active.includes('FOSSIL_HUNTER')) fossilWeightMultiplier *= 2.35;
  if (run.elevator.rhythmBoostTrips > 0) elevatorSpeed *= 1.65;

  switch (run.anomaly.selected) {
    case 'GOLD_RUSH':
      commonYieldMultiplier *= 0.68;
      valuableWeightMultiplier *= 3.2;
      treasureChanceMultiplier *= 1.15;
      break;
    case 'HEAVY_WORLD':
      playerMoveSpeed *= 0.72;
      porterMoveSpeed *= 0.58;
      break;
    case 'EMPTY_SHAFT':
      elevatorCapacity *= 0.55;
      elevatorSpeed *= 1.9;
      break;
    case 'FOSSIL_AGE':
      fossilWeightMultiplier *= 3.1;
      break;
    case 'LIVING_ROCK':
      respawnSpeedMultiplier *= 3.2;
      break;
    case 'FRAGILE_REALITY':
      miningDamageMultiplier *= 1.8;
      anomalyWeightMultiplier *= 3.8;
      researchWeightMultiplier *= 1.15;
      treasureChanceMultiplier *= 1.2;
      break;
    case null:
      break;
  }

  return {
    playerMoveSpeed,
    porterMoveSpeed,
    elevatorCapacity,
    elevatorSpeed,
    miningDamageMultiplier,
    commonYieldMultiplier,
    treasureChanceMultiplier,
    valuableWeightMultiplier,
    fossilWeightMultiplier,
    relicWeightMultiplier,
    anomalyWeightMultiplier,
    researchWeightMultiplier,
    respawnSpeedMultiplier,
  };
}

export function appraisalMultiplier(state: GameState, category: LootCategory): number {
  let value = state.run.anomaly.selected === 'HEAVY_WORLD' ? 1.55 : 1;
  if (state.run.anomaly.selected === 'FOSSIL_AGE' && category === 'ORE') value *= 0.62;
  if (state.meta.passives.active.includes('FOSSIL_HUNTER') && category === 'ORE') value *= 0.78;
  return value;
}
