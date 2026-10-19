import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const CLAUDE = 'plugins/shinaps-claude';
const CODEX = 'plugins/shinaps-codex';
const MANAGED = 'managed-agents';
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

async function managedSkillReferences(): Promise<string[]> {
  const skills = await readdir(`${MANAGED}/skills`, { withFileTypes: true });
  return skills
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${MANAGED}/skills/${entry.name}/references`);
}

// multiagent を持つ定義が lead。役割定義は委任先を持たない。
async function managedLeads(): Promise<string[]> {
  const leads: string[] = [];
  for (const entry of await readdir(`${MANAGED}/agents`)) {
    const path = `${MANAGED}/agents/${entry}`;
    if (/^multiagent:/m.test(await readFile(path, 'utf8'))) leads.push(path);
  }
  return leads;
}

async function workflowRoles(): Promise<Set<string>> {
  const workflow = await readFile(`${CLAUDE}/references/dev/workflow.md`, 'utf8');
  return new Set([...workflow.matchAll(/`(shinaps-[a-z-]+)`/g)].map(([, role]) => role));
}

function splitDefinition(text: string) {
  const [, frontmatter, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
  assert.ok(frontmatter !== undefined && body !== undefined, 'frontmatter が無い');
  const field = (key: string) => frontmatter.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1];
  return { name: field('name'), description: field('description'), body };
}

// Codex 版と Managed Agents 版の配布先は自分の references しか読めないので、工程・テスト方針・
// 作業記録・linear の手順を各版に複製している。Claude 版だけを直すと、runtime によって工程や
// 判断基準が変わる。Managed 版の skill を readdir で列挙するのは、skill を足したときに検査から
// 漏れないようにするため。
test('every runtime ships the Claude references except the launch procedure', async () => {
  const expected = await sharedReferences(`${CLAUDE}/references`);
  const managed = await managedSkillReferences();
  assert.ok(managed.length > 0, 'Managed 版の skill が見つからない');
  for (const root of [`${CODEX}/references`, ...managed]) {
    assert.deepEqual(
      await sharedReferences(root),
      expected,
      `${root} は Claude 版を編集元として複製する`,
    );
  }
});

// runtimeごとの入口は一つに統一し、削除済みの固定人数入口が再配布されないことを確認する。
test('each runtime exposes one development entrypoint', async () => {
  for (const [root, expected] of [
    [`${CLAUDE}/skills`, 'dev-claude'],
    [`${CODEX}/skills`, 'dev-codex'],
    [`${MANAGED}/skills`, 'dev-managed-cc'],
  ]) {
    const entries = (await readdir(root)).filter((name) => name.startsWith('dev-'));
    assert.deepEqual(entries, [expected], root);
  }
  assert.deepEqual(await managedLeads(), [`${MANAGED}/agents/shinaps-dev-managed-cc.md`]);
});

// 全 runtime が同じ工程を使うので、工程が名前を挙げる役割は各 runtime に定義が要る。
// 定義が無い、または Managed 版のいずれかの lead に登録されていないと、その入口の dev だけが
// 担当を起動できずに止まる。lead は multiagent を持つ定義として列挙し、入口を足しても漏れないようにする。
test('every role named in the dev workflow is defined in every runtime', async () => {
  const roles = await workflowRoles();
  assert.ok(roles.size > 0);
  const leads = await managedLeads();
  assert.ok(leads.length > 0, 'Managed 版の lead が見つからない');
  const missing: string[] = [];
  for (const role of roles) {
    for (const path of [`${CLAUDE}/agents/${role}.md`, `${CODEX}/agents/${role}.toml`]) {
      await access(path).catch(() => missing.push(path));
    }
  }
  for (const lead of leads) {
    const text = await readFile(lead, 'utf8');
    const registered = new Set(
      [...text.matchAll(/^\s*- \.\/(shinaps-[a-z-]+)\.md$/gm)].map(([, role]) => role),
    );
    for (const role of roles) {
      if (!registered.has(role)) missing.push(`${lead} の predefined_agents に ${role}`);
    }
  }
  assert.deepEqual(missing, []);
});

// Managed 版の役割定義は Claude 版の name・description・本文を複製し、runtime 固有の部分は
// frontmatter の他の項目だけに持つ。Claude 版だけを直すと、クラウドで動く担当の判断基準が
// PC と変わる。対象は工程が名前を挙げる役割だけで、Managed 版だけにある lead は比べない。
test('Managed Agents role definitions copy the Claude name, description and body', async () => {
  const stale: string[] = [];
  for (const role of await workflowRoles()) {
    const claude = splitDefinition(await readFile(`${CLAUDE}/agents/${role}.md`, 'utf8'));
    const managed = splitDefinition(await readFile(`${MANAGED}/agents/${role}.md`, 'utf8'));
    for (const key of ['name', 'description', 'body'] as const) {
      if (managed[key] !== claude[key]) stale.push(`${role} の ${key}`);
    }
  }
  assert.deepEqual(stale, []);
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
  for (const skill of ['dev-claude']) {
    const text = await readFile(`${CLAUDE}/skills/${skill}/SKILL.md`, 'utf8');
    const frontmatter = text.split('---')[1];
    assert.doesNotMatch(frontmatter, /^disable-model-invocation:\s*true\s*$/m, skill);
  }
});
