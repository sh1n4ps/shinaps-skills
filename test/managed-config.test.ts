import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateManagedConfig } from '../lib/managed-config.ts';

// 利用者は資料の設定例を写して設定を作る。例が契約と食い違うと、最初の検証で止まる。
test('documented Managed configuration example is valid and left unchanged', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'managed-config-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const documentation = await readFile(
    'plugins/shinaps-claude/references/managed/configuration.md',
    'utf8',
  );
  const example = documentation.split('## 設定例')[1].match(/```json\n([\s\S]*?)\n```/)?.[1];
  assert.ok(example);
  const path = join(directory, 'managed.json');
  await writeFile(path, example);
  await validateManagedConfig(path);
  assert.equal(await readFile(path, 'utf8'), example);
});

// 許可は呼び出しのたびに合意する。設定に書いた許可が通ると、合意なしの push や PR 作成の根拠にされる。
test('Managed configuration cannot carry permissions', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'managed-permissions-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'managed.json');
  await writeFile(
    path,
    JSON.stringify({
      config_version: 2,
      repository: { url: 'https://github.com/acme/widgets', mount_path: '/workspace/widgets' },
      accounts: { work: { vault_id: null } },
      permissions: ['commit', 'push', 'draft_pull_request'],
    }),
  );
  await assert.rejects(validateManagedConfig(path), /Invalid Managed configuration/);
});

// 旧版 (1 は lock を作業先に置いていた) は設定を読む managed-execute で作り直して lock を移し、未来版は
// skill と CLI の更新で直す。案内を取り違えると利用者が直せない。
test('Managed version errors distinguish setup from skill update', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'managed-version-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'managed.json');
  for (const [config_version, message] of [
    [1, /managed-execute.*claude-lock\.json/],
    [3, /Update the skill/],
  ] as const) {
    await writeFile(path, JSON.stringify({ config_version }));
    await assert.rejects(validateManagedConfig(path), message);
  }
});
