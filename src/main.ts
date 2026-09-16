import './style.css';
import { GameAudio } from './game/audio';
import {
  ANOMALIES,
  AUTO_DISPATCH_MIN_WEIGHT,
  AUTO_SWING_MANUAL_SWINGS_REQUIRED,
  D030_EXTENSION_COST,
  PASSIVES,
  SAVE_INTERVAL,
  UPGRADE_COSTS,
} from './game/config';
import { createGameState } from './game/createGame';
import { loadFromStorage, saveToStorage } from './game/save';
import {
  canExtendShaft,
  canMine,
  cargoValue,
  cargoWeight,
  carriedWeight,
  chooseAnomaly,
  drainEvents,
  effectiveTreasureChance,
  moveToSelectedNode,
  porterWeight,
  requestMine,
  selectArchive,
  selectElevator,
  selectNode,
  selectScanner,
  selectWorkbench,
  sendElevator,
  toggleAutoDispatch,
  toggleAutoSwing,
  togglePassive,
  unlockAutoDispatch,
  unlockAutoSwing,
  unlockD030,
  unlockPorter,
  updateGame,
  upgradeBoots,
  upgradePack,
  upgradeTool,
} from './game/simulation';
import type { AnomalyId, GameState, MiningNode, PassiveId } from './game/types';
import { CanvasRenderer } from './render/canvasRenderer';

const FIXED_STEP = 1 / 60;
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

