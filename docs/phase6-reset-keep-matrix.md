# Phase 6 — Reboot Reset / Keep Matrix

Phase 6 continues to use the existing Core Reboot. There is no new prestige currency.

| State | Reboot | Notes |
| --- | --- | --- |
| Rail instance / line | RESET | Physical line, buffers, carts and cargo are Run state. |
| Rail Blueprint | RESET by default / KEEP with `RAIL_BLUEPRINT` | Protocol skips the blueprint discovery step; it does not keep the physical Rail instance. |
| Rail Cart cargo | RESET atomically | Never leaks into the new Run or Inventory. |
| Cargo Hub buffers | RESET atomically | All in-flight physical cargo belongs to the old Run. |
| Engineer instance / active job | RESET | Installation / repair progress cannot cross a Reboot. |
| Engineer early unlock | KEEP with `ENGINEER_LICENSE` | New Run starts with Engineer available when the protocol is owned. |
| Freight Cage instance | RESET | Position, state, target and cargo are Run state. |
| Freight Blueprint | RESET by default / KEEP with `FREIGHT_CHARTER` | Protocol remembers authorization, not physical construction/cargo. |
| Remote Bore instance | RESET | Bore target, cycle, output buffer and connected line reset together. |
| Bore Blueprint | RESET by default / KEEP with `BORE_MEMORY` | Blueprint memory skips rediscovery; Bore still needs a valid site/logistics path. |
| Deep Survey setup | RESET by default / shortened with `DEEP_SURVEY_ARCHIVE` | Lost signal/sample setup is restored by the protocol. |
| Deep Equipment instance | RESET by default | Equipment can persist only through the existing `LEGACY_LOCKER` behavior, which keeps one selected legacy item rather than the entire inventory. |
| Equipment discovery | KEEP | Stored in Meta progression. |
| Deep discovery | KEEP | `meta.deepDiscoveries` persists reached depths / deep discoveries. |
| D-650 discovery | KEEP | Reached depth is recorded in Meta best/deep discovery state. Physical D-650 Run state still resets. |
| Deep Components delivered this Run | RESET | They are part of the D-650 construction chain for the current Run. |
| Research completion | RESET according to existing Run research rules | Deep protocols are the permanent shortcut mechanism. |
| Core / Protocol ownership | KEEP | Existing prestige layer. |

## Atomicity requirement

Reboot constructs the next Run from Meta state rather than selectively clearing current transport objects. Rail buffers, carts, Freight cargo, Bore output and Engineer jobs therefore reset as one Run-state boundary; no partial logistics object is retained.
