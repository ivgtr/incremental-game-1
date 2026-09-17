import './style.css';
import { GameAudio } from './game/audio';
import {
  ANOMALIES,
  AUTO_SWING_MANUAL_SWINGS_REQUIRED,
  BORE_INSTALL_COST,
  CORE_PROTOCOLS,
  CREW_BOARD_COST,
  D060_EXTENSION_COST,
  D100_EXTENSION_COST,
  D180_EXTENSION_COST,
  D250_EXTENSION_COST,
  D400_EXTENSION_COST,
  D650_SHAFT_COST,
  FREIGHT_INSTALL_COST,
  PASSIVES,
  RAIL_INSTALL_COST,
  RESEARCH,
  SAVE_INTERVAL,
  UPGRADE_COSTS,
} from './game/config';
import { createGameState } from './game/createGame';
import {
  canInstallBore,
  canPlayerAccessNode,
  canStartD650Construction,
  canStartFreightConstruction,
  canStartRailConstruction,
  canUnlockD250,
  canUnlockD400,
  installBore,
  processDeepEvents,
  setFreightPriority,
  setRailPriority,
  startD650Construction,
  startFreightConstruction,
  startRailConstruction,
  unlockD250,
  unlockD400,
  updateDeepGame,
} from './game/deepGame';
import {
  applyOfflineProgress,
  armPhase5Reboot,
  assignCrew,
  canPushD180,
  canTravelPhase5,
  canUnlockCrewOperations,
  equipCrewItem,
  equipPlayerItem,
  expandCrewSlots,
  hireCrew,
  phase5Floor,
  playerHasEquipmentAffix,
  processPhase5Events,
  pushD180,
  requestPhase5Travel,
  selectCrewBoard,
  setCargoPriority,
  setMinerPriority,
  setPorterPriority,
  unlockCrewOperations,
  unlockedPhase5Depths,
  updatePhase5,
} from './game/phase5';
import { deeperDepth } from './game/depth';
import { loadFromStorage, saveToStorage } from './game/save';
import {
  canExtendD030,
  canExtendD060,
  canExtendD100,
  canMine,
  canStartResearch,
  cargoValue,
  cargoWeight,
  carriedWeight,
  chooseAnomaly,
  currentFloor,
  d030ExtensionCost,
  drainEvents,
  effectiveTreasureChance,
  moveToSelectedNode,
  purchaseCoreProtocol,
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
import type {
  AnomalyId,
  CargoRoutingPriority,
  CoreProtocolId,
  CrewMember,
  EquipmentItem,
  FreightPriority,
  GameState,
  MinerPriority,
  MiningNode,
  PassiveId,
  PorterPriority,
  RailPriority,
  ResearchId,
} from './game/types';
import { GameRenderer } from './render/gameRenderer';

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
        <span>Click a vein or machine to inspect it · press <kbd>Space</kbd> to swing</span>
        <span>Cargo stays physical: mine → carry → line → vertical transport → Surface.</span>
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
const restoredOffline = applyOfflineProgress(state);
if (restoredOffline) saveToStorage(state);
const renderer = new GameRenderer(canvas);
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
    const node = currentFloor(state).nodes.find((candidate) => candidate.id === target.id);
    if (node && !canPlayerAccessNode(node)) state.selection = { type: 'node', id: target.id };
    else {
      const isCurrent = state.run.character.targetNodeId === target.id;
      if (isCurrent && canMine(state)) requestMine(state);
      else selectNode(state, target.id);
    }
  } else if (target.type === 'rail-stop') state.selection = { type: 'rail-stop', id: target.id };
  else if (target.type === 'cargo-hub') state.selection = { type: 'cargo-hub', id: target.id };
  else if (target.type === 'freight-control') state.selection = { type: 'freight-control' };
  else if (target.type === 'bore-console') state.selection = { type: 'bore-console', id: target.id };
  else if (target.type === 'crew-board') selectCrewBoard(state);
  else if (target.type === 'elevator') selectElevator(state);
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
  const selection = state.selection;
  const selected = selection?.type === 'node' ? currentFloor(state).nodes.find((node) => node.id === selection.id) : undefined;
  if (!selected || canPlayerAccessNode(selected)) requestMine(state);
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
    case 'push-d180': pushD180(state); break;
    case 'extend-d250': unlockD250(state); break;
    case 'build-rail': startRailConstruction(state); break;
    case 'build-freight': startFreightConstruction(state); break;
    case 'extend-d400': unlockD400(state); break;
    case 'build-d650': startD650Construction(state); break;
    case 'install-bore': if (button.dataset.site) installBore(state, button.dataset.site); break;
    case 'rail-priority': {
      const lineId = button.dataset.line;
      const priority = button.dataset.priority as RailPriority | undefined;
      if (lineId && priority) setRailPriority(state, lineId, priority);
      break;
    }
    case 'freight-priority': {
      const priority = button.dataset.priority as FreightPriority | undefined;
      if (priority) setFreightPriority(state, priority);
      break;
    }
    case 'unlock-crew': unlockCrewOperations(state); break;
    case 'expand-crew': expandCrewSlots(state); break;
    case 'hire-miner': hireCrew(state, 'MINER'); break;
    case 'hire-porter': hireCrew(state, 'PORTER'); break;
    case 'assign-crew': {
      const crewId = button.dataset.crew;
      const depth = button.dataset.depth as GameState['run']['depth']['current'] | undefined;
      if (crewId && depth) assignCrew(state, crewId, depth);
      break;
    }
    case 'cycle-miner-priority': if (button.dataset.crew) cycleMinerPriority(button.dataset.crew); break;
    case 'cycle-porter-priority': if (button.dataset.crew) cyclePorterPriority(button.dataset.crew); break;
    case 'cargo-priority': {
      const priority = button.dataset.priority as CargoRoutingPriority | undefined;
      if (priority) setCargoPriority(state, priority);
      break;
    }
    case 'equip-item': if (button.dataset.item) equipPlayerItem(state, button.dataset.item); break;
    case 'equip-crew-item': if (button.dataset.item && button.dataset.crew) equipCrewItem(state, button.dataset.crew, button.dataset.item); break;
    case 'travel': {
      const depth = button.dataset.depth as GameState['run']['depth']['current'] | undefined;
      if (depth) requestPhase5Travel(state, depth);
      break;
    }
    case 'choose-anomaly': if (button.dataset.anomaly) chooseAnomaly(state, button.dataset.anomaly as AnomalyId); break;
    case 'toggle-passive': if (button.dataset.passive) togglePassive(state, button.dataset.passive as PassiveId); break;
    case 'research': if (button.dataset.research) startResearch(state, button.dataset.research as ResearchId); break;
    case 'protocol': if (button.dataset.protocol) purchaseCoreProtocol(state, button.dataset.protocol as CoreProtocolId); break;
    case 'reboot': armPhase5Reboot(state); break;
  }
  saveToStorage(state);
  renderDom();
});

