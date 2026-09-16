import './style.css';
import { GameAudio } from './game/audio';
import {
  ANOMALIES,
  AUTO_DISPATCH_MIN_WEIGHT,
  AUTO_SWING_MANUAL_SWINGS_REQUIRED,
  CORE_PROTOCOLS,
  D060_EXTENSION_COST,
  D100_EXTENSION_COST,
  PASSIVES,
  RESEARCH,
  SAVE_INTERVAL,
  UPGRADE_COSTS,
} from './game/config';
import { createGameState } from './game/createGame';
import { loadFromStorage, saveToStorage } from './game/save';
import {
  armReboot,
  canExtendD030,
  canExtendD060,
  canExtendD100,
  canMine,
  canStartResearch,
  canTravelToDepth,
  cargoValue,
  cargoWeight,
  carriedWeight,
  chooseAnomaly,
  currentFloor,
  d030ExtensionCost,
  drainEvents,
  effectiveTreasureChance,
  moveToSelectedNode,
  porterWeight,
  purchaseCoreProtocol,
  requestFloorTravel,
  requestMine,
  selectArchive,
  selectCoreChamber,
  selectCoreConsole,
  selectElevator,
  selectNode,
  selectResearchTerminal,
  selectScanner,
  selectWorkbench,
  sendElevator,
  startResearch,
  toggleAutoDispatch,
  toggleAutoSwing,
  togglePassive,
  unlockAutoDispatch,
  unlockAutoSwing,
  unlockD030,
  unlockD060,
  unlockD100,
  unlockPorter,
  updateGame,
  upgradeBoots,
  upgradePack,
  upgradeTool,
} from './game/simulation';
import type { AnomalyId, CoreProtocolId, DepthId, GameState, MiningNode, PassiveId, ResearchId } from './game/types';
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
        <span>Underground finds only become resources after the lift reaches Surface.</span>
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
    const isCurrent = state.run.character.targetNodeId === target.id;
    if (isCurrent && canMine(state)) requestMine(state);
    else selectNode(state, target.id);
  } else if (target.type === 'elevator') selectElevator(state);
  else if (target.type === 'workbench') selectWorkbench(state);
  else if (target.type === 'scanner') selectScanner(state);
  else if (target.type === 'archive') selectArchive(state);
  else if (target.type === 'research') selectResearchTerminal(state);
  else if (target.type === 'core-console') selectCoreConsole(state);
  else selectCoreChamber(state);
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
    case 'extend-d030': unlockD030(state); break;
    case 'extend-d060': unlockD060(state); break;
    case 'extend-d100': unlockD100(state); break;
    case 'travel': {
      const depth = button.dataset.depth as DepthId | undefined;
      if (depth) requestFloorTravel(state, depth);
      break;
    }
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
    case 'research': {
      const research = button.dataset.research as ResearchId | undefined;
      if (research) startResearch(state, research);
      break;
    }
    case 'protocol': {
      const protocol = button.dataset.protocol as CoreProtocolId | undefined;
      if (protocol) purchaseCoreProtocol(state, protocol);
      break;
    }
    case 'reboot': armReboot(state); break;
  }
  saveToStorage(state);
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
  for (const gameEvent of events) {
    renderer.handleEvent(gameEvent, state, now);
    audio.handle(gameEvent);
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
  const run = state.run;
  const discovered = state.meta.collection.entries.filter((entry) => entry.discovered).length;
  setHtml(hudLeft, `
    <strong>SCRAP ${run.scrap}</strong> · <strong>DATA ${run.data}</strong> · <strong>CORE ${state.meta.core}</strong><br>
    <span class="muted">CARRY</span> ${fmt(carriedWeight(state))}/${fmt(run.character.backpackCapacity)}kg ·
    <span class="muted">LIFT</span> ${fmt(cargoWeight(run.elevator.cargo))}/${fmt(run.elevator.maxLoad)}kg
    ${run.porter.enabled ? `<br><span class="muted">PORTER</span> ${fmt(porterWeight(state))}/${fmt(run.porter.capacity)}kg` : ''}
    ${run.pendingCore > 0 ? `<br><span class="core-readout">PENDING CORE +${run.pendingCore}</span>` : ''}
  `);
  const anomaly = run.anomaly.selected ? ANOMALIES[run.anomaly.selected].name : run.depth.current === 'D-030' ? 'UNRESOLVED' : '—';
  const research = run.research.active ? `${RESEARCH[run.research.active.id].name} ${Math.ceil(run.research.active.remaining)}s` : `${run.research.completed.length}/5`;
  setHtml(hudRight, `
    <strong>RUN ${String(state.meta.runIndex).padStart(2, '0')} · ${run.depth.current}</strong><br>
    <span class="muted">ANOMALY</span> ${anomaly}<br>
    <span class="muted">RESEARCH</span> ${research}<br>
    <span class="muted">ARCHIVE</span> ${discovered}/${state.meta.collection.entries.length} · <span class="muted">BUILD</span> ${state.meta.passives.active.length}/2
  `);

  if (run.elevator.travel) {
    const travel = run.elevator.travel;
    setHtml(context, contextMarkup('Central Elevator', `${travel.viaSurface ? 'Surface relay' : 'Direct travel'} · ${travel.from} → ${travel.to} · ${travel.remaining.toFixed(1)}s`, ''));
    return;
  }
  if (state.selection?.type === 'node') {
    const selectedId = state.selection.id;
    const node = currentFloor(state).nodes.find((candidate) => candidate.id === selectedId);
    if (node) renderNodeContext(node);
    return;
  }
  if (state.selection?.type === 'elevator') { renderElevatorContext(); return; }
  if (state.selection?.type === 'workbench') { renderWorkbenchContext(); return; }
  if (state.selection?.type === 'scanner') { renderScannerContext(); return; }
  if (state.selection?.type === 'archive') { renderArchiveContext(); return; }
  if (state.selection?.type === 'research') { renderResearchContext(); return; }
  if (state.selection?.type === 'core-console') { renderCoreConsoleContext(); return; }
  if (state.selection?.type === 'core-chamber') { renderCoreChamberContext(); return; }
  setHtml(context, contextMarkup(`${run.depth.current} · Run ${state.meta.runIndex}`, nextObjective(state), ''));
}

