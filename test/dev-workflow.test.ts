import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const CLAUDE = 'plugins/shinaps-claude';
const CODEX = 'plugins/shinaps-codex';
// 起動手順は runtime ごとの機構で書くので、references の中でこれだけは複製しない。
const RUNTIME_SPECIFIC_REFERENCE = 'dev/launch.md';
const TESTING_POLICY_ROLES = [
  'shinaps-architect',
  'shinaps-implementer',
  'shinaps-plan-reviewer',
  'shinaps-reviewer',
  'shinaps-refine-agent',
  'shinaps-simplifier',
  'shinaps-review-verifier',
];

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

async function sharedReferences(root: string): Promise<Record<string, string>> {
  const { [RUNTIME_SPECIFIC_REFERENCE]: _launch, ...shared } = await readTree(root);
  return shared;
}

async function workflowRoles(): Promise<Set<string>> {
  const workflow = await readFile(`${CLAUDE}/references/dev/workflow.md`, 'utf8');
  return new Set([...workflow.matchAll(/`(shinaps-[a-z-]+)`/g)].map(([, role]) => role));
}

// Codex 版の配布先は自分の references しか読めないので、工程・テスト方針・作業記録・linear の
// 手順を複製している。Claude 版だけを直すと、runtime によって工程や判断基準が変わる。
test('every runtime ships the Claude references except the launch procedure', async () => {
  assert.deepEqual(
    await sharedReferences(`${CODEX}/references`),
    await sharedReferences(`${CLAUDE}/references`),
    `${CODEX}/references は Claude 版を編集元として複製する`,
  );
});

// 実装の入口は Claude Code の dev-claude だけ。Codex に dev- の入口を配布しない。
test('only Claude Code exposes the development entrypoint', async () => {
  for (const [root, expected] of [
    [`${CLAUDE}/skills`, ['dev-claude']],
    [`${CODEX}/skills`, []],
  ] as const) {
    const entries = (await readdir(root)).filter((name) => name.startsWith('dev-'));
    assert.deepEqual(entries, expected, root);
  }
});

// review・debug・spec などは両 runtime で工程の役割を使うので、工程が名前を挙げる役割は
// 各 runtime に定義が要る。定義が無いと、その runtime のスキルだけが担当を起動できずに止まる。
test('every role named in the dev workflow is defined in every runtime', async () => {
  const roles = await workflowRoles();
  assert.ok(roles.size > 0);
  const missing: string[] = [];
  for (const role of roles) {
    for (const path of [`${CLAUDE}/agents/${role}.md`, `${CODEX}/agents/${role}.toml`]) {
      await access(path).catch(() => missing.push(path));
    }
  }
  assert.deepEqual(missing, []);
});

// テスト方針は references/testing.md を正本とし、役割定義には同じ段落を写す（役割は plugin 内の
// 資料を読めるとは限らないため）。正本だけを直すと、役割ごとに古い基準が残る。
test('role definitions contain the testing policy paragraph verbatim', async () => {
  const policy = (await readFile(`${CLAUDE}/references/testing.md`, 'utf8'))
    .split('\n')
    .filter((line) => line.trim() !== '')
    .at(-1);
  assert.ok(policy);
  const stale: string[] = [];
  for (const role of TESTING_POLICY_ROLES) {
    for (const path of [`${CLAUDE}/agents/${role}.md`, `${CODEX}/agents/${role}.toml`]) {
      if (!(await readFile(path, 'utf8')).includes(policy)) stale.push(path);
    }
  }
  assert.deepEqual(stale, []);
});

// Claude の dev 入口は、Codex がローカル CLI または Bridge で依頼して Skill ツールから起動する。
// disable-model-invocation: true を付けると、Skill ツールからの起動が拒否される（63102d2 で直した不具合）。
test('Claude dev entries can be invoked through the Skill tool', async () => {
  for (const skill of ['dev-claude']) {
    const text = await readFile(`${CLAUDE}/skills/${skill}/SKILL.md`, 'utf8');
    const frontmatter = text.split('---')[1];
    assert.doesNotMatch(frontmatter, /^disable-model-invocation:\s*true\s*$/m, skill);
  }
});
