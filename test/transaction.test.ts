import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withLock } from '../lib/lock.ts';
import { assertMissing, pidOfExitedProcess, temporaryHome } from './support/fixtures.ts';

const lockBusy = /Another Shinaps update is running/;

test('a second lock on the same directory is refused while the first is held', async (t) => {
  const { root } = await temporaryHome(t);
  await withLock(root, async () => {
    await assert.rejects(
      withLock(root, async () => assert.fail('must not run')),
      lockBusy,
    );
  });
});

// 古いロックを置き換えたあとも lock-recovery を残したまま work を実行すると落ちる。work の途中で
// 強制終了されたときに lock-recovery が残り、手で削除するまで以後の実行がすべて失敗するため。
test('a lock left by a terminated process is replaced without leaving the recovery marker during work', async (t) => {
  const { root } = await temporaryHome(t);
  const lock = join(root, 'update.lock');
  await mkdir(lock, { recursive: true });
  await writeFile(join(lock, 'pid'), pidOfExitedProcess());

  await withLock(root, async () => {
    await assertMissing(join(root, 'lock-recovery'));
    assert.equal(await readFile(join(lock, 'pid'), 'utf8'), String(process.pid));
  });
});

// 古いロックの判定で、最初に読んだ pid だけを信用すると落ちる。その pid の生存を確認している間に
// ロックが解放され、別のプロセスが取得していた場合、新しい保持者のロックを削除してしまうため。
test('a lock re-acquired by another process during the stale check is left alone', async (t) => {
  const { root } = await temporaryHome(t);
  const lock = join(root, 'update.lock');
  const exitedPid = pidOfExitedProcess();
  // 新しい保持者。生きていることが保証された pid として自分自身を使う。
  const newHolderPid = String(process.pid);
  await mkdir(lock, { recursive: true });
  await writeFile(join(lock, 'pid'), exitedPid);

  // withLock は pid を読んだあと process.kill(pid, 0) で生存を確かめる。その瞬間に古い保持者が終了し、
  // 別プロセスがロックを取り直した状況を pid ファイルの書き換えで再現する。kill は同期関数なので
  // 同期 API で書く。
  const realKill = process.kill;
  t.mock.method(process, 'kill', (pid: number, signal?: string | number) => {
    if (String(pid) === exitedPid) writeFileSync(join(lock, 'pid'), newHolderPid);
    return realKill.call(process, pid, signal);
  });

  await assert.rejects(
    withLock(root, async () => assert.fail('must not run')),
    lockBusy,
  );
  assert.equal(await readFile(join(lock, 'pid'), 'utf8'), newHolderPid);
});

// pid ファイルの無いロックを ENOENT のまま報告したり削除したりすると落ちる。保持者はロックを作って
// から pid を書くまでの途中にいるため。
test('a lock whose holder has not written its pid yet is treated as running', async (t) => {
  const { root } = await temporaryHome(t);
  await mkdir(join(root, 'update.lock'), { recursive: true });
  await assert.rejects(
    withLock(root, async () => assert.fail('must not run')),
    lockBusy,
  );
  await access(join(root, 'update.lock'));
});
