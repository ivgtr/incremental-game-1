import { WORLD } from '../game/config';
import type { GameState, LootKind, MiningNode } from '../game/types';
import { elevatorY } from './environment';
import { PALETTE } from './palette';

export function drawEntities(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  drawNodes(ctx, state);
  drawLoot(ctx, state, now);
  drawWorkbench(ctx, state);
  if (state.porter.enabled) drawPorter(ctx, state, now);
  drawCharacter(ctx, state, now);
  drawElevator(ctx, state, now);
  drawLiftControl(ctx, state);
}

function drawNodes(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const node of state.floor.nodes) drawNode(ctx, node, state.selection?.type === 'node' && state.selection.id === node.id);
}

function drawNode(ctx: CanvasRenderingContext2D, node: MiningNode, selected: boolean): void {
  if (node.hp <= 0) {
    ctx.fillStyle = '#443840'; ctx.fillRect(node.x - 10, node.y - 4, 20, 5); ctx.fillRect(node.x - 5, node.y - 8, 4, 4); ctx.fillRect(node.x + 5, node.y - 7, 3, 3);
    return;
  }
  const ratio = node.hp / node.maxHp;
  ctx.fillStyle = '#3a3036'; ctx.fillRect(node.x - 12, node.y - 18, 25, 18);
  ctx.fillStyle = '#51434a'; ctx.fillRect(node.x - 9, node.y - 21, 9, 4); ctx.fillRect(node.x + 4, node.y - 16, 8, 6);
  if (node.id === 'copper-pocket') {
    ctx.fillStyle = PALETTE.copper; ctx.fillRect(node.x - 6, node.y - 13, 3, 3); ctx.fillRect(node.x + 6, node.y - 9, 2, 3);
  } else if (node.id === 'fossil-crack') {
    ctx.fillStyle = '#aaa07d'; ctx.fillRect(node.x - 4, node.y - 12, 8, 2); ctx.fillRect(node.x, node.y - 15, 2, 7);
  } else {
    ctx.fillStyle = PALETTE.metal; ctx.fillRect(node.x - 5, node.y - 11, 3, 2); ctx.fillRect(node.x + 4, node.y - 14, 3, 2);
  }
  if (ratio < 0.75) { ctx.fillStyle = '#17141a'; ctx.fillRect(node.x, node.y - 17, 1, 8); ctx.fillRect(node.x, node.y - 11, 5, 1); }
  if (ratio < 0.4) { ctx.fillRect(node.x - 7, node.y - 8, 8, 1); ctx.fillRect(node.x - 3, node.y - 13, 1, 6); }
  if (selected) { ctx.strokeStyle = PALETTE.lamp; ctx.lineWidth = 1; ctx.strokeRect(node.x - 15.5, node.y - 24.5, 31, 26); }
}

function drawLoot(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  for (const item of state.floor.loot) {
    const bob = item.rarity === 'RARE' && Math.floor(now / 180) % 2 === 0 ? -1 : 0;
    ctx.fillStyle = lootColor(item.kind); ctx.fillRect(Math.round(item.x) - 2, Math.round(item.y) - 3 + bob, 5, 4);
    if (item.rarity === 'RARE') { ctx.fillStyle = PALETTE.rare; ctx.fillRect(Math.round(item.x), Math.round(item.y) - 6 + bob, 1, 1); }
  }
}

function drawWorkbench(ctx: CanvasRenderingContext2D, state: GameState): void {
  const x = WORLD.workbenchX;
  ctx.fillStyle = PALETTE.timber; ctx.fillRect(x - 12, WORLD.floorY - 8, 25, 4); ctx.fillRect(x - 9, WORLD.floorY - 4, 3, 8); ctx.fillRect(x + 7, WORLD.floorY - 4, 3, 8);
  ctx.fillStyle = state.tool.level === 1 ? PALETTE.rust : PALETTE.steel;
  ctx.fillRect(x - 1, WORLD.floorY - 18, 2, 11); ctx.fillRect(x - 5, WORLD.floorY - 19, 9, 2);
  ctx.fillStyle = state.boots.level === 1 ? '#51463d' : PALETTE.steel;
  ctx.fillRect(x - 11, WORLD.floorY - 13, 4, 4); ctx.fillRect(x - 6, WORLD.floorY - 13, 4, 4);
  ctx.fillStyle = state.pack.level === 1 ? '#685642' : '#846c47';
  const packW = state.pack.level === 1 ? 5 : 7; const packH = state.pack.level === 1 ? 6 : 8;
  ctx.fillRect(x + 6, WORLD.floorY - 12 - (packH - 6), packW, packH);
  if (state.automation.autoSwing.unlocked) { ctx.fillStyle = state.automation.autoSwing.enabled ? PALETTE.cyan : '#3f5355'; ctx.fillRect(x + 2, WORLD.floorY - 22, 3, 3); }
  if (state.selection?.type === 'workbench') { ctx.strokeStyle = PALETTE.lamp; ctx.strokeRect(x - 15.5, WORLD.floorY - 25.5, 31, 31); }
}

