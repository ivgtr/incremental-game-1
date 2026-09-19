import { CREW_BOARD_COST } from '../../game/config';
import { canUnlockCrewOperations, unlockedPhase5Depths } from '../../game/phase5';
import type { CrewMember, EquipmentItem, GameState } from '../../game/types';
import { formatState } from '../shared/format';
import { ActionButton, ContextLayout } from './common';
import { DeepControls } from './DeepControls';

export function CrewContext({ state }: { state: GameState }) {
  const run = state.run;
  const crew = run.phase5.crew;
  if (!crew.unlocked) {
    const ready = run.research.completed.includes('CREW_ROUTING') && run.research.completed.includes('CARGO_SCHEDULER');
    return <ContextLayout title="Crew Board" meta={ready ? `Open assignable shifts · ${CREW_BOARD_COST} Scrap.` : 'Complete Crew Routing and Cargo Scheduler first.'}>
      <ActionButton command={{ type: 'unlock-crew' }} className="primary" disabled={!canUnlockCrewOperations(state)}>OPEN FIRST SHIFT · {CREW_BOARD_COST}</ActionButton>
    </ContextLayout>;
  }
  return <ContextLayout title="Shift / Logistics Board" meta={`${crew.members.length}/${crew.slots} staffed · ${run.engineer.unlocked ? `Engineer ${formatState(run.engineer.state)}` : 'Engineer locked'}.`}>
    <div className="research-stack">{crew.members.map((member) => <CrewLine key={member.id} state={state} member={member} />)}</div>
    <span className="depth-buttons">
      <ActionButton command={{ type: 'hire-crew', role: 'MINER' }} disabled={crew.members.length >= crew.slots || run.scrap < 2600}>HIRE MINER · 2600</ActionButton>
      <ActionButton command={{ type: 'hire-crew', role: 'PORTER' }} disabled={crew.members.length >= crew.slots || run.scrap < 2200}>HIRE PORTER · 2200</ActionButton>
      <ActionButton command={{ type: 'expand-crew' }} disabled={crew.slots >= 4}>EXPAND SHIFT</ActionButton>
    </span>
    <DeepControls state={state} />
  </ContextLayout>;
}

function CrewLine({ state, member }: { state: GameState; member: CrewMember }) {
  const tool = bestCrewTool(state, member);
  return <div className="research-line">
    <strong>{member.name} · {member.assignedDepth}{member.pendingDepth && ` → ${member.pendingDepth}`}</strong>
    <span>{formatState(member.state)} · {member.role === 'MINER' ? member.minerPriority : member.porterPriority}</span>
    <span className="depth-buttons">
      {unlockedPhase5Depths(state).filter((depth) => depth !== member.assignedDepth).map((depth) => <ActionButton key={depth} command={{ type: 'assign-crew', crewId: member.id, depth }} className="travel-action" disabled={Boolean(member.pendingDepth) || member.body.carried.length > 0}>{depth}</ActionButton>)}
      <ActionButton command={member.role === 'MINER' ? { type: 'cycle-miner-priority', crewId: member.id } : { type: 'cycle-porter-priority', crewId: member.id }}>PRIORITY</ActionButton>
      {member.role === 'MINER' && tool && <ActionButton command={{ type: 'equip-crew-item', crewId: member.id, itemId: tool.id }}>TOOL {tool.rarity}</ActionButton>}
    </span>
  </div>;
}

function bestCrewTool(state: GameState, member: CrewMember): EquipmentItem | undefined {
  return state.run.phase5.equipment.inventory.filter((item) => item.slot === 'TOOL' && item.id !== member.equipment.TOOL).at(-1);
}
