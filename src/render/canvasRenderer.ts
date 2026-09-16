import { WORLD } from '../game/config';
import type { GameEvent, GameState } from '../game/types';
import { drawEntities } from './entities';
import { drawEnvironment, elevatorY } from './environment';
import { PALETTE } from './palette';

export type InteractiveTarget =
  | { type: 'node'; id: string }
  | { type: 'elevator' }
  | { type: 'workbench' }
  | null;

type DebrisFx = { x: number; y: number; startedAt: number };
type RareFx = { name: string; startedAt: number };
type GainFx = { amount: number; startedAt: number };

export class CanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private shakeUntil = 0;
  private debris: DebrisFx[] = [];
  private rare: RareFx | null = null;
  private gain: GainFx | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.width = WORLD.width;
    canvas.height = WORLD.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is required.');
    context.imageSmoothingEnabled = false;
    this.ctx = context;
  }

  handleEvent(event: GameEvent, state: GameState, now: number): void {
    if (event.type === 'MINER_SWING_HIT') {
      const node = state.floor.nodes.find((candidate) => candidate.id === event.data?.nodeId);
      if (node) this.debris.push({ x: node.x, y: node.y - 8, startedAt: now });
      this.shakeUntil = Math.max(this.shakeUntil, now + 115);
    }
    if (event.type === 'LOOT_SPAWN' && event.data?.rarity === 'RARE') {
      this.rare = { name: String(event.data.name ?? 'Rare find'), startedAt: now };
    }
    if (event.type === 'RESOURCE_GAIN') {
      this.gain = { amount: Number(event.data?.amount ?? 0), startedAt: now };
    }
  }

  render(state: GameState, now: number): void {
    this.ctx.save();
    const shake = now < this.shakeUntil ? (Math.floor(now / 28) % 2 === 0 ? 1 : -1) : 0;
    this.ctx.translate(shake, 0);
    drawEnvironment(this.ctx, state);
    drawEntities(this.ctx, state, now);
    this.ctx.restore();
    this.drawFx(now);
  }

  pickTarget(clientX: number, clientY: number, state: GameState): InteractiveTarget {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * WORLD.width;
    const y = ((clientY - rect.top) / rect.height) * WORLD.height;

    for (const node of state.floor.nodes) {
      if (Math.hypot(x - node.x, y - (node.y - 9)) <= 22) return { type: 'node', id: node.id };
    }

    const cageY = elevatorY(state);
    if (x >= WORLD.elevatorX - 23 && x <= WORLD.elevatorX + 23 && y >= cageY - 17 && y <= cageY + 19) {
      return { type: 'elevator' };
    }

    if (x >= WORLD.workbenchX - 15 && x <= WORLD.workbenchX + 14 && y >= WORLD.floorY - 25 && y <= WORLD.floorY + 2) {
      return { type: 'workbench' };
    }

    return null;
  }

  private drawFx(now: number): void {
    this.debris = this.debris.filter((fx) => now - fx.startedAt < 260);
    const offsets = [[-8, -4], [-4, -8], [3, -7], [7, -3], [10, -6]] as const;
    for (const fx of this.debris) {
      const age = (now - fx.startedAt) / 260;
      this.ctx.fillStyle = '#8b7770';
      offsets.forEach(([ox, oy], index) => {
        const dx = ox * age;
        const dy = oy * age + 12 * age * age;
        this.ctx.fillRect(Math.round(fx.x + dx), Math.round(fx.y + dy + index % 2), 2, 2);
      });
    }

    if (this.rare && now - this.rare.startedAt < 1450) {
      const age = now - this.rare.startedAt;
      this.ctx.fillStyle = '#111014';
      this.ctx.fillRect(164, 54, 152, 22);
      this.ctx.strokeStyle = PALETTE.rare;
      this.ctx.strokeRect(164.5, 54.5, 151, 21);
      this.ctx.textAlign = 'center';
      this.ctx.font = '6px monospace';
      this.ctx.fillStyle = PALETTE.rare;
      this.ctx.fillText('RARE FIND', 240, 63);
      this.ctx.font = '8px monospace';
      this.ctx.fillStyle = PALETTE.white;
      this.ctx.fillText(this.rare.name.toUpperCase(), 240, 72 - (age < 80 ? 1 : 0));
      this.ctx.textAlign = 'left';
    } else if (this.rare) {
      this.rare = null;
    }

    if (this.gain && now - this.gain.startedAt < 900) {
      const age = (now - this.gain.startedAt) / 900;
      this.ctx.font = '7px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = PALETTE.white;
      this.ctx.fillText(`+${this.gain.amount} SCRAP`, WORLD.elevatorX, 31 - Math.round(age * 5));
      this.ctx.textAlign = 'left';
    } else if (this.gain) {
      this.gain = null;
    }
  }
}