window.addEventListener('beforeunload', () => saveToStorage(state));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveToStorage(state); });

function frame(now: number): void {
  const delta = Math.min(0.25, (now - previous) / 1000);
  previous = now;
  accumulator += delta;
  saveTimer += delta;
  while (accumulator >= FIXED_STEP) {
    updateGame(state, FIXED_STEP);
    updatePhase5(state, FIXED_STEP);
    updateDeepGame(state, FIXED_STEP);
    state.meta.bestDepth = deeperDepth(state.meta.bestDepth, state.run.depth.current);
    accumulator -= FIXED_STEP;
  }
  const baseEvents = drainEvents(state);
  processPhase5Events(state, baseEvents);
  const phase5Events = drainEvents(state);
  processDeepEvents(state, [...baseEvents, ...phase5Events]);
  const deepEvents = drainEvents(state);
  const events = [...baseEvents, ...phase5Events, ...deepEvents];
  for (const gameEvent of events) {
    renderer.handleEvent(gameEvent, state, now);
    audio.handle(gameEvent);
  }
  if (saveTimer >= SAVE_INTERVAL) { saveToStorage(state); saveTimer = 0; }
  renderer.render(state, now);
  renderDom();
  requestAnimationFrame(frame);
}

function renderDom(): void {
  const run = state.run;
  const floor = phase5Floor(state, run.depth.current);
  const floorCargo = floor?.cargo ?? [];
  const line = run.logistics.lines.find((candidate) => candidate.depth === run.depth.current);
  const hub = run.logistics.cargoHubs.find((candidate) => candidate.depth === run.depth.current);
  const bore = run.deepAutomation.bores.find((candidate) => candidate.depth === run.depth.current);
  setHtml(hudLeft, `
    <strong>SCRAP ${run.scrap}</strong> · <strong>DATA ${run.data}</strong> · <strong>CORE ${state.meta.core}</strong><br>
    <span class="muted">CARRY</span> ${fmt(carriedWeight(state))}/${fmt(run.character.backpackCapacity)}kg ·
    <span class="muted">LIFT</span> ${fmt(cargoWeight(run.elevator.cargo))}/${fmt(run.elevator.maxLoad)}kg
    ${run.phase5.crew.unlocked ? `<br><span class="muted">SHIFT</span> ${run.phase5.crew.members.length}/${run.phase5.crew.slots} · <span class="muted">FLOOR</span> ${fmt(cargoWeight(floorCargo))}kg` : ''}
    ${line ? `<br><span class="muted">LINE</span> ${fmt(cargoWeight(line.inputBuffer))}/${fmt(line.maxInputWeight)}kg · ${formatState(line.state)}` : ''}
    ${hub ? ` · <span class="muted">HUB</span> ${fmt(cargoWeight(hub.buffer))}/${fmt(hub.maxWeight)}kg` : ''}
    ${bore ? `<br><span class="muted">BORE</span> ${formatState(bore.state)} · OUT ${fmt(cargoWeight(bore.outputBuffer))}/${fmt(bore.maxOutputWeight)}kg` : ''}
  `);
  const freight = run.logistics.freightCage;
  const engineer = run.engineer;
  setHtml(hudRight, `
    <strong>RUN ${String(state.meta.runIndex).padStart(2, '0')} · ${run.depth.current}</strong><br>
    <span class="muted">RESEARCH</span> ${run.research.active ? RESEARCH[run.research.active.id].name : `${run.research.completed.length}/${Object.keys(RESEARCH).length}`}<br>
    <span class="muted">ENGINEER</span> ${engineer.unlocked ? formatState(engineer.state) : 'LOCKED'}<br>
    <span class="muted">FREIGHT</span> ${formatState(freight.state)}${freight.cargo.length ? ` · ${fmt(cargoWeight(freight.cargo))}kg` : ''}<br>
    <span class="muted">BEST</span> ${state.meta.bestDepth}
  `);

  if (run.elevator.travel) {
    const travel = run.elevator.travel;
    setHtml(context, contextMarkup('Central Elevator', `${travel.from} → ${travel.to} · ${travel.remaining.toFixed(1)}s`, ''));
    return;
  }
  const selection = state.selection;
  if (selection?.type === 'node') {
    const node = currentFloor(state).nodes.find((candidate) => candidate.id === selection.id);
    if (node) renderNodeContext(node);
    return;
  }
  if (state.selection?.type === 'rail-stop') { renderRailContext(state.selection.id); return; }
  if (state.selection?.type === 'cargo-hub') { renderCargoHubContext(state.selection.id); return; }
  if (state.selection?.type === 'freight-control') { renderFreightContext(); return; }
  if (state.selection?.type === 'bore-console') { renderBoreContext(state.selection.id); return; }
  if (state.selection?.type === 'elevator') { renderElevatorContext(); return; }
  if (state.selection?.type === 'workbench') { renderWorkbenchContext(); return; }
  if (state.selection?.type === 'scanner') { renderScannerContext(); return; }
  if (state.selection?.type === 'archive') { renderArchiveContext(); return; }
  if (state.selection?.type === 'research') { renderResearchContext(); return; }
  if (state.selection?.type === 'core-console') { renderCoreConsoleContext(); return; }
  if (state.selection?.type === 'core-chamber') { renderCoreChamberContext(); return; }
  if (state.selection?.type === 'crew-board') { renderCrewBoardContext(); return; }
  setHtml(context, contextMarkup(`${run.depth.current} · ${biomeName(run.depth.current)}`, nextObjective(state), deepControls()));
}

