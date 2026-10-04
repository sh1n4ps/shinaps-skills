import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, access, rm, cp, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from '../lib/install.ts';
import { payloadPaths } from '../lib/layout.ts';
import {
  JOURNAL,
  PACKAGE_VERSION,
  STATE,
  assertMissing,
  installationSnapshot,
  isPluginAdd,
  packageWithVersion,
  recordingCodex,
  temporaryHome,
} from './support/fixtures.ts';

test('install, repeat and uninstall preserve unrelated files', async (t) => {
  const { options } = await temporaryHome(t);
  const agentsDirectory = join(options.codexHome, 'agents');
  await mkdir(agentsDirectory, { recursive: true });
  await writeFile(join(agentsDirectory, 'personal.toml'), 'personal');

  await run(['install', 'codex'], options);
  const reviewer = join(agentsDirectory, 'shinaps-reviewer.toml');
  const content = await readFile(reviewer, 'utf8');

  await run(['update', 'codex'], options);
  assert.equal(await readFile(reviewer, 'utf8'), content);

  await run(['uninstall', 'codex'], options);
  await assertMissing(reviewer);
  assert.equal(await readFile(join(agentsDirectory, 'personal.toml'), 'utf8'), 'personal');
});

test('install registers the plugin but never touches MCP configuration', async (t) => {
  const { options } = await temporaryHome(t);
  const codex = recordingCodex();
  await run(['install', 'codex'], { ...options, command: codex.command });
  assert.ok(codex.calls.some(isPluginAdd));
  assert.ok(codex.calls.every((args) => args[0] !== 'mcp'));
});

test('an unmanaged same-name agent is never adopted or overwritten', async (t) => {
  const { options } = await temporaryHome(t);
  const agentPath = join(options.codexHome, 'agents', 'shinaps-reviewer.toml');
  await mkdir(join(options.codexHome, 'agents'), { recursive: true });
  await writeFile(agentPath, 'mine');
  const codex = recordingCodex();
  await assert.rejects(
    run(['install', 'codex'], { ...options, command: codex.command }),
    /Unmanaged agent preserved/,
  );
  assert.equal(codex.calls.length, 0);
  assert.equal(await readFile(agentPath, 'utf8'), 'mine');
});

test('user changes stop update and uninstall before external mutations', async (t) => {
  const { options } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  const reviewer = join(options.codexHome, 'agents', 'shinaps-reviewer.toml');
  await writeFile(reviewer, 'my edited agent');

  const codex = recordingCodex();
  for (const action of ['update', 'uninstall']) {
    await assert.rejects(
      run([action, 'codex'], { ...options, command: codex.command }),
      /Modified agent preserved/,
    );
  }
  assert.equal(codex.calls.length, 0);
  assert.equal(await readFile(reviewer, 'utf8'), 'my edited agent');
});

test('a failed first install leaves no agents behind and a retry succeeds', async (t) => {
  const { options } = await temporaryHome(t);
  const reviewer = join(options.codexHome, 'agents', 'shinaps-reviewer.toml');
  const offline = async () => {
    throw new Error('offline');
  };
  await assert.rejects(run(['install', 'codex'], { ...options, command: offline }), /offline/);
  await assertMissing(reviewer);

  await run(['install', 'codex'], options);
  await access(reviewer);
});

test('update replaces managed content and retires removed package files', async (t) => {
  const { options, root } = await temporaryHome(t);
  const source = join(options.home, 'package');
  for (const path of payloadPaths) {
    await cp(new URL(`../${path}`, import.meta.url), join(source, path), { recursive: true });
  }
  const agentName = 'shinaps-reviewer.toml';
  const packagedAgent = join(source, 'plugins/shinaps-codex/agents', agentName);
  await run(['install', 'codex'], { ...options, source });

  const newContent = `${await readFile(packagedAgent, 'utf8')}\n# New release\n`;
  await writeFile(packagedAgent, newContent);
  await rm(join(source, 'plugins/shinaps-codex/agents/shinaps-explorer.toml'));
  await rm(join(source, 'plugins/shinaps-codex/skills/review'), { recursive: true });
  await run(['update', 'codex'], { ...options, source });

  assert.equal(await readFile(join(options.codexHome, 'agents', agentName), 'utf8'), newContent);
  await assertMissing(join(options.codexHome, 'agents/shinaps-explorer.toml'));
  await assertMissing(join(root, 'codex/plugins/shinaps-codex/skills/review'));
});