function renderNodeContext(node: MiningNode): void {
  const run = state.run;
  const mineEnabled = canMine(state);
  const moving = run.character.state === 'MOVING_TO_NODE';
  const broken = node.hp <= 0;
  const base = broken
    ? `${node.profile} · DEPLETED · exposed again in ${Math.ceil(node.respawnTimer)}s · ${node.distanceMeters}m`
    : `${node.profile} · HP ${node.hp}/${node.maxHp} · ${node.distanceMeters}m · yield ${node.yieldMin}-${node.yieldMax}`;
  const readout = nodeReadout(node);
  const moveDisabled = broken || run.character.carried.length > 0 || !['IDLE', 'MINING', 'MOVING_TO_NODE'].includes(run.character.state);
  const auto = run.automation.autoSwing.enabled ? '<span class="inline-status">AUTO SWING</span>' : '';
  setHtml(context, contextMarkup(
    node.name,
    `${base}${readout} ${auto}`,
    `<button class="action" data-action="move" ${moveDisabled ? 'disabled' : ''}>${moving ? 'MOVING' : 'MOVE'}</button>
     <button class="action primary" data-action="mine" ${mineEnabled ? '' : 'disabled'}>MINE</button>`,
  ));
}

function nodeReadout(node: MiningNode): string {
  const depth = state.run.depth.current;
  if (node.id === 'core-shell') return ' · CORE SIGNAL LOCKED · fragments must reach Surface';
  const survey = state.run.research.completed.includes('DEEP_SURVEY') || state.run.research.completed.includes('STRATA_SCANNER');
  const prospector = state.meta.passives.active.includes('PROSPECTORS_EYE');
  if ((depth === 'D-060' || depth === 'D-100') && survey) {
    const researchSignal = signal(node.researchWeight);
    const rareSignal = signal(effectiveTreasureChance(state, node));
    const fossil = signal(node.fossilWeight);
    return ` · Research ${researchSignal} · Rare ${rareSignal} · Fossil ${fossil}`;
  }
  if (depth === 'D-030' && prospector) {
    return ` · treasure ${(effectiveTreasureChance(state, node) * 100).toFixed(1)}% · Fossil ${signal(node.fossilWeight)} · Relic ${signal(node.relicWeight)}`;
  }
  if (depth !== 'D-001') return ` · Rare ${signal(effectiveTreasureChance(state, node))} · other signals ?`;
  return ` · rare signal ${signal(node.treasureChance)}`;
}

