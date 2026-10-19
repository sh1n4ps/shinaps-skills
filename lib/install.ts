import { readFile, readdir, cp, rm, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  digest,
  registerPlugin,
  replaceInstallation,
  restore,
  type Command,
  type Journal,
  type Target,
} from './transaction.ts';
import { withLock } from './lock.ts';
import { readTextIfExists, writeFileAtomic } from './fs.ts';
import {
  codexHomeMismatch,
  codexHomeOf,
  isRecordedCodexHome,
  managedAgent,
  managedRoot,
  marketplaceName,
  packageRoot,
  payloadDir,
  payloadPaths,
  pluginDir,
  pluginId,
  statePath,
  type State,
} from './layout.ts';

/**
 * `run` の動作環境を外から指定するオプション。`auto-update check` とテストが使う。省略した項目は
 * このプロセスの環境から決める。
 */
export type RunOptions = {
  home?: string;
  /** 導入先。省略時は環境変数 CODEX_HOME、無ければ `~/.codex`。 */
  codexHome?: string;
  /** 配布物の取得元 (パッケージルート)。省略時はこのパッケージ自身。 */
  source?: string;
  /** codex CLI の実行関数。 */
  command?: Command;
  log?: (message: string) => unknown;
};

/** 1 回の実行で使う場所と関数。`openInstallation` が `RunOptions` から決める。 */
export type Installation = Target & {
  agentsDir: string;
  source: string;
  log: (message: string) => unknown;
};

type PackagedAgents = Record<string, { content: string; hash: string }>;

const actions = ['install', 'update', 'uninstall', 'recover'] as const;
type Action = (typeof actions)[number];
const isAction = (value: string): value is Action => (actions as readonly string[]).includes(value);

const usage = [
  'Usage: shinaps-skills <install|update|uninstall|recover> codex',
  '       shinaps-skills validate-linear-config <file>',
  '       shinaps-skills validate-managed-config <file>',
  '       shinaps-skills auto-update <enable|disable|status|check> codex',
  'Claude Code: /plugin marketplace add sh1n4ps/shinaps-skills',
  '             /plugin install shinaps@shinaps-skills',
].join('\n');

const installGuidance = [
  'No Shinaps AI account is required to install. For MCP features, create an account at https://app.shinaps.ai and use your client’s authentication flow.',
  'MCP setup (only if not already configured): codex mcp add shinaps-ai --url https://app.shinaps.ai/mcp',
  'Then: codex mcp login shinaps-ai',
];

/**
 * `shinaps-skills <install|update|uninstall|recover> codex` を実行する。どの操作も、開始時に中断した
 * 更新があれば restore で元に戻す。
 * @param args コマンドライン引数 (node とスクリプトのパスを除いたもの)。例: `['install', 'codex']`。
 * @param options 動作環境の指定。`auto-update check` とテストが使う。
 */
export async function run(args: string[], options: RunOptions = {}): Promise<void> {
  const log = options.log ?? console.log;
  const [action, target, ...extra] = args;
  if (!action || action === '--help' || action === 'help') {
    log(usage);
    return;
  }
  if (!isAction(action) || target !== 'codex' || extra.length) {
    throw new Error(`Unknown command: ${args.join(' ')}. ${usage.split('\n')[0]} (see --help).`);
  }
  const installation = openInstallation(options);
  switch (action) {
    case 'recover':
      return recover(installation);
    case 'uninstall':
      return uninstall(installation, options);
    case 'install':
    case 'update':
      return install(installation, action);
  }
}

export function openInstallation(options: RunOptions): Installation {
  const home = options.home ?? homedir();
  const codexHome = codexHomeOf(options, home);
  return {
    root: managedRoot(home),
    codexHome,
    agentsDir: join(codexHome, 'agents'),
    command: options.command ?? codexCommand(codexHome),
    source: options.source ?? packageRoot,
    log: options.log ?? console.log,
  };
}

/** 中断した更新があれば元に戻す。無ければ何もしない。 */
export function recover(installation: Installation): Promise<void> {
  return withLock(installation.root, () => restore(installation));
}

/**
 * 配布物とエージェントを `installation.source` の内容に置き換える。state.json の記録と違うエージェントが
 * あれば何も変更せずに止める。
 * @param action install と update の違いは完了メッセージだけ。
 */
export async function install(
  installation: Installation,
  action: 'install' | 'update',
): Promise<void> {
  const { root, codexHome, agentsDir, command, log } = installation;
  await withLock(root, async () => {
    await restore(installation);
    const recorded = await readVerifiedState(installation);
    const state = recorded?.state ?? { agents: {}, codexHome };
    const nextAgents = await readPackagedAgents(installation, state);
    const preparedDir = await preparePayload(installation);
    const journal: Journal = {
      state: recorded?.text ?? null,
      agents: {},
      codexHome,
      nextHashes: {},
    };
    for (const name of new Set([...Object.keys(state.agents), ...Object.keys(nextAgents)])) {
      journal.agents[name] = await readTextIfExists(join(agentsDir, name));
      journal.nextHashes[name] = nextAgents[name]?.hash ?? null;
    }
    const nextState: State = {
      agents: Object.fromEntries(
        Object.entries(nextAgents).map(([name, { hash }]) => [name, hash]),
      ),
      codexHome,
    };
    const removed = Object.keys(state.agents).filter((name) => !(name in nextAgents));
    await replaceInstallation(installation, journal, preparedDir, async () => {
      // codex コマンドより前に作る。codex は既定のディレクトリだけを自分で作り、指定された
      // CODEX_HOME が存在しないと失敗するため。
      await mkdir(agentsDir, { recursive: true });
      await registerPlugin(command, payloadDir(root));
      for (const [name, { content }] of Object.entries(nextAgents)) {
        await writeFileAtomic(join(agentsDir, name), content);
      }
      for (const name of removed) await rm(join(agentsDir, name), { force: true });
      await writeFileAtomic(statePath(root), JSON.stringify(nextState, null, 2) + '\n');
    });
  });
  if (action === 'update') {
    log('Shinaps updated. Start a new Codex session to load the new skills and agents.');
    return;
  }
  log('Shinaps installed. Start a new Codex session to load skills and agents.');
  for (const line of installGuidance) log(line);
}

