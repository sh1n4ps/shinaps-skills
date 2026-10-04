import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * このパッケージのルートディレクトリ。リポジトリの checkout、または npm が展開したディレクトリ。
 * このファイルは checkout では `lib/`、配布物では `dist/lib/` にあり深さが違うので、package.json が
 * ある最も近い親ディレクトリを探す。
 */
export const packageRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));

function findPackageRoot(directory: string): string {
  if (existsSync(join(directory, 'package.json'))) return directory;
  const parent = dirname(directory);
  if (parent === directory) throw new Error(`package.json not found above ${directory}`);
  return findPackageRoot(parent);
}

/** Codex plugin のディレクトリ。パッケージルートからも配置済み配布物からも同じ相対パス。 */
export const pluginDir = 'plugins/shinaps-codex';
export const manifestPath = `${pluginDir}/.codex-plugin/plugin.json`;
/** Codex の marketplace 定義。 */
const marketplacePath = '.agents/plugins/marketplace.json';
/** 配布物としてパッケージからコピーするパス。 */
export const payloadPaths = [pluginDir, marketplacePath];
/** marketplace.json の name と、その中の plugin の name。 */
export const marketplaceName = 'shinaps-skills-codex';
export const pluginId = `shinaps@${marketplaceName}`;

/**
 * インストーラが扱えるエージェントのファイル名。一致しないファイルは置き換えも削除もしない。一致しても
 * 所有の証明にはならず、実際に置き換え・削除するのは state.json に記録した内容と一致するファイルだけ。
 */
export const managedAgent = /^shinaps-[a-z0-9-]+\.toml$/;

/** 管理ディレクトリ。配布物、state.json、ロックを置く。 */
export const managedRoot = (home: string): string =>
  join(home, '.local', 'share', 'shinaps-ai', 'skills');
/** 配置済みの配布物。Codex の marketplace はここを指す。 */
export const payloadDir = (root: string): string => join(root, 'codex');
export const statePath = (root: string): string => join(root, 'state.json');

/** CODEX_HOME の解決値。オプション → 環境変数 → Codex の既定の順。 */
export const codexHomeOf = (options: { codexHome?: string }, home: string): string =>
  resolve(options.codexHome ?? process.env.CODEX_HOME ?? join(home, '.codex'));

/**
 * 記録された CODEX_HOME が今回の導入先と同じか。旧版 (0.11.0) は指定された値を resolve せずに
 * 保存していたので、記録側を resolve して比べる。
 */
export const isRecordedCodexHome = (recorded: string, current: string): boolean =>
  resolve(recorded) === current;

/** state.json。 */
export type State = {
  /** 配置したエージェントのファイル名 → 内容の sha256。 */
  agents: Record<string, string>;
  /**
   * 旧版 (0.11.0) がエージェントの書き込み中に中断したとき残した新内容の sha256。現在の版は書かずに
   * 削除する。この値が残った state.json の導入先でも update できるように、照合にだけ使う。
   */
  pending?: Record<string, string>;
  /**
   * インストール時の CODEX_HOME。現在の版は resolve 済みの値を保存するが、旧版 (0.11.0) は指定値の
   * まま保存していた。
   */
  codexHome: string;
};
