import { mkdir, rm, rename, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { managedAgent, marketplaceName, payloadDir, pluginId, statePath } from './layout.ts';
import {
  errorCode,
  errorMessage,
  readJsonIfExists,
  readTextIfExists,
  writeFileAtomic,
} from './fs.ts';

/** 外部コマンド (codex CLI) を argv で実行する関数。失敗したら throw する。テストでは差し替える。 */
export type Command = (argv: string[]) => unknown;

/** 更新の対象。管理ディレクトリと導入先、codex CLI の実行関数。 */
export type Target = { root: string; codexHome: string; command: Command };

/** `replaceInstallation` が変更前に記録し、`restore` が読む内容。 */
export type Journal = {
  /** 変更前の state.json の本文。無ければ null。 */
  state: string | null;
  /** 影響を受ける各エージェントファイルの変更前の内容。無ければ null。 */
  agents: Record<string, string | null>;
  /** `apply` が各エージェントに書く内容の sha256。削除するファイルは null。 */
  nextHashes: Record<string, string | null>;
  /** 導入先 (resolve 済みの CODEX_HOME)。 */
  codexHome: string;
};

/** journal.json に保存する形。 */
type SavedJournal = Journal & {
  /** 変更前に配布物が存在したか。初回 install では false。 */
  hadPayload: boolean;
};

/** エージェント内容の sha256。state.json と journal の `nextHashes` はこの形式で記録する。 */
export const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

/** 配布物を Codex に登録する。install と restore で同じ手順を使う。 */
export async function registerPlugin(command: Command, payload: string): Promise<void> {
  await command(['plugin', 'marketplace', 'add', payload]);
  await command(['plugin', 'add', pluginId]);
}

const journalDir = (root: string): string => join(root, 'transaction');

/**
 * 配置済みの配布物を `preparedDir` で置き換えて `apply` を実行する。両方を取り消せるだけの記録を
 * `<root>/transaction` に残す。失敗したら `restore` を実行し、元のエラーを再 throw する。restore も
 * 失敗した場合は両方のエラーを持つ AggregateError を throw し、バックアップは `<root>/transaction`
 * に残る。次回の install / update / uninstall / recover が、開始時に restore をやり直す。
 * @param target 更新の対象。
 * @param journal 変更前の記録。`hadPayload` を付けて journal.json として保存する。
 * @param preparedDir 準備済みの配布物。`<root>/codex` と同じファイルシステムにあること。rename で
 *   配置するので成功後は存在しない。
 * @param apply 配布物を置いたあとに行う処理。Codex への登録、エージェントの書き込み、state.json。
 */
export async function replaceInstallation(
  target: Target,
  journal: Journal,
  preparedDir: string,
  apply: () => Promise<void>,
): Promise<void> {
  const dir = journalDir(target.root);
  const payload = payloadDir(target.root);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir);
  let hadPayload = true;
  try {
    await cp(payload, join(dir, 'payload'), { recursive: true });
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    hadPayload = false;
  }
  // 一時ファイルに書いてから rename するので、journal.json が書きかけの内容で読まれることはない。
  // fsync はしていないため、電源断のあとは journal が残らず、配布物やエージェントが更新途中のまま残る
  // ことがある。
  const saved: SavedJournal = { ...journal, hadPayload };
  await writeFileAtomic(join(dir, 'journal.json'), JSON.stringify(saved));
  try {
    await rm(payload, { recursive: true, force: true });
    await rename(preparedDir, payload);
    await apply();
  } catch (error) {
    try {
      await restore(target);
    } catch (recovery) {
      throw new AggregateError(
        [error, recovery],
        `${errorMessage(error)}; recovery incomplete: ${errorMessage(recovery)}. Backup retained in ${dir}; run "shinaps-skills recover codex" after fixing the cause.`,
        { cause: error },
      );
    }
    throw error;
  }
  await removeJournal(dir);
}

/**
 * `replaceInstallation` が書いた `<root>/transaction/journal.json` の内容で、中断した install / update
 * の前の状態に戻す。journal が無ければ何もせず返る。journal が別の CODEX_HOME のものか、中断後に
 * エージェントファイルが編集されている (旧内容でも新内容でもない) 場合は、何も変更せずに throw する。
 * journal が消えるまで何度でも繰り返せる。journal の削除が最後の手順で、完了の印になる。
 * @param target 更新の対象。`command` は、Codex が plugin を独自のキャッシュにも保持しているため、
 *   戻した配布物を登録し直すのに使う。
 */
export async function restore(target: Target): Promise<void> {
  const { root, codexHome, command } = target;
  const dir = journalDir(root);
  const journalPath = join(dir, 'journal.json');
  const journal = await readJsonIfExists<SavedJournal>(journalPath);
  if (!journal) return;
  if (journal.codexHome !== codexHome) {
    throw new Error(
      `An interrupted update in CODEX_HOME=${journal.codexHome} must be recovered first, but this run uses ${codexHome}. Run "CODEX_HOME=${journal.codexHome} shinaps-skills recover codex".`,
    );
  }
  const agentsDir = join(codexHome, 'agents');
  for (const [name, priorContent] of Object.entries(journal.agents)) {
    if (!managedAgent.test(name)) {
      throw new Error(`Invalid agent filename "${name}" in ${journalPath}.`);
    }
    const current = await readTextIfExists(join(agentsDir, name));
    if (current === null) continue;
    if (current !== priorContent && digest(current) !== journal.nextHashes[name]) {
      throw new Error(
        `Modified agent preserved during recovery: ${join(agentsDir, name)}. Move the edited file elsewhere, then run "shinaps-skills recover codex".`,
      );
    }
  }
  const payload = payloadDir(root);
  await rm(payload, { recursive: true, force: true });
  if (journal.hadPayload) await cp(join(dir, 'payload'), payload, { recursive: true });
  await mkdir(agentsDir, { recursive: true });
  for (const [name, content] of Object.entries(journal.agents)) {
    if (content === null) await rm(join(agentsDir, name), { force: true });
    else await writeFileAtomic(join(agentsDir, name), content);
  }
  if (journal.state === null) await rm(statePath(root), { force: true });
  else await writeFileAtomic(statePath(root), journal.state);
  // Codex は plugin を独自のキャッシュにも保持しているため、ファイルを戻したあとで登録し直す。
  if (journal.hadPayload) await registerPlugin(command, payload);
  await removeJournal(dir);
}

// journal の削除が完了の時点。順序が重要で、payload/ が先に消えて journal が残ると、次の restore が
// 新しい配布物を削除したうえで古い配布物のコピーに失敗する。
async function removeJournal(dir: string): Promise<void> {
  await rm(join(dir, 'journal.json'));
  await rm(dir, { recursive: true });
}