function renderWorkbenchContext(): void {
  const run = state.run;
  const equipment = `TOOL ${run.tool.level === 1 ? 'Rusty' : 'Steel'} · BOOTS Mk.${run.boots.level} · PACK Mk.${run.pack.level}`;
  let action = '';
  let note = nextObjective(state);
  if (run.tool.level === 1) action = upgradeButton('upgrade-tool', `STEEL PICK · ${UPGRADE_COSTS.tool}`, UPGRADE_COSTS.tool);
  else if (run.boots.level === 1) action = upgradeButton('upgrade-boots', `RUNNER BOOTS · ${UPGRADE_COSTS.boots}`, UPGRADE_COSTS.boots);
  else if (!run.automation.autoSwing.unlocked) {
    const swingsLeft = Math.max(0, AUTO_SWING_MANUAL_SWINGS_REQUIRED - run.stats.manualSwings);
    const disabled = run.scrap < UPGRADE_COSTS.autoSwing || swingsLeft > 0;
    action = `<button class="action primary" data-action="unlock-auto-swing" ${disabled ? 'disabled' : ''}>AUTO SWING · ${UPGRADE_COSTS.autoSwing}</button>`;
    if (swingsLeft > 0) note = `${swingsLeft} more manual swing${swingsLeft === 1 ? '' : 's'} before the motor attachment can be fitted.`;
  } else if (run.pack.level === 1) action = `${toggleButton('toggle-auto-swing', 'AUTO SWING', run.automation.autoSwing.enabled)}${upgradeButton('upgrade-pack', `FRAME PACK · ${UPGRADE_COSTS.pack}`, UPGRADE_COSTS.pack)}`;
  else if (!run.porter.enabled) action = `${toggleButton('toggle-auto-swing', 'AUTO SWING', run.automation.autoSwing.enabled)}${upgradeButton('unlock-porter', `HIRE PORTER · ${UPGRADE_COSTS.porter}`, UPGRADE_COSTS.porter)}`;
  else action = toggleButton('toggle-auto-swing', 'AUTO SWING', run.automation.autoSwing.enabled);
  setHtml(context, contextMarkup('Tool Bench', `${equipment} · ${note}`, action));
}

function renderElevatorContext(): void {
  const run = state.run;
  const weight = cargoWeight(run.elevator.cargo);
  const value = cargoValue(run.elevator.cargo);
  const canSend = run.elevator.state === 'IDLE_BOTTOM' && weight > 0 && run.character.state !== 'LOADING' && run.porter.state !== 'LOADING';
  let actions = `<button class="action primary" data-action="send" ${canSend ? '' : 'disabled'}>SEND</button>`;
  if (run.porter.enabled && !run.automation.autoDispatch.unlocked) actions += upgradeButton('unlock-auto-dispatch', `FIT AUTO RELAY · ${UPGRADE_COSTS.autoDispatch}`, UPGRADE_COSTS.autoDispatch);
  else if (run.automation.autoDispatch.unlocked) actions += toggleButton('toggle-auto-dispatch', 'AUTO DISPATCH', run.automation.autoDispatch.enabled);

  if (run.depth.current === 'D-001' && !run.depth.unlocked.includes('D-030')) {
    actions += `<button class="action depth-action" data-action="extend-d030" ${canExtendD030(state) ? '' : 'disabled'}>EXTEND D-030 · ${d030ExtensionCost(state)}</button>`;
  } else if (run.depth.current === 'D-030' && !run.depth.unlocked.includes('D-060')) {
    actions += `<button class="action depth-action" data-action="extend-d060" ${canExtendD060(state) ? '' : 'disabled'}>EXTEND D-060 · ${D060_EXTENSION_COST}</button>`;
  } else if (run.depth.current === 'D-060' && !run.depth.unlocked.includes('D-100')) {
    actions += `<button class="action depth-action" data-action="extend-d100" ${canExtendD100(state) ? '' : 'disabled'}>EXTEND D-100 · ${D100_EXTENSION_COST}</button>`;
  }

  const travelButtons = run.depth.unlocked.filter((depth) => depth !== run.depth.current).map((depth) =>
    `<button class="action travel-action" data-action="travel" data-depth="${depth}" ${canTravelToDepth(state, depth) ? '' : 'disabled'}>${depth}</button>`).join('');
  if (travelButtons) actions += `<span class="depth-buttons">${travelButtons}</span>`;
  const autoRule = run.automation.autoDispatch.enabled ? ` · auto at ${AUTO_DISPATCH_MIN_WEIGHT}kg / blocked load` : '';
  const relay = run.research.completed.includes('MULTI_STOP_RELAY') ? ' · DIRECT FLOOR RELAY' : ' · underground transfers route via Surface';
  setHtml(context, contextMarkup('Central Elevator', `CARGO ${fmt(weight)}/${fmt(run.elevator.maxLoad)}kg · EST. ${value} Scrap · ${formatState(run.elevator.state)}${autoRule}${relay}`, actions));
}