function renderNodeContext(node: MiningNode): void {
  const remote = !canPlayerAccessNode(node);
  const mineEnabled = !remote && canMine(state);
  const moving = state.run.character.state === 'MOVING_TO_NODE';
  const broken = node.hp <= 0;
  const bore = state.run.deepAutomation.bores.find((candidate) => candidate.siteId === node.id);
  let actions = `<button class="action" data-action="move" ${remote || broken ? 'disabled' : ''}>${moving ? 'MOVING' : 'MOVE'}</button>
    <button class="action primary" data-action="mine" ${mineEnabled ? '' : 'disabled'}>MINE</button>`;
  if (remote && !bore) actions += `<button class="action primary" data-action="install-bore" data-site="${node.id}" ${canInstallBore(state, node.id) ? '' : 'disabled'}>INSTALL REMOTE BORE · ${BORE_INSTALL_COST}</button>`;
  if (bore) actions += `<span class="inline-status">BORE ${formatState(bore.state)} · cycle ${Math.round((bore.cycleProgress / Math.max(0.001, bore.cycleDuration)) * 100)}%</span>`;
  setHtml(context, contextMarkup(node.name,
    `${broken ? `DEPLETED · respawn ${Math.ceil(node.respawnTimer)}s` : `HP ${node.hp}/${node.maxHp}`} · ${node.distanceMeters}m${nodeReadout(node)}${remote ? ' · NO WALKWAY' : ''}`,
    actions));
}

