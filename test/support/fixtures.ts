import assert from 'node:assert/strict';
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { TestContext } from 'node:test';
import type { AutoUpdateOptions } from '../../lib/auto-update.ts';
import { manifestPath, payloadPaths } from '../../lib/layout.ts';

/**
 * fixture がインストールするこのリポジトリの plugin の版と比べるための版。`aboveRelease` は現在のどの
 * リリースより新しく、`belowRelease` はどのリリースより古い。リポジトリの版が 9.0.0 以上になったら
 * `aboveRelease` を上げる。
 */
export const PACKAGE_VERSION = { aboveRelease: '9.0.0', belowRelease: '0.0.1' };

// 管理ディレクトリ (`~/.local/share/shinaps-ai/skills`) 配下の相対パス。保存先は版をまたぐ約束なので、
// 実装の定数を使わず文字列で書く。
export const STATE = 'state.json';
export const MANIFEST = 'codex/plugins/shinaps-codex/.codex-plugin/plugin.json';
export const JOURNAL = 'transaction/journal.json';
export const RESULT = 'auto-update-result.json';
export const CONFIG = 'auto-update.json';
// ホームディレクトリ配下の相対パス。
export const PLIST = 'Library/LaunchAgents/io.shinaps.skills.update.plist';

export type TestOptions = AutoUpdateOptions & { home: string; codexHome: string };

/**
 * 一時的なホームディレクトリ。CODEX_HOME はシェルの環境変数を拾わないよう明示する。codex と launchd
 * は何もしない偽物。インストールはしないので、必要なテストが `run(['install', 'codex'])` を呼ぶ。
 */
export async function temporaryHome(
  t: TestContext,
): Promise<{ options: TestOptions; root: string }> {
  const home = await mkdtemp(join(tmpdir(), 'shinaps-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const options: TestOptions = {
    home,
    codexHome: join(home, '.codex'),
    command: async () => {},
    launch: async () => {},
    platform: 'darwin',
    npm: '/test/npm',
    path: '/test/bin',
    log() {},
  };
  return { options, root: join(home, '.local/share/shinaps-ai/skills') };
}

/** このリポジトリの plugin と marketplace をコピーし、plugin manifest の version だけを書き換えたパッケージ。 */
export async function packageWithVersion(home: string, version: string): Promise<string> {
  const directory = join(home, `package-${version}`);
  for (const path of payloadPaths) {
    await cp(new URL(`../../${path}`, import.meta.url), join(directory, path), { recursive: true });
  }
  const manifest = JSON.parse(await readFile(join(directory, manifestPath), 'utf8'));
  manifest.version = version;
  await writeFile(join(directory, manifestPath), JSON.stringify(manifest));
  return directory;
}

/** codex CLI の偽物。呼び出しを記録し、`failFirst` に一致した最初の 1 回だけ失敗する。 */
export function recordingCodex(failFirst?: (args: string[]) => boolean) {
  const calls: string[][] = [];
  let failed = false;
  const command = async (args: string[]) => {
    calls.push(args);
    if (!failed && failFirst?.(args)) {
      failed = true;
      throw new Error('cache failure');
    }
  };
  return { calls, command };
}

export const isPluginAdd = (args: string[]): boolean => args[0] === 'plugin' && args[1] === 'add';

/**
 * launchd の偽物。読み込み済みのラベルへの bootstrap を拒否する実物の挙動を写す。これが無いと、
 * 再 enable が先に bootout しなくてもテストが通ってしまう。
 */
export function fakeLaunchd() {
  let registered = false;
  const launch = async ([verb]: string[]) => {
    if (verb === 'bootstrap' && registered) throw new Error('service already bootstrapped');
    registered = verb === 'bootstrap';
  };
  return { launch, registered: () => registered };
}

export const assertMissing = (path: string) => assert.rejects(access(path), { code: 'ENOENT' });

/** 終了済みのプロセスの pid。再利用される可能性はテストの間なら無視できる。 */
export const pidOfExitedProcess = (): string =>
  String(spawnSync(process.execPath, ['-e', '0']).pid);

/** インストール状態の観測点。失敗した更新の前後でこれが一致すれば、元に戻っている。 */
export const installationSnapshot = async (root: string) => ({
  state: await readFile(join(root, STATE), 'utf8'),
  manifest: await readFile(join(root, MANIFEST), 'utf8'),
});
