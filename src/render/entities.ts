import { WORLD } from '../game/config';
import type { GameState, LootKind, MiningNode } from '../game/types';
import { elevatorY } from './environment';
import { PALETTE } from './palette';

export function drawEntities(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  drawNodes(ctx, state);
  drawLoot(ctx, state, now);
  drawWorkbench(ctx, state);
  drawCharacter(ctx, state, now);
  drawElevator(ctx, state, now);
}

function drawNodes(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const node of state.floor.nodes) {
    drawNode(ctx, node, state.selection?.type === 'node' && state.selection.id === node.id);
  }
}

function drawNode(ctx: CanvasRenderingContext2D, node: MiningNode, selected: boolean): void {
  if (node.hp <= 0) {
    ctx.fillStyle = '#443840';
    ctx.fillRect(node.x - 10, node.y - 4, 20, 5);
    ctx.fillRect(node.x - 5, node.y - 8, 4, 4);
    ctx.fillRect(node.x + 5, node.y - 7, 3, 3);
    return;
  }

  const ratio = node.hp / node.maxHp;
  ctx.fillStyle = '#3a3036';
  ctx.fillRect(node.x - 12, node.y - 18, 25, 18);
  ctx.fillStyle = '#51434a';
  ctx.fillRect(node.x - 9, node.y - 21, 9, 4);
  ctx.fillRect(node.x + 4, node.y - 16, 8, 6);

  if (node.id === 'copper-pocket') {
    ctx.fillStyle = PALETTE.copper;
    ctx.fillRect(node.x - 6, node.y - 13, 3, 3);
    ctx.fillRect(node.x + 6, node.y - 9, 2, 3);
  } else if (node.id === 'fossil-crack') {
    ctx.fillStyle = '#aaa07d';
    ctx.fillRect(node.x - 4, node.y - 12, 8, 2);
    ctx.fillRect(node.x, node.y - 15, 2, 7);
  } else {
    ctx.fillStyle = PALETTE.metal;
    ctx.fillRect(node.x - 5, node.y - 11, 3, 2);
    ctx.fillRect(node.x + 4, node.y - 14, 3, 2);
  }

  if (ratio < 0.75) {
    ctx.fillStyle = '#17141a';
    ctx.fillRect(node.x, node.y - 17, 1, 8);
    ctx.fillRect(node.x, node.y - 11, 5, 1);
  }
  if (ratio < 0.4) {
    ctx.fillRect(node.x - 7, node.y - 8, 8, 1);
    ctx.fillRect(node.x - 3, node.y - 13, 1, 6);
  }

  if (selected) {
    ctx.strokeStyle = PALETTE.lamp;
    ctx.lineWidth = 1;
    ctx.strokeRect(node.x - 15.5, node.y - 24.5, 31, 26);
  }
}

function drawLoot(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  for (const item of state.floor.loot) {
    const bob = item.rarity === 'RARE' && Math.floor(now / 180) % 2 === 0 ? -1 : 0;
    ctx.fillStyle = lootColor(item.kind);
    ctx.fillRect(Math.round(item.x) - 2, Math.round(item.y) - 3 + bob, 5, 4);
    if (item.rarity === 'RARE') {
      ctx.fillStyle = PALETTE.rare;
      ctx.fillRect(Math.round(item.x), Math.round(item.y) - 6 + bob, 1, 1);
    }
  }
}

function drawWorkbench(ctx: CanvasRenderingContext2D, state: GameState): void {
  const x = WORLD.workbenchX;
  ctx.fillStyle = PALETTE.timber;
  ctx.fillRect(x - 12, WORLD.floorY - 8, 25, 4);
  ctx.fillRect(x - 9, WORLD.floorY - 4, 3, 8);
  ctx.fillRect(x + 7, WORLD.floorY - 4, 3, 8);
  ctx.fillStyle = state.tool.level === 1 ? PALETTE.rust : PALETTE.steel;
  ctx.fillRect(x - 3, WORLD.floorY - 16, 3, 10);
  ctx.fillRect(x - 7, WORLD.floorY - 17, 11, 2);
  if (state.selection?.type === 'workbench') {
    ctx.strokeStyle = PALETTE.lamp;
    ctx.strokeRect(x - 15.5, WORLD.floorY - 22.5, 31, 28);
  }
}

