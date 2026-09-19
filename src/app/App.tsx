import { useEffect } from 'react';
import { ContextPanel } from '../components/context/ContextPanel';
import { GameCanvas } from '../components/game/GameCanvas';
import { ResourceHud, RunStatusHud } from '../components/hud/Hud';
import type { GameRuntime } from '../runtime/GameRuntime';
import { GameProvider } from './GameProvider';

export function App({ runtime }: { runtime: GameRuntime }) {
  useEffect(() => {
    runtime.start();
    return () => runtime.stop();
  }, [runtime]);

  return (
    <GameProvider runtime={runtime}>
      <div className="game-root">
        <div>
          <div className="game-shell">
            <GameCanvas />
            <ResourceHud />
            <RunStatusHud />
          </div>
          <ContextPanel />
          <div className="help-line">
            <span>Click a vein or machine to inspect it · press <kbd>Space</kbd> to swing</span>
            <span>Cargo stays physical: mine → carry → line → vertical transport → Surface.</span>
          </div>
        </div>
      </div>
    </GameProvider>
  );
}
