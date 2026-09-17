import fs from 'node:fs';
const path = 'src/main.ts';
let source = fs.readFileSync(path, 'utf8');
source = source.replace('  processDeepEvents,\n', '');
source = source.replace('  updateDeepGame,\n', '');
source = source.replace('    updatePhase5(state, FIXED_STEP);\n    updateDeepGame(state, FIXED_STEP);\n', '    updatePhase5(state, FIXED_STEP);\n');
source = source.replace("  const baseEvents = drainEvents(state);\n  processPhase5Events(state, baseEvents);\n  const phase5Events = drainEvents(state);\n  processDeepEvents(state, [...baseEvents, ...phase5Events]);\n  const deepEvents = drainEvents(state);\n  const events = [...baseEvents, ...phase5Events, ...deepEvents];", "  const baseEvents = drainEvents(state);\n  processPhase5Events(state, baseEvents);\n  const phase5Events = drainEvents(state);\n  const events = [...baseEvents, ...phase5Events];");
fs.writeFileSync(path, source);
fs.rmSync('scripts/phase6-ci-fix.mjs');
