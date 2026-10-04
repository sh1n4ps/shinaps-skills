import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import type { Command } from './transaction.ts';
import { withLock } from './lock.ts';
import { install, openInstallation, recover, type RunOptions } from './install.ts';
import { errorMessage, readJson, readJsonIfExists } from './fs.ts';
import {
  codexHomeMismatch,
  codexHomeOf,
  isRecordedCodexHome,
  managedRoot,
  manifestPath,
  payloadDir,
  statePath,
  type AutoUpdateConfig,
  type CheckResult,
  type State,
} from './layout.ts';

/**
 * `autoUpdate` のオプション。`RunOptions` に加えて、OS の判定、launchctl の実行、launchd ジョブに書く
 * 値をテストから指定できる。
 */
export type AutoUpdateOptions = RunOptions & {
  /** `process.platform` の代わり。 */
  platform?: string;
  /** `process.getuid()` の代わり。 */
  uid?: number;
  /** launchctl の実行関数。 */
  launch?: Command;
  /** launchd ジョブに記録する npm の場所。省略時は `which npm`。 */
  npm?: string;
  /** launchd ジョブに記録する PATH。省略時はこのプロセスの PATH。 */
  path?: string;
};

/** 1 回の実行で使う場所と関数。 */
type Context = {
  home: string;
  root: string;
  configPath: string;
  resultPath: string;
  log: (message: string) => unknown;
  options: AutoUpdateOptions;
};

const actions = ['enable', 'disable', 'status', 'check'] as const;
type Action = (typeof actions)[number];
const isAction = (value: string): value is Action => (actions as readonly string[]).includes(value);

const label = 'io.shinaps.skills.update';
// StartInterval ではなく時刻指定にする。launchd はスリープ中に来た間隔の実行をスキップするが、時刻
// 指定ならスリープ中に過ぎた回を起床時に 1 回実行する (man launchd.plist)。12:00 は Mac が起きていて
// ログイン中である可能性が高い時刻として選んだ。
const schedule = { hour: 12, minute: 0 };

/**
 * `shinaps-skills auto-update <enable|disable|status|check> codex`。
 * @param args サブコマンドと対象。例: `['enable', 'codex']`。
 * @param options 動作環境の指定。`auto-update check` とテストが使う。
 */
export async function autoUpdate(args: string[], options: AutoUpdateOptions = {}): Promise<void> {
  const [action, target, ...extra] = args;
  if (!isAction(action) || target !== 'codex' || extra.length) {
    throw new Error(
      `Unknown command: auto-update ${args.join(' ')}. Usage: shinaps-skills auto-update <enable|disable|status|check> codex`,
    );
  }
  const home = options.home ?? homedir();
  const root = managedRoot(home);
  const context: Context = {
    home,
    root,
    configPath: join(root, 'auto-update.json'),
    resultPath: join(root, 'auto-update-result.json'),
    log: options.log ?? console.log,
    options,
  };
  // enable / disable / check は同じロックで直列にする。check の実行中に disable が走らないようにするため。
  const schedulerDir = join(root, 'scheduler');
  switch (action) {
    case 'status':
      return status(context);
    case 'check':
      return withLock(schedulerDir, () => check(context));
    case 'disable':
      return withLock(schedulerDir, () => disable(context));
    case 'enable':
      return withLock(schedulerDir, () => enable(context));
  }
}

async function status(context: Context): Promise<void> {
  const config = await readJsonIfExists<AutoUpdateConfig>(context.configPath);
  const lastCheck = await readJsonIfExists<CheckResult>(context.resultPath);
  context.log(JSON.stringify({ enabled: config !== null, config, lastCheck }, null, 2));
}

async function check(context: Context): Promise<void> {
  // 設定はロックを取ってから読む。取得前に読むと、その間に完了した disable を見逃し、無効にしたあとで
  // 更新が実行されるため。
  const config = await readJsonIfExists<AutoUpdateConfig>(context.configPath);
  if (!config) {
    throw new Error(
      'Auto-update is not enabled. Run "shinaps-skills auto-update enable codex" first.',
    );
  }
  const result: CheckResult = { checkedAt: new Date().toISOString() };
  try {
    await updateIfNewer(context, config, result);
  } catch (error) {
    result.status = 'failed';
    await recordResult(context.resultPath, result, error);
    throw error;
  }
  await recordResult(context.resultPath, result);
  context.log(JSON.stringify(result));
}

