import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readJson, readJsonIfExists, writeFileAtomic } from './fs.ts';
import { withLock } from './lock.ts';
import { type Account, type Ant, filesBeta, managedBeta } from './managed-ant.ts';

export const staffings = ['LITE', 'BASIC', 'ULTRA'] as const;
export const permissions = ['commit', 'push', 'draft_pr'] as const;
export type Permission = (typeof permissions)[number];

/** 依頼の入力。秘密値 (APIキー・GitHub token) は含めない。記録とセッションの重複判定に使う。 */
export type RunRequest = {
  account: string;
  repository: { url: string; mount_path: string };
  vault_id: string | null;
  base: string;
  base_sha: string;
  head: string;
  staffing: (typeof staffings)[number];
  allow: Permission[];
  budget_cents: string;
  task: string;
  verify: string | null;
  author: string | null;
  title: string | null;
  /** 利用者 CLAUDE.md の本文。無ければ null。 */
  claude_md: string | null;
};

/** `sessions/<request_id>.json`。`session_id` が null の記録は、作成の成否が分からない。 */
type SessionRecord = {
  request_id: string;
  session_id: string | null;
  created_at: string;
  request: Omit<RunRequest, 'task' | 'claude_md'> & {
    task_sha256: string;
    claude_md_sha256: string | null;
  };
};

const leadKey = './agents/shinaps-dev-managed-cc.md';
const environmentKey = './environments/shinaps-dev.yaml';
const permissionLabels: Record<Permission, string> = {
  commit: 'commit',
  push: 'headへのpush',
  draft_pr: 'draft PRの作成',
};
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/**
 * `--transform id -r` の出力から ID を取り出す。ant は transform のパスが応答に無いと応答の全体を
 * 出すので、ID の形でない出力を ID として記録しない。
 */
async function readId(output: Promise<string>, command: string): Promise<string> {
  const id = (await output).trim();
  if (!/^[A-Za-z0-9_]+$/.test(id)) throw new Error(`${command} returned no ID.`);
  return id;
}

/**
 * 依頼を lead へ送るセッションを作る。同じ入力の依頼は同じセッションを返し、作り直さない。
 * 作成の途中で止まった記録があれば、重複を避けるために作らずに止める。
 * @param githubToken マウントするリポジトリの token。本文 (stdin) だけで渡す。
 * @param claudeMdPath `request.claude_md` の元のファイル。upload に使う。
 */