function nodeReadout(node: MiningNode): string {
  const depth = state.run.depth.current;
  if (node.id === 'core-shell') return ' · Core cargo must reach Surface';
  if (depth === 'D-180') return ` · ANCIENT · ${node.id === 'ruined-workshop' ? 'Equipment / Scrap' : node.id === 'archive-vault' ? 'Relic / Data' : 'Rare / Core'}`;
  if (depth === 'D-250') return ` · THE LOST · ${node.id === 'lost-depot' ? 'Alloy / Rail Parts' : node.id === 'hanging-vein' ? 'Valuable / Equipment · long route' : 'Research / Relic · high logistics load'}`;
  if (depth === 'D-400') return ` · NULL STRATA · ${node.id === 'null-edge' ? 'Player / Miner access' : node.id === 'echo-pocket' ? 'Remote Bore / Research' : 'Deep Component / Core'}`;
  if (playerHasEquipmentAffix(state, 'SURVEY_LAMP')) return ` · Research ${signal(node.researchWeight)} · Rare ${signal(effectiveTreasureChance(state, node))}`;
  return '';
}

function renderRailContext(lineId: string): void {
  const line = state.run.logistics.lines.find((candidate) => candidate.id === lineId);
  if (!line) return;
  const cart = state.run.logistics.railCarts.find((candidate) => candidate.lineId === line.id);
  const actions = `<span class="depth-buttons">${(['BULK', 'RESEARCH', 'RARE', 'ANY'] as RailPriority[]).map((priority) => `<button class="action ${line.priority === priority ? 'toggle-on' : ''}" data-action="rail-priority" data-line="${line.id}" data-priority="${priority}">${priority}</button>`).join('')}</span>`;
  setHtml(context, contextMarkup('Rail Stop / Line Control', `${formatState(line.state)} · stop ${fmt(cargoWeight(line.inputBuffer))}/${fmt(line.maxInputWeight)}kg · cart ${cart ? formatState(cart.state) : 'MISSING'} ${cart ? fmt(cargoWeight(cart.cargo)) : 0}kg${line.jamReason ? ` · JAM ${line.jamReason}` : ''}`, actions));
}

function renderCargoHubContext(hubId: string): void {
  const hub = state.run.logistics.cargoHubs.find((candidate) => candidate.id === hubId);
  if (!hub) return;
  const freight = state.run.logistics.freightCage;
  const actions = freight.state === 'UNBUILT'
    ? `<button class="action primary" data-action="build-freight" ${canStartFreightConstruction(state) ? '' : 'disabled'}>BUILD FREIGHT CAGE · ${FREIGHT_INSTALL_COST}</button>`
    : `<span class="depth-buttons">${(['BULK', 'BALANCED'] as FreightPriority[]).map((priority) => `<button class="action ${freight.priority === priority ? 'toggle-on' : ''}" data-action="freight-priority" data-priority="${priority}">${priority}</button>`).join('')}</span>`;
  setHtml(context, contextMarkup('Cargo Hub', `${hub.depth} · ${fmt(cargoWeight(hub.buffer))}/${fmt(hub.maxWeight)}kg · bulk waits for Freight; rare/research can return to Central Elevator.`, actions));
}

function renderFreightContext(): void {
  const cage = state.run.logistics.freightCage;
  const actions = `<span class="depth-buttons">${(['BULK', 'BALANCED'] as FreightPriority[]).map((priority) => `<button class="action ${cage.priority === priority ? 'toggle-on' : ''}" data-action="freight-priority" data-priority="${priority}">${priority}</button>`).join('')}</span>`;
  setHtml(context, contextMarkup('Freight Cage', `${formatState(cage.state)} · cargo-only · ${fmt(cargoWeight(cage.cargo))}/${fmt(cage.maxLoad)}kg${cage.targetDepth ? ` · target ${cage.targetDepth}` : ''}. Central Elevator remains the priority/personnel route.`, actions));
}

function renderBoreContext(boreId: string): void {
  const bore = state.run.deepAutomation.bores.find((candidate) => candidate.id === boreId);
  if (!bore) return;
  const line = bore.connectedLineId ? state.run.logistics.lines.find((candidate) => candidate.id === bore.connectedLineId) : undefined;
  setHtml(context, contextMarkup('Remote Bore Console', `${bore.siteId} · ${formatState(bore.state)} · target ${bore.targetNodeId ?? 'NONE'} · cycle ${Math.round((bore.cycleProgress / Math.max(0.001, bore.cycleDuration)) * 100)}% · output ${fmt(cargoWeight(bore.outputBuffer))}/${fmt(bore.maxOutputWeight)}kg · line ${line ? formatState(line.state) : 'DISCONNECTED'}`, ''));
}