root.innerHTML = `
  <div class="game-root">
    <div>
      <div class="game-shell">
        <canvas class="game-canvas" aria-label="LOOP SHAFT mining floor" tabindex="0"></canvas>
        <div class="hud hud-left" id="hud-left"></div>
        <div class="hud hud-right" id="hud-right"></div>
      </div>
      <section class="context-strip" id="context" aria-live="polite"></section>
      <div class="help-line">
        <span>Click a vein to move · click again or press <kbd>Space</kbd> to swing</span>
        <span>Rare finds are not yours until the lift appraises them at the surface.</span>
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
  else if (target.type === 'workbench') selectWorkbench(state);
  else if (target.type === 'scanner') selectScanner(state);
  else selectArchive(state);
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
    case 'extend-shaft': unlockD030(state); break;
    case 'choose-anomaly': {
      const anomaly = button.dataset.anomaly as AnomalyId | undefined;
      if (anomaly) chooseAnomaly(state, anomaly);
      break;
    }
    case 'toggle-passive': {
      const passive = button.dataset.passive as PassiveId | undefined;
      if (passive) togglePassive(state, passive);
      break;
    }
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
  const discovered = state.collection.entries.filter((entry) => entry.discovered).length;
  setHtml(hudLeft, `
    <strong>SCRAP ${state.scrap}</strong><br>
    <span class="muted">CARRY</span> ${fmt(carriedWeight(state))}/${fmt(state.character.backpackCapacity)}kg<br>
    <span class="muted">LIFT</span> ${fmt(cargoWeight(state.elevator.cargo))}/${fmt(state.elevator.maxLoad)}kg
    ${state.porter.enabled ? `<br><span class="muted">PORTER</span> ${fmt(porterWeight(state))}/${fmt(state.porter.capacity)}kg` : ''}
  `);
  const anomaly = state.anomaly.selected ? ANOMALIES[state.anomaly.selected].name : state.depth.current === 'D-030' ? 'UNRESOLVED' : '—';
  setHtml(hudRight, `
    <strong>${state.depth.current}</strong><br>
    <span class="muted">ANOMALY</span> ${anomaly}<br>
    <span class="muted">AUTO</span> ${automationSummary(state)}
    ${state.depth.current === 'D-030' ? `<br><span class="muted">ARCHIVE</span> ${discovered}/${state.collection.entries.length} · BUILD ${state.passives.active.length}/2` : ''}
  `);

  if (state.depth.transitionRemaining > 0) {
    setHtml(context, contextMarkup('Shaft Extension', 'The cage is descending through unworked rock. Controls are locked until D-030.', ''));
    return;
  }
  if (state.selection?.type === 'node') {
    const selectedId = state.selection.id;
    const node = state.floor.nodes.find((candidate) => candidate.id === selectedId);
    if (node) renderNodeContext(node);
    return;
  }
  if (state.selection?.type === 'elevator') { renderElevatorContext(); return; }
  if (state.selection?.type === 'workbench') { renderWorkbenchContext(); return; }
  if (state.selection?.type === 'scanner') { renderScannerContext(); return; }
  if (state.selection?.type === 'archive') { renderArchiveContext(); return; }
  setHtml(context, contextMarkup(`${state.depth.current} · ${state.depth.current === 'D-001' ? 'First Shift' : 'Anomalous Strata'}`, nextObjective(state), ''));
}

function renderNodeContext(node: MiningNode): void {
  const mineEnabled = canMine(state);
  const moving = state.character.state === 'MOVING_TO_NODE';
  const broken = node.hp <= 0;
  const base = broken
    ? `${node.profile} · DEPLETED · exposed again in ${Math.ceil(node.respawnTimer)}s · ${node.distanceMeters}m`
    : `${node.profile} · HP ${node.hp}/${node.maxHp} · ${node.distanceMeters}m · yield ${node.yieldMin}-${node.yieldMax}`;
  const prospecting = state.depth.current === 'D-030' ? prospectorReadout(node) : ` · rare signal ${signal(node.treasureChance)}`;
  const moveDisabled = broken || state.character.carried.length > 0 || !['IDLE', 'MINING', 'MOVING_TO_NODE'].includes(state.character.state);
  const auto = state.automation.autoSwing.enabled ? '<span class="inline-status">AUTO SWING</span>' : '';
  setHtml(context, contextMarkup(
    node.name,
    `${base}${prospecting} ${auto}`,
    `<button class="action" data-action="move" ${moveDisabled ? 'disabled' : ''}>${moving ? 'MOVING' : 'MOVE'}</button>
     <button class="action primary" data-action="mine" ${mineEnabled ? '' : 'disabled'}>MINE</button>`,
  ));
}

function prospectorReadout(node: MiningNode): string {
  if (state.passives.active.includes('PROSPECTORS_EYE')) {
    const chance = (effectiveTreasureChance(state, node) * 100).toFixed(1);
    const fossil = node.fossilWeight > 0.45 ? 'FOSSIL RICH' : node.fossilWeight > 0.15 ? 'FOSSIL TRACE' : 'FOSSIL LOW';
    const relic = node.relicWeight >= 0.25 ? ' · POSSIBLE RELIC' : '';
    return ` · treasure ${chance}% · ${fossil}${relic}`;
  }
  return ` · Rare signal ${signal(effectiveTreasureChance(state, node))} · Fossil traces ?`;
}

function renderWorkbenchContext(): void {
  const equipment = `TOOL ${state.tool.level === 1 ? 'Rusty' : 'Steel'} · BOOTS Mk.${state.boots.level} · PACK Mk.${state.pack.level}`;
  let action = '';
  let note = nextObjective(state);
  if (state.tool.level === 1) action = upgradeButton('upgrade-tool', `STEEL PICK · ${UPGRADE_COSTS.tool}`, UPGRADE_COSTS.tool);
  else if (state.boots.level === 1) action = upgradeButton('upgrade-boots', `RUNNER BOOTS · ${UPGRADE_COSTS.boots}`, UPGRADE_COSTS.boots);
  else if (!state.automation.autoSwing.unlocked) {
    const swingsLeft = Math.max(0, AUTO_SWING_MANUAL_SWINGS_REQUIRED - state.stats.manualSwings);
    const disabled = state.scrap < UPGRADE_COSTS.autoSwing || swingsLeft > 0;
    action = `<button class="action primary" data-action="unlock-auto-swing" ${disabled ? 'disabled' : ''}>AUTO SWING · ${UPGRADE_COSTS.autoSwing}</button>`;
    if (swingsLeft > 0) note = `${swingsLeft} more manual swing${swingsLeft === 1 ? '' : 's'} before the motor attachment can be fitted.`;
  } else if (state.pack.level === 1) action = `${toggleButton('toggle-auto-swing', 'AUTO SWING', state.automation.autoSwing.enabled)}${upgradeButton('upgrade-pack', `FRAME PACK · ${UPGRADE_COSTS.pack}`, UPGRADE_COSTS.pack)}`;
  else if (!state.porter.enabled) action = `${toggleButton('toggle-auto-swing', 'AUTO SWING', state.automation.autoSwing.enabled)}${upgradeButton('unlock-porter', `HIRE PORTER · ${UPGRADE_COSTS.porter}`, UPGRADE_COSTS.porter)}`;
  else action = toggleButton('toggle-auto-swing', 'AUTO SWING', state.automation.autoSwing.enabled);
  setHtml(context, contextMarkup('Tool Bench', `${equipment} · ${note}`, action));
}

function renderElevatorContext(): void {
  const weight = cargoWeight(state.elevator.cargo);
  const value = cargoValue(state.elevator.cargo);
  const canSend = state.elevator.state === 'IDLE_BOTTOM' && weight > 0 && state.character.state !== 'LOADING' && state.porter.state !== 'LOADING';
  let actions = `<button class="action primary" data-action="send" ${canSend ? '' : 'disabled'}>SEND</button>`;
  if (state.porter.enabled && !state.automation.autoDispatch.unlocked) {
    actions += upgradeButton('unlock-auto-dispatch', `FIT AUTO RELAY · ${UPGRADE_COSTS.autoDispatch}`, UPGRADE_COSTS.autoDispatch);
  } else if (state.automation.autoDispatch.unlocked) {
    actions += toggleButton('toggle-auto-dispatch', 'AUTO DISPATCH', state.automation.autoDispatch.enabled);
  }
  if (state.depth.current === 'D-001' && state.automation.autoDispatch.unlocked && !state.depth.unlockedD030) {
    actions += `<button class="action depth-action" data-action="extend-shaft" ${canExtendShaft(state) ? '' : 'disabled'}>EXTEND TO D-030 · ${D030_EXTENSION_COST}</button>`;
  }
  const autoRule = state.automation.autoDispatch.enabled ? ` · auto at ${AUTO_DISPATCH_MIN_WEIGHT}kg / blocked load` : '';
  const extension = state.depth.current === 'D-001' && state.automation.autoDispatch.unlocked && !state.depth.unlockedD030
    ? ` · D-030 extension requires ${D030_EXTENSION_COST} Scrap and a clear lift/floor`
    : '';
  setHtml(context, contextMarkup('Central Elevator · Mk.I', `CARGO ${fmt(weight)}/${fmt(state.elevator.maxLoad)}kg · EST. ${value} Scrap · ${formatState(state.elevator.state)}${autoRule}${extension}`, actions));
}

function renderScannerContext(): void {
  if (state.anomaly.selected) {
    const chosen = ANOMALIES[state.anomaly.selected];
    setHtml(context, contextMarkup('Geological Scanner', `${chosen.name} locked for this Run · ${chosen.description}`, ''));
    return;
  }
  const options = state.anomaly.options.map((id) => {
    const option = ANOMALIES[id];
    return `<button class="choice-line" data-action="choose-anomaly" data-anomaly="${id}"><strong>${option.name}</strong><span>${option.description}</span></button>`;
  }).join('');
  setHtml(context, contextMarkup('Three anomalous responses', 'One response can be stabilized. The choice is locked for this Run and survives reload.', `<div class="choice-stack">${options}</div>`));
}

function renderArchiveContext(): void {
  const found = state.collection.entries.filter((entry) => entry.discovered);
  const collection = state.collection.entries.map((entry) => entry.discovered
    ? `<span class="archive-item found">${entry.name} · ${entry.rarity} ×${entry.count}</span>`
    : `<span class="archive-item">???? · ${entry.category}</span>`).join('');
  const passiveButtons = state.passives.unlocked.length === 0
    ? '<span class="archive-empty">No passive artifacts appraised yet.</span>'
    : state.passives.unlocked.map((id) => {
      const active = state.passives.active.includes(id);
      const disabled = !active && state.passives.active.length >= 2;
      return `<button class="passive-line ${active ? 'active' : ''}" data-action="toggle-passive" data-passive="${id}" ${disabled ? 'disabled' : ''}><strong>${PASSIVES[id].name}</strong><span>${active ? 'ACTIVE' : 'STORED'} · ${PASSIVES[id].description}</span></button>`;
    }).join('');
  setHtml(context, contextMarkup(
    `Archive Terminal · ${found.length}/${state.collection.entries.length}`,
    `Only surface-appraised objects are recorded. Active build ${state.passives.active.length}/2.`,
    `<div class="archive-layout"><div class="archive-grid">${collection}</div><div class="passive-stack">${passiveButtons}</div></div>`,
  ));
}

function nextObjective(current: GameState): string {
  if (current.tool.level === 1) return 'The rusty pick is the first bottleneck. Earn Scrap and fit the Steel Pickaxe.';
  if (current.boots.level === 1) return 'Walking is now the slow part. Fit Runner Boots.';
  if (!current.automation.autoSwing.unlocked) return 'After enough manual swings, fit Auto Swing so mining input can disappear.';
  if (current.pack.level === 1) return 'Mining can run itself, but you still haul the result. Upgrade the Pack.';
  if (!current.porter.enabled) return 'Hire a Porter. Drops remain on the floor until the worker reaches them.';
  if (!current.automation.autoDispatch.unlocked) return 'The Porter still waits on the lift. Fit the Auto Relay.';
  if (!current.depth.unlockedD030) return `The base can work without you. Bank ${D030_EXTENSION_COST} Scrap, clear the line, then extend the shaft from the elevator.`;
  if (current.depth.transitionRemaining > 0) return 'Descending to D-030.';
  if (!current.anomaly.selected) return 'The geology is unstable. Use the scanner and choose which rule this Run will obey.';
  if (current.discovery.foundThisRun === 0) return 'Choose a D-030 vein. You are mining to discover what is buried here, not only for Scrap.';
  if (!current.collection.entries.some((entry) => entry.discovered)) return 'A discovery exists underground. Get it onto the elevator and through surface appraisal.';
  if (current.passives.unlocked.length === 0) return 'Keep targeting veins for a Relic. A Relic only unlocks its Passive after surface appraisal.';
  return 'Use the Archive to choose up to two Passives, then change which vein you target for this Anomaly.';
}

function automationSummary(current: GameState): string {
  const swing = current.automation.autoSwing.unlocked ? `SWING ${current.automation.autoSwing.enabled ? 'ON' : 'OFF'}` : 'MANUAL';
  const porter = current.porter.enabled ? ' · PORTER' : '';
  const lift = current.automation.autoDispatch.unlocked ? ` · LIFT ${current.automation.autoDispatch.enabled ? 'ON' : 'OFF'}` : '';
  return swing + porter + lift;
}
function signal(chance: number): string { return chance >= 0.2 ? 'HIGH' : chance >= 0.075 ? 'MED' : 'LOW'; }
function upgradeButton(action: string, label: string, cost: number): string { return `<button class="action primary" data-action="${action}" ${state.scrap >= cost ? '' : 'disabled'}>${label}</button>`; }
function toggleButton(action: string, label: string, enabled: boolean): string { return `<button class="action ${enabled ? 'toggle-on' : ''}" data-action="${action}">${label} ${enabled ? 'ON' : 'OFF'}</button>`; }
function setHtml(element: HTMLElement, html: string): void { if (uiHtml.get(element) === html) return; uiHtml.set(element, html); element.innerHTML = html; }
function contextMarkup(title: string, meta: string, actions: string): string { return `<div class="context-copy"><h1 class="context-title">${title}</h1><p class="context-meta">${meta}</p></div><div class="context-actions">${actions}</div>`; }
function fmt(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function formatState(value: string): string { return value.replaceAll('_', ' '); }

renderDom();
requestAnimationFrame(frame);
