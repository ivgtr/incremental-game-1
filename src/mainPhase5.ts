import './style.css';
import { GameAudio } from './game/audio';
import {
  ANOMALIES,
  AUTO_DISPATCH_MIN_WEIGHT,
  AUTO_SWING_MANUAL_SWINGS_REQUIRED,
  CORE_PROTOCOLS,
  CREW_BOARD_COST,
  D060_EXTENSION_COST,
  D100_EXTENSION_COST,
  D180_EXTENSION_COST,
  PASSIVES,
  RESEARCH,
  SAVE_INTERVAL,
  UPGRADE_COSTS,
} from './game/config';
import { createGameState } from './game/createGame';
import {
  applyOfflineProgress,
  armPhase5Reboot,
  assignCrew,
  canPushD180,
  canShowCrewBoard,
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
  porterWeight,
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
  DepthId,
  EquipmentItem,
  GameState,
  MinerPriority,
  MiningNode,
  PassiveId,
  Phase5DepthId,
  PorterPriority,
  ResearchId,
} from './game/types';
import { Phase5Renderer } from './render/phase5Renderer';

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
        <span>Every find still has to reach Surface. Crew only automate work that physically exists.</span>
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
const renderer = new Phase5Renderer(canvas);
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
  } else if (target.type === 'crew-board') selectCrewBoard(state);
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
    case 'push-d180': pushD180(state); break;
    case 'unlock-crew': unlockCrewOperations(state); break;
    case 'expand-crew': expandCrewSlots(state); break;
    case 'hire-miner': hireCrew(state, 'MINER'); break;
    case 'hire-porter': hireCrew(state, 'PORTER'); break;
    case 'assign-crew': {
      const crewId = button.dataset.crew;
      const depth = button.dataset.depth as Phase5DepthId | undefined;
      if (crewId && depth) assignCrew(state, crewId, depth);
      break;
    }
    case 'cycle-miner-priority': {
      const crewId = button.dataset.crew;
      if (crewId) cycleMinerPriority(crewId);
      break;
    }
    case 'cycle-porter-priority': {
      const crewId = button.dataset.crew;
      if (crewId) cyclePorterPriority(crewId);
      break;
    }
    case 'cargo-priority': {
      const priority = button.dataset.priority as CargoRoutingPriority | undefined;
      if (priority) setCargoPriority(state, priority);
      break;
    }
    case 'equip-item': {
      const itemId = button.dataset.item;
      if (itemId) equipPlayerItem(state, itemId);
      break;
    }
    case 'equip-crew-item': {
      const itemId = button.dataset.item;
      const crewId = button.dataset.crew;
      if (itemId && crewId) equipCrewItem(state, crewId, itemId);
      break;
    }
    case 'travel': {
      const depth = button.dataset.depth as Phase5DepthId | undefined;
      if (depth) requestPhase5Travel(state, depth);
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
    case 'reboot': armPhase5Reboot(state); break;
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
    updatePhase5(state, FIXED_STEP);
    if ((state.run.depth.current as string) === 'D-180') state.meta.bestDepth = 'D-180' as DepthId;
    accumulator -= FIXED_STEP;
  }
  const baseEvents = drainEvents(state);
  processPhase5Events(state, baseEvents);
  const phase5Events = drainEvents(state);
  const events = [...baseEvents, ...phase5Events];
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
  const floor = phase5Floor(state, run.depth.current as Phase5DepthId);
  const floorCargo = floor?.cargo ?? [];
  setHtml(hudLeft, `
    <strong>SCRAP ${run.scrap}</strong> · <strong>DATA ${run.data}</strong> · <strong>CORE ${state.meta.core}</strong><br>
    <span class="muted">CARRY</span> ${fmt(carriedWeight(state))}/${fmt(run.character.backpackCapacity)}kg ·
    <span class="muted">LIFT</span> ${fmt(cargoWeight(run.elevator.cargo))}/${fmt(run.elevator.maxLoad)}kg
    ${run.porter.enabled ? `<br><span class="muted">PORTER</span> ${fmt(porterWeight(state))}/${fmt(run.porter.capacity)}kg` : ''}
    ${run.phase5.crew.unlocked ? `<br><span class="muted">SHIFT</span> ${run.phase5.crew.members.length}/${run.phase5.crew.slots} · <span class="muted">FLOOR CARGO</span> ${fmt(cargoWeight(floorCargo))}kg` : ''}
    ${run.pendingCore > 0 ? `<br><span class="core-readout">PENDING CORE +${run.pendingCore}</span>` : ''}
  `);
  const anomaly = run.anomaly.selected ? ANOMALIES[run.anomaly.selected].name : run.depth.current === 'D-030' ? 'UNRESOLVED' : '—';
  const research = run.research.active ? `${RESEARCH[run.research.active.id].name} ${Math.ceil(run.research.active.remaining)}s` : `${run.research.completed.length}/${Object.keys(RESEARCH).length}`;
  const crewSummary = run.phase5.crew.unlocked
    ? run.phase5.crew.members.map((member) => `${member.role[0]}:${member.assignedDepth.replace('D-', '')}`).join(' ')
    : '—';
  setHtml(hudRight, `
    <strong>RUN ${String(state.meta.runIndex).padStart(2, '0')} · ${run.depth.current}</strong><br>
    <span class="muted">ANOMALY</span> ${anomaly}<br>
    <span class="muted">RESEARCH</span> ${research}<br>
    <span class="muted">CREW</span> ${crewSummary}<br>
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
  if (state.selection?.type === 'crew-board') { renderCrewBoardContext(); return; }
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
  const depth = state.run.depth.current as Phase5DepthId;
  if (node.id === 'core-shell') return ' · CORE SIGNAL LOCKED · fragments must reach Surface';
  if (depth === 'D-180') {
    const site = node.id === 'ruined-workshop' ? 'Equipment / stable Scrap'
      : node.id === 'archive-vault' ? 'Relic / Data / records'
        : 'High rare / Core / heavy logistics';
    const survey = playerHasEquipmentAffix(state, 'SURVEY_LAMP') ? ` · Research ${signal(node.researchWeight)} · Rare ${signal(effectiveTreasureChance(state, node))}` : '';
    return ` · ANCIENT SITE · ${site}${survey}`;
  }
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
  else if (!run.porter.enabled && !run.phase5.crew.unlocked) action = `${toggleButton('toggle-auto-swing', 'AUTO SWING', run.automation.autoSwing.enabled)}${upgradeButton('unlock-porter', `HIRE PORTER · ${UPGRADE_COSTS.porter}`, UPGRADE_COSTS.porter)}`;
  else action = toggleButton('toggle-auto-swing', 'AUTO SWING', run.automation.autoSwing.enabled);

  const rare = run.phase5.equipment.inventory.slice(-6).map((item) => equipmentLine(item)).join('');
  const rareBlock = rare ? `<div class="research-stack">${rare}</div>` : '';
  setHtml(context, contextMarkup('Tool Bench', `${equipment} · ${note}`, `${action}${rareBlock}`));
}

function equipmentLine(item: EquipmentItem): string {
  const equipped = state.run.phase5.equipment.equippedPlayer[item.slot] === item.id;
  const affixes = item.affixes.map((affix) => affix.name).join(' / ');
  return `<button class="research-line ${equipped ? 'complete' : ''}" data-action="equip-item" data-item="${item.id}" ${equipped ? 'disabled' : ''}><strong>${item.rarity} · ${item.name}</strong><span>${item.slot} · ${affixes || 'No calibrated affix'} · ${equipped ? 'EQUIPPED' : 'EQUIP'}</span></button>`;
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

  const travelButtons = unlockedPhase5Depths(state).filter((depth) => depth !== run.depth.current).map((depth) =>
    `<button class="action travel-action" data-action="travel" data-depth="${depth}" ${canTravelPhase5(state, depth) ? '' : 'disabled'}>${depth}</button>`).join('');
  if (travelButtons) actions += `<span class="depth-buttons">${travelButtons}</span>`;
  if (run.phase5.cargo.unlocked) {
    actions += `<span class="depth-buttons">${(['BALANCED', 'CORE', 'RESEARCH', 'ANCIENT'] as CargoRoutingPriority[]).map((priority) =>
      `<button class="action ${run.phase5.cargo.priority === priority ? 'toggle-on' : ''}" data-action="cargo-priority" data-priority="${priority}">${priority}</button>`).join('')}</span>`;
  }
  const autoRule = run.automation.autoDispatch.enabled ? ` · auto at ${AUTO_DISPATCH_MIN_WEIGHT}kg / blocked load` : '';
  const relay = run.research.completed.includes('MULTI_STOP_RELAY') ? ' · DIRECT FLOOR RELAY' : ' · underground transfers route via Surface';
  const route = run.phase5.cargo.route ? ` · ROUTING ${run.phase5.cargo.route.targetDepth} ${run.phase5.cargo.route.remaining.toFixed(1)}s` : '';
  setHtml(context, contextMarkup('Central Elevator', `CARGO ${fmt(weight)}/${fmt(run.elevator.maxLoad)}kg · EST. ${value} Scrap · ${formatState(run.elevator.state)}${autoRule}${relay}${route}`, actions));
}

function renderCrewBoardContext(): void {
  const run = state.run;
  const crew = run.phase5.crew;
  if (!crew.unlocked) {
    const researchReady = run.research.completed.includes('CREW_ROUTING') && run.research.completed.includes('CARGO_SCHEDULER');
    const meta = researchReady
      ? `Convert the old Porter workflow into assignable shifts. ${CREW_BOARD_COST} Scrap · requires an idle Porter.`
      : 'Run 2 field program · complete Crew Routing and Cargo Scheduler at the Surface Analyzer first.';
    setHtml(context, contextMarkup('Crew Board', meta, `<button class="action primary" data-action="unlock-crew" ${canUnlockCrewOperations(state) ? '' : 'disabled'}>OPEN FIRST SHIFT · ${CREW_BOARD_COST}</button>${offlineReportMarkup()}`));
    return;
  }
  const rows = crew.members.map((member) => crewLine(member)).join('');
  const nextSlotCost = crew.slots < 4 ? crew.slots === 2 ? 3200 : 5200 : 0;
  const management = `<div class="research-stack">${rows}</div><span class="depth-buttons">
    <button class="action" data-action="hire-miner" ${crew.members.length < crew.slots && run.scrap >= 2600 ? '' : 'disabled'}>HIRE MINER · 2600</button>
    <button class="action" data-action="hire-porter" ${crew.members.length < crew.slots && run.scrap >= 2200 ? '' : 'disabled'}>HIRE PORTER · 2200</button>
    ${crew.slots < 4 ? `<button class="action" data-action="expand-crew" ${run.scrap >= nextSlotCost ? '' : 'disabled'}>SLOT +1 · ${nextSlotCost}</button>` : ''}
  </span>${offlineReportMarkup()}`;
  setHtml(context, contextMarkup('Shift Board', `${crew.members.length}/${crew.slots} staffed · assignments keep running while you supervise another Floor.`, management));
}

function crewLine(member: CrewMember): string {
  const travel = member.pendingDepth ? ` → ${member.pendingDepth}` : '';
  const priority = member.role === 'MINER' ? member.minerPriority : member.porterPriority;
  const destinations = unlockedPhase5Depths(state).filter((depth) => depth !== member.assignedDepth).map((depth) =>
    `<button class="action travel-action" data-action="assign-crew" data-crew="${member.id}" data-depth="${depth}" ${member.pendingDepth || member.body.carried.length > 0 ? 'disabled' : ''}>${depth}</button>`).join('');
  const priorityAction = member.role === 'MINER' ? 'cycle-miner-priority' : 'cycle-porter-priority';
  const tool = bestCrewTool(member);
  const toolButton = member.role === 'MINER' && tool ? `<button class="action" data-action="equip-crew-item" data-crew="${member.id}" data-item="${tool.id}">TOOL: ${tool.rarity}</button>` : '';
  return `<div class="research-line"><strong>${member.name} · ${member.assignedDepth}${travel}</strong><span>${formatState(member.state)} · ${priority}</span><span class="depth-buttons">${destinations}<button class="action" data-action="${priorityAction}" data-crew="${member.id}">PRIORITY</button>${toolButton}</span></div>`;
}

function bestCrewTool(member: CrewMember): EquipmentItem | undefined {
  const current = member.equipment.TOOL;
  const candidates = state.run.phase5.equipment.inventory.filter((item) => item.slot === 'TOOL' && item.id !== current);
  return candidates.at(-1);
}

function offlineReportMarkup(): string {
  const report = state.run.phase5.offline.lastReport;
  if (!report) return '';
  const rows = report.entries.map((entry) => `${entry.depth} ${entry.loads} loads${entry.data ? ` · Data +${entry.data}` : ''}${entry.core ? ` · Core +${entry.core}` : ''}${entry.equipment ? ` · Equipment ${entry.equipment}` : ''}`).join(' / ');
  return `<span class="archive-empty">SHIFT REPORT · ${Math.round(report.seconds / 60)}m · ${rows || 'No assigned cargo completed.'}</span>`;
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
    `Surface-appraised discoveries persist across Reboot. Active build ${state.meta.passives.active.length}/2. Ancient blueprints ${state.meta.equipmentDiscoveries.length}.`,
    `<div class="archive-layout"><div class="archive-grid">${collection}</div><div class="passive-stack">${passiveButtons}</div></div>`,
  ));
}

function renderResearchContext(): void {
  const active = state.run.research.active;
  const rows = (Object.keys(RESEARCH) as ResearchId[]).filter((id) => state.meta.runIndex > 1 || !['CREW_ROUTING', 'CARGO_SCHEDULER', 'ANCIENT_SURVEY', 'SALVAGE_ANALYSIS'].includes(id)).map((id) => {
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
  let actions = '';
  let meta = chamber.discovered ? 'Core Chamber closed. Break the Core Shell and get its fragments to Surface.' : 'Dormant';
  if (state.run.pendingCore > 0) meta = `CORE CHARGE ${state.run.pendingCore} · Reboot commits this charge into permanent Core.`;
  if (chamber.rebootAvailable) {
    actions += `<button class="action reboot-action" data-action="reboot">${chamber.rebootArmed ? `CONFIRM REBOOT · CORE +${state.run.pendingCore}` : `ARM REBOOT · CORE +${state.run.pendingCore}`}</button>`;
    if (!unlockedPhase5Depths(state).includes('D-180')) actions += `<button class="action primary" data-action="push-d180" ${canPushD180(state) ? '' : 'disabled'}>PUSH DEEPER · D-180 · ${D180_EXTENSION_COST}</button>`;
    meta += ' · REBOOT NOW remains available. PUSH DEEPER spends this Run on Crew, Research and shaft extension before resetting.';
  }
  setHtml(context, contextMarkup('Core Chamber', meta, actions));
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
  const depth = run.depth.current as Phase5DepthId;
  if (current.meta.runIndex > 1 && current.meta.core > 0 && current.meta.protocols.length === 0) return 'The Core Console is online. Spend Core on one remembered piece of the previous Run.';
  if (run.tool.level === 1) return 'The rusty pick is the first bottleneck. Earn Scrap and fit the Steel Pickaxe.';
  if (run.boots.level === 1) return 'Walking is now the slow part. Fit Runner Boots.';
  if (!run.automation.autoSwing.unlocked) return 'After enough manual swings, fit Auto Swing so mining input can disappear.';
  if (run.pack.level === 1) return 'Mining can run itself, but you still haul the result. Upgrade the Pack.';
  if (!run.porter.enabled && !run.phase5.crew.unlocked) return 'Hire a Porter. Drops remain physical until somebody reaches them.';
  if (run.porter.enabled && !run.automation.autoDispatch.unlocked) return 'The Porter still waits on the lift. Fit the Auto Relay.';
  if (!run.depth.unlocked.includes('D-030')) return `The base can work without you. Bank ${d030ExtensionCost(current)} Scrap, clear the lift, then extend D-030.`;
  if (depth === 'D-001') return 'Use the elevator control to travel to D-030.';
  if (!run.anomaly.selected) return 'The D-030 geology is unstable. Use the scanner and choose this Run’s Anomaly.';
  if (!current.meta.collection.entries.some((entry) => entry.discovered)) return 'Find a Fossil or other rare object and get it through Surface appraisal.';
  if (current.meta.passives.unlocked.length === 0) return 'Target D-030 veins for a Relic. Its Passive unlocks only after Surface appraisal.';
  if (!run.depth.unlocked.includes('D-060')) return `Your first field archive is useful now. Bank ${D060_EXTENSION_COST} Scrap and extend the shaft from D-030.`;
  if (!run.research.completed.includes('CORE_RESONANCE')) {
    if (depth !== 'D-060') return 'Travel to D-060. Research Samples there are worth Data rather than Scrap.';
    if (run.data === 0 && !run.research.active) return 'Mine Crystal Bank or Machine Grave, then carry a Research Sample all the way to Surface.';
    if (!run.research.completed.includes('DEEP_SURVEY')) return 'Use the Surface Analyzer. Deep Survey turns unknown strata into useful information.';
    return 'Gather enough Data and complete Core Resonance while mining other targets in parallel.';
  }
  if (current.meta.runIndex > 1 && !run.phase5.crew.unlocked) {
    if (!run.research.completed.includes('CREW_ROUTING')) return 'Research Crew Routing. Run 2 is where old manual work becomes an assignable shift.';
    if (!run.research.completed.includes('CARGO_SCHEDULER')) return 'Research Cargo Scheduler so the one Central Elevator can serve several Floor Cargo queues.';
    if (canShowCrewBoard(current)) return `Use the Surface Crew Board and convert the old Porter workflow into a first Miner + Porter shift for ${CREW_BOARD_COST} Scrap.`;
  }
  if (!run.depth.unlocked.includes('D-100')) return `Core Resonance is decoded. Bank ${D100_EXTENSION_COST} Scrap and extend D-100 from D-060.`;
  if (depth !== 'D-100' && depth !== 'D-180') return 'Travel to D-100. The Core Chamber marks this Run’s first possible endpoint.';
  if (depth === 'D-180') {
    if (run.phase5.equipment.inventory.length === 0) return 'Choose an Ancient site. Equipment is not yours until the crate reaches Surface appraisal.';
    return 'Reassign Crew around the Ancient Ruins, compare appraised Equipment at the Workbench, then decide when this Run is worth rebooting.';
  }
  if (run.pendingCore === 0) return 'Break the Core Shell. A Core Fragment is still only cargo until Surface appraisal.';
  if (current.meta.runIndex === 1) return `Reboot now for Core +${run.pendingCore}. D-180 is balanced around the first Crew shift in Run 2.`;
  if (!run.research.completed.includes('ANCIENT_SURVEY')) return 'You can Reboot now, or collect Data and finish Ancient Survey to reveal the deeper signal.';
  if (!run.phase5.ancient.signalFound) return 'Return to the Core Chamber after Ancient Survey. The D-180 signal resolves when Core cargo reaches Surface.';
  if (!unlockedPhase5Depths(current).includes('D-180')) return `Reboot now for Core +${run.pendingCore}, or invest ${D180_EXTENSION_COST} Scrap and your Crew/Cargo setup into D-180.`;
  return `Reboot is available for Core +${run.pendingCore}. Ancient Ruins remain open until you decide this Run is finished.`;
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
