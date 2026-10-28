import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { managed } from '../lib/managed.ts';
import { antEnvironment, antRequestBody, type AntCall } from '../lib/managed-ant.ts';

// アカウントの状態の配置 (版をまたぐ約束なので実装の定数を使わない)。
const accountDir = (home: string, name: string) =>
  join(home, '.local/share/shinaps-ai/skills/managed', name);

const KEYS = { personal: 'sk-ant-personal-0123456789', work: 'sk-ant-work-9876543210' };
const TOKEN = 'github_pat_secret_0123456789';
const PLAN = '+ ./agents/shinaps-dev-managed-cc.md  create\n';
const UP_TO_DATE = 'Everything is up to date.\n';

/**
 * ant の偽物。呼び出しを記録し、apply は lock を書いて次の dry-run を最新にする。`respond` で個々の
 * 応答を差し替える。
 */
function fakeAnt(
  respond: (call: AntCall) => string | undefined | Promise<string | undefined> = () => undefined,
) {
  const calls: AntCall[] = [];
  const ant = async (call: AntCall) => {
    calls.push(call);
    const custom = await respond(call);
    if (custom !== undefined) return custom;
    const [command, action] = call.argv;
    if (command === 'apply' && call.argv.includes('--dry-run')) {
      const applied = await readFile(join(call.cwd!, 'claude-lock.json'), 'utf8').catch(() => null);
      return applied ? UP_TO_DATE : PLAN;
    }
    if (command === 'apply') {
      await writeFile(
        join(call.cwd!, 'claude-lock.json'),
        JSON.stringify({
          resources: {
            './agents/shinaps-dev-managed-cc.md': { id: `agent_${call.apiKey.slice(-4)}` },
            './environments/shinaps-dev.yaml': { id: `env_${call.apiKey.slice(-4)}` },
          },
        }),
      );
      return 'Apply  ./claude-lock.json\n';
    }
    if (action === 'list') return '';
    if (command === 'beta:files' && action === 'upload') return 'file_claude\n';
    if (action === 'create') return `sesn_${calls.filter((c) => c.argv[1] === 'create').length}\n`;
    return '';
  };
  return { calls, ant };
}

async function temporary(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), 'shinaps-managed-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const logs: string[] = [];
  const env = {
    SHINAPS_MANAGED_API_KEY_PERSONAL: KEYS.personal,
    SHINAPS_MANAGED_API_KEY_WORK: KEYS.work,
    SHINAPS_MANAGED_GITHUB_TOKEN: TOKEN,
  };
  return { home, logs, env, log: (message: string) => logs.push(message) };
}

/** ディレクトリ配下の全ファイルの相対パス → 内容。 */
async function snapshot(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    result[path.slice(directory.length + 1)] = await readFile(path, 'utf8');
  }
  return result;
}

const filesUnder = async (directory: string) => Object.values(await snapshot(directory));

async function writeRunInputs(home: string) {
  const config = join(home, 'managed.json');
  await writeFile(
    config,
    JSON.stringify({
      config_version: 2,
      repository: { url: 'https://github.com/acme/widgets', mount_path: '/workspace/widgets' },
      accounts: { personal: { vault_id: 'vlt_personal' }, work: { vault_id: null } },
    }),
  );
  const task = join(home, 'task.md');
  await writeFile(task, 'READMEの誤字を直す。npm test が通る。\n');
  return { config, task };
}

const runArgs = (config: string, task: string, account = 'personal') => [
  'run',
  config,
  '--account',
  account,
  '--base',
  'main',
  '--base-sha',
  'a7399a65e69864ddd1232abc184acebdb169065b',
  '--head',
  'feat/typo',
  '--staffing',
  'BASIC',
  '--allow',
  'commit,push',
  '--budget-cents',
  '4000',
  '--task-file',
  task,
];

