import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const CLAUDE = 'plugins/shinaps-claude';
const CODEX = 'plugins/shinaps-codex';
const SHARED_REFERENCES = [
  'references/dev/workflow.md',
  'references/testing.md',
  'references/work-records.md',
];
const TESTING_POLICY_ROLES = [
  'shinaps-architect',
  'shinaps-implementer',
  'shinaps-plan-reviewer',
  'shinaps-reviewer',
  'shinaps-refine-agent',
  'shinaps-simplifier',
  'shinaps-review-verifier',
];

// Codex のインストーラは plugins/shinaps-codex だけを配るので、dev の工程とテスト方針を両版に置いている。
// 片方だけを更新すると、runtime によって工程や判断基準が変わる。
test('shared workflow references are identical in the Claude and Codex plugins', async () => {
  for (const path of SHARED_REFERENCES) {
    assert.equal(
      await readFile(`${CODEX}/${path}`, 'utf8'),
      await readFile(`${CLAUDE}/${path}`, 'utf8'),
      `${path} は Claude 版を編集元として Codex 版へ複製する`,
    );
  }
});

// 両 runtime が同じ工程を使うので、工程が名前を挙げる役割はどちらの plugin にも定義が要る。
// 片方に無いと、その runtime の dev だけが担当を起動できずに止まる。
test('every role named in the dev workflow is defined in both plugins', async () => {
  const workflow = await readFile(`${CLAUDE}/references/dev/workflow.md`, 'utf8');
  const roles = new Set([...workflow.matchAll(/`(shinaps-[a-z-]+)`/g)].map(([, role]) => role));
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

// Claude の dev 入口は、Codex が AI Terminal Bridge で依頼して Skill ツールから起動する。
// disable-model-invocation: true を付けると、Skill ツールからの起動が拒否される（63102d2 で直した不具合）。
test('Claude dev entries can be invoked through the Skill tool', async () => {
  for (const skill of ['dev-claude', 'dev-claude-ultra']) {
    const text = await readFile(`${CLAUDE}/skills/${skill}/SKILL.md`, 'utf8');
    const frontmatter = text.split('---')[1];
    assert.doesNotMatch(frontmatter, /^disable-model-invocation:\s*true\s*$/m, skill);
  }
});
