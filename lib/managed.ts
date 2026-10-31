import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { errorMessage } from './fs.ts';
import { managedAccountDir, managedRoot, packageRoot } from './layout.ts';
import { type Account, type Ant, antCommand } from './managed-ant.ts';
import { validateManagedConfig } from './managed-config.ts';
import {
  type RunRequest,
  collectOutputs,
  importSession,
  permissions,
  replySession,
  runSession,
  sessionStatus,
  staffings,
} from './managed-session.ts';
import { setupAccount } from './managed-setup.ts';
import { prepareSnapshot, readSnapshot } from './managed-snapshot.ts';

export type ManagedOptions = {
  /** ホームディレクトリ。アカウントの状態は `managedRoot(home)/managed/` に置く。 */
  home?: string;
  /** キーと GitHub token を読む環境変数。`ant` の子プロセスの環境の元にもなる。 */
  env?: NodeJS.ProcessEnv;
  ant?: Ant;
  log?: (message: string) => unknown;
  /** 同梱の共通定義を含むパッケージのルート。 */
  source?: string;
  now?: () => Date;
};

const managedUsage = [
  'Usage: shinaps-skills managed setup --account <name> [--account <name> ...] [--apply]',
  '       shinaps-skills managed run <managed.json> --account <name> --base <branch> (--base-sha <sha> | --snapshot <manifest>) --head <branch> --staffing <LITE|BASIC|ULTRA> --allow <none|commit,push,draft_pr> --budget-cents <n> --task-file <file> [--verify <command>] [--author "<name> <email>"] [--title <title>] [--claude-md <file>]',
  '       shinaps-skills managed status --account <name> --session <id>',
  '       shinaps-skills managed reply --account <name> --session <id> --message-file <file>',
  '       shinaps-skills managed collect --account <name> --session <id>',
  '       shinaps-skills managed prepare --source <local-checkout-root>',
  '       shinaps-skills managed import --account <name> --session <id> --destination <new-directory>',
  'API keys: --api-key <name>=<key>, or SHINAPS_MANAGED_API_KEY_<NAME> (prefer the environment variable; arguments are visible to other processes).',
  'GitHub token for the mounted repository: SHINAPS_MANAGED_GITHUB_TOKEN.',
  'Local source: prepare lists the frozen files and manifest; pass --snapshot <manifest> to run instead of --base-sha. Local snapshots do not push or create PRs.',
].join('\n');

const accountName = /^[a-z0-9][a-z0-9-]*$/;
const githubTokenVariable = 'SHINAPS_MANAGED_GITHUB_TOKEN';
const valueFlags = new Set([
  'account',
  'api-key',
  'base',
  'base-sha',
  'head',
  'staffing',
  'allow',
  'budget-cents',
  'task-file',
  'verify',
  'author',
  'title',
  'claude-md',
  'session',
  'message-file',
  'source',
  'snapshot',
  'destination',
]);
const repeatableFlags = new Set(['account', 'api-key']);

/** アカウント名ごとのキーの環境変数名。名前に `_` を許さないので、名前と一対一に対応する。 */
const apiKeyVariable = (account: string): string =>
  `SHINAPS_MANAGED_API_KEY_${account.toUpperCase().replaceAll('-', '_')}`;

/**
 * `shinaps-skills managed <setup|run|status|reply|collect|prepare|import>` を実行する。出力とエラー文から、渡された
 * APIキーと GitHub token の値を伏字にする。
 */
export async function managed(args: string[], options: ManagedOptions = {}): Promise<void> {
  const env = options.env ?? process.env;
  const secrets = collectSecrets(args, env);
  const redact = (text: string) =>
    secrets.reduce((result, secret) => result.replaceAll(secret, '<redacted>'), text);
  const log = (message: string) => (options.log ?? console.log)(redact(message));
  try {
    await dispatch(args, { ...options, env, log });
  } catch (error) {
    throw new Error(redact(errorMessage(error)));
  }
}

// 伏字にする値。解決に使うかどうかによらず、引数と環境変数で渡された全てのキーと token を含める。
function collectSecrets(args: string[], env: NodeJS.ProcessEnv): string[] {
  const values = Object.entries(env)
    .filter(([name]) => name.startsWith('SHINAPS_MANAGED_'))
    .map(([, value]) => value ?? '');
  args.forEach((arg, index) => {
    if (arg === '--api-key') values.push(args[index + 1]?.split('=').slice(1).join('=') ?? '');
  });
  return values.filter((value) => value.length > 0);
}

