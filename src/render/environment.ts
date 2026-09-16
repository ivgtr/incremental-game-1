import { WORLD } from '../game/config';
import type { GameState } from '../game/types';
import { PALETTE } from './palette';

export function drawEnvironment(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = PALETTE.void;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  drawRock(ctx);
  drawSurfaceStation(ctx);
  drawShaft(ctx, state);
  drawTunnel(ctx);
}

function drawRock(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PALETTE.rock0;
  ctx.fillRect(0, 38, WORLD.width, WORLD.height - 38);

  ctx.fillStyle = PALETTE.rock1;
  const blocks = [
    [4, 48, 45, 10], [66, 42, 61, 8], [143, 51, 52, 10], [279, 43, 54, 9], [351, 50, 70, 10], [440, 42, 35, 8],
    [11, 74, 58, 8], [91, 68, 42, 10], [151, 79, 52, 8], [282, 75, 67, 9], [372, 69, 39, 9], [430, 81, 44, 7],
    [3, 104, 37, 9], [54, 99, 77, 11], [150, 109, 55, 8], [279, 103, 51, 10], [346, 110, 71, 8], [437, 100, 37, 11],
    [13, 138, 69, 9], [98, 131, 36, 7], [149, 145, 54, 10], [278, 137, 66, 9], [362, 146, 50, 8], [428, 134, 47, 10],
    [4, 171, 53, 8], [76, 163, 63, 10], [151, 177, 53, 8], [278, 169, 49, 10], [344, 178, 78, 8], [440, 164, 34, 9],
    [9, 231, 63, 10], [91, 239, 51, 9], [159, 229, 47, 10], [276, 237, 58, 9], [353, 228, 62, 10], [437, 240, 39, 8],
  ] as const;
  for (const [x, y, width, height] of blocks) ctx.fillRect(x, y, width, height);

  ctx.fillStyle = PALETTE.rock2;
  for (let x = 18; x < WORLD.width; x += 43) {
    ctx.fillRect(x, 58 + ((x / 43) % 4) * 27, 2, 2);
    ctx.fillRect(x + 12, 126 + ((x / 43) % 3) * 25, 3, 2);
  }

  ctx.fillStyle = PALETTE.cyan;
  ctx.fillRect(31, 154, 2, 5);
  ctx.fillRect(35, 151, 2, 8);
  ctx.fillRect(458, 117, 2, 6);
  ctx.fillRect(454, 120, 2, 4);
  ctx.fillStyle = PALETTE.violet;
  ctx.fillRect(18, 119, 2, 5);
  ctx.fillRect(461, 181, 3, 5);
}

function drawSurfaceStation(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#17121b';
  ctx.fillRect(0, 0, WORLD.width, 38);
  ctx.fillStyle = PALETTE.metalDark;
  ctx.fillRect(199, 4, 82, 34);
  ctx.fillStyle = PALETTE.metal;
  ctx.fillRect(204, 8, 72, 3);
  ctx.fillRect(204, 30, 72, 3);
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.white;
  ctx.fillText('LOOP SHAFT', WORLD.elevatorX, 20);
  ctx.font = '5px monospace';
  ctx.fillStyle = PALETTE.lamp;
  ctx.fillText('SURFACE EXCHANGE', WORLD.elevatorX, 27);
  ctx.textAlign = 'left';
}

function drawShaft(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#09090d';
  ctx.fillRect(216, 38, 49, 196);
  ctx.fillStyle = PALETTE.metalDark;
  ctx.fillRect(216, 38, 3, 196);
  ctx.fillRect(262, 38, 3, 196);
  ctx.fillStyle = PALETTE.rail;
  ctx.fillRect(225, 38, 2, 196);
  ctx.fillRect(253, 38, 2, 196);
  ctx.fillStyle = '#77706c';
  ctx.fillRect(239, 36, 2, Math.max(2, elevatorY(state) - 16));

  ctx.fillStyle = PALETTE.metalDark;
  for (let y = 52; y < 226; y += 18) {
    ctx.fillRect(219, y, 6, 2);
    ctx.fillRect(255, y, 6, 2);
  }
}

function drawTunnel(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#0d0c11';
  ctx.fillRect(22, 183, 194, 45);
  ctx.fillRect(265, 183, 193, 45);
  ctx.fillStyle = PALETTE.timber;
  for (const x of [37, 119, 176, 302, 374, 444]) {
    ctx.fillRect(x, 180, 4, 35);
    ctx.fillRect(x - 5, 181, 14, 3);
  }
  ctx.fillStyle = PALETTE.rail;
  ctx.fillRect(18, WORLD.floorY + 4, 198, 2);
  ctx.fillRect(265, WORLD.floorY + 4, 199, 2);
  ctx.fillStyle = PALETTE.rock2;
  ctx.fillRect(0, WORLD.floorY + 7, WORLD.width, 63);

  for (const x of [52, 157, 323, 405]) drawLamp(ctx, x, 187);
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = PALETTE.lampDim;
  ctx.fillRect(x - 2, y - 2, 5, 5);
  ctx.fillStyle = PALETTE.lamp;
  ctx.fillRect(x, y, 2, 2);
}

export function elevatorY(state: GameState): number {
  return WORLD.elevatorBottomY + (WORLD.topY - WORLD.elevatorBottomY) * state.elevator.position;
}