function renderElevatorContext(): void {
  const run = state.run;
  const weight = cargoWeight(run.elevator.cargo);
  const value = cargoValue(run.elevator.cargo);
  const canSend = run.elevator.state === 'IDLE_BOTTOM' && weight > 0 && run.character.state !== 'LOADING' && run.porter.state !== 'LOADING';
  let actions = `<button class="action primary" data-action="send" ${canSend ? '' : 'disabled'}>SEND</button>`;
  if (run.porter.enabled && !run.automation.autoDispatch.unlocked) actions += upgradeButton('unlock-auto-dispatch', `FIT AUTO RELAY · ${UPGRADE_COSTS.autoDispatch}`, UPGRADE_COSTS.autoDispatch);
  else if (run.automation.autoDispatch.unlocked) actions += toggleButton('toggle-auto-dispatch', 'AUTO DISPATCH', run.automation.autoDispatch.enabled);
  if (run.depth.current === 'D-001' && !run.depth.unlocked.includes('D-030')) actions += `<button class="action depth-action" data-action="extend-d030" ${canExtendD030(state) ? '' : 'disabled'}>EXTEND D-030 · ${d030ExtensionCost(state)}</button>`;
  else if (run.depth.current === 'D-030' && !run.depth.unlocked.includes('D-060')) actions += `<button class="action depth-action" data-action="extend-d060" ${canExtendD060(state) ? '' : 'disabled'}>EXTEND D-060 · ${D060_EXTENSION_COST}</button>`;
  else if (run.depth.current === 'D-060' && !run.depth.unlocked.includes('D-100')) actions += `<button class="action depth-action" data-action="extend-d100" ${canExtendD100(state) ? '' : 'disabled'}>EXTEND D-100 · ${D100_EXTENSION_COST}</button>`;
  actions += deepControls();
  const travelButtons = unlockedPhase5Depths(state).filter((depth) => depth !== run.depth.current).map((depth) => `<button class="action travel-action" data-action="travel" data-depth="${depth}" ${canTravelPhase5(state, depth) ? '' : 'disabled'}>${depth}</button>`).join('');
  if (travelButtons) actions += `<span class="depth-buttons">${travelButtons}</span>`;
  if (run.phase5.cargo.unlocked) actions += `<span class="depth-buttons">${(['BALANCED', 'CORE', 'RESEARCH', 'ANCIENT'] as CargoRoutingPriority[]).map((priority) => `<button class="action ${run.phase5.cargo.priority === priority ? 'toggle-on' : ''}" data-action="cargo-priority" data-priority="${priority}">${priority}</button>`).join('')}</span>`;
  setHtml(context, contextMarkup('Central Elevator', `Priority transport · ${fmt(weight)}/${fmt(run.elevator.maxLoad)}kg · EST ${value} Scrap · ${formatState(run.elevator.state)}`, actions));
}

function deepControls(): string {
  const run = state.run;
  let out = '';
  if (run.depth.unlocked.includes('D-180') && !run.depth.unlocked.includes('D-250')) out += `<button class="action depth-action" data-action="extend-d250" ${canUnlockD250(state) ? '' : 'disabled'}>EXTEND D-250 · ${D250_EXTENSION_COST}</button>`;
  if (run.depth.unlocked.includes('D-250')) {
    const line = run.logistics.lines.find((candidate) => candidate.depth === 'D-250');
    if (!line) out += `<button class="action primary" data-action="build-rail" ${canStartRailConstruction(state) ? '' : 'disabled'}>RESTORE RAIL · ${RAIL_INSTALL_COST}</button>`;
    else out += `<span class="depth-buttons">${(['BULK', 'RESEARCH', 'RARE', 'ANY'] as RailPriority[]).map((priority) => `<button class="action ${line.priority === priority ? 'toggle-on' : ''}" data-action="rail-priority" data-line="${line.id}" data-priority="${priority}">${priority}</button>`).join('')}</span>`;
    if (run.logistics.freightCage.state === 'UNBUILT') out += `<button class="action" data-action="build-freight" ${canStartFreightConstruction(state) ? '' : 'disabled'}>BUILD FREIGHT CAGE · ${FREIGHT_INSTALL_COST}</button>`;
    else out += `<span class="depth-buttons">${(['BULK', 'BALANCED'] as FreightPriority[]).map((priority) => `<button class="action ${run.logistics.freightCage.priority === priority ? 'toggle-on' : ''}" data-action="freight-priority" data-priority="${priority}">FREIGHT ${priority}</button>`).join('')}</span>`;
    if (!run.depth.unlocked.includes('D-400')) out += `<button class="action depth-action" data-action="extend-d400" ${canUnlockD400(state) ? '' : 'disabled'}>EXTEND D-400 · ${D400_EXTENSION_COST}</button>`;
  }
  if (run.depth.unlocked.includes('D-400') && !run.depth.unlocked.includes('D-650')) out += `<button class="action depth-action" data-action="build-d650" ${canStartD650Construction(state) ? '' : 'disabled'}>SHAFT EXTENSION D-650 · ${D650_SHAFT_COST}</button>`;
  return out;
}

