import './style.css';
import { GameAudio } from './game/audio';
import { STEEL_PICKAXE_COST } from './game/config';
import { createGameState } from './game/createGame';
import { loadFromStorage, saveToStorage } from './game/save';
import {
  canMine,
  cargoValue,
  cargoWeight,
  carriedWeight,
  drainEvents,
  moveToSelectedNode,
  requestMine,
  selectElevator,
  selectNode,
  selectWorkbench,
  sendElevator,
  updateGame,
  upgradeTool,
} from './game/simulation';
import type { GameState, MiningNode } from './game/types';
import { CanvasRenderer } from './render/canvasRenderer';

const FIXED_STEP = 1 / 60;
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

root.innerHTML = `
  <div class="game-root">
    <div>
      <div class="game-shell">
        <canvas class="game-canvas" aria-label="LOOP SHAFT mining floor D-001" tabindex="0"></canvas>
        <div class="hud hud-left" id="hud-left"></div>
        <div class="hud hud-right" id="hud-right"></div>
      </div>
      <section class="context-strip" id="context" aria-live="polite"></section>
      <div class="help-line">
        <span>Click a vein to walk · click again or press <kbd>Space</kbd> to swing</span>
        <span>Ore becomes Scrap only after the lift unloads at the surface.</span>
      </div>
    </div>
  </div>
`;

const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
const hudLeft = root.querySelector<HTMLDivElement>('#hud-left')!;
const hudRight = root.querySelector<HTMLDivElement>('#hud-right')!;
const context = root.querySelector<HTMLElement>('#context')!;

const uiHtml = new WeakMap<HTMLElement, string>();
let state: GameState = loadFromStorage() ?? createGameState();
const renderer = new CanvasRenderer(canvas);
const audio = new GameAudio();
let accumulator = 0;
let saveTimer = 0;
let previous = performance.now();

function unlockAudio(): void { audio.unlock(); }
canvas.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio, { once: true });

canvas.addEventListener('click', (event) => {
  const target = renderer.pickTarget(event.clientX, event.clientY, state);
  if (!target) return;

  if (target.type === 'node') {
    const isCurrent = state.character.targetNodeId === target.id;
    if (isCurrent && canMine(state)) requestMine(state);
    else selectNode(state, target.id);
  } else if (target.type === 'elevator') {
    selectElevator(state);
  } else {
    selectWorkbench(state);
  }
  canvas.focus({ preventScroll: true });
  renderDom();
});

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  event.preventDefault();
  requestMine(state);
});

context.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  if (!button) return;
  unlockAudio();
  switch (button.dataset.action) {
    case 'move': moveToSelectedNode(state); break;
    case 'mine': requestMine(state); break;
    case 'send': sendElevator(state); break;
    case 'upgrade': upgradeTool(state); break;
  }
  renderDom();
});

window.addEventListener('beforeunload', () => saveToStorage(state));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveToStorage(state);
});

function frame(now: number): void {
  const delta = Math.min(0.25, (now - previous) / 1000);
  previous = now;
  accumulator += delta;
  saveTimer += delta;

  while (accumulator >= FIXED_STEP) {
    updateGame(state, FIXED_STEP);
    accumulator -= FIXED_STEP;
  }

  const events = drainEvents(state);
  for (const event of events) {
    renderer.handleEvent(event, state, now);
    audio.handle(event);
  }

  if (saveTimer >= 5) {
    saveToStorage(state);
    saveTimer = 0;
  }

  renderer.render(state, now);
  renderDom();
  requestAnimationFrame(frame);
}

function renderDom(): void {
  setHtml(hudLeft, `
    <strong>SCRAP ${state.scrap}</strong><br>
    <span class="muted">CARRY</span> ${fmt(carriedWeight(state))}/${fmt(state.character.backpackCapacity)}kg<br>
    <span class="muted">LIFT</span> ${fmt(cargoWeight(state.elevator.cargo))}/${fmt(state.elevator.maxLoad)}kg
  `);
  setHtml(hudRight, `
    <strong>D-001</strong><br>
    <span class="muted">RUN</span> ${state.runSeed.toString(16).toUpperCase().padStart(8, '0')}<br>
    <span class="muted">TOOL</span> ${state.tool.name}
  `);

  if (state.selection?.type === 'node') {
    const selectedId = state.selection.id;
    const node = state.floor.nodes.find((candidate) => candidate.id === selectedId);
    if (node) renderNodeContext(node);
    return;
  }

  if (state.selection?.type === 'elevator') {
    const weight = cargoWeight(state.elevator.cargo);
    const value = cargoValue(state.elevator.cargo);
    const canSend = state.elevator.state === 'IDLE_BOTTOM' && weight > 0 && state.character.state !== 'LOADING';
    setHtml(context, contextMarkup(
      'Central Elevator · Mk.I',
      `CARGO ${fmt(weight)} / ${fmt(state.elevator.maxLoad)}kg · EST. ${value} Scrap · ${formatState(state.elevator.state)}`,
      `<button class="action primary" data-action="send" ${canSend ? '' : 'disabled'}>SEND</button>`,
    ));
    return;
  }

  if (state.selection?.type === 'workbench') {
    const upgraded = state.tool.level === 2;
    const canUpgrade = !upgraded && state.scrap >= STEEL_PICKAXE_COST;
    const detail = upgraded
      ? `EQUIPPED · ${state.tool.damage} damage per hit`
      : `${state.tool.name} · ${state.tool.damage} damage → Steel Pickaxe · 16 damage · ${STEEL_PICKAXE_COST} Scrap`;
    setHtml(context, contextMarkup(
      'Tool Bench',
      detail,
      upgraded
        ? '<button class="action" disabled>UPGRADED</button>'
        : `<button class="action primary" data-action="upgrade" ${canUpgrade ? '' : 'disabled'}>UPGRADE</button>`,
    ));
    return;
  }

  setHtml(context, contextMarkup(
    'D-001 · First Shift',
    'Choose a vein. Near deposits are quick; the far Fossil Crack is slower but has a better rare roll.',
    '',
  ));
}

function renderNodeContext(node: MiningNode): void {
  const mineEnabled = canMine(state);
  const moving = state.character.state === 'MOVING_TO_NODE';
  const broken = node.hp <= 0;
  const meta = broken
    ? `DEPLETED · new face exposed in ${Math.ceil(node.respawnTimer)}s · Distance ${node.distanceMeters}m`
    : `HP ${node.hp} / ${node.maxHp} · Distance ${node.distanceMeters}m · Rare ${(node.rareChance * 100).toFixed(1)}%`;
  const moveDisabled = broken || state.character.carried.length > 0 || !['IDLE', 'MINING', 'MOVING_TO_NODE'].includes(state.character.state);
  setHtml(context, contextMarkup(
    node.name,
    meta,
    `<button class="action" data-action="move" ${moveDisabled ? 'disabled' : ''}>${moving ? 'MOVING' : 'MOVE'}</button>
     <button class="action primary" data-action="mine" ${mineEnabled ? '' : 'disabled'}>MINE</button>`,
  ));
}

function setHtml(element: HTMLElement, html: string): void {
  if (uiHtml.get(element) === html) return;
  uiHtml.set(element, html);
  element.innerHTML = html;
}

function contextMarkup(title: string, meta: string, actions: string): string {
  return `
    <div class="context-copy">
      <h1 class="context-title">${title}</h1>
      <p class="context-meta">${meta}</p>
    </div>
    <div class="context-actions">${actions}</div>
  `;
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatState(value: string): string {
  return value.replaceAll('_', ' ');
}

renderDom();
requestAnimationFrame(frame);
