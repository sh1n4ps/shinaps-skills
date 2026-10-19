import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateLinearConfig } from '../lib/linear-config.ts';

// 人が設定を保存しても、未知キーや廃止した実装経路の指定が許可として解釈されないことを保証する。
test('configuration accepts complete review policies and rejects incomplete, retired or unknown contracts without changing input', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'linear-config-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  const config = {
    config_version: 2,
    config_storage: 'shared',
    target: { workspace: 'shinaps', team: 'SHINAPS', project: null },
    team_settings: 'existing_only',
    statuses: { todo: 'Todo', human_input: 'In Progress' },
    stop_after: 'pre_push_qa',
    review_flow: { mode: 'auto' },
    path_policy_overrides: [],
    permissions: [
      'issue_update',
      'claude_cli',
      'bridge_request',
      'dev_delegation',
      'deploy:staging',
      'publish:npm',
      'evidence:drive',
    ],
    references: {
      specifications: [],
      validation: [],
      environments: [],
      deployment: [],
      publication: [],
    },
    cycle_report: null,
  };
  for (const review_flow of [{ mode: 'auto' }, { mode: 'manual' }]) {
    const input = {
      ...config,
      review_flow,
      path_policy_overrides: [{ paths: ['docs/**'], review_flow }],
    };
    const before = JSON.stringify(input);
    await writeFile(path, before);
    await validateLinearConfig(path);
    assert.equal(await readFile(path, 'utf8'), before);
  }
  const invalid = [
    { ...config, review_flow: 'auto' },
    { ...config, review_flow: { mode: 'manual', tool: 'webstorm' } },
    { ...config, review_flow: { mode: 'auto', tool: 'plasma' } },
    { ...config, review_flow: { mode: 'other' } },
    {
      ...config,
      path_policy_overrides: [
        { paths: ['docs/**'], review_flow: { mode: 'manual', tool: 'plasma' } },
      ],
    },
    { ...config, config_storage: undefined },
    { ...config, path_policy_overrides: undefined },
    { ...config, document_only_changes: 'none' },
    { ...config, implementation_skill: 'dev-claude' },
    { ...config, target: { ...config.target, unexpected: true } },
    { ...config, statuses: { invented: 'Todo' } },
    { ...config, permissions: ['codex_task'] },
    { ...config, permissions: ['managed_session:20'] },
    { ...config, permissions: ['commit'] },
  ];
  for (const input of invalid) {
    const before = JSON.stringify(input);
    await writeFile(path, before);
    await assert.rejects(validateLinearConfig(path), /Invalid Linear configuration/);
    assert.equal(await readFile(path, 'utf8'), before);
  }
});

test('version errors distinguish migration, skill update and malformed values', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'linear-version-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  for (const [config_version, message] of [
    [undefined, /Migrate/],
    [0, /Migrate/],
    [1, /Migrate/],
    [3, /Update the skill/],
    ['2', /Invalid Linear configuration/],
    [2.5, /Invalid Linear configuration/],
  ] as const) {
    await writeFile(path, JSON.stringify({ config_version }));
    await assert.rejects(validateLinearConfig(path), message);
  }
  await writeFile(path, '{ // comment\n}');
  await assert.rejects(validateLinearConfig(path), SyntaxError);
});

// 明示ファイル以外の設定探索や$schemaへの通信があれば、無関係なcwd・通信禁止の環境で失敗する。
test('CLI validates documented JSON offline from an unrelated directory and requires one explicit path', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'linear-cli-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const documentation = await readFile(
    'plugins/shinaps-claude/references/linear/configuration.md',
    'utf8',
  );
  const example = documentation.split('## 設定例')[1].match(/```json\n([\s\S]*?)\n```/)?.[1];
  assert.ok(example);
  const config = JSON.parse(example);
  config.$schema = 'https://invalid.example/must-not-fetch.json';
  const path = join(directory, 'explicit.json');
  const before = JSON.stringify(config);
  await writeFile(path, before);
  const guard = join(directory, 'no-network.cjs');
  await writeFile(
    guard,
    "require('node:net').Socket.prototype.connect = () => { throw new Error('Network forbidden'); }; globalThis.fetch = () => { throw new Error('Network forbidden'); };\n",
  );
  const cli = resolve('bin/skills.ts');
  const result = spawnSync(
    process.execPath,
    ['--require', guard, cli, 'validate-linear-config', path],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path, 'utf8'), before);
  for (const arguments_ of [[], [path, path]]) {
    const rejected = spawnSync(process.execPath, [cli, 'validate-linear-config', ...arguments_], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Usage:/);
  }
});
