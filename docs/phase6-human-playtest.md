# Phase 6 — Human Playtest Checklist

This checklist is intentionally for a human playtester. Automated validation covers simulation/state/save/RNG/regression; it does not claim that the game is fun or correctly paced.

## Run 3 / return to D-180

- [ ] Run 3 opening is not too repetitive after previous Reboots.
- [ ] Returning to D-180 does not take so long that the new layer feels hidden.
- [ ] The Lost Signal Sample reads as physical cargo that must reach Surface, not as an abstract unlock counter.

## D-250 — The Lost

- [ ] The Lost looks distinct from Ancient Ruins.
- [ ] Broken platforms / old industrial infrastructure communicate that normal walking logistics is reaching its limit.
- [ ] Lost Depot, Hanging Vein and Forgotten Terminal create different reasons to visit them.
- [ ] Porter walking actually becomes a visible bottleneck before Rail is available.
- [ ] The player wants Rail because of observed work, not because a tooltip says it is an upgrade.

## Rail / Cargo Hub

- [ ] Rail construction visibly requires Engineer work instead of becoming throughput instantly.
- [ ] Minecart loading, travel and unloading are readable from the world view.
- [ ] Cargo can be mentally followed from Floor Cargo → Rail Stop → Cart → Cargo Hub.
- [ ] A full Rail Stop or Cargo Hub visibly explains why upstream work is waiting.
- [ ] BULK / RESEARCH / RARE / ANY priority changes create an understandable routing decision.
- [ ] Porter still has a useful local-transport role after Rail is restored.

## Freight Cage

- [ ] Cargo Hub congestion naturally creates demand for another vertical route.
- [ ] Freight Cage feels materially different from Central Elevator: larger and cargo-only, but slower and unsuitable for priority cargo.
- [ ] Bulk cargo tends toward Freight while Research / Core / Equipment still makes Central Elevator meaningful.
- [ ] Building Freight removes a specific observed job rather than acting as a generic production multiplier.

## D-400 — Null Strata / Remote Bore

- [ ] Null Strata looks like a different place from The Lost and does not rely on neon effects.
- [ ] Remote-only sites clearly cannot be solved by ordinary walking.
- [ ] Bore installation reads as Blueprint / Engineer / installation / target connection.
- [ ] The Bore visibly damages the same persistent MiningNode used by Player / Miner logic.
- [ ] Bore output stops when its output buffer or connected logistics line is blocked.
- [ ] The player can diagnose Bore → Line → Hub → Freight congestion from the world view.

## Multi-floor / multi-line decisions

- [ ] D-060 Data, D-180 Equipment, D-250 bulk cargo and D-400 Deep Components can remain meaningful at the same time.
- [ ] Turning every site / route on is not automatically the best answer.
- [ ] Crew placement, Rail priority, Freight priority and direct Player intervention create different decisions.
- [ ] The Player remains useful for new Sites, Rare cargo, installation decisions and build changes.

## D-650 endpoint

- [ ] Deep Components must actually reach Surface before the final shaft project can proceed.
- [ ] D-650 unlock feels like the result of the whole Phase 6 logistics network rather than a Scrap gate.
- [ ] D-650 is a clear endpoint while keeping the structure / lore deliberately unexplained (`???`).

## UI / readability

- [ ] World machinery is the primary status display; the HUD does not become a permanent network dashboard.
- [ ] Rail Stop, Cargo Hub, Freight Cage and Bore can be clicked for local context controls.
- [ ] Jam / full-buffer states can be recognized before opening a control panel.
- [ ] A player can answer “where is this cargo now?” for Rare / Equipment / Deep Component cargo.

## Timing hypotheses — not measured by the Coding Agent

These are design targets to validate or revise through human play, not measured results:

| Target | Hypothesis |
| --- | ---: |
| Second Reboot | 155–180 min |
| D-250 | 180–210 min |
| Rail | 195–230 min |
| Freight Cage | 210–250 min |
| D-400 | 225–280 min |
| Stable Multi-Line | 260–330 min |
| D-650 | 300–420 min |