function drawCharacter(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const character = state.character;
  const walking = character.state === 'MOVING_TO_NODE' || character.state === 'RETURNING';
  const step = walking && Math.floor(now / 120) % 2 === 0 ? 1 : 0;
  const x = Math.round(character.x); const y = Math.round(character.y) - step; const dir = character.facing;
  ctx.fillStyle = '#6a4935'; ctx.fillRect(x - 3, y - 7, 7, 7);
  ctx.fillStyle = PALETTE.helmet; ctx.fillRect(x - 4, y - 9, 8, 3);
  ctx.fillStyle = PALETTE.worker; ctx.fillRect(x - 3, y - 4, 7, 6);
  ctx.fillStyle = state.boots.level === 1 ? '#4a5660' : '#87979d';
  ctx.fillRect(x - 3, y + 2, 2, 4 + step); ctx.fillRect(x + 2, y + 2, 2, 5 - step);

  if (character.carried.length > 0 || state.pack.level === 2) {
    const packW = state.pack.level === 1 ? 5 : 7; const packH = state.pack.level === 1 ? 7 : 9;
    ctx.fillStyle = state.pack.level === 1 ? '#685642' : '#846c47';
    ctx.fillRect(x - dir * (state.pack.level === 1 ? 6 : 7) - (dir > 0 ? packW : 0), y - 5, packW, packH);
    if (character.carried.length > 0) { ctx.fillStyle = PALETTE.white; ctx.fillRect(x - dir * 6 - 2, y - 2, 3, 2); }
  }
  drawPickaxe(ctx, state, x, y, dir);
}

function drawPorter(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const porter = state.porter;
  const walking = porter.state === 'MOVING_TO_LOOT' || porter.state === 'RETURNING_TO_ELEVATOR';
  const step = walking && Math.floor(now / 135) % 2 === 0 ? 1 : 0;
  const x = Math.round(porter.x); const y = Math.round(porter.y) - step; const dir = porter.facing;
  ctx.fillStyle = '#5b4537'; ctx.fillRect(x - 3, y - 7, 7, 7);
  ctx.fillStyle = PALETTE.cyan; ctx.fillRect(x - 4, y - 9, 8, 3);
  ctx.fillStyle = '#8f8b72'; ctx.fillRect(x - 3, y - 4, 7, 6);
  ctx.fillStyle = '#46535a'; ctx.fillRect(x - 3, y + 2, 2, 4 + step); ctx.fillRect(x + 2, y + 2, 2, 5 - step);
  if (porter.carried.length > 0) {
    ctx.fillStyle = '#705a3d'; ctx.fillRect(x - dir * 7 - (dir > 0 ? 6 : 0), y - 5, 6, 8);
    ctx.fillStyle = PALETTE.cyan; ctx.fillRect(x - dir * 7 - (dir > 0 ? 5 : -1), y - 3, 2, 2);
  }
  if (porter.state === 'WAITING_FOR_ELEVATOR') {
    ctx.fillStyle = Math.floor(now / 420) % 2 === 0 ? PALETTE.lamp : PALETTE.lampDim;
    ctx.fillRect(x - 1, y - 14, 2, 2);
  }
}