function renderScannerContext(): void {
  if (state.run.anomaly.selected) {
    const chosen = ANOMALIES[state.run.anomaly.selected];
    setHtml(context, contextMarkup('Geological Scanner', `${chosen.name} locked for this Run · ${chosen.description}`, ''));
    return;
  }
  const options = state.run.anomaly.options.map((id) => {
    const option = ANOMALIES[id];
    return `<button class="choice-line" data-action="choose-anomaly" data-anomaly="${id}"><strong>${option.name}</strong><span>${option.description}</span></button>`;
  }).join('');
  setHtml(context, contextMarkup('Three anomalous responses', 'One response can be stabilized. The choice resets on Reboot and survives reload.', `<div class="choice-stack">${options}</div>`));
}

function renderArchiveContext(): void {
  const found = state.meta.collection.entries.filter((entry) => entry.discovered);
  const collection = state.meta.collection.entries.map((entry) => entry.discovered
    ? `<span class="archive-item found">${entry.name} · ${entry.rarity} ×${entry.count}</span>`
    : `<span class="archive-item">???? · ${entry.category}</span>`).join('');
  const passiveButtons = state.meta.passives.unlocked.length === 0
    ? '<span class="archive-empty">No passive artifacts appraised yet.</span>'
    : state.meta.passives.unlocked.map((id) => {
      const active = state.meta.passives.active.includes(id);
      const disabled = !active && state.meta.passives.active.length >= 2;
      return `<button class="passive-line ${active ? 'active' : ''}" data-action="toggle-passive" data-passive="${id}" ${disabled ? 'disabled' : ''}><strong>${PASSIVES[id].name}</strong><span>${active ? 'ACTIVE' : 'STORED'} · ${PASSIVES[id].description}</span></button>`;
    }).join('');
  setHtml(context, contextMarkup(
    `Archive Terminal · ${found.length}/${state.meta.collection.entries.length}`,
    `Surface-appraised discoveries persist across Reboot. Active build ${state.meta.passives.active.length}/2.`,
    `<div class="archive-layout"><div class="archive-grid">${collection}</div><div class="passive-stack">${passiveButtons}</div></div>`,
  ));
}

function renderResearchContext(): void {
  const active = state.run.research.active;
  const rows = (Object.keys(RESEARCH) as ResearchId[]).map((id) => {
    const definition = RESEARCH[id];
    const done = state.run.research.completed.includes(id);
    const running = active?.id === id;
    const prereq = definition.prerequisite && !state.run.research.completed.includes(definition.prerequisite) ? ` · needs ${RESEARCH[definition.prerequisite].name}` : '';
    const status = done ? 'COMPLETE' : running ? `${Math.ceil(active.remaining)}s` : `DATA ${definition.dataCost}${prereq}`;
    return `<button class="research-line ${done ? 'complete' : running ? 'running' : ''}" data-action="research" data-research="${id}" ${canStartResearch(state, id) ? '' : 'disabled'}><strong>${definition.name}</strong><span>${status} · ${definition.description}</span></button>`;
  }).join('');
  const meta = active ? `Terminal running · ${RESEARCH[active.id].name} continues while you mine.` : `DATA ${state.run.data} · samples only become Data after Surface analysis.`;
  setHtml(context, contextMarkup('Surface Analyzer', meta, `<div class="research-stack">${rows}</div>`));
}

function renderCoreChamberContext(): void {
  const chamber = state.run.coreChamber;
  let action = '';
  let meta = chamber.discovered ? 'Core Chamber closed. Break the Core Shell and get its fragments to Surface.' : 'Dormant';
  if (state.run.pendingCore > 0) meta = `CORE CHARGE ${state.run.pendingCore} · Reboot commits this charge into permanent Core.`;
  if (chamber.rebootAvailable) {
    action = `<button class="action reboot-action" data-action="reboot">${chamber.rebootArmed ? `CONFIRM REBOOT · CORE +${state.run.pendingCore}` : `ARM REBOOT · CORE +${state.run.pendingCore}`}</button>`;
    meta += ' · RESET: Scrap, Data, floors, equipment, automation, Research, Anomaly. KEEP: Collection, Passive, Core, Protocol, Best Depth.';
  }
  setHtml(context, contextMarkup('Core Chamber', meta, action));
}