function renderCrewBoardContext(): void {
  const run = state.run;
  const crew = run.phase5.crew;
  if (!crew.unlocked) {
    const ready = run.research.completed.includes('CREW_ROUTING') && run.research.completed.includes('CARGO_SCHEDULER');
    setHtml(context, contextMarkup('Crew Board', ready ? `Open assignable shifts · ${CREW_BOARD_COST} Scrap.` : 'Complete Crew Routing and Cargo Scheduler first.', `<button class="action primary" data-action="unlock-crew" ${canUnlockCrewOperations(state) ? '' : 'disabled'}>OPEN FIRST SHIFT · ${CREW_BOARD_COST}</button>`));
    return;
  }
  const rows = crew.members.map(crewLine).join('');
  const management = `<div class="research-stack">${rows}</div><span class="depth-buttons"><button class="action" data-action="hire-miner" ${crew.members.length < crew.slots && run.scrap >= 2600 ? '' : 'disabled'}>HIRE MINER · 2600</button><button class="action" data-action="hire-porter" ${crew.members.length < crew.slots && run.scrap >= 2200 ? '' : 'disabled'}>HIRE PORTER · 2200</button><button class="action" data-action="expand-crew" ${crew.slots >= 4 ? 'disabled' : ''}>EXPAND SHIFT</button></span>${deepControls()}`;
  setHtml(context, contextMarkup('Shift / Logistics Board', `${crew.members.length}/${crew.slots} staffed · ${run.engineer.unlocked ? `Engineer ${formatState(run.engineer.state)}` : 'Engineer locked'}.`, management));
}

function crewLine(member: CrewMember): string {
  const destinations = unlockedPhase5Depths(state).filter((depth) => depth !== member.assignedDepth).map((depth) => `<button class="action travel-action" data-action="assign-crew" data-crew="${member.id}" data-depth="${depth}" ${member.pendingDepth || member.body.carried.length > 0 ? 'disabled' : ''}>${depth}</button>`).join('');
  const priorityAction = member.role === 'MINER' ? 'cycle-miner-priority' : 'cycle-porter-priority';
  const tool = bestCrewTool(member);
  return `<div class="research-line"><strong>${member.name} · ${member.assignedDepth}${member.pendingDepth ? ` → ${member.pendingDepth}` : ''}</strong><span>${formatState(member.state)} · ${member.role === 'MINER' ? member.minerPriority : member.porterPriority}</span><span class="depth-buttons">${destinations}<button class="action" data-action="${priorityAction}" data-crew="${member.id}">PRIORITY</button>${member.role === 'MINER' && tool ? `<button class="action" data-action="equip-crew-item" data-crew="${member.id}" data-item="${tool.id}">TOOL ${tool.rarity}</button>` : ''}</span></div>`;
}

function cycleMinerPriority(crewId: string): void {
  const member = state.run.phase5.crew.members.find((candidate) => candidate.id === crewId && candidate.role === 'MINER');
  if (!member) return;
  const order: MinerPriority[] = ['ANY', 'RESEARCH', 'RARE', 'NEAREST'];
  setMinerPriority(state, crewId, order[(order.indexOf(member.minerPriority) + 1) % order.length]!);
}
function cyclePorterPriority(crewId: string): void {
  const member = state.run.phase5.crew.members.find((candidate) => candidate.id === crewId && candidate.role === 'PORTER');
  if (!member) return;
  const order: PorterPriority[] = ['NEAREST', 'RESEARCH', 'CORE', 'RELIC', 'RARE', 'VALUE'];
  setPorterPriority(state, crewId, order[(order.indexOf(member.porterPriority) + 1) % order.length]!);
}
function bestCrewTool(member: CrewMember): EquipmentItem | undefined { return state.run.phase5.equipment.inventory.filter((item) => item.slot === 'TOOL' && item.id !== member.equipment.TOOL).at(-1); }

