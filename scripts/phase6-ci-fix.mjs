import fs from 'node:fs';
const path = 'src/main.ts';
const before = fs.readFileSync(path, 'utf8');
const oldText = `  if (state.selection?.type === 'node') {\n    const node = currentFloor(state).nodes.find((candidate) => candidate.id === state.selection?.id);\n    if (node) renderNodeContext(node);\n    return;\n  }`;
const newText = `  const selection = state.selection;\n  if (selection?.type === 'node') {\n    const node = currentFloor(state).nodes.find((candidate) => candidate.id === selection.id);\n    if (node) renderNodeContext(node);\n    return;\n  }`;
if (!before.includes(oldText)) throw new Error('Expected node-selection block not found');
fs.writeFileSync(path, before.replace(oldText, newText));
fs.rmSync('scripts/phase6-ci-fix.mjs');
