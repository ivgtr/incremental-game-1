# LOOP SHAFT

React-based playable vertical slice for the mining / logistics incremental game described in `docs/game-design-requirements.md`.

Phase 1 establishes the fully manual chain: choose a vein, walk, swing, collect, haul, load the elevator, `SEND`, and unload at the surface. Phase 2 adds the first automation without bypassing that chain: Auto Swing generates the same swing action, a Porter physically moves floor loot, and Auto Dispatch submits the same elevator departure when its rule is met.

## Run

```bash
npm ci
npm run dev
```

React owns the HUD and contextual controls. The deterministic simulation, fixed-step loop, Canvas renderer, audio, and persistence remain in the external game runtime under `src/runtime`.

## Controls

- Click a mining node: walk to it
- Click the selected node again or press `Space`: one manual pickaxe swing
- Click the tool bench: progress Tool → Boots → Auto Swing → Pack → Porter
- Click the central elevator: inspect cargo, use `SEND`, and later fit/toggle Auto Dispatch

Ore is not currency when it is mined. It remains a world object until a Character or Porter carries it into the elevator and the elevator unloads it at the surface.

## Checks

```bash
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```