// 複数アカウントを一コマンドで導入する。各アカウントの apply はそのアカウントの lock の場所で、
// そのアカウントのキーだけで動かなければならない。キーは argv・出力・保存したファイルに残さない。
test('setup applies every account with its own key and lock, and never exposes keys', async (t) => {
  const { home, logs, env, log } = await temporary(t);
  const { calls, ant } = fakeAnt();
  await managed(['setup', '--account', 'personal', '--account', 'work', '--apply'], {
    home,
    env,
    ant,
    log,
  });
  for (const [name, key] of Object.entries(KEYS)) {
    const definitions = join(accountDir(home, name), 'definitions');
    const applies = calls.filter((call) => call.argv[0] === 'apply' && call.argv[1] === '--yes');
    assert.ok(applies.some((call) => call.cwd === definitions && call.apiKey === key));
    assert.ok(
      calls.filter((call) => call.cwd === definitions).every((call) => call.apiKey === key),
    );
    const lock = JSON.parse(await readFile(join(definitions, 'claude-lock.json'), 'utf8'));
    assert.equal(lock.resources['./agents/shinaps-dev-managed-cc.md'].id, `agent_${key.slice(-4)}`);
  }
  const exposed = [
    ...calls.flatMap((call) => call.argv),
    ...logs,
    ...(await filesUnder(join(home, '.local'))),
  ].filter((text) => Object.values(KEYS).some((key) => text.includes(key)));
  assert.deepEqual(exposed, []);
  // ant の子プロセスには、そのアカウントのキーだけを資格情報として渡す。
  const child = antEnvironment(
    { ...env, ANTHROPIC_API_KEY: 'sk-ant-other', ANTHROPIC_PROFILE: 'other', PATH: '/bin' },
    KEYS.work,
  );
  assert.deepEqual(child, { PATH: '/bin', ANTHROPIC_API_KEY: KEYS.work, FORCE_COLOR: '0' });
  // ant は lock を上のディレクトリへ探すので、どの apply も definitions 直下の lock を明示する。
  const applies = calls.filter((call) => call.argv[0] === 'apply');
  assert.ok(applies.length > 0);
  for (const call of applies) {
    assert.deepEqual(call.argv.slice(2), ['--lock-file', 'claude-lock.json', '.']);
  }

  // 再実行は lock を使って最新と判定し、作り直さない。
  calls.length = 0;
  await managed(['setup', '--account', 'personal', '--account', 'work', '--apply'], {
    home,
    env,
    ant,
    log,
  });
  assert.deepEqual(
    calls.filter((call) => call.argv[1] === '--yes' || call.argv[1] === 'list'),
    [],
  );
});

// --apply を付けない setup は計画を見せるだけで、クラウドを変えない。
test('setup without --apply only shows the plan', async (t) => {
  const { home, env, log } = await temporary(t);
  const { calls, ant } = fakeAnt();
  await managed(['setup', '--account', 'work'], { home, env, ant, log });
  assert.deepEqual(
    calls.map((call) => call.argv.slice(0, 2)),
    [
      ['beta:agents', 'list'],
      ['beta:environments', 'list'],
      ['apply', '--dry-run'],
    ],
  );
});

// lock が無いと apply は同名のリソースを重複して作る。適用不能な計画 (dry-run は終了コード 0 で返す)
// も適用しない。どちらもそのアカウントだけを失敗にし、apply を呼ばない。
test('setup refuses plans that would duplicate or cannot be applied', async (t) => {
  for (const respond of [
    (call: AntCall) =>
      call.argv[0] === 'beta:agents'
        ? '{"name":"shinaps-dev-managed-cc","archived_at":null}\n'
        : undefined,
    (call: AntCall) =>
      call.argv[1] === '--dry-run' ? `${PLAN}This plan cannot be applied:\n` : undefined,
  ]) {
    const { home, env, log } = await temporary(t);
    const { calls, ant } = fakeAnt(respond);
    await assert.rejects(
      managed(['setup', '--account', 'work', '--apply'], { home, env, ant, log }),
      /Setup failed for: work/,
    );
    assert.equal(calls.filter((call) => call.argv[1] === '--yes').length, 0);
  }
});