async function uninstall(installation: Installation, options: RunOptions): Promise<void> {
  const { root, agentsDir, command, log } = installation;
  await withLock(root, async () => {
    await restore(installation);
    const recorded = await readVerifiedState(installation);
    if (!recorded) {
      log('No managed Shinaps installation found.');
      return;
    }
    // auto-update.ts は check でこのモジュールを使う。相互 import を避けるため実行時に読み込む。
    const { autoUpdate } = await import('./auto-update.ts');
    await autoUpdate(['disable', 'codex'], options);
    await command(['plugin', 'remove', pluginId]);
    await command(['plugin', 'marketplace', 'remove', marketplaceName]);
    for (const name of Object.keys(recorded.state.agents)) {
      await rm(join(agentsDir, name), { force: true });
    }
    await rm(payloadDir(root), { recursive: true, force: true });
    await rm(statePath(root));
    log(
      'Removed managed Codex plugin and agents. Other skills and MCP credentials were preserved.',
    );
  });
}

// codex にはファイル操作と同じ CODEX_HOME を見せる。options.codexHome (`auto-update check` が渡す)
// はシェルの環境変数と違い得るので、解決済みの値を明示的に渡す。
const codexCommand =
  (codexHome: string): Command =>
  (argv) => {
    const result = spawnSync('codex', argv, {
      stdio: 'inherit',
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `codex ${argv.join(' ')} exited with ${result.status ?? result.signal}. Fix the error codex reported above, then retry.`,
      );
    }
  };

/**
 * state.json を読み、記録された導入先とエージェントを今回の実行で扱えることを確かめる。無ければ null。
 * 名前の接頭辞は所有の証明にならないので、記録した内容と一致するファイルだけを置き換え・削除する。
 * ユーザーが編集したファイルがあれば、何も変更しないうちに止めて、移動か復元を求める。
 */
async function readVerifiedState(
  installation: Installation,
): Promise<{ text: string; state: State } | null> {
  const { root, codexHome, agentsDir } = installation;
  const path = statePath(root);
  const text = await readTextIfExists(path);
  if (text === null) return null;
  const state: State = JSON.parse(text);
  // state.json は記録した CODEX_HOME のエージェントだけを管理する。別の CODEX_HOME で実行した
  // uninstall が、そちらにある同名のファイルを削除しないように、一致しなければ止める。
  if (!isRecordedCodexHome(state.codexHome, codexHome)) {
    throw new Error(
      `${codexHomeMismatch(state.codexHome, codexHome)} Run again with CODEX_HOME=${state.codexHome}, or run "CODEX_HOME=${state.codexHome} shinaps-skills uninstall codex" first.`,
    );
  }
  for (const [name, hash] of Object.entries(state.agents)) {
    if (!managedAgent.test(name)) throw new Error(`Invalid agent filename "${name}" in ${path}.`);
    const current = await readTextIfExists(join(agentsDir, name));
    if (current === null) continue;
    const currentHash = digest(current);
    if (currentHash !== hash && currentHash !== state.pending?.[name]) {
      throw new Error(
        `Modified agent preserved: ${join(agentsDir, name)}. Move the edited file elsewhere or restore its content, then retry.`,
      );
    }
  }
  return { text, state };
}

/** パッケージに入っているエージェント。導入先に Shinaps が置いていない同名ファイルがあれば止める。 */
async function readPackagedAgents(
  installation: Installation,
  state: State,
): Promise<PackagedAgents> {
  const { source, agentsDir } = installation;
  const directory = join(source, pluginDir, 'agents');
  const agents: PackagedAgents = {};
  for (const name of await readdir(directory)) {
    if (!managedAgent.test(name)) continue;
    const content = await readFile(join(directory, name), 'utf8');
    if (!(name in state.agents) && (await readTextIfExists(join(agentsDir, name))) !== null) {
      throw new Error(
        `Unmanaged agent preserved: ${join(agentsDir, name)}. Shinaps did not install this file. Move or rename it, then retry.`,
      );
    }
    agents[name] = { content, hash: digest(content) };
  }
  return agents;
}

// npx のダウンロードキャッシュは一時的。配布物は管理ディレクトリにコピーし、後続の Codex セッションと
// 更新がキャッシュに依存しないようにする。
async function preparePayload(installation: Installation): Promise<string> {
  const prepared = join(installation.root, 'prepared');
  await rm(prepared, { recursive: true, force: true });
  for (const path of payloadPaths) {
    await cp(join(installation.source, path), join(prepared, path), { recursive: true });
  }
  return prepared;
}