export async function runSession(
  account: Account,
  request: RunRequest,
  options: {
    ant: Ant;
    log: (message: string) => unknown;
    githubToken: string | null;
    claudeMdPath: string | null;
    now: () => Date;
  },
): Promise<string> {
  const { ant, log } = options;
  return withLock(account.dir, async () => {
    const { task, claude_md, ...rest } = request;
    const recorded: SessionRecord['request'] = {
      ...rest,
      task_sha256: sha256(task),
      claude_md_sha256: claude_md === null ? null : sha256(claude_md),
    };
    const requestId = sha256(JSON.stringify(recorded)).slice(0, 32);
    const recordPath = join(account.dir, 'sessions', `${requestId}.json`);
    const previous = await readJsonIfExists<SessionRecord>(recordPath);
    if (previous?.session_id) {
      log(`Session already exists for this request: ${previous.session_id}`);
      return previous.session_id;
    }
    if (previous) {
      throw new Error(
        `A previous run of this request stopped while creating a session. Check the sessions of account ${account.name} for metadata shinaps_request=${requestId}; delete ${recordPath} only after confirming none was created, then retry.`,
      );
    }
    const lock = await readJsonIfExists<{ resources?: Record<string, { id?: string }> }>(
      join(account.dir, 'definitions', 'claude-lock.json'),
    );
    const agent = lock?.resources?.[leadKey]?.id;
    const environment = lock?.resources?.[environmentKey]?.id;
    if (!agent || !environment) {
      throw new Error(
        `Account ${account.name} has no applied lead and environment. Run managed setup --apply first.`,
      );
    }
    await mkdir(join(account.dir, 'sessions'), { recursive: true });
    const record: SessionRecord = {
      request_id: requestId,
      session_id: null,
      created_at: options.now().toISOString(),
      request: recorded,
    };
    // 作成より前に記録する。作成後に記録できずに終わっても、次の実行は止まり、重複して作らない。
    await writeFileAtomic(recordPath, JSON.stringify(record, null, 2) + '\n');
    const resources: unknown[] = [
      {
        type: 'github_repository',
        url: request.repository.url,
        mount_path: request.repository.mount_path,
        ...(options.githubToken ? { authorization_token: options.githubToken } : {}),
        checkout: { type: 'commit', sha: request.base_sha },
      },
    ];
    if (options.claudeMdPath) {
      // upload は記録の後に行う。記録の前だと、途中で止まった実行の再実行のたびに Files が増える。
      let fileId: string;
      try {
        fileId = await readId(
          ant({
            // セッションの Files と同じ beta の Files API に上げる。パスは絶対パスにする (ant は `-` を
            // stdin と解釈する)。
            argv: [
              'beta:files',
              'upload',
              '--file',
              resolve(options.claudeMdPath),
              ...filesBeta,
              '--transform',
              'id',
              '-r',
            ],
            apiKey: account.apiKey,
          }),
          'ant files upload',
        );
      } catch (error) {
        // セッションはまだ作っていないので、記録を残すと同じ依頼の再実行が不要に止まる。
        await rm(recordPath, { force: true });
        throw error;
      }
      resources.push({ type: 'file', file_id: fileId, mount_path: '/CLAUDE.md' });
    }
    const body = {
      agent,
      environment_id: environment,
      ...(request.vault_id ? { vault_ids: [request.vault_id] } : {}),
      title: request.title ?? request.head,
      metadata: { shinaps_request: requestId, head: request.head, staffing: request.staffing },
      budget: {
        type: 'limit',
        max_list_cost: { amount: request.budget_cents, currency: 'USD' },
      },
      resources,
      initial_events: [
        { type: 'user.message', content: [{ type: 'text', text: initialMessage(request) }] },
      ],
    };
    const sessionId = await readId(
      ant({
        argv: ['beta:sessions', 'create', ...managedBeta, '--transform', 'id', '-r'],
        apiKey: account.apiKey,
        body,
      }),
      'ant beta:sessions create',
    );
    await writeFileAtomic(
      recordPath,
      JSON.stringify({ ...record, session_id: sessionId }, null, 2) + '\n',
    );
    log(`Created session ${sessionId} for account ${account.name}.`);
    return sessionId;
  });
}

// lead の契約 (managed-agents/skills/dev-managed-cc/SKILL.md の初回メッセージ) の必須入力を、
// すべて明示する。欠けると lead は質問で止まり、それまでの費用が無駄になる。
function initialMessage(request: RunRequest): string {
  const budget = Number(request.budget_cents) / 100;
  return [
    `リポジトリ: ${request.repository.url}（マウント先 ${request.repository.mount_path}）`,
    `base: ${request.base} @ ${request.base_sha}`,
    `head: ${request.head}`,
    `範囲と受入条件:\n${request.task.trimEnd()}`,
    `体制: ${request.staffing}`,
    `許可: ${request.allow.length ? request.allow.map((name) => permissionLabels[name]).join('・') : 'なし（commit・push・draft PRの作成はしない）'}`,
    `予算: ${budget} USD（セッションの上限 ${request.budget_cents} セント）`,
    `必須検証（任意）: ${request.verify ?? '指定なし。リポジトリの規約に従う'}`,
    `author（任意）: ${request.author ?? '指定なし'}`,
    ...(request.claude_md === null ? [] : ['利用者 CLAUDE.md: /mnt/session/uploads/CLAUDE.md']),
  ].join('\n');
}

/**
 * このアカウントの記録にあるセッションか確かめる。別アカウントのキーや、CLI が作っていない
 * セッションを観測・操作しないため。
 */
async function requireRecordedSession(account: Account, sessionId: string): Promise<void> {
  const directory = join(account.dir, 'sessions');
  const names = await readdir(directory).catch(() => [] as string[]);
  for (const name of names.filter((entry) => entry.endsWith('.json'))) {
    const record = await readJson<SessionRecord>(join(directory, name));
    if (record.session_id === sessionId) return;
  }
  throw new Error(
    `Session ${sessionId} was not created by managed run for account ${account.name}.`,
  );
}

