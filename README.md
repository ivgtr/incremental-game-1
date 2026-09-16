# LOOP SHAFT

Milestone 1 vertical slice for the mining / logistics incremental game described in `docs/game-design-requirements.md`.

## Run

```bash
npm install
npm run dev
```

## Controls

- Click a mining node: walk to it
- Click the selected node again or press `Space`: one pickaxe swing
- Click the central elevator: inspect cargo
- `SEND`: dispatch loaded cargo to the surface
- Click the tool bench beside the shaft: upgrade the pickaxe when enough Scrap is available

Ore is not currency when it is mined. It must exist as loot, be collected, carried, loaded into the elevator, delivered to the surface, and unloaded before it becomes Scrap.

## Checks

```bash
npm run build
npm test
```