function drawPickaxe(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, dir: -1 | 1): void {
  const swing = state.character.swing; const metal = state.tool.level === 1 ? PALETTE.rust : PALETTE.steel;
  ctx.strokeStyle = '#805c3d'; ctx.lineWidth = 1;
  if (!swing) {
    ctx.beginPath(); ctx.moveTo(x + dir * 3, y - 2); ctx.lineTo(x + dir * 9, y - 8); ctx.stroke();
    ctx.fillStyle = metal; ctx.fillRect(x + dir * 8 - (dir < 0 ? 4 : 0), y - 10, 5, 2);
    if (state.automation.autoSwing.enabled) { ctx.fillStyle = PALETTE.cyan; ctx.fillRect(x + dir * 3, y - 5, 2, 2); }
    return;
  }
  const progress = Math.min(1, swing.elapsed / 0.44); const phase = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
  const headX = x + dir * (5 + Math.round(phase * 9)); const headY = y - 12 + Math.round(phase * 8);
  ctx.beginPath(); ctx.moveTo(x + dir * 2, y - 3); ctx.lineTo(headX, headY); ctx.stroke();
  ctx.fillStyle = metal; ctx.fillRect(headX - (dir < 0 ? 4 : 0), headY - 1, 5, 2);
}

function drawElevator(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const elevator = state.elevator; const y = elevatorY(state);
  ctx.fillStyle = '#22262b'; ctx.fillRect(WORLD.elevatorX - 20, y - 16, 41, 35);
  ctx.fillStyle = PALETTE.metal; ctx.fillRect(WORLD.elevatorX - 20, y - 16, 41, 3); ctx.fillRect(WORLD.elevatorX - 20, y + 16, 41, 3); ctx.fillRect(WORLD.elevatorX - 20, y - 16, 3, 35); ctx.fillRect(WORLD.elevatorX + 18, y - 16, 3, 35);
  const closed = elevator.state === 'ASCENDING' || elevator.state === 'DESCENDING';
  if (closed) {
    ctx.fillStyle = '#3d4448'; ctx.fillRect(WORLD.elevatorX - 15, y - 11, 15, 25); ctx.fillRect(WORLD.elevatorX + 1, y - 11, 15, 25);
    ctx.fillStyle = '#24292d'; ctx.fillRect(WORLD.elevatorX, y - 11, 1, 25);
  } else {
    const cargoCount = Math.min(9, elevator.cargo.length);
    for (let index = 0; index < cargoCount; index += 1) {
      const row = Math.floor(index / 3); const column = index % 3;
      ctx.fillStyle = lootColor(elevator.cargo[index]!.kind); ctx.fillRect(WORLD.elevatorX - 12 + column * 9, y + 8 - row * 6, 7, 5);
    }
  }
  const lampOn = elevator.state !== 'IDLE_BOTTOM' || elevator.cargo.length > 0;
  ctx.fillStyle = lampOn ? PALETTE.lamp : '#47413a'; ctx.fillRect(WORLD.elevatorX + 13, y - 12, 3, 3);
  if (elevator.state === 'IDLE_BOTTOM' && elevator.cargo.length > 0 && !state.automation.autoDispatch.enabled && Math.floor(now / 500) % 2 === 0) {
    ctx.font = '5px monospace'; ctx.fillStyle = PALETTE.lamp; ctx.textAlign = 'center'; ctx.fillText('SEND', WORLD.elevatorX, y - 22); ctx.textAlign = 'left';
  }
  if (state.selection?.type === 'elevator') { ctx.strokeStyle = PALETTE.lamp; ctx.strokeRect(WORLD.elevatorX - 23.5, y - 19.5, 56, 42); }
}

function drawLiftControl(ctx: CanvasRenderingContext2D, state: GameState): void {
  const x = WORLD.elevatorX + 25; const y = WORLD.floorY - 18;
  ctx.fillStyle = '#24272a'; ctx.fillRect(x, y, 8, 12);
  ctx.fillStyle = state.automation.autoDispatch.enabled ? PALETTE.cyan : state.automation.autoDispatch.unlocked ? PALETTE.lampDim : '#3c3b3b';
  ctx.fillRect(x + 3, y + 2, 2, 2);
  ctx.fillStyle = PALETTE.metal; ctx.fillRect(x + 2, y + 7, 4, 2);
}

export function lootColor(kind: LootKind): string {
  switch (kind) {
    case 'STONE': return '#777078';
    case 'IRON': return '#9aa0a2';
    case 'COPPER': return PALETTE.copper;
    case 'GOLD_NUGGET': return '#d2ad45';
    case 'FOSSIL': return '#c4b68a';
    case 'OLD_COIN': return '#bd9652';
  }
}