function drawCharacter(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const character = state.character;
  const walking = character.state === 'MOVING_TO_NODE' || character.state === 'RETURNING';
  const step = walking && Math.floor(now / 120) % 2 === 0 ? 1 : 0;
  const x = Math.round(character.x);
  const y = Math.round(character.y) - step;
  const dir = character.facing;

  ctx.fillStyle = '#6a4935';
  ctx.fillRect(x - 3, y - 7, 7, 7);
  ctx.fillStyle = PALETTE.helmet;
  ctx.fillRect(x - 4, y - 9, 8, 3);
  ctx.fillStyle = PALETTE.worker;
  ctx.fillRect(x - 3, y - 4, 7, 6);
  ctx.fillStyle = '#4a5660';
  ctx.fillRect(x - 3, y + 2, 2, 4 + step);
  ctx.fillRect(x + 2, y + 2, 2, 5 - step);

  if (character.carried.length > 0) {
    ctx.fillStyle = '#685642';
    ctx.fillRect(x - dir * 6 - 3, y - 4, 5, 7);
    ctx.fillStyle = PALETTE.white;
    ctx.fillRect(x - dir * 6 - 2, y - 2, 3, 2);
  }

  drawPickaxe(ctx, state, x, y, dir);
}

function drawPickaxe(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, dir: -1 | 1): void {
  const swing = state.character.swing;
  const metal = state.tool.level === 1 ? PALETTE.rust : PALETTE.steel;
  ctx.strokeStyle = '#805c3d';
  ctx.lineWidth = 1;

  if (!swing) {
    ctx.beginPath();
    ctx.moveTo(x + dir * 3, y - 2);
    ctx.lineTo(x + dir * 9, y - 8);
    ctx.stroke();
    ctx.fillStyle = metal;
    ctx.fillRect(x + dir * 8 - (dir < 0 ? 4 : 0), y - 10, 5, 2);
    return;
  }

  const progress = Math.min(1, swing.elapsed / 0.44);
  const phase = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
  const headX = x + dir * (5 + Math.round(phase * 9));
  const headY = y - 12 + Math.round(phase * 8);
  ctx.beginPath();
  ctx.moveTo(x + dir * 2, y - 3);
  ctx.lineTo(headX, headY);
  ctx.stroke();
  ctx.fillStyle = metal;
  ctx.fillRect(headX - (dir < 0 ? 4 : 0), headY - 1, 5, 2);
}

function drawElevator(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const elevator = state.elevator;
  const y = elevatorY(state);
  ctx.fillStyle = '#22262b';
  ctx.fillRect(WORLD.elevatorX - 20, y - 16, 41, 35);
  ctx.fillStyle = PALETTE.metal;
  ctx.fillRect(WORLD.elevatorX - 20, y - 16, 41, 3);
  ctx.fillRect(WORLD.elevatorX - 20, y + 16, 41, 3);
  ctx.fillRect(WORLD.elevatorX - 20, y - 16, 3, 35);
  ctx.fillRect(WORLD.elevatorX + 18, y - 16, 3, 35);

  const closed = elevator.state === 'ASCENDING' || elevator.state === 'DESCENDING';
  if (closed) {
    ctx.fillStyle = '#3d4448';
    ctx.fillRect(WORLD.elevatorX - 15, y - 11, 15, 25);
    ctx.fillRect(WORLD.elevatorX + 1, y - 11, 15, 25);
    ctx.fillStyle = '#24292d';
    ctx.fillRect(WORLD.elevatorX, y - 11, 1, 25);
  } else {
    const cargoCount = Math.min(6, elevator.cargo.length);
    for (let index = 0; index < cargoCount; index += 1) {
      const row = Math.floor(index / 3);
      const column = index % 3;
      ctx.fillStyle = lootColor(elevator.cargo[index]!.kind);
      ctx.fillRect(WORLD.elevatorX - 12 + column * 9, y + 8 - row * 6, 7, 5);
    }
  }

  const lampOn = elevator.state !== 'IDLE_BOTTOM' || elevator.cargo.length > 0;
  ctx.fillStyle = lampOn ? PALETTE.lamp : '#47413a';
  ctx.fillRect(WORLD.elevatorX + 13, y - 12, 3, 3);

  if (elevator.state === 'IDLE_BOTTOM' && elevator.cargo.length > 0 && Math.floor(now / 500) % 2 === 0) {
    ctx.font = '5px monospace';
    ctx.fillStyle = PALETTE.lamp;
    ctx.textAlign = 'center';
    ctx.fillText('SEND', WORLD.elevatorX, y - 22);
    ctx.textAlign = 'left';
  }

  if (state.selection?.type === 'elevator') {
    ctx.strokeStyle = PALETTE.lamp;
    ctx.strokeRect(WORLD.elevatorX - 23.5, y - 19.5, 47, 41);
  }
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
