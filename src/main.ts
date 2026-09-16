import './style.css';
import { GameAudio } from './game/audio';
import { AUTO_DISPATCH_MIN_WEIGHT, AUTO_SWING_MANUAL_SWINGS_REQUIRED, SAVE_INTERVAL, UPGRADE_COSTS } from './game/config';
import { createGameState } from './game/createGame';
import { loadFromStorage, saveToStorage } from './game/save';
import {
  canMine,
  cargoValue,
  cargoWeight,
  carriedWeight,
  drainEvents,
  moveToSelectedNode,
  porterWeight,
  requestMine,
  selectElevator,
  selectNode,
  selectWorkbench,
  sendElevator,
  toggleAutoDispatch,
  toggleAutoSwing,
  unlockAutoDispatch,
  unlockAutoSwing,
  unlockPorter,
  updateGame,
  upgradeBoots,
  upgradePack,
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
        <span>Click a vein to move · click again or press <kbd>Space</kbd> to swing</span>
        <span>Watch the floor, workers and lift to see where the line is backing up.</span>
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
  } else if (target.type === 'elevator') selectElevator(state);
  else selectWorkbench(state);
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
    case 'upgrade-tool': upgradeTool(state); break;
    case 'upgrade-boots': upgradeBoots(state); break;
    case 'unlock-auto-swing': unlockAutoSwing(state); break;
    case 'toggle-auto-swing': toggleAutoSwing(state); break;
    case 'upgrade-pack': upgradePack(state); break;
    case 'unlock-porter': unlockPorter(state); break;
    case 'unlock-auto-dispatch': unlockAutoDispatch(state); break;
    case 'toggle-auto-dispatch': toggleAutoDispatch(state); break;
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
  if (saveTimer >= SAVE_INTERVAL) {
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
    ${state.porter.enabled ? `<br><span class="muted">PORTER</span> ${fmt(porterWeight(state))}/${fmt(state.porter.capacity)}kg` : ''}
  `);
  setHtml(hudRight, `
    <strong>D-001</strong><br>
    <span class="muted">TOOL</span> ${state.tool.name}<br>
    <span class="muted">AUTO</span> ${automationSummary(state)}
  `);

  if (state.selection?.type === 'node') {
    const selectedId = state.selection.id;
    const node = state.floor.nodes.find((candidate) => candidate.id === selectedId);
    if (node) renderNodeContext(node);
    return;
  }
  if (state.selection?.type === 'elevator') {
    renderElevatorContext();
    return;
  }
  if (state.selection?.type === 'workbench') {
    renderWorkbenchContext();
    return;
  }
  setHtml(context, contextMarkup('D-001 · First Shift', nextObjective(state), ''));
}

function renderNodeContext(node: MiningNode): void {
  const mineEnabled = canMine(state);
  const moving = state.character.state === 'MOVING_TO_NODE';
  const broken = node.hp <= 0;
  const meta = broken
    ? `${node.profile} · DEPLETED · exposed again in ${Math.ceil(node.respawnTimer)}s · ${node.distanceMeters}m`
    : `${node.profile} · HP ${node.hp}/${node.maxHp} · ${node.distanceMeters}m · yield ${node.yieldMin}-${node.yieldMax} · rare ${(node.rareChance * 100).toFixed(1)}%`;
  const moveDisabled = broken || state.character.carried.length > 0 || !['IDLE', 'MINING', 'MOVING_TO_NODE'].includes(state.character.state);
  const auto = state.automation.autoSwing.enabled ? '<span class="inline-status">AUTO SWING</span>' : '';
  setHtml(context, contextMarkup(
    node.name,
    `${meta} ${auto}`,
    `<button class="action" data-action="move" ${moveDisabled ? 'disabled' : ''}>${moving ? 'MOVING' : 'MOVE'}</button>
     <button class="action primary" data-action="mine" ${mineEnabled ? '' : 'disabled'}>MINE</button>`,
  ));
}

function renderWorkbenchContext(): void {
  const equipment = `TOOL ${state.tool.level === 1 ? 'Rusty' : 'Steel'} · BOOTS Mk.${state.boots.level} · PACK Mk.${state.pack.level}`;
  let action = '';
  let note = nextObjective(state);

  if (state.tool.level === 1) {
    action = upgradeButton('upgrade-tool', `STEEL PICK · ${UPGRADE_COSTS.tool}`, UPGRADE_COSTS.tool);
  } else if (state.boots.level === 1) {
    action = upgradeButton('upgrade-boots', `RUNNER BOOTS · ${UPGRADE_COSTS.boots}`, UPGRADE_COSTS.boots);
  } else if (!state.automation.autoSwing.unlocked) {
    const swingsLeft = Math.max(0, AUTO_SWING_MANUAL_SWINGS_REQUIRED - state.stats.manualSwings);
    const disabled = state.scrap < UPGRADE_COSTS.autoSwing || swingsLeft > 0;
    action = `<button class="action primary" data-action="unlock-auto-swing" ${disabled ? 'disabled' : ''}>AUTO SWING · ${UPGRADE_COSTS.autoSwing}</button>`;
    if (swingsLeft > 0) note = `${equipment} · ${swingsLeft} more manual swing${swingsLeft === 1 ? '' : 's'} before the motor attachment can be fitted.`;
  } else if (state.pack.level === 1) {
    action = `${toggleButton('toggle-auto-swing', 'AUTO SWING', state.automation.autoSwing.enabled)}${upgradeButton('upgrade-pack', `FRAME PACK · ${UPGRADE_COSTS.pack}`, UPGRADE_COSTS.pack)}`;
  } else if (!state.porter.enabled) {
    action = `${toggleButton('toggle-auto-swing', 'AUTO SWING', state.automation.autoSwing.enabled)}${upgradeButton('unlock-porter', `HIRE PORTER · ${UPGRADE_COSTS.porter}`, UPGRADE_COSTS.porter)}`;
  } else {
    action = toggleButton('toggle-auto-swing', 'AUTO SWING', state.automation.autoSwing.enabled);
    note = `${equipment} · Porter ${formatState(state.porter.state)}. Elevator controls now have the final Phase 2 automation.`;
  }

  setHtml(context, contextMarkup('Tool Bench', `${equipment} · ${note}`, action));
}

function renderElevatorContext(): void {
  const weight = cargoWeight(state.elevator.cargo);
  const value = cargoValue(state.elevator.cargo);
  const canSend = state.elevator.state === 'IDLE_BOTTOM' && weight > 0 && state.character.state !== 'LOADING' && state.porter.state !== 'LOADING';
  let automationAction = '';
  if (state.porter.enabled && !state.automation.autoDispatch.unlocked) {
    automationAction = upgradeButton('unlock-auto-dispatch', `FIT AUTO RELAY · ${UPGRADE_COSTS.autoDispatch}`, UPGRADE_COSTS.autoDispatch);
  } else if (state.automation.autoDispatch.unlocked) {
    automationAction = toggleButton('toggle-auto-dispatch', 'AUTO DISPATCH', state.automation.autoDispatch.enabled);
  }
  const autoRule = state.automation.autoDispatch.enabled ? ` · auto at ${AUTO_DISPATCH_MIN_WEIGHT}kg / blocked load` : '';
  setHtml(context, contextMarkup(
    'Central Elevator · Mk.I',
    `CARGO ${fmt(weight)}/${fmt(state.elevator.maxLoad)}kg · EST. ${value} Scrap · ${formatState(state.elevator.state)}${autoRule}`,
    `<button class="action primary" data-action="send" ${canSend ? '' : 'disabled'}>SEND</button>${automationAction}`,
  ));
}

function nextObjective(current: GameState): string {
  if (current.tool.level === 1) return 'The rusty pick is the first bottleneck. Earn Scrap and fit the Steel Pickaxe at the bench.';
  if (current.boots.level === 1) return 'Walking is now the slow part. Fit Runner Boots at the bench.';
  if (!current.automation.autoSwing.unlocked) return 'After enough manual swings, fit the Auto Swing motor so mining input can disappear.';
  if (current.pack.level === 1) return 'Mining can run itself, but you still haul the result. Upgrade the Pack next.';
  if (!current.porter.enabled) return 'Hire a Porter. New drops will stay on the floor until the worker physically reaches them.';
  if (!current.automation.autoDispatch.unlocked) return 'The Porter still waits on the lift. Fit the Auto Relay from the elevator controls.';
  if (!current.automation.autoDispatch.enabled) return 'Auto Relay fitted. Turn AUTO DISPATCH ON when you want the lift to send itself.';
  return 'Small mining base online: choose the vein; mining, hauling and dispatch can now run without repeated input.';
}

function automationSummary(current: GameState): string {
  const swing = current.automation.autoSwing.unlocked ? `SWING ${current.automation.autoSwing.enabled ? 'ON' : 'OFF'}` : 'MANUAL';
  const porter = current.porter.enabled ? ' · PORTER' : '';
  const lift = current.automation.autoDispatch.unlocked ? ` · LIFT ${current.automation.autoDispatch.enabled ? 'ON' : 'OFF'}` : '';
  return swing + porter + lift;
}

function upgradeButton(action: string, label: string, cost: number): string {
  return `<button class="action primary" data-action="${action}" ${state.scrap >= cost ? '' : 'disabled'}>${label}</button>`;
}

function toggleButton(action: string, label: string, enabled: boolean): string {
  return `<button class="action ${enabled ? 'toggle-on' : ''}" data-action="${action}">${label} ${enabled ? 'ON' : 'OFF'}</button>`;
}

function setHtml(element: HTMLElement, html: string): void {
  if (uiHtml.get(element) === html) return;
  uiHtml.set(element, html);
  element.innerHTML = html;
}

function contextMarkup(title: string, meta: string, actions: string): string {
  return `<div class="context-copy"><h1 class="context-title">${title}</h1><p class="context-meta">${meta}</p></div><div class="context-actions">${actions}</div>`;
}

function fmt(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function formatState(value: string): string { return value.replaceAll('_', ' '); }

renderDom();
requestAnimationFrame(frame);