type Context = ManagedOptions & { env: NodeJS.ProcessEnv; log: (message: string) => unknown };

async function dispatch(args: string[], context: Context): Promise<void> {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === 'help') {
    context.log(managedUsage);
    return;
  }
  const { positional, flags, apply } = parse(rest);
  const home = context.home ?? homedir();
  const ant = context.ant ?? antCommand(context.env);
  const accounts = flags.get('account') ?? [];
  if (command === 'prepare') {
    if (apply || positional.length || accounts.length) throw usageError();
    const snapshot = await prepareSnapshot(
      required(flags, 'source'),
      join(managedRoot(home), 'snapshots'),
    );
    context.log(
      JSON.stringify({ ...snapshot, manifest: join(snapshot.directory, 'snapshot.json') }, null, 2),
    );
    return;
  }
  if (command === 'import') {
    if (apply || positional.length || accounts.length !== 1 || !accountName.test(accounts[0]))
      throw usageError();
    const account = { name: accounts[0], dir: managedAccountDir(managedRoot(home), accounts[0]) };
    const sessionId = required(flags, 'session');
    context.log(
      JSON.stringify(
        {
          account: account.name,
          session_id: sessionId,
          directory: await importSession(account, sessionId, required(flags, 'destination')),
        },
        null,
        2,
      ),
    );
    return;
  }
  if (command === 'setup') {
    if (positional.length || !accounts.length) throw usageError();
    // キーを先に全て解決する。途中のアカウントで欠けて止まると、一部だけが更新された状態になる。
    const resolved = resolveAccounts(accounts, flags, context.env, home);
    const results: string[] = [];
    const failures: string[] = [];
    for (const account of resolved) {
      try {
        const result = await setupAccount(account, {
          apply,
          ant,
          log: context.log,
          source: context.source ?? packageRoot,
        });
        results.push(result);
        context.log(`Account ${account.name}: ${result}.`);
      } catch (error) {
        failures.push(account.name);
        context.log(`Account ${account.name}: failed. ${errorMessage(error)}`);
      }
    }
    if (failures.length) throw new Error(`Setup failed for: ${failures.join(', ')}.`);
    if (results.includes('planned')) {
      context.log('No changes were applied. Re-run with --apply after reviewing the plans.');
    }
    return;
  }
  if (apply || accounts.length !== 1) throw usageError();
  const [account] = resolveAccounts(accounts, flags, context.env, home);
  if (command === 'run') {
    if (positional.length !== 1) throw usageError();
    return run(positional[0], account, flags, context, ant);
  }
  if (positional.length) throw usageError();
  const sessionId = required(flags, 'session');
  if (command === 'status') {
    context.log(JSON.stringify(await sessionStatus(account, sessionId, ant), null, 2));
  } else if (command === 'reply') {
    await replySession(
      account,
      sessionId,
      await readFile(required(flags, 'message-file'), 'utf8'),
      ant,
    );
    context.log(`Sent the reply to session ${sessionId}.`);
  } else if (command === 'collect') {
    const saved = await collectOutputs(account, sessionId, ant);
    context.log(
      [
        ...saved,
        'Saved only. Nothing was applied; review a patch with `git apply --check <changes.patch>` in a checkout of the agreed base.',
      ].join('\n'),
    );
  } else {
    throw usageError();
  }
}

