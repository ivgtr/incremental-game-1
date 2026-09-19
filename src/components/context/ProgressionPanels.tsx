import { ANOMALIES, CORE_PROTOCOLS, PASSIVES, RESEARCH } from '../../game/config';
import { canStartResearch } from '../../game/simulation';
import type { AnomalyId, CoreProtocolId, GameState, PassiveId, ResearchId } from '../../game/types';
import { CommandButton, ContextLayout } from './common';

export function ScannerContext({ state }: { state: GameState }) {
  const selected = state.run.anomaly.selected;
  if (selected) {
    const anomaly = ANOMALIES[selected];
    return <ContextLayout title="Geological Scanner" meta={`${anomaly.name} · ${anomaly.description}`} />;
  }
  return <ContextLayout title="Three anomalous responses" meta="Choose one for this Run.">
    <div className="choice-stack">{state.run.anomaly.options.map((id: AnomalyId) => <CommandButton key={id} className="choice-line" command={{ type: 'choose-anomaly', anomaly: id }}><strong>{ANOMALIES[id].name}</strong><span>{ANOMALIES[id].description}</span></CommandButton>)}</div>
  </ContextLayout>;
}

export function ArchiveContext({ state }: { state: GameState }) {
  return <ContextLayout title="Archive Terminal" meta={`Discoveries persist across Reboot · Deep discoveries ${state.meta.deepDiscoveries.length}.`}>
    <div className="archive-layout">
      <div className="archive-grid">{state.meta.collection.entries.map((entry) => entry.discovered
        ? <span key={entry.kind} className="archive-item found">{entry.name} · {entry.rarity} ×{entry.count}</span>
        : <span key={entry.kind} className="archive-item">???? · {entry.category}</span>)}</div>
      <div className="passive-stack">{state.meta.passives.unlocked.map((id: PassiveId) => {
        const active = state.meta.passives.active.includes(id);
        return <CommandButton key={id} className={`passive-line ${active ? 'active' : ''}`} command={{ type: 'toggle-passive', passive: id }} disabled={!active && state.meta.passives.active.length >= 2}><strong>{PASSIVES[id].name}</strong><span>{active ? 'ACTIVE' : 'STORED'} · {PASSIVES[id].description}</span></CommandButton>;
      })}</div>
    </div>
  </ContextLayout>;
}

export function ResearchContext({ state }: { state: GameState }) {
  const active = state.run.research.active;
  return <ContextLayout title="Surface Analyzer" meta={`DATA ${state.run.data} · Research unlocks actions rather than passive production.`}>
    <div className="research-stack">{(Object.keys(RESEARCH) as ResearchId[]).map((id) => {
      const definition = RESEARCH[id];
      const done = state.run.research.completed.includes(id);
      const running = active?.id === id;
      return <CommandButton key={id} className={`research-line ${done ? 'complete' : running ? 'running' : ''}`} command={{ type: 'research', research: id }} disabled={!canStartResearch(state, id)}><strong>{definition.name}</strong><span>{done ? 'COMPLETE' : running ? `${Math.ceil(active.remaining)}s` : `DATA ${definition.dataCost}`} · {definition.description}</span></CommandButton>;
    })}</div>
  </ContextLayout>;
}

export function CoreConsoleContext({ state }: { state: GameState }) {
  return <ContextLayout title="Core Console" meta={`CORE ${state.meta.core} · Protocols skip old setup work instead of adding a new prestige currency.`}>
    <div className="protocol-stack">{(Object.keys(CORE_PROTOCOLS) as CoreProtocolId[]).map((id) => {
      const definition = CORE_PROTOCOLS[id];
      const owned = state.meta.protocols.includes(id);
      return <CommandButton key={id} className={`protocol-line ${owned ? 'owned' : ''}`} command={{ type: 'protocol', protocol: id }} disabled={owned || state.meta.core < definition.cost}><strong>{definition.name}</strong><span>{owned ? 'INSTALLED' : `CORE ${definition.cost}`} · {definition.description}</span></CommandButton>;
    })}</div>
  </ContextLayout>;
}