// definitions には利用者の編集や旧版から移した lock がありうる。setup は自分が書いた内容と一致しない
// ファイルを書き換えも削除もせず、そのアカウントを失敗にし、apply を呼ばない。案内どおりに退避すれば
// 再実行で進める。
test('setup never overwrites or deletes definitions it did not write', async (t) => {
  const { home, env, log } = await temporary(t);
  const definitions = join(accountDir(home, 'work'), 'definitions');
  const lead = join(definitions, 'agents/shinaps-dev-managed-cc.md');
  const setup = (ant = fakeAnt().ant) =>
    managed(['setup', '--account', 'work', '--apply'], { home, env, ant, log });
  const changes = [
    () => writeFile(lead, 'edited by the user'),
    () => writeFile(join(definitions, 'agents/custom.md'), 'added by the user'),
    // ディレクトリごとリンクに置き換えた場合。辿るとリンク先 (利用者のファイル) へ書き込む。
    async () => {
      await mkdir(join(home, 'elsewhere'), { recursive: true });
      await rm(join(definitions, 'agents'), { recursive: true });
      await symlink(join(home, 'elsewhere'), join(definitions, 'agents'));
    },
    // 旧版の定義を lock ごと複写した場合。setup の記録が無く、内容が同梱の定義と違う。
    async () => {
      await writeFile(lead, 'previous template');
      await rm(join(accountDir(home, 'work'), 'definitions.json'));
    },
  ];
  for (const change of changes) {
    await rm(accountDir(home, 'work'), { recursive: true, force: true });
    await setup();
    await change();
    const before = await snapshot(definitions);
    const { calls, ant } = fakeAnt();
    await assert.rejects(setup(ant), /Setup failed for: work/);
    assert.deepEqual(await snapshot(definitions), before);
    assert.ok(before['claude-lock.json']);
    assert.deepEqual(calls, []);
  }

  // 編集したファイルを案内どおり外へ移すと、再実行は同梱の定義を書き直して進み、lock は変えない。
  // 消したファイルも同じく書き直す (利用者の内容は失われない)。
  await rm(accountDir(home, 'work'), { recursive: true, force: true });
  await setup();
  const lock = await readFile(join(definitions, 'claude-lock.json'), 'utf8');
  const bundled = await readFile(lead, 'utf8');
  await writeFile(lead, 'edited by the user');
  await assert.rejects(setup(), /Setup failed for: work/);
  await rename(lead, join(home, 'moved.md'));
  await rm(join(definitions, 'agents/shinaps-architect.md'));
  await setup();
  assert.equal(await readFile(join(home, 'moved.md'), 'utf8'), 'edited by the user');
  assert.equal(await readFile(lead, 'utf8'), bundled);
  assert.ok(await readFile(join(definitions, 'agents/shinaps-architect.md'), 'utf8'));
  assert.equal(await readFile(join(definitions, 'claude-lock.json'), 'utf8'), lock);
});

// 未編集の定義は同梱の定義の更新に追随し、同梱から消えたファイルを消す。旧版から移した lock だけの
// definitions もそのまま同期され、lock は書き換えない。
test('setup follows template updates and keeps the lock', async (t) => {
  const { home, env, log } = await temporary(t);
  const template = join(home, 'package/plugins/shinaps-claude/managed-agents');
  await cp('plugins/shinaps-claude/managed-agents', template, { recursive: true });
  const options = { home, env, log, source: join(home, 'package') };
  const definitions = join(accountDir(home, 'work'), 'definitions');
  await mkdir(definitions, { recursive: true });
  await writeFile(join(definitions, 'claude-lock.json'), '{"resources":{}}');
  await managed(['setup', '--account', 'work', '--apply'], { ...options, ant: fakeAnt().ant });
  await writeFile(join(template, 'agents/shinaps-architect.md'), 'updated template');
  await rm(join(template, 'skills/dev-managed-cc/references/design.md'));
  await managed(['setup', '--account', 'work', '--apply'], { ...options, ant: fakeAnt().ant });
  const { 'claude-lock.json': lock, ...copied } = await snapshot(definitions);
  assert.equal(lock, '{"resources":{}}');
  assert.deepEqual(copied, await snapshot(template));
});

