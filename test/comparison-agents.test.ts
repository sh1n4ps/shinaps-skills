import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CODEX_AGENTS,
  COMPARISON_AGENT_PREFIX,
  renderComparisonAgents,
} from '../scripts/comparison-agents.ts';

// shinaps-comparison-*.toml は roles/*.md から生成する。正本だけを直して生成し直さないと、
// Codex の構成（P4〜P7）だけが古い担当指示で動き、構成間の前提が崩れる。
test('comparison agent definitions are generated from the comparison roles', async () => {
  const committed = Object.fromEntries(
    await Promise.all(
      (await readdir(CODEX_AGENTS))
        .filter((name) => name.startsWith(COMPARISON_AGENT_PREFIX))
        .map(async (name) => [name, await readFile(join(CODEX_AGENTS, name), 'utf8')] as const),
    ),
  );
  assert.deepEqual(
    committed,
    await renderComparisonAgents(),
    'roles/*.md を変えたら npm run generate:agents を実行する',
  );
});
