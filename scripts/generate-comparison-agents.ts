import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CODEX_AGENTS, renderComparisonAgents } from './comparison-agents.ts';

// 書き込みだけを行う。役割を減らしたときに残った定義は test/comparison-agents.test.ts が
// 失敗して知らせるので、ここでは削除しない（既存の通常 dev 用の shinaps-*.toml に触れないため）。
for (const [file, content] of Object.entries(await renderComparisonAgents())) {
  await writeFile(join(CODEX_AGENTS, file), content);
}