// ant は本文の `@` で始まる文字列をファイル参照として展開し、`\@` で始まるものだけを文字列に戻す
// (ant v2.4.0 pkg/cmd/flagoptions.go)。題名や回答を書かれたとおりに送る。
test('request bodies keep strings that start with @ literal for ant', () => {
  assert.deepEqual(
    JSON.parse(antRequestBody({ title: '@feat/x', events: [{ text: 'mail a@b.c' }], n: 1 })),
    { title: '\\@feat/x', events: [{ text: 'mail a@b.c' }], n: 1 },
  );
});

// 同じ依頼の再実行で有料のセッションを重複して作らない。初回メッセージには lead が必須とする
// 入力を全て明示し、token はリクエスト本文 (stdin) にだけ渡す。
test('run creates one session per request and keeps the token out of argv, logs and files', async (t) => {
  const { home, logs, env, log } = await temporary(t);
  const { calls, ant } = fakeAnt();
  await managed(['setup', '--account', 'personal', '--apply'], { home, env, ant, log });
  const { config, task } = await writeRunInputs(home);
  const claudeMd = join(home, 'CLAUDE.md');
  await writeFile(claudeMd, '# 個人規約\n');
  for (let attempt = 0; attempt < 2; attempt++) {
    await managed([...runArgs(config, task), '--claude-md', claudeMd], { home, env, ant, log });
  }
  const creates = calls.filter(
    (call) => call.argv[0] === 'beta:sessions' && call.argv[1] === 'create',
  );
  assert.equal(creates.length, 1);
  assert.equal(calls.filter((call) => call.argv[1] === 'upload').length, 1);
  const body = creates[0].body as Record<string, any>;
  assert.equal(body.agent, `agent_${KEYS.personal.slice(-4)}`);
  assert.deepEqual(body.vault_ids, ['vlt_personal']);
  assert.deepEqual(body.budget, {
    type: 'limit',
    max_list_cost: { amount: '4000', currency: 'USD' },
  });
  assert.deepEqual(body.resources[0], {
    type: 'github_repository',
    url: 'https://github.com/acme/widgets',
    mount_path: '/workspace/widgets',
    authorization_token: TOKEN,
    checkout: { type: 'commit', sha: 'a7399a65e69864ddd1232abc184acebdb169065b' },
  });
  const message = body.initial_events[0].content[0].text;
  for (const line of [
    'リポジトリ: https://github.com/acme/widgets',
    'base: main @ a7399a65e69864ddd1232abc184acebdb169065b',
    'head: feat/typo',
    'READMEの誤字を直す',
    '体制: BASIC',
    '許可: commit・headへのpush',
    '予算: 40 USD',
  ]) {
    assert.ok(message.includes(line), line);
  }
  const exposed = [
    ...calls.flatMap((call) => call.argv),
    ...logs,
    ...(await filesUnder(join(home, '.local'))),
  ].filter((text) => text.includes(TOKEN));
  assert.deepEqual(exposed, []);
});

