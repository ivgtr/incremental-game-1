import { WORLD } from '../game/config';
import { currentFloor } from '../game/simulation';
import type { GameEvent, GameState, Rarity } from '../game/types';
import { drawEntities } from './entities';
import { drawEnvironment, elevatorY } from './environment';
import { PALETTE } from './palette';

export type InteractiveTarget =
  | { type: 'node'; id: string }
  | { type: 'elevator' }
  | { type: 'workbench' }
  | { type: 'scanner' }
  | { type: 'archive' }
  | { type: 'research' }
  | { type: 'core-console' }
  | { type: 'core-chamber' }
  | null;

type DebrisFx = { x: number; y: number; startedAt: number };
type BannerFx = { label: string; sub: string; rarity: Rarity; startedAt: number };
type GainFx = { label: string; startedAt: number };

export class CanvasRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private shakeUntil = 0;
  private debris: DebrisFx[] = [];
  private banner: BannerFx | null = null;
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
      const node = currentFloor(state).nodes.find((candidate) => candidate.id === event.data?.nodeId);
      if (node) this.debris.push({ x: node.x, y: node.y - 8, startedAt: now });
      this.shakeUntil = Math.max(this.shakeUntil, now + 110);
    }
    if (event.type === 'DISCOVERY_FOUND') {
      this.banner = {
        label: String(event.data?.name ?? 'Unknown find'),
        sub: `${String(event.data?.rarity ?? 'RARE')} · ${String(event.data?.category ?? '')}`,
        rarity: String(event.data?.rarity ?? 'RARE') as Rarity,
        startedAt: now,
      };
    }
    if (event.type === 'RESEARCH_COMPLETED') this.gain = { label: `RESEARCH COMPLETE · ${String(event.data?.research ?? '')}`, startedAt: now };
    if (event.type === 'CORE_CHARGE_GAINED') this.gain = { label: `CORE CHARGE +${Number(event.data?.amount ?? 0)}`, startedAt: now };
    if (event.type === 'DATA_GAIN') this.gain = { label: `DATA +${Number(event.data?.amount ?? 0)}`, startedAt: now };
    if (event.type === 'CORE_GAINED') this.gain = { label: `CORE +${Number(event.data?.amount ?? 0)}`, startedAt: now };
  }

  render(state: GameState, now: number): void {
    this.ctx.save();
    const shake = now < this.shakeUntil ? (Math.floor(now / 28) % 2 === 0 ? 1 : -1) : 0;
    this.ctx.translate(shake, 0);
    drawEnvironment(this.ctx, state);
    drawEntities(this.ctx, state, now);
    this.ctx.restore();
    if (state.run.elevator.travel) this.drawTravel(state);
    this.drawFx(now);
  }

  pickTarget(clientX: number, clientY: number, state: GameState): InteractiveTarget {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * WORLD.width;
    const y = ((clientY - rect.top) / rect.height) * WORLD.height;
    if (state.run.depth.unlocked.includes('D-060') && x >= 102 && x <= 160 && y >= 7 && y <= 34) return { type: 'research' };
    if (state.run.depth.unlocked.includes('D-030') && x >= 315 && x <= 369 && y >= 7 && y <= 34) return { type: 'archive' };
    if ((state.meta.runIndex > 1 || state.meta.core > 0 || state.meta.protocols.length > 0) && x >= 382 && x <= 458 && y >= 7 && y <= 34) return { type: 'core-console' };
    if (state.run.depth.current === 'D-030' && x >= 270 && x <= 294 && y >= 180 && y <= 212) return { type: 'scanner' };
    if (state.run.depth.current === 'D-100' && x >= 372 && x <= 390 && y >= 148 && y <= 171) return { type: 'core-chamber' };
    for (const node of currentFloor(state).nodes) {
      if (Math.hypot(x - node.x, y - (node.y - 9)) <= 22) return { type: 'node', id: node.id };
    }
    const overLiftControl = x >= WORLD.elevatorX + 24 && x <= WORLD.elevatorX + 34 && y >= WORLD.floorY - 21 && y <= WORLD.floorY - 4;
    if (overLiftControl) return { type: 'elevator' };
    const cageY = elevatorY(state);
    if (x >= WORLD.elevatorX - 25 && x <= WORLD.elevatorX + 25 && y >= cageY - 17 && y <= cageY + 19) return { type: 'elevator' };
    if (x >= WORLD.workbenchX - 15 && x <= WORLD.workbenchX + 14 && y >= WORLD.floorY - 25 && y <= WORLD.floorY + 2) return { type: 'workbench' };
    return null;
  }

  private drawTravel(state: GameState): void {
    const travel = state.run.elevator.travel;
    if (!travel) return;
    const progress = 1 - travel.remaining / travel.duration;
    this.ctx.fillStyle = '#08090bdd';
    this.ctx.fillRect(0, 38, WORLD.width, WORLD.height - 38);
    this.ctx.fillStyle = '#171c1f';
    for (let y = -20; y < WORLD.height + 30; y += 28) {
      const offset = Math.round(progress * 28);
      this.ctx.fillRect(0, y + offset, WORLD.width, 8);
    }
    this.ctx.textAlign = 'center';
    this.ctx.font = '8px monospace';
    this.ctx.fillStyle = PALETTE.white;
    this.ctx.fillText(travel.viaSurface ? 'SURFACE RELAY' : 'ELEVATOR TRAVEL', WORLD.width / 2, 124);
    this.ctx.font = '6px monospace';
    this.ctx.fillStyle = PALETTE.d060Lamp;
    this.ctx.fillText(`${travel.from} → ${travel.to}`, WORLD.width / 2, 137);
    this.ctx.textAlign = 'left';
  }

  private drawFx(now: number): void {
    this.debris = this.debris.filter((fx) => now - fx.startedAt < 260);
    const offsets = [[-8, -4], [-4, -8], [3, -7], [7, -3], [10, -6]] as const;
    for (const fx of this.debris) {
      const age = (now - fx.startedAt) / 260;
      this.ctx.fillStyle = '#8b7770';
      offsets.forEach(([ox, oy], index) => {
        const dx = ox * age; const dy = oy * age + 12 * age * age;
        this.ctx.fillRect(Math.round(fx.x + dx), Math.round(fx.y + dy + index % 2), 2, 2);
      });
    }
    if (this.banner && now - this.banner.startedAt < 1200) {
      this.ctx.fillStyle = '#111014'; this.ctx.fillRect(157, 53, 166, 23);
      this.ctx.strokeStyle = rarityColor(this.banner.rarity); this.ctx.strokeRect(157.5, 53.5, 165, 22);
      this.ctx.textAlign = 'center'; this.ctx.font = '5px monospace'; this.ctx.fillStyle = rarityColor(this.banner.rarity); this.ctx.fillText(this.banner.sub.toUpperCase(), 240, 62);
      this.ctx.font = '8px monospace'; this.ctx.fillStyle = PALETTE.white; this.ctx.fillText(this.banner.label.toUpperCase(), 240, 72); this.ctx.textAlign = 'left';
    } else if (this.banner) this.banner = null;
    if (this.gain && now - this.gain.startedAt < 1200) {
      this.ctx.fillStyle = '#101214e8'; this.ctx.fillRect(147, 9, 186, 16);
      this.ctx.font = '5px monospace'; this.ctx.fillStyle = PALETTE.d060Lamp; this.ctx.textAlign = 'center'; this.ctx.fillText(this.gain.label, 240, 19); this.ctx.textAlign = 'left';
    } else if (this.gain) this.gain = null;
  }
}

function rarityColor(rarity: Rarity): string {
  switch (rarity) {
    case 'ANOMALY': return '#a392aa';
    case 'RELIC': return '#c6a36b';
    case 'EPIC': return '#a991bc';
    case 'RARE': return PALETTE.rare;
    default: return PALETTE.white;
  }
}