// シンボリックリンクを辿って書き込むと落ちる。リンク先にある CODEX_HOME 外のユーザーのファイルを
// 上書きしてしまうため。
test('replacing an installed agent with a symlink does not write through it', async (t) => {
  const { options } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  const agentPath = join(options.codexHome, 'agents/shinaps-reviewer.toml');
  const personal = join(options.home, 'personal.toml');
  await cp(agentPath, personal);
  const content = await readFile(personal, 'utf8');
  await rm(agentPath);
  await symlink(personal, agentPath);

  await assert.rejects(run(['update', 'codex'], options), /Symlink preserved/);
  assert.equal(await readFile(personal, 'utf8'), content);
});

// 記録された CODEX_HOME を resolve せずに比較すると落ちる。旧版 (0.11.0) は指定された値をそのまま
// 保存していたため、末尾にスラッシュを付けてインストールした環境で update できなくなる。
test('an install whose recorded CODEX_HOME is not normalized can still be updated', async (t) => {
  const { options, root } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  const state = JSON.parse(await readFile(join(root, STATE), 'utf8'));
  state.codexHome = `${options.codexHome}/`;
  await writeFile(join(root, STATE), JSON.stringify(state));

  await run(['update', 'codex'], options);
  // 例外なく完了することを確認する。
});

// restore がファイルを戻しても、古い配布物を Codex に登録し直さないと落ちる。登録し直さないと、Codex の
// plugin キャッシュが失敗した新しい版を指したままになる。
test('failed update restores payload and state and re-registers the old plugin with Codex', async (t) => {
  const { options, root } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  const before = await installationSnapshot(root);
  const newerPackage = await packageWithVersion(options.home, PACKAGE_VERSION.aboveRelease);
  const codex = recordingCodex(isPluginAdd);

  await assert.rejects(
    run(['update', 'codex'], { ...options, source: newerPackage, command: codex.command }),
    /cache failure/,
  );

  assert.deepEqual(await installationSnapshot(root), before);
  const failedAt = codex.calls.findIndex(isPluginAdd);
  assert.ok(
    codex.calls.slice(failedAt + 1).some(isPluginAdd),
    'restore must register the restored payload with Codex again',
  );
});

// restore が途中で失敗したときに journal を削除すると落ちる。journal が無いと、次回の実行でエージェント
// を元に戻せない。あわせて、中断後にユーザーが編集したエージェントを recover が上書きしないことを確認する。
test('a restore that fails midway keeps the backup and recover completes it later', async (t) => {
  const { options, root } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  const agentPath = join(options.codexHome, 'agents', 'shinaps-reviewer.toml');
  const priorContent = await readFile(agentPath, 'utf8');
  const newerPackage = await packageWithVersion(options.home, PACKAGE_VERSION.aboveRelease);

  // 更新も、その復元も、codex が失敗する。
  const offline = async () => {
    throw new Error('codex offline');
  };
  await assert.rejects(
    run(['update', 'codex'], { ...options, source: newerPackage, command: offline }),
    (error) =>
      error instanceof AggregateError &&
      error.errors.length === 2 &&
      (error.cause as Error).message === 'codex offline' &&
      /recovery incomplete/.test(error.message),
  );
  assert.equal(await readFile(agentPath, 'utf8'), priorContent);
  await access(join(root, JOURNAL));

  // 利用者が編集したあとの recover は止まり、編集を保つ。
  await writeFile(agentPath, 'user edit after interruption');
  await assert.rejects(run(['recover', 'codex'], options), /Modified agent preserved/);
  assert.equal(await readFile(agentPath, 'utf8'), 'user edit after interruption');

  // 編集を戻せば recover が完了し、journal が消える。
  await writeFile(agentPath, priorContent);
  await run(['recover', 'codex'], options);
  await assertMissing(join(root, JOURNAL));
});