async function run(
  configPath: string,
  account: Account,
  flags: Map<string, string[]>,
  context: Context,
  ant: Ant,
): Promise<void> {
  const config = await validateManagedConfig(configPath);
  if (!Object.hasOwn(config.accounts, account.name)) {
    throw new Error(`Account ${account.name} is not listed in ${configPath}.`);
  }
  const settings = config.accounts[account.name];
  const staffing = required(flags, 'staffing');
  if (!(staffings as readonly string[]).includes(staffing)) {
    throw new Error(`--staffing must be one of ${staffings.join(', ')}.`);
  }
  const allowText = required(flags, 'allow');
  const listed = allowText === 'none' ? [] : allowText.split(',');
  if (
    listed.some((permission) => !(permissions as readonly string[]).includes(permission)) ||
    new Set(listed).size !== listed.length
  ) {
    throw new Error(
      `--allow must be none or a comma-separated subset of ${permissions.join(',')}.`,
    );
  }
  // 並び順だけが違う同じ許可を別の依頼として扱わないよう、正規の順に揃える。
  const allow = permissions.filter((permission) => listed.includes(permission));
  const budget = required(flags, 'budget-cents');
  if (!/^[1-9][0-9]*$/.test(budget)) throw new Error('--budget-cents must be a positive integer.');
  // 次の 2 つは、セッションを作ってから lead が気づいても予算を消費した後になるので、作る前に止める。
  if (allow.includes('draft_pr') && settings.vault_id === null) {
    throw new Error(
      `draft_pr needs a vault with the GitHub MCP credential, but account ${account.name} has vault_id null.`,
    );
  }
  const githubToken = context.env[githubTokenVariable] || null;
  if ((allow.includes('push') || allow.includes('draft_pr')) && !githubToken) {
    throw new Error(`push and draft_pr need ${githubTokenVariable} for the mounted repository.`);
  }
  const optional = (flag: string) => flags.get(flag)?.[0] ?? null;
  const claudeMdPath = optional('claude-md');
  const snapshotPath = optional('snapshot');
  if (snapshotPath && flags.has('base-sha'))
    throw new Error('Use either --base-sha or --snapshot.');
  const snapshot = snapshotPath ? await readSnapshot(snapshotPath) : undefined;
  if (snapshot && (allow.includes('push') || allow.includes('draft_pr'))) {
    throw new Error(
      'Local snapshots support local result recovery; push and draft_pr are not available.',
    );
  }
  const request: RunRequest = {
    account: account.name,
    repository: config.repository,
    vault_id: settings.vault_id,
    base: required(flags, 'base'),
    base_sha: snapshot?.id ?? required(flags, 'base-sha'),
    head: required(flags, 'head'),
    staffing: staffing as RunRequest['staffing'],
    allow,
    budget_cents: budget,
    task: await readFile(required(flags, 'task-file'), 'utf8'),
    verify: optional('verify'),
    author: optional('author'),
    title: optional('title'),
    claude_md: claudeMdPath === null ? null : await readFile(claudeMdPath, 'utf8'),
    ...(snapshot ? { snapshot } : {}),
  };
  const sessionId = await runSession(account, request, {
    ant,
    log: context.log,
    githubToken,
    claudeMdPath,
    now: context.now ?? (() => new Date()),
  });
  context.log(
    `Observe: shinaps-skills managed status --account ${account.name} --session ${sessionId}`,
  );
  context.log(JSON.stringify({ account: account.name, session_id: sessionId }));
}

function resolveAccounts(
  names: string[],
  flags: Map<string, string[]>,
  env: NodeJS.ProcessEnv,
  home: string,
): Account[] {
  const keys = new Map<string, string>();
  for (const pair of flags.get('api-key') ?? []) {
    const separator = pair.indexOf('=');
    if (separator <= 0) throw new Error('--api-key expects <account>=<key>.');
    keys.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  const unique = [...new Set(names)];
  const invalid = unique.filter((name) => !accountName.test(name));
  if (invalid.length) {
    throw new Error(
      `Invalid account name: ${invalid.join(', ')}. Use lowercase letters, digits and hyphens, starting with a letter or digit.`,
    );
  }
  const missing = unique.filter((name) => !(keys.get(name) || env[apiKeyVariable(name)]));
  if (missing.length) {
    throw new Error(
      `Missing API key for ${missing.map((name) => `${name} (--api-key ${name}=<key> or ${apiKeyVariable(name)})`).join(', ')}.`,
    );
  }
  return unique.map((name) => ({
    name,
    apiKey: keys.get(name) || (env[apiKeyVariable(name)] as string),
    dir: managedAccountDir(managedRoot(home), name),
  }));
}

// 値を取るフラグは `--name value` の形だけを受け付ける。エラー文には引数の値を含めない (キーを
// 含みうるため)。
function parse(args: string[]): {
  positional: string[];
  flags: Map<string, string[]>;
  apply: boolean;
} {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === 'apply') {
      apply = true;
      continue;
    }
    const value = args[index + 1];
    if (!valueFlags.has(name) || value === undefined) throw usageError();
    const values = flags.get(name) ?? [];
    if (values.length && !repeatableFlags.has(name)) throw usageError();
    flags.set(name, [...values, value]);
    index++;
  }
  return { positional, flags, apply };
}

function required(flags: Map<string, string[]>, name: string): string {
  const value = flags.get(name)?.[0];
  if (!value) throw new Error(`Missing --${name}. See shinaps-skills managed --help.`);
  return value;
}

const usageError = () =>
  new Error('Invalid arguments for shinaps-skills managed. See shinaps-skills managed --help.');