async function updateIfNewer(
  context: Context,
  config: AutoUpdateConfig,
  result: CheckResult,
): Promise<void> {
  const installation = openInstallation({ ...context.options, codexHome: config.codexHome });
  await recover(installation);
  const state = await readJson<State>(statePath(context.root));
  if (!isRecordedCodexHome(state.codexHome, config.codexHome)) {
    throw new Error(
      `Shinaps is installed in CODEX_HOME=${state.codexHome}, but auto-update is configured for ${config.codexHome}. Run "CODEX_HOME=${state.codexHome} shinaps-skills auto-update enable codex".`,
    );
  }
  // 導入済みの版は配布物の manifest にある。state.json には記録していない。
  result.installed = await packagedVersion(payloadDir(context.root));
  // launchd ジョブは `npm exec @shinaps/skills@latest` でこのコマンドを起動するので、このプロセスの
  // パッケージが最新版になる。導入済みより新しければ、このパッケージを配布元にして update する。
  result.available = await packagedVersion(installation.source);
  const updated = newer(result.available, result.installed);
  if (updated) {
    await install(installation, 'update');
    result.installed = result.available;
  }
  result.status = updated ? 'updated' : 'up-to-date';
}

const packagedVersion = async (directory: string): Promise<string> =>
  (await readJson<{ version: string }>(join(directory, manifestPath))).version;

// 結果ファイルにはエラーメッセージを書かない。エラーは再 throw されて launchd のエラーログ
// (auto-update-error.log) に出力されるので、詳細はそちらで確認する。結果ファイルには status と、読み
// 取れた版だけを記録する。
async function recordResult(path: string, result: CheckResult, failure?: unknown): Promise<void> {
  try {
    await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  } catch (writeError) {
    if (failure === undefined) throw writeError;
    throw new AggregateError(
      [failure, writeError],
      `${errorMessage(failure)}; result not recorded: ${errorMessage(writeError)}`,
      { cause: failure },
    );
  }
}

async function disable(context: Context): Promise<void> {
  const config = await readJsonIfExists<AutoUpdateConfig>(context.configPath);
  // OS の確認より前に判定する。uninstall はどの OS でも disable を呼び、自動更新を有効にしたことのない
  // 導入でもそこで失敗してはならない。
  if (!config) {
    context.log('Auto-update is already disabled.');
    return;
  }
  const { service, plistPath, launchctl } = launchd(context);
  await launchctl(['bootout', service]);
  await rm(plistPath, { force: true });
  await rm(context.configPath);
  context.log('Daily auto-update disabled. Installed skills and agents were preserved.');
}

async function enable(context: Context): Promise<void> {
  const { home, root, configPath, options, log } = context;
  const config = await readJsonIfExists<AutoUpdateConfig>(configPath);
  const { uid, service, plistPath, launchctl } = launchd(context);
  const state = await readJsonIfExists<State>(statePath(root));
  if (!state) {
    throw new Error(
      'Shinaps is not installed for Codex. Run "shinaps-skills install codex" first.',
    );
  }
  const codexHome = codexHomeOf(options, home);
  if (!isRecordedCodexHome(state.codexHome, codexHome)) {
    throw new Error(
      `${codexHomeMismatch(state.codexHome, codexHome)} Run again with CODEX_HOME=${state.codexHome}.`,
    );
  }
  const nextConfig: AutoUpdateConfig = {
    codexHome,
    // `status` で表示する。同じパスが ProgramArguments の先頭にも入る。
    npm: options.npm ?? execFileSync('/usr/bin/which', ['npm'], { encoding: 'utf8' }).trim(),
  };
  // ジョブは固定のコピーではなく、`npm exec @latest` で毎回最新版の CLI を取得して check を実行する
  // (npm はタグを毎回オンラインで解決する)。そのため CLI 自体を更新する仕組みは持たない。代わりに、
  // このコマンド行と各ファイルの形式は版をまたいで保つ (layout.ts の冒頭を参照)。
  const plistText = renderPlist({
    programArguments: [
      nextConfig.npm,
      'exec',
      '--yes',
      '--package',
      '@shinaps/skills@latest',
      '--',
      'shinaps-skills',
      'auto-update',
      'check',
      'codex',
    ],
    path: options.path ?? process.env.PATH ?? '',
    root,
  });
  // 読み込み済みのラベルへの bootstrap は失敗するので、再 enable では先に今のジョブを外す。
  if (config) await launchctl(['bootout', service]);
  await mkdir(dirname(plistPath), { recursive: true });
  await writeFile(plistPath, plistText);
  await writeFile(configPath, JSON.stringify(nextConfig, null, 2) + '\n');
  try {
    await launchctl(['bootstrap', `gui/${uid}`, plistPath]);
  } catch (error) {
    try {
      await rm(configPath, { force: true });
      await rm(plistPath, { force: true });
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        `${errorMessage(error)}; cleanup failed: ${errorMessage(cleanup)}`,
        { cause: error },
      );
    }
    throw error;
  }
  const time = `${schedule.hour}:${String(schedule.minute).padStart(2, '0')}`;
  log(
    `Daily auto-update enabled: runs at ${time} while you are logged in (a run missed during sleep starts on wake).`,
  );
  log(`To test it now: launchctl kickstart -k ${service}`);
  log(
    `Then check the result: shinaps-skills auto-update status codex (errors: ${join(root, 'auto-update-error.log')})`,
  );
}

