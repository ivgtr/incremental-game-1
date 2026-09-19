import { GameAudio } from '../game/audio';
import { SAVE_INTERVAL } from '../game/config';
import { createGameState } from '../game/createGame';
import {
  canPlayerAccessNode,
  installBore,
  setFreightPriority,
  setRailPriority,
  startD650Construction,
  startFreightConstruction,
  startRailConstruction,
  unlockD250,
  unlockD400,
} from '../game/deepGame';
import { deeperDepth } from '../game/depth';
import {
  applyOfflineProgress,
  armPhase5Reboot,
  assignCrew,
  equipCrewItem,
  equipPlayerItem,
  expandCrewSlots,
  hireCrew,
  processPhase5Events,
  pushD180,
  requestPhase5Travel,
  selectCrewBoard,
  setCargoPriority,
  setMinerPriority,
  setPorterPriority,
  unlockCrewOperations,
  updatePhase5,
} from '../game/phase5';
import { loadFromStorage, saveToStorage } from '../game/save';
import {
  canMine,
  chooseAnomaly,
  currentFloor,
  drainEvents,
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
} from '../game/simulation';
import type { GameState, MinerPriority, PorterPriority } from '../game/types';
import { GameRenderer } from '../render/gameRenderer';
import type { GameCommand } from './commands';

const FIXED_STEP = 1 / 60;
const UI_UPDATE_INTERVAL = 100;
const MINER_PRIORITIES: readonly MinerPriority[] = ['ANY', 'RESEARCH', 'RARE', 'NEAREST'];
const PORTER_PRIORITIES: readonly PorterPriority[] = ['NEAREST', 'RESEARCH', 'CORE', 'RELIC', 'RARE', 'VALUE'];

export interface GameSnapshot {
  readonly revision: number;
  readonly state: GameState;
}

type Listener = () => void;

export class GameRuntime {
  private readonly audio = new GameAudio();
  private readonly listeners = new Set<Listener>();
  private renderer: GameRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private animationFrame: number | null = null;
  private accumulator = 0;
  private saveTimer = 0;
  private previous = 0;
  private lastUiUpdate = 0;
  private revision = 0;
  private snapshot: GameSnapshot;

  constructor(private readonly state: GameState) {
    this.snapshot = this.createSnapshot();
  }

  static fromStorage(): GameRuntime {
    const state = loadFromStorage() ?? createGameState();
    if (applyOfflineProgress(state)) saveToStorage(state);
    return new GameRuntime(state);
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): GameSnapshot => this.snapshot;

  attachCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) return;
    this.canvas = canvas;
    this.renderer = new GameRenderer(canvas);
  }

  detachCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas !== canvas) return;
    this.canvas = null;
    this.renderer = null;
  }

  start(): void {
    if (this.animationFrame !== null) return;
    this.previous = performance.now();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    saveToStorage(this.state);
  }

  unlockAudio(): void {
    this.audio.unlock();
  }

  selectCanvasTarget(clientX: number, clientY: number): void {
    const target = this.renderer?.pickTarget(clientX, clientY, this.state);
    if (!target) return;
    if (target.type === 'node') {
      const node = currentFloor(this.state).nodes.find((candidate) => candidate.id === target.id);
      if (node && !canPlayerAccessNode(node)) this.state.selection = { type: 'node', id: target.id };
      else if (this.state.run.character.targetNodeId === target.id && canMine(this.state)) requestMine(this.state);
      else selectNode(this.state, target.id);
    } else if (target.type === 'rail-stop') this.state.selection = { type: 'rail-stop', id: target.id };
    else if (target.type === 'cargo-hub') this.state.selection = { type: 'cargo-hub', id: target.id };
    else if (target.type === 'freight-control') this.state.selection = { type: 'freight-control' };
    else if (target.type === 'bore-console') this.state.selection = { type: 'bore-console', id: target.id };
    else if (target.type === 'crew-board') selectCrewBoard(this.state);
    else if (target.type === 'elevator') selectElevator(this.state);
    else if (target.type === 'workbench') selectWorkbench(this.state);
    else if (target.type === 'scanner') selectScanner(this.state);
    else if (target.type === 'archive') selectArchive(this.state);
    else if (target.type === 'research') selectResearchTerminal(this.state);
    else if (target.type === 'core-console') selectCoreConsole(this.state);
    else selectCoreChamber(this.state);
    this.publish();
  }

  dispatch(command: GameCommand): void {
    switch (command.type) {
      case 'move': moveToSelectedNode(this.state); break;
      case 'mine': requestMine(this.state); break;
      case 'send': sendElevator(this.state); break;
      case 'upgrade-tool': upgradeTool(this.state); break;
      case 'upgrade-boots': upgradeBoots(this.state); break;
      case 'unlock-auto-swing': unlockAutoSwing(this.state); break;
      case 'toggle-auto-swing': toggleAutoSwing(this.state); break;
      case 'upgrade-pack': upgradePack(this.state); break;
      case 'unlock-porter': unlockPorter(this.state); break;
      case 'unlock-auto-dispatch': unlockAutoDispatch(this.state); break;
      case 'toggle-auto-dispatch': toggleAutoDispatch(this.state); break;
      case 'extend-d030': unlockD030(this.state); break;
      case 'extend-d060': unlockD060(this.state); break;
      case 'extend-d100': unlockD100(this.state); break;
      case 'push-d180': pushD180(this.state); break;
      case 'extend-d250': unlockD250(this.state); break;
      case 'build-rail': startRailConstruction(this.state); break;
      case 'build-freight': startFreightConstruction(this.state); break;
      case 'extend-d400': unlockD400(this.state); break;
      case 'build-d650': startD650Construction(this.state); break;
      case 'install-bore': installBore(this.state, command.siteId); break;
      case 'rail-priority': setRailPriority(this.state, command.lineId, command.priority); break;
      case 'freight-priority': setFreightPriority(this.state, command.priority); break;
      case 'unlock-crew': unlockCrewOperations(this.state); break;
      case 'expand-crew': expandCrewSlots(this.state); break;
      case 'hire-crew': hireCrew(this.state, command.role); break;
      case 'assign-crew': assignCrew(this.state, command.crewId, command.depth); break;
      case 'cycle-miner-priority': this.cycleMinerPriority(command.crewId); break;
      case 'cycle-porter-priority': this.cyclePorterPriority(command.crewId); break;
      case 'cargo-priority': setCargoPriority(this.state, command.priority); break;
      case 'equip-item': equipPlayerItem(this.state, command.itemId); break;
      case 'equip-crew-item': equipCrewItem(this.state, command.crewId, command.itemId); break;
      case 'travel': requestPhase5Travel(this.state, command.depth); break;
      case 'choose-anomaly': chooseAnomaly(this.state, command.anomaly); break;
      case 'toggle-passive': togglePassive(this.state, command.passive); break;
      case 'research': startResearch(this.state, command.research); break;
      case 'protocol': purchaseCoreProtocol(this.state, command.protocol); break;
      case 'reboot': armPhase5Reboot(this.state); break;
    }
    saveToStorage(this.state);
    this.publish();
  }

  private readonly frame = (now: number): void => {
    const delta = Math.min(0.25, (now - this.previous) / 1000);
    this.previous = now;
    this.accumulator += delta;
    this.saveTimer += delta;
    while (this.accumulator >= FIXED_STEP) {
      updateGame(this.state, FIXED_STEP);
      updatePhase5(this.state, FIXED_STEP);
      this.state.meta.bestDepth = deeperDepth(this.state.meta.bestDepth, this.state.run.depth.current);
      this.accumulator -= FIXED_STEP;
    }
    const baseEvents = drainEvents(this.state);
    processPhase5Events(this.state, baseEvents);
    const events = [...baseEvents, ...drainEvents(this.state)];
    for (const gameEvent of events) {
      this.renderer?.handleEvent(gameEvent, this.state, now);
      this.audio.handle(gameEvent);
    }
    if (this.saveTimer >= SAVE_INTERVAL) {
      saveToStorage(this.state);
      this.saveTimer = 0;
    }
    this.renderer?.render(this.state, now);
    if (now - this.lastUiUpdate >= UI_UPDATE_INTERVAL) {
      this.lastUiUpdate = now;
      this.publish();
    }
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.unlockAudio();
    if (event.code !== 'Space') return;
    event.preventDefault();
    const selection = this.state.selection;
    const selected = selection?.type === 'node'
      ? currentFloor(this.state).nodes.find((node) => node.id === selection.id)
      : undefined;
    if (!selected || canPlayerAccessNode(selected)) this.dispatch({ type: 'mine' });
  };

  private readonly handleBeforeUnload = (): void => saveToStorage(this.state);

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') saveToStorage(this.state);
  };

  private cycleMinerPriority(crewId: string): void {
    const member = this.state.run.phase5.crew.members.find((candidate) => candidate.id === crewId && candidate.role === 'MINER');
    if (!member) return;
    const next = MINER_PRIORITIES[(MINER_PRIORITIES.indexOf(member.minerPriority) + 1) % MINER_PRIORITIES.length]!;
    setMinerPriority(this.state, crewId, next);
  }

  private cyclePorterPriority(crewId: string): void {
    const member = this.state.run.phase5.crew.members.find((candidate) => candidate.id === crewId && candidate.role === 'PORTER');
    if (!member) return;
    const next = PORTER_PRIORITIES[(PORTER_PRIORITIES.indexOf(member.porterPriority) + 1) % PORTER_PRIORITIES.length]!;
    setPorterPriority(this.state, crewId, next);
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }

  private createSnapshot(): GameSnapshot {
    return Object.freeze({ revision: this.revision, state: structuredClone(this.state) });
  }
}
