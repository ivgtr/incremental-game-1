import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UPGRADE_COSTS } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { GameRuntime } from '../src/runtime/GameRuntime';

describe('GameRuntime', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  it('publishes an immutable snapshot after a typed command', () => {
    const state = createGameState(7001);
    state.run.scrap = UPGRADE_COSTS.tool;
    const runtime = new GameRuntime(state);
    const initial = runtime.getSnapshot();
    const listener = vi.fn();
    runtime.subscribe(listener);

    runtime.dispatch({ type: 'upgrade-tool' });

    expect(initial.state.run.tool.level).toBe(1);
    expect(runtime.getSnapshot().state.run.tool.level).toBe(2);
    expect(runtime.getSnapshot().revision).toBe(initial.revision + 1);
    expect(listener).toHaveBeenCalledOnce();
  });
});
