import fs from 'node:fs';

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (before === after) throw new Error(`No changes applied to ${path}`);
  fs.writeFileSync(path, after);
}

patch('src/game/deepGame.ts', (source) => source
  .replace('  BORE_LINE_CAPACITY,\n', '')
  .replace('  FREIGHT_CAPACITY,\n', '')
  .replace("import { appraisalMultiplier, getModifiers } from './modifiers';", "import { appraisalMultiplier } from './modifiers';")
  .replace('  LootCategory,\n', '')
  .replace("    case 'JAMMED':\n      return;\n", '')
  .replace("    case 'JAMMED':\n    case 'UNBUILT':\n      return;\n", '')
);

patch('src/game/simulation.ts', (source) => source.replace(
  "const DEPTH_RANK: Record<DepthId, number> = { 'D-001': 1, 'D-030': 30, 'D-060': 60, 'D-100': 100 };",
  "const DEPTH_RANK: Record<DepthId, number> = { 'D-001': 1, 'D-030': 30, 'D-060': 60, 'D-100': 100, 'D-180': 180, 'D-250': 250, 'D-400': 400, 'D-650': 650 };",
));

patch('tests/simulation.test.ts', (source) => source.replace(
  "expect(migrated.version).toBe(5);",
  "expect(migrated.version).toBe(6);",
));

patch('tests/deepGame.test.ts', (source) => source.replace(
  "line.maxInputWeight = 2;\n    const heavy = makeLoot('ANCIENT_ALLOY', 'too-heavy', 'D-250');",
  "const heavy = makeLoot('ANCIENT_ALLOY', 'too-heavy', 'D-250');\n    line.maxInputWeight = Math.max(0, heavy.weight - 0.1);",
));

fs.rmSync('scripts/phase6-ci-fix.mjs');
fs.rmSync('.github/workflows/phase6-ci-fix.yml');