/** launchd の操作に必要な値。macOS 以外では throw する。 */
function launchd(context: Context): {
  uid: number;
  service: string;
  plistPath: string;
  launchctl: Command;
} {
  const { options, home } = context;
  if ((options.platform ?? process.platform) !== 'darwin') {
    throw new Error(
      'Auto-update is available only on macOS. Run "shinaps-skills update codex" to update manually.',
    );
  }
  // macOS であることを確認済みなので getuid は存在する。
  const uid = options.uid ?? process.getuid!();
  return {
    uid,
    service: `gui/${uid}/${label}`,
    plistPath: join(home, 'Library/LaunchAgents', `${label}.plist`),
    launchctl: options.launch ?? launchctlCommand,
  };
}

const launchctlCommand: Command = (argv) => {
  const result = spawnSync('/bin/launchctl', argv, { encoding: 'utf8' });
  if (result.error) throw result.error;
  // 読み込まれていないラベルの bootout は終了コード 3 (ESRCH。`launchctl error 3` で意味を確認できる)
  // で終わる。disable と再 enable はジョブが読み込まれていなくても続けるので、この場合だけ成功として
  // 扱う。終了コードの意味は文書化されていないため、ほかの失敗は区別せずにエラーにする。
  if (result.status !== 0 && !(argv[0] === 'bootout' && result.status === 3)) {
    throw new Error(`launchctl ${argv[0]} failed: ${result.stderr.trim()}`);
  }
};

function renderPlist(job: { programArguments: string[]; path: string; root: string }): string {
  const entry = (argument: string) => `<string>${escapeXml(argument)}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${job.programArguments.map(entry).join('')}</array>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>${schedule.hour}</integer><key>Minute</key><integer>${schedule.minute}</integer></dict>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${escapeXml(job.path)}</string></dict>
<key>WorkingDirectory</key><string>${escapeXml(job.root)}</string>
<key>StandardOutPath</key><string>${escapeXml(join(job.root, 'auto-update.log'))}</string>
<key>StandardErrorPath</key><string>${escapeXml(join(job.root, 'auto-update-error.log'))}</string>
</dict></plist>
`;
}

const xmlEntities: Record<string, string> = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&apos;',
};
const escapeXml = (value: string): string =>
  value.replace(/[<>&"']/g, (character) => xmlEntities[character]);

/** `candidate` が `installed` より新しい安定版か。安定版 (x.y.z) 以外は throw する。 */
export function newer(candidate: unknown, installed: unknown): boolean {
  const parse = (value: unknown): number[] => {
    if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
      throw new Error(`Expected a stable version, got ${value}`);
    }
    return value.split('.').map(Number);
  };
  const candidateParts = parse(candidate);
  const installedParts = parse(installed);
  for (let index = 0; index < 3; index++) {
    if (candidateParts[index] !== installedParts[index]) {
      return candidateParts[index] > installedParts[index];
    }
  }
  return false;
}