function renderWorkbenchContext(): void {
  const run = state.run;
  let actions = '';
  if (run.tool.level === 1) actions += upgradeButton('upgrade-tool', `STEEL PICK · ${UPGRADE_COSTS.tool}`, UPGRADE_COSTS.tool);
  if (run.boots.level === 1) actions += upgradeButton('upgrade-boots', `RUNNER BOOTS · ${UPGRADE_COSTS.boots}`, UPGRADE_COSTS.boots);
  if (!run.automation.autoSwing.unlocked) actions += `<button class="action" data-action="unlock-auto-swing" ${run.scrap >= UPGRADE_COSTS.autoSwing && run.stats.manualSwings >= AUTO_SWING_MANUAL_SWINGS_REQUIRED ? '' : 'disabled'}>AUTO SWING · ${UPGRADE_COSTS.autoSwing}</button>`;
  else actions += toggleButton('toggle-auto-swing', 'AUTO SWING', run.automation.autoSwing.enabled);
  if (run.pack.level === 1) actions += upgradeButton('upgrade-pack', `FRAME PACK · ${UPGRADE_COSTS.pack}`, UPGRADE_COSTS.pack);
  if (!run.porter.enabled && !run.phase5.crew.unlocked) actions += upgradeButton('unlock-porter', `HIRE PORTER · ${UPGRADE_COSTS.porter}`, UPGRADE_COSTS.porter);
  const items = run.phase5.equipment.inventory.slice(-8).map((item) => `<button class="research-line ${run.phase5.equipment.equippedPlayer[item.slot] === item.id ? 'complete' : ''}" data-action="equip-item" data-item="${item.id}"><strong>${item.rarity} · ${item.name}</strong><span>${item.slot} · ${item.affixes.map((affix) => affix.name).join(' / ')}</span></button>`).join('');
  setHtml(context, contextMarkup('Workshop', nextObjective(state), `${actions}${items ? `<div class="research-stack">${items}</div>` : ''}`));
}

function renderScannerContext(): void {
  if (state.run.anomaly.selected) { const chosen = ANOMALIES[state.run.anomaly.selected]; setHtml(context, contextMarkup('Geological Scanner', `${chosen.name} · ${chosen.description}`, '')); return; }
  const options = state.run.anomaly.options.map((id) => `<button class="choice-line" data-action="choose-anomaly" data-anomaly="${id}"><strong>${ANOMALIES[id].name}</strong><span>${ANOMALIES[id].description}</span></button>`).join('');
  setHtml(context, contextMarkup('Three anomalous responses', 'Choose one for this Run.', `<div class="choice-stack">${options}</div>`));
}

function renderArchiveContext(): void {
  const collection = state.meta.collection.entries.map((entry) => entry.discovered ? `<span class="archive-item found">${entry.name} · ${entry.rarity} ×${entry.count}</span>` : `<span class="archive-item">???? · ${entry.category}</span>`).join('');
  const passiveButtons = state.meta.passives.unlocked.map((id) => { const active = state.meta.passives.active.includes(id); return `<button class="passive-line ${active ? 'active' : ''}" data-action="toggle-passive" data-passive="${id}" ${!active && state.meta.passives.active.length >= 2 ? 'disabled' : ''}><strong>${PASSIVES[id].name}</strong><span>${active ? 'ACTIVE' : 'STORED'} · ${PASSIVES[id].description}</span></button>`; }).join('');
  setHtml(context, contextMarkup('Archive Terminal', `Discoveries persist across Reboot · Deep discoveries ${state.meta.deepDiscoveries.length}.`, `<div class="archive-layout"><div class="archive-grid">${collection}</div><div class="passive-stack">${passiveButtons}</div></div>`));
}

function renderResearchContext(): void {
  const active = state.run.research.active;
  const rows = (Object.keys(RESEARCH) as ResearchId[]).map((id) => { const definition = RESEARCH[id]; const done = state.run.research.completed.includes(id); const running = active?.id === id; return `<button class="research-line ${done ? 'complete' : running ? 'running' : ''}" data-action="research" data-research="${id}" ${canStartResearch(state, id) ? '' : 'disabled'}><strong>${definition.name}</strong><span>${done ? 'COMPLETE' : running ? `${Math.ceil(active.remaining)}s` : `DATA ${definition.dataCost}`} · ${definition.description}</span></button>`; }).join('');
  setHtml(context, contextMarkup('Surface Analyzer', `DATA ${state.run.data} · Research unlocks actions rather than passive production.`, `<div class="research-stack">${rows}</div>`));
}

function renderCoreChamberContext(): void {
  const run = state.run;
  let actions = deepControls();
  if (run.coreChamber.rebootAvailable) {
    actions = `<button class="action reboot-action" data-action="reboot">${run.coreChamber.rebootArmed ? `CONFIRM REBOOT · CORE +${run.pendingCore}` : `ARM REBOOT · CORE +${run.pendingCore}`}</button>${actions}`;
    if (!run.depth.unlocked.includes('D-180')) actions += `<button class="action primary" data-action="push-d180" ${canPushD180(state) ? '' : 'disabled'}>PUSH D-180 · ${D180_EXTENSION_COST}</button>`;
  }
  setHtml(context, contextMarkup('Core Chamber', run.pendingCore ? `CORE CHARGE ${run.pendingCore} · Reboot remains a choice while pushing deeper.` : 'Core cargo must be appraised before Reboot.', actions));
}