// 作成の成否が分からない記録が残っていれば、重複を避けるために作らない。push の許可で token が
// 無ければ、予算を使う前に止める。
test('run stops before creating when a session might exist or push cannot work', async (t) => {
  const { home, env, log } = await temporary(t);
  const { calls, ant } = fakeAnt((call) => {
    if (call.argv[1] === 'create') throw new Error('connection reset');
  });
  await managed(['setup', '--account', 'personal', '--apply'], { home, env, ant, log });
  const { config, task } = await writeRunInputs(home);
  await assert.rejects(managed(runArgs(config, task), { home, env, ant, log }), /connection reset/);
  await assert.rejects(
    managed(runArgs(config, task), { home, env, ant, log }),
    /stopped while creating a session/,
  );
  const { SHINAPS_MANAGED_GITHUB_TOKEN: _, ...withoutToken } = env;
  await assert.rejects(
    managed([...runArgs(config, task), '--title', 'new'], { home, env: withoutToken, ant, log }),
    /SHINAPS_MANAGED_GITHUB_TOKEN/,
  );
  assert.equal(calls.filter((call) => call.argv[1] === 'create').length, 1);

  // CLAUDE.md の upload で止まった依頼はセッションを作っていないので、同じ依頼の再実行は作成へ進む。
  let uploadFailed = false;
  const retry = fakeAnt((call) => {
    if (call.argv[1] === 'upload' && !uploadFailed) {
      uploadFailed = true;
      throw new Error('upload failed');
    }
  });
  const claudeMd = join(home, 'CLAUDE.md');
  await writeFile(claudeMd, '# 個人規約\n');
  const withClaudeMd = [...runArgs(config, task), '--claude-md', claudeMd];
  await assert.rejects(managed(withClaudeMd, { home, env, ant: retry.ant, log }), /upload failed/);
  await managed(withClaudeMd, { home, env, ant: retry.ant, log });
  assert.equal(retry.calls.filter((call) => call.argv[1] === 'create').length, 1);
});

// 観測と回収は、そのアカウントで作ったセッションだけを扱う。回収は保存だけで適用せず、同名の出力は
// 最新だけを残し、保存先の外へ書く名前は拒否する。
test('status and collect only handle sessions recorded for the account', async (t) => {
  const { home, logs, env, log } = await temporary(t);
  const files = [
    '{"id":"file_old","filename":"changes.patch","size_bytes":3,"created_at":"2026-10-01T00:00:00Z"}',
    '{"id":"file_new","filename":"changes.patch","size_bytes":3,"created_at":"2026-10-02T00:00:00Z"}',
  ];
  const { calls, ant } = fakeAnt(async (call) => {
    if (call.argv[0] === 'beta:files' && call.argv[1] === 'list') return files.join('\n');
    if (call.argv[1] === 'download') {
      const output = call.argv[call.argv.indexOf('--output') + 1];
      await writeFile(output, call.argv.includes('file_new') ? 'new' : 'old');
      return '';
    }
    if (call.argv[1] === 'retrieve') return '{"status":"idle"}';
    if (call.argv[0] === 'beta:sessions:events') {
      return '{"type":"agent.message","content":[{"type":"text","text":"状態: 質問\\nbase は？"}]}\n';
    }
  });
  await managed(['setup', '--account', 'personal', '--account', 'work', '--apply'], {
    home,
    env,
    ant,
    log,
  });
  const { config, task } = await writeRunInputs(home);
  await managed(runArgs(config, task), { home, env, ant, log });
  await assert.rejects(
    managed(['status', '--account', 'work', '--session', 'sesn_1'], { home, env, ant, log }),
    /not created by managed run for account work/,
  );
  logs.length = 0;
  await managed(['status', '--account', 'personal', '--session', 'sesn_1'], {
    home,
    env,
    ant,
    log,
  });
  assert.equal(JSON.parse(logs[0]).state, '質問');

  await managed(['collect', '--account', 'personal', '--session', 'sesn_1'], {
    home,
    env,
    ant,
    log,
  });
  const outputs = join(accountDir(home, 'personal'), 'sessions/sesn_1/outputs');
  assert.deepEqual(await readdir(outputs), ['changes.patch']);
  assert.equal(await readFile(join(outputs, 'changes.patch'), 'utf8'), 'new');
  assert.ok(calls.every((call) => call.argv[0] !== 'git'));

  files.push(
    '{"id":"file_bad","filename":"../escape","size_bytes":1,"created_at":"2026-10-03T00:00:00Z"}',
  );
  await assert.rejects(
    managed(['collect', '--account', 'personal', '--session', 'sesn_1'], { home, env, ant, log }),
    /unsafe file name/,
  );
  assert.deepEqual(await readdir(join(outputs, '..')), ['outputs']);
});
