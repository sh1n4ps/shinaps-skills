import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CLAUDE,
  CODEX,
  MANAGED_SKILL,
  RUNTIME_SPECIFIC_REFERENCE,
} from '../scripts/distribution-copies.ts';

const MANAGED = `${CLAUDE}/managed-agents`;
const MANAGED_LEAD = `${MANAGED}/agents/shinaps-dev-managed-cc.md`;
// 探索は必須担当ではなく、Managed では lead と独立設計担当が自分で調べるので、探索担当は lead に登録しない。
const MANAGED_UNREGISTERED_ROLES = ['shinaps-explorer'];
// テスト方針の段落を写す定義。Codex には dev 専用の役割を配布しないので、対象は runtime ごとに違う。
// Managed の lead はメインとして実装と検証を行うので、lead の定義にも写す。
const TESTING_POLICY_DEFINITIONS = [
  ...['shinaps-architect', 'shinaps-plan-reviewer', 'shinaps-reviewer'].map(
    (role) => `${CLAUDE}/agents/${role}.md`,
  ),
  MANAGED_LEAD,
  `${CODEX}/agents/shinaps-reviewer.toml`,
];
// 本文を写す先。担当は plugin 内の資料を読めるとは限らず、Managed の skill は plugin の外の資料を読めない。
// 設計の観点: Claude ではメインが design.md を読み、独立設計担当は定義の写しで同じ観点を使う。Managed の lead は
// 自分の skill の中の写しを読む（Managed の architect は Claude 版との本文一致で結ばれる）。
// レビューの共通契約: dev と単独の review で担当の構成と採否の基準を揃える。Codex へは references の一致で届く。
const REFERENCE_COPIES = [
  {
    source: `${CLAUDE}/references/dev/design.md`,
    copies: [`${CLAUDE}/agents/shinaps-architect.md`, `${MANAGED_SKILL}/references/design.md`],
  },
  {
    source: `${CLAUDE}/references/review.md`,
    copies: [`${MANAGED_SKILL}/references/review.md`],
  },
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

// 0.48.0 で操作ごとの許可一覧（`permissions`）を廃止し、依頼範囲と `constraints` で判断する契約にした。
// 廃止した許可名が文書に残ると、読んだ AI がその許可の有無で止まったり、bypassPermissions への個別の同意を
// 求めたりする。両版は手作業で複製するので、両方に同じ旧文面が入ると一致テストでは検出できない。
// 旧契約を説明してよいのは、configuration.md の「旧設定の移行」節だけにする。
test('distributed documents describe retired Linear permissions only in the migration section', async () => {
  const retired = [
    /[`"]permissions[`"]/,
    /\b(?:claude_cli|claude_cli_bypass_permissions|bridge_request|dev_delegation|issue_update|development_operations|pr_create)\b/,
    /`(?:deploy|publish|evidence):/,
  ];
  const documents: Record<string, string> = {};
  for (const root of [CLAUDE, CODEX, 'docs']) {
    for (const [path, text] of Object.entries(await readTree(root))) {
      if (/\.(?:md|json|toml|ya?ml)$/.test(path)) documents[`${root}/${path}`] = text;
    }
  }
  documents['README.md'] = await readFile('README.md', 'utf8');
  for (const root of [CLAUDE, CODEX]) {
    const path = `${root}/references/linear/configuration.md`;
    const migration = /^## 旧設定の移行\n[\s\S]*?(?=^## )/m;
    assert.match(documents[path], migration, `${path} に「旧設定の移行」節がない`);
    documents[path] = documents[path].replace(migration, '');
  }
  const found = Object.entries(documents).flatMap(([path, text]) =>
    retired.filter((pattern) => pattern.test(text)).map((pattern) => `${path}: ${pattern}`),
  );
  assert.deepEqual(found, []);
});

// Managed の共通定義は、各 runtime の managed-setup が自分の plugin 内から読んで利用者の組織へ適用する。
// Claude 版だけを直すと、Codex から導入した lead・役割の定義が古いまま適用される。
test('every runtime ships the Claude Managed definitions', async () => {
  assert.deepEqual(
    await readTree(`${CODEX}/managed-agents`),
    await readTree(MANAGED),
    `${CODEX}/managed-agents は Claude 版を編集元として複製する`,
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

// 正本だけを直すと、独立案や Managed の計画・レビューが古い基準で行われ、runtime によって結果の基準が変わる。
test('copies in role definitions and the Managed skill contain the reference body verbatim', async () => {
  const stale: string[] = [];
  for (const { source, copies } of REFERENCE_COPIES) {
    const body = (await readFile(source, 'utf8')).replace(/^# .*\n/, '').trim();
    assert.ok(body);
    for (const path of copies) {
      if (!(await readFile(path, 'utf8')).includes(body)) stale.push(`${path} <- ${source}`);
    }
  }
  assert.deepEqual(stale, []);
});

// Codex の担当は plugin の Claude 版の定義を読めないので、種類ごとの手順を同じ文で持つ。片方だけを直すと、
// 同じ「規約照合」の依頼で runtime によって手順と重要度の基準が変わる。
test('the Codex reviewer carries the Claude review kinds verbatim', async () => {
  const definition = await readFile(`${CLAUDE}/agents/shinaps-reviewer.md`, 'utf8');
  const start = definition.indexOf('## レビューの種類');
  const end = definition.indexOf('## テスト方針');
  assert.ok(start >= 0 && end > start);
  const codex = await readFile(`${CODEX}/agents/shinaps-reviewer.toml`, 'utf8');
  // TOML の basic string は改行を \n で書くので、戻してから本文全体を比べる。
  assert.ok(codex.replaceAll('\\n', '\n').includes(definition.slice(start, end).trim()));
});

// 廃止した入口・担当が配布物に残ると、更新後も古い手順で動き続ける。移行案内として旧名を説明することは
// 別の話なので、文書の語ではなく配布するファイルを検査する。
test('retired review entrypoints and roles are not distributed', async () => {
  const distributed = [
    ...Object.keys(await readTree(`${CLAUDE}`)),
    ...Object.keys(await readTree(`${CODEX}`)),
  ];
  const retired =
    /^(?:skills\/(?:refine|simplify|extract-rules)\/|(?:managed-agents\/)?agents\/shinaps-(?:refine-agent|simplifier|review-validator)\.)/;
  assert.deepEqual(
    distributed.filter((path) => retired.test(path)),
    [],
  );
});

// 文書が呼び出しとして書いた `shinaps:<名前>` の先が配布されていないと、読んだ AI が存在しない入口や担当を
// 起動しようとして止まる。Codex の文書は Claude の dev-claude も案内するので、両版の和と比べる。
test('skill and role invocations in distributed documents resolve', async () => {
  const skills = new Set([
    ...(await readdir(`${CLAUDE}/skills`)),
    ...(await readdir(`${CODEX}/skills`)),
  ]);
  const roles = (await readdir(`${CLAUDE}/agents`)).map((name) => name.slice(0, -'.md'.length));
  const known = new Set([...skills, ...roles]);
  const documents: Record<string, string> = { 'README.md': await readFile('README.md', 'utf8') };
  for (const root of [CLAUDE, CODEX, 'docs']) {
    for (const [path, text] of Object.entries(await readTree(root))) {
      documents[`${root}/${path}`] = text;
    }
  }
  const broken = Object.entries(documents).flatMap(([path, text]) =>
    [...text.matchAll(/shinaps:([a-z][a-z-]*)/g)]
      .filter(([, name]) => !known.has(name))
      .map(([reference]) => `${path}: ${reference}`),
  );
  assert.deepEqual(broken, []);
});

// 工程の文書やスキルが挙げた担当の定義が無いと、読んだ AI がその担当を起動できずに止まる。Codex の担当は
// `Codex ships exactly the roles its skills name` が別に確かめる。
test('every role named in distributed documents is defined', async () => {
  // 担当ではない名前: 配布 CLI のコマンドと Managed の環境。
  const notRoles = new Set(['shinaps-skills', 'shinaps-dev']);
  const defined = new Set(
    [...(await readdir(`${CLAUDE}/agents`)), ...(await readdir(`${MANAGED}/agents`))].map((name) =>
      name.slice(0, -'.md'.length),
    ),
  );
  const documents = await Promise.all([CLAUDE, CODEX, 'docs'].map((root) => readTree(root)));
  const named = documents
    .flatMap((tree) => Object.values(tree))
    .flatMap((text) => [...text.matchAll(/`(shinaps-[a-z-]+)`/g)].map(([, role]) => role));
  assert.ok(named.length > 0);
  assert.deepEqual(
    [...new Set(named)].filter((role) => !notRoles.has(role) && !defined.has(role)),
    [],
  );
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

// auto 経路のメインは Opus・bypassPermissions で動かす。Codex は CLI 手順のコマンドをそのまま実行するので、
// resume を含むどれか一つで指定が抜けると、そのターンは CLI の既定のモデル・権限モードで再開される。
// 権限モードが既定に戻ると、非対話では足りない許可を求められないまま作業が止まる。
test('every Claude CLI invocation in the auto route pins the main model and permission mode', async () => {
  const procedure = await readFile(`${CLAUDE}/references/linear/claude-cli.md`, 'utf8');
  const invocations = [...procedure.matchAll(/```[a-z]*\n([\s\S]*?)```/g)]
    .flatMap(([, block]) => block.split('\n'))
    .filter((line) => line.startsWith('claude -p'));
  assert.ok(invocations.length > 0);
  assert.deepEqual(
    invocations.filter(
      (line) =>
        !/(^|\s)--model opus(\s|$)/.test(line) ||
        !/(^|\s)--permission-mode bypassPermissions(\s|$)/.test(line),
    ),
    [],
  );
});

// Managed の lead は predefined_agents に列挙した役割にしか委任できない。必須担当は人数によらず
// 毎回起動されるので、Claude の dev 工程が使う役割や skill が名前を挙げる役割が未登録だと、lead が
// その担当を起動できずに止まるか、必須の確認を欠いたまま進む。
test('Managed lead registers every role the dev workflow and its skill use', async () => {
  const registered = await managedLeadRoles();
  const skillNames = Object.values(await readTree(MANAGED_SKILL)).flatMap((text) =>
    [...text.matchAll(/`(shinaps-[a-z-]+)`/g)].map(([, role]) => role),
  );
  assert.ok(skillNames.length > 0);
  const named = [
    ...[...(await workflowRoles())].filter((role) => !MANAGED_UNREGISTERED_ROLES.includes(role)),
    ...skillNames,
  ];
  assert.deepEqual(
    [...new Set(named)].filter((role) => !registered.includes(role)),
    [],
  );
});

// lead が列挙したファイルが無いと apply が失敗し、lead から到達できない役割定義を置くと apply が
// 使われない担当を更新し続ける。
test('Managed role definitions are exactly the roles the lead registers', async () => {
  assert.deepEqual(await managedRoleDefinitions(), await managedLeadRoles());
});

// hook の本文が版でずれると、片方のホストだけ捕捉の形式や保存先が変わる。設定はプラグインのルートの環境変数だけが違う。
test('rule capture hook is the same in both plugins', async () => {
  const hook = 'hooks/capture-rule-response.mjs';
  assert.equal(
    await readFile(`${CODEX}/${hook}`, 'utf8'),
    await readFile(`${CLAUDE}/${hook}`, 'utf8'),
  );
  assert.equal(
    await readFile(`${CODEX}/hooks/hooks.json`, 'utf8'),
    (await readFile(`${CLAUDE}/hooks/hooks.json`, 'utf8')).replace(
      'CLAUDE_PLUGIN_ROOT',
      'PLUGIN_ROOT',
    ),
  );
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

// Managed 構成は Shinaps AI に依存せず自己完結させる。役割の本文は
// `Managed role definitions copy the Claude name, description and body` で Claude 版と同一に固定しているので、
// 役割は frontmatter だけを見る。
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

// Managed の lead はメインとして設計・実装を行うので、そのモデルが Managed の設計・実装のモデルになる。
// 利用者の指定で lead・役割とも Opus で動かす (SHINAPS-240)。
test('every Managed agent runs on Opus', async () => {
  const notOpus: string[] = [];
  for (const role of [...(await managedLeadRoles()), 'shinaps-dev-managed-cc']) {
    const path = `${MANAGED}/agents/${role}.md`;
    const { frontmatter } = splitDefinition(await readFile(path, 'utf8'));
    if (!/^model:\n\s+id: claude-opus-5-5$/m.test(frontmatter)) notOpus.push(path);
  }
  assert.deepEqual(notOpus, []);
});