/** セッションの状態と、lead の最後のメッセージ (1 行目が `状態: 完了|質問|未完了`) を返す。 */
export async function sessionStatus(
  account: Account,
  sessionId: string,
  ant: Ant,
): Promise<Record<string, unknown>> {
  await requireRecordedSession(account, sessionId);
  const call = (argv: string[]) => ant({ argv, apiKey: account.apiKey });
  const session = JSON.parse(
    await call([
      'beta:sessions',
      'retrieve',
      '--session-id',
      sessionId,
      ...managedBeta,
      '--format',
      'json',
      '--transform',
      '{status,usage,budget}',
    ]),
  );
  // 最新の agent.message 1 件だけを取る。全イベント (ツールの呼び出しを含む) を取得しないため。
  const [last] = (
    await call([
      'beta:sessions:events',
      'list',
      '--session-id',
      sessionId,
      ...managedBeta,
      '--type',
      'agent.message',
      '--order',
      'desc',
      '--max-items',
      '1',
      '--format',
      'jsonl',
      '--transform',
      '{content}',
    ])
  )
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { content?: { type?: string; text?: string }[] });
  const message =
    last?.content
      ?.filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n') ?? null;
  const state = message?.match(/^状態: (完了|質問|未完了)/)?.[1] ?? null;
  return { session_id: sessionId, ...session, state, message };
}

/** 質問への回答を user.message として送る。新しい許可・予算はここでは加えられない (本文だけ)。 */
export async function replySession(
  account: Account,
  sessionId: string,
  text: string,
  ant: Ant,
): Promise<void> {
  await requireRecordedSession(account, sessionId);
  await ant({
    argv: ['beta:sessions:events', 'send', '--session-id', sessionId, ...managedBeta],
    apiKey: account.apiKey,
    body: { events: [{ type: 'user.message', content: [{ type: 'text', text }] }] },
  });
}

/**
 * セッションの出力ファイルを `sessions/<session_id>/outputs/` へ保存し、保存したパスを返す。
 * 差分の適用はしない。同名のファイルは最新のものだけを保存する (lead は毎ターン changes.patch を
 * 全体の差分で置き換えるため)。
 */
export async function collectOutputs(
  account: Account,
  sessionId: string,
  ant: Ant,
): Promise<string[]> {
  await requireRecordedSession(account, sessionId);
  const listed = (
    await ant({
      argv: [
        'beta:files',
        'list',
        '--scope-id',
        sessionId,
        ...filesBeta,
        '--format',
        'jsonl',
        '--transform',
        '{id,filename,size_bytes,created_at}',
      ],
      apiKey: account.apiKey,
    })
  )
    .split('\n')
    .filter((line) => line.trim())
    .map(
      (line) =>
        JSON.parse(line) as {
          id: string;
          filename: string;
          size_bytes?: number;
          created_at: string;
        },
    );
  const latest = new Map<string, (typeof listed)[number]>();
  for (const file of listed) {
    // 名前はクラウドのエージェントが決める。保存先の外へ書かないよう、ファイル名だけのものに限る。
    // ID は ant の引数に渡すので、フラグとして解釈される形 (`-` で始まる) を受け付けない。
    if (
      !/^[^/\\\0]+$/.test(file.filename) ||
      file.filename === '.' ||
      file.filename === '..' ||
      !/^[A-Za-z0-9_]+$/.test(file.id)
    ) {
      throw new Error(`Refusing to save an output with an unsafe file name (file ${file.id}).`);
    }
    const current = latest.get(file.filename);
    // 時刻は小数秒の桁数が揃うとは限らないので、文字列ではなく時刻として比べる。
    if (!current || Date.parse(current.created_at) < Date.parse(file.created_at)) {
      latest.set(file.filename, file);
    }
  }
  const directory = join(account.dir, 'sessions', sessionId, 'outputs');
  await mkdir(directory, { recursive: true });
  const saved: string[] = [];
  for (const file of latest.values()) {
    const path = join(directory, file.filename);
    const temporary = join(directory, `.${file.filename}.${randomUUID()}.tmp`);
    try {
      await ant({
        argv: ['beta:files', 'download', '--file-id', file.id, ...filesBeta, '--output', temporary],
        apiKey: account.apiKey,
      });
      const { size } = await stat(temporary);
      if (file.size_bytes !== undefined && size !== file.size_bytes) {
        throw new Error(
          `Downloaded ${file.filename} has ${size} bytes, but the Files API lists ${file.size_bytes}.`,
        );
      }
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
    saved.push(path);
  }
  return saved;
}
