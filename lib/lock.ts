import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { errorCode } from './fs.ts';

/**
 * `<directory>/update.lock` を保持したまま `work` を実行する。ロックはディレクトリで、保持者の pid を
 * `pid` ファイルに記録する。保持者が存在しないロックは置き換える。保持者が生きているか pid をまだ読め
 * ないロックは "Another Shinaps update is running" で、別の処理が古いロックの判定中なら
 * "Another Shinaps update is recovering its lock" で reject する。
 * 入れ子にできるのは別のディレクトリ同士だけ。保持中のロックは待たずに即失敗する。
 * @param directory ロックの親ディレクトリ。無ければ作る。古いロックの置き換え中は `lock-recovery`
 *   もここに置く。
 * @param work ロック保持中に実行する処理。戻り値をそのまま返す。
 */
export async function withLock<T>(directory: string, work: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true });
  const lock = join(directory, 'update.lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
    await replaceStaleLock(directory, lock);
  }
  try {
    await writeFile(join(lock, 'pid'), String(process.pid));
    return await work();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

// 古いロックの置き換えは、lock-recovery ディレクトリを作れた 1 プロセスだけが行う。複数のプロセスが
// 同時に置き換えると、別のプロセスが取得した直後のロックを削除してしまうため。lock-recovery はこの
// 関数の中だけで保持し、work の前に削除する。この間に強制終了されると lock-recovery が残り、自動では
// 削除されないので、エラーメッセージにパスを含めて手で削除できるようにする。
async function replaceStaleLock(directory: string, lock: string): Promise<void> {
  const recovery = join(directory, 'lock-recovery');
  try {
    await mkdir(recovery);
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
    throw new Error(
      `Another Shinaps update is recovering its lock: ${recovery}. Retry later; remove that directory only after confirming no update is running.`,
    );
  }
  try {
    const pidPath = join(lock, 'pid');
    const holder = await readLockPid(pidPath);
    if (holderMayBeAlive(holder)) throw lockBusyError(lock);
    // pid を読んでから生存を確認するまでの間に、保持者が終了してロックを解放し、別のプロセスが取得
    // している可能性がある。そのため pid を読み直し、同じ終了済みの pid のままのときだけ古いロック
    // として削除する。読み直しから削除までの間は、保持者が終了済みで、ほかの置き換え処理も
    // lock-recovery で止まるため、ロックが変わることはない。
    if ((await readLockPid(pidPath)) !== holder) throw lockBusyError(lock);
    await rm(lock, { recursive: true, force: true });
    try {
      await mkdir(lock);
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      // 上の rm と mkdir の間に別のプロセスが通常の経路で取得した。
      throw lockBusyError(lock);
    }
  } finally {
    await rm(recovery, { recursive: true, force: true });
  }
}

// pid ファイルの本文。保持者がまだ書いていなければ null。
async function readLockPid(pidPath: string): Promise<string | null> {
  try {
    return await readFile(pidPath, 'utf8');
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    return null;
  }
}

// pid ファイルが無い、空または数値でない、別ユーザーのプロセス (EPERM)、のいずれも実行中として扱う。
// 保持者が mkdir と pid の書き込みの間にいる場合と、その間に強制終了された場合を区別できないため。
// ESRCH のときだけ保持者がいないとみなす。強制終了で残ったロックは手で削除する (エラーメッセージに
// パスを含める)。
function holderMayBeAlive(text: string | null): boolean {
  if (text === null) return true;
  const pid = Number(text);
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    throw error;
  }
}

const lockBusyError = (lock: string): Error =>
  new Error(
    `Another Shinaps update is running: ${lock}. Retry after it finishes; remove the lock only after confirming no update is running.`,
  );
