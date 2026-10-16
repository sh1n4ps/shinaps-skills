import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const CLAUDE_REFERENCES = 'plugins/shinaps-claude/references/linear';
const CODEX_REFERENCES = 'plugins/shinaps-codex/references/linear';

async function readTree(root: string): Promise<Record<string, string>> {
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  const entries = await Promise.all(
    files
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return [path.slice(root.length + 1), await readFile(path, 'utf8')] as const;
      }),
  );
  return Object.fromEntries(entries);
}

// Codex のインストーラは plugins/shinaps-codex だけをコピーするので、共通の references を
// 両版に置いている。片方だけを更新すると、このテストが失敗する。
test('linear references are identical in the Claude and Codex plugins', async () => {
  assert.deepEqual(
    await readTree(CODEX_REFERENCES),
    await readTree(CLAUDE_REFERENCES),
    'linear の references は Claude 版を編集元として Codex 版へ複製する',
  );
});