function renderCoreConsoleContext(): void {
  const rows = (Object.keys(CORE_PROTOCOLS) as CoreProtocolId[]).map((id) => { const definition = CORE_PROTOCOLS[id]; const owned = state.meta.protocols.includes(id); return `<button class="protocol-line ${owned ? 'owned' : ''}" data-action="protocol" data-protocol="${id}" ${owned || state.meta.core < definition.cost ? 'disabled' : ''}><strong>${definition.name}</strong><span>${owned ? 'INSTALLED' : `CORE ${definition.cost}`} · ${definition.description}</span></button>`; }).join('');
  setHtml(context, contextMarkup('Core Console', `CORE ${state.meta.core} · Protocols skip old setup work instead of adding a new prestige currency.`, `<div class="protocol-stack">${rows}</div>`));
}

function nextObjective(current: GameState): string {
  const run = current.run;
  if (run.depth.current === 'D-650') return 'D-650 · ??? · The shaft reaches an unreadable structure. This is the current endpoint.';
  if (run.depth.current === 'D-400') {
    if (!run.deepAutomation.bores.length) return 'Null Strata breaks ordinary walking. Inspect Remote-only sites and install a Bore.';
    if (run.deepProgress.deepComponentsDelivered < 3) return 'Keep Bore output connected through a Line and Freight route until Deep Components reach Surface.';
    return 'Analyze the delivered Deep Components and complete Deep Shaft Geometry.';
  }
  if (run.depth.current === 'D-250') {
    if (!run.logistics.lines.length) return 'The Lost makes Porter walking the bottleneck. Recover Rail Parts, research Rail Logistics, then restore the line.';
    if (run.logistics.freightCage.state === 'UNBUILT') return 'Rail moves horizontal cargo faster. Its Hub now exposes the vertical bottleneck: build Freight Cage.';
    return 'Route bulk through Rail → Freight while preserving Central Elevator for rare / research cargo.';
  }
  if (run.depth.unlocked.includes('D-180') && !run.depth.unlocked.includes('D-250')) return run.deepProgress.lostSampleDelivered ? 'Complete Lost Survey and reinforce the shaft for D-250.' : 'In Run 3, recover the Lost Signal Sample at D-180 and physically return it to Surface.';
  if (run.depth.current === 'D-180') return 'Ancient Ruins: split Crew and Central Elevator capacity, then decide whether to Reboot or push deeper.';
  if (!run.depth.unlocked.includes('D-100')) return 'Build the early mine, collect Data, complete Core Resonance, and extend D-100.';
  if (run.pendingCore === 0) return 'Break the D-100 Core Shell and return its fragments to Surface.';
  if (current.meta.runIndex === 1) return 'Reboot converts this Run into permanent Core and unlocks the next automation layer.';
  return 'Use the Shift Board to distribute Miner / Porter work across Floors while one Central Elevator remains shared.';
}

function biomeName(depth: GameState['run']['depth']['current']): string { if (depth === 'D-250') return 'THE LOST'; if (depth === 'D-400') return 'NULL STRATA'; if (depth === 'D-650') return '???'; if (depth === 'D-180') return 'ANCIENT RUINS'; return 'SHAFT'; }
function upgradeButton(action: string, label: string, cost: number): string { return `<button class="action primary" data-action="${action}" ${state.run.scrap >= cost ? '' : 'disabled'}>${label}</button>`; }
function toggleButton(action: string, label: string, enabled: boolean): string { return `<button class="action ${enabled ? 'toggle-on' : ''}" data-action="${action}">${label} ${enabled ? 'ON' : 'OFF'}</button>`; }
function signal(value: number): string { return value >= 0.5 ? 'HIGH' : value >= 0.18 ? 'MED' : 'LOW'; }
function setHtml(element: HTMLElement, html: string): void { if (uiHtml.get(element) === html) return; uiHtml.set(element, html); element.innerHTML = html; }
function contextMarkup(title: string, meta: string, actions: string): string { return `<div class="context-copy"><h1 class="context-title">${title}</h1><p class="context-meta">${meta}</p></div><div class="context-actions">${actions}</div>`; }
function fmt(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function formatState(value: string): string { return value.replaceAll('_', ' '); }

renderDom();
requestAnimationFrame(frame);