function renderCoreConsoleContext(): void {
  const rows = (Object.keys(CORE_PROTOCOLS) as CoreProtocolId[]).map((id) => {
    const definition = CORE_PROTOCOLS[id];
    const owned = state.meta.protocols.includes(id);
    const disabled = owned || state.meta.core < definition.cost;
    return `<button class="protocol-line ${owned ? 'owned' : ''}" data-action="protocol" data-protocol="${id}" ${disabled ? 'disabled' : ''}><strong>${definition.name}</strong><span>${owned ? 'INSTALLED' : `CORE ${definition.cost}`} · ${definition.description}</span></button>`;
  }).join('');
  setHtml(context, contextMarkup('Core Console', `CORE ${state.meta.core} · Choose which old work the next Runs no longer need to repeat.`, `<div class="protocol-stack">${rows}</div>`));
}

function nextObjective(current: GameState): string {
  const run = current.run;
  if (current.meta.runIndex > 1 && current.meta.core > 0 && current.meta.protocols.length === 0) return 'The Core Console is online. Spend Core on one remembered piece of the previous Run.';
  if (run.tool.level === 1) return 'The rusty pick is the first bottleneck. Earn Scrap and fit the Steel Pickaxe.';
  if (run.boots.level === 1) return 'Walking is now the slow part. Fit Runner Boots.';
  if (!run.automation.autoSwing.unlocked) return 'After enough manual swings, fit Auto Swing so mining input can disappear.';
  if (run.pack.level === 1) return 'Mining can run itself, but you still haul the result. Upgrade the Pack.';
  if (!run.porter.enabled) return 'Hire a Porter. Drops remain physical until somebody reaches them.';
  if (!run.automation.autoDispatch.unlocked) return 'The Porter still waits on the lift. Fit the Auto Relay.';
  if (!run.depth.unlocked.includes('D-030')) return `The base can work without you. Bank ${d030ExtensionCost(current)} Scrap, clear the lift, then extend D-030.`;
  if (run.depth.current === 'D-001') return 'Use the elevator control to travel to D-030.';
  if (!run.anomaly.selected) return 'The D-030 geology is unstable. Use the scanner and choose this Run’s Anomaly.';
  if (!current.meta.collection.entries.some((entry) => entry.discovered)) return 'Find a Fossil or other rare object and get it through Surface appraisal.';
  if (current.meta.passives.unlocked.length === 0) return 'Target D-030 veins for a Relic. Its Passive unlocks only after Surface appraisal.';
  if (!run.depth.unlocked.includes('D-060')) return `Your first field archive is useful now. Bank ${D060_EXTENSION_COST} Scrap and extend the shaft from D-030.`;
  if (!run.research.completed.includes('CORE_RESONANCE')) {
    if (run.depth.current !== 'D-060') return 'Travel to D-060. Research Samples there are worth Data rather than Scrap.';
    if (run.data === 0 && !run.research.active) return 'Mine Crystal Bank or Machine Grave, then carry a Research Sample all the way to Surface.';
    if (!run.research.completed.includes('DEEP_SURVEY')) return 'Use the Surface Analyzer. Deep Survey turns unknown strata into useful information.';
    return 'Gather enough Data and complete Core Resonance while mining other targets in parallel.';
  }
  if (!run.depth.unlocked.includes('D-100')) return `Core Resonance is decoded. Bank ${D100_EXTENSION_COST} Scrap and extend D-100 from D-060.`;
  if (run.depth.current !== 'D-100') return 'Travel to D-100. The Core Chamber marks this Run’s first possible endpoint.';
  if (run.pendingCore === 0) return 'Break the Core Shell. A Core Fragment is still only cargo until Surface appraisal.';
  if (!run.coreChamber.rebootArmed) return `Reboot now for Core +${run.pendingCore}, or wait for the shell to reform and push the reward higher.`;
  return `Reboot is armed for Core +${run.pendingCore}. Confirm only when you want this Run to end.`;
}

function upgradeButton(action: string, label: string, cost: number): string { return `<button class="action primary" data-action="${action}" ${state.run.scrap >= cost ? '' : 'disabled'}>${label}</button>`; }
function toggleButton(action: string, label: string, enabled: boolean): string { return `<button class="action ${enabled ? 'toggle-on' : ''}" data-action="${action}">${label} ${enabled ? 'ON' : 'OFF'}</button>`; }
function signal(value: number): string { return value >= 0.5 ? 'HIGH' : value >= 0.18 ? 'MED' : 'LOW'; }
function setHtml(element: HTMLElement, html: string): void { if (uiHtml.get(element) === html) return; uiHtml.set(element, html); element.innerHTML = html; }
function contextMarkup(title: string, meta: string, actions: string): string { return `<div class="context-copy"><h1 class="context-title">${title}</h1><p class="context-meta">${meta}</p></div><div class="context-actions">${actions}</div>`; }
function fmt(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function formatState(value: string): string { return value.replaceAll('_', ' '); }

renderDom();
requestAnimationFrame(frame);
