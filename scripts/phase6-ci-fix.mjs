import fs from 'node:fs';
const path = 'tests/deepGame.test.ts';
const before = fs.readFileSync(path, 'utf8');
const oldText = `    const heavy = makeLoot('ANCIENT_ALLOY', 'too-heavy', 'D-250');\n    line.maxInputWeight = Math.max(0, heavy.weight - 0.1);\n    state.run.floors['D-250'].cargo.push(heavy);`;
const newText = `    const heavy = makeLoot('ANCIENT_ALLOY', 'too-heavy', 'D-250');\n    line.maxInputWeight = Math.max(0, heavy.weight - 0.1);\n    // Isolate Rail backpressure: the existing Central Elevator scheduler would otherwise\n    // legitimately collect the same Floor Cargo before Rail gets a chance to reject it.\n    state.run.phase5.cargo.unlocked = false;\n    state.run.floors['D-250'].cargo.push(heavy);`;
if (!before.includes(oldText)) throw new Error('Expected Rail buffer test block not found');
fs.writeFileSync(path, before.replace(oldText, newText));
fs.rmSync('scripts/phase6-ci-fix.mjs');
