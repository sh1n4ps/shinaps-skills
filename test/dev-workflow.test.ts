import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const CLAUDE = 'plugins/shinaps-claude';
const CODEX = 'plugins/shinaps-codex';
const MANAGED = 'managed-agents';
const MANAGED_LEAD = `${MANAGED}/agents/shinaps-dev-managed-cc.md`;
const MANAGED_SKILL = `${MANAGED}/skills/dev-managed-cc`;
// 起動手順は runtime ごとの機構で書くので、references の中でこれだけは複製しない。
const RUNTIME_SPECIFIC_REFERENCE = 'dev/launch.md';
// テスト方針の段落を写す役割定義。Codex には dev 専用の役割を配布しないので、対象は runtime ごとに違う。
const TESTING_POLICY_DEFINITIONS = [
  ...[
    'shinaps-architect',
    'shinaps-implementer',
    'shinaps-plan-reviewer',
    'shinaps-reviewer',
    'shinaps-refine-agent',
    'shinaps-simplifier',
    'shinaps-review-verifier',
  ].map((role) => `${CLAUDE}/agents/${role}.md`),
  ...['shinaps-reviewer', 'shinaps-refine-agent'].map((role) => `${CODEX}/agents/${role}.toml`),
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

function splitDefinition(text: string) {
  const [, frontmatter, body] = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [];
  assert.ok(frontmatter !== undefined && body !== undefined, 'frontmatter が無い');
  const field = (key: string) => frontmatter.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1];
  return { frontmatter, name: field('name'), description: field('description'), body };
}

// lead の predefined_agents に列挙された役割。lead が委任できるのはこの集合だけ。
async function managedLeadRoles(): Promise<string[]> {
  const lead = await readFile(MANAGED_LEAD, 'utf8');
  return [...lead.matchAll(/^\s*- \.\/(shinaps-[a-z-]+)\.md$/gm)].map(([, role]) => role).sort();
}

async function managedRoleDefinitions(): Promise<string[]> {
  return (await readdir(`${MANAGED}/agents`))
    .filter((name) => `${MANAGED}/agents/${name}` !== MANAGED_LEAD)
    .map((name) => name.slice(0, -'.md'.length))
    .sort();
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

// dev-claude は工程が名前を挙げる役割を Claude の定義から起動する。定義が無いと dev がその担当を
// 起動できずに止まる。
test('every role named in the dev workflow is defined for Claude', async () => {
  const roles = await workflowRoles();
  assert.ok(roles.size > 0);
  const missing: string[] = [];
  for (const role of roles) {
    const path = `${CLAUDE}/agents/${role}.md`;
    await access(path).catch(() => missing.push(path));
  }
  assert.deepEqual(missing, []);
});

// Codex のスキルは名前を挙げた担当だけを起動する。定義が無いとそのスキルが担当を起動できずに止まり、
// どのスキルも起動しない定義は、利用者の環境に使われないファイルを置くだけなので配布しない。
test('Codex ships exactly the roles its skills name', async () => {
  const defined = (await readdir(`${CODEX}/agents`))
    .filter((name) => name.endsWith('.toml'))
    .map((name) => name.slice(0, -'.toml'.length))
    .sort();
  const skills = await readTree(`${CODEX}/skills`);
  const named = [
    ...new Set(
      Object.entries(skills)
        .filter(([path]) => path.endsWith('SKILL.md'))
        .flatMap(([, text]) => [...text.matchAll(/shinaps-[a-z-]+/g)].map(([role]) => role)),
    ),
  ].sort();
  assert.ok(named.length > 0);
  assert.deepEqual(defined, named);
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
  for (const path of TESTING_POLICY_DEFINITIONS) {
    if (!(await readFile(path, 'utf8')).includes(policy)) stale.push(path);
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

// Managed の lead は predefined_agents に列挙した役割にしか委任できない。skill が名前を挙げる役割が
// 未登録だと lead がその担当を起動できずに止まる。
test('Managed lead registers every role its skill names', async () => {
  const registered = await managedLeadRoles();
  const skill = await readTree(MANAGED_SKILL);
  const named = new Set(
    Object.values(skill).flatMap((text) =>
      [...text.matchAll(/`(shinaps-[a-z-]+)`/g)].map(([, role]) => role),
    ),
  );
  assert.ok(named.size > 0);
  assert.deepEqual(
    [...named].filter((role) => !registered.includes(role)),
    [],
  );
});

// lead が列挙したファイルが無いと apply が失敗し、lead から到達できない役割定義を置くと apply が
// 使われない担当を更新し続ける。lock に残る旧 refine の項目は、ソースを置かないことで
// 到達不能のまま保つ。
test('Managed role definitions are exactly the roles the lead registers', async () => {
  assert.deepEqual(await managedRoleDefinitions(), await managedLeadRoles());
});

// Managed の役割定義は Claude 版の name・description・本文を写し、runtime 固有の部分は frontmatter の
// 他の項目だけに持つ。Claude 版だけを直すと、クラウドで動く担当の判断基準が PC と変わる。
test('Managed role definitions copy the Claude name, description and body', async () => {
  const stale: string[] = [];
  for (const role of await managedLeadRoles()) {
    const claude = splitDefinition(await readFile(`${CLAUDE}/agents/${role}.md`, 'utf8'));
    const managed = splitDefinition(await readFile(`${MANAGED}/agents/${role}.md`, 'utf8'));
    for (const key of ['name', 'description', 'body'] as const) {
      if (managed[key] !== claude[key]) stale.push(`${role} の ${key}`);
    }
  }
  assert.deepEqual(stale, []);
});

// Managed 構成は Shinaps AI に依存せず自己完結させる。役割の本文は Claude 版と同一であることを上の
// テストで固定しているので、役割は frontmatter だけを見る。
// クラウドの既存リソースには speed: fast が残っており、ソースで speed を省略しても apply は変更と
// みなさず fast のまま残る。全 agent 定義に speed: standard を明示して戻し、再び fast にならないよう固定する。
test('Managed configuration does not depend on Shinaps AI or fast mode', async () => {
  const frontmatters: Record<string, string> = {};
  for (const role of [...(await managedLeadRoles()), 'shinaps-dev-managed-cc']) {
    const path = `${MANAGED}/agents/${role}.md`;
    frontmatters[path] = splitDefinition(await readFile(path, 'utf8')).frontmatter;
  }
  const notStandard = Object.entries(frontmatters)
    .filter(([, text]) => !/^\s+speed: standard$/m.test(text) || /speed: fast/.test(text))
    .map(([path]) => path);
  assert.deepEqual(notStandard, []);

  const targets: Record<string, string> = {
    ...frontmatters,
    [MANAGED_LEAD]: await readFile(MANAGED_LEAD, 'utf8'),
    ...Object.fromEntries(
      Object.entries(await readTree(MANAGED_SKILL)).map(([path, text]) => [
        `${MANAGED_SKILL}/${path}`,
        text,
      ]),
    ),
  };
  const found: string[] = [];
  for (const [path, text] of Object.entries(targets)) {
    for (const pattern of [/shinaps-ai|app\.shinaps\.ai/, /search_rules|list_search_facets/]) {
      if (pattern.test(text)) found.push(`${path}: ${pattern}`);
    }
  }
  assert.deepEqual(found, []);
});
