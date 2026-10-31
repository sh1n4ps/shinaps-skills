import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareSnapshot, importSnapshot, readSnapshot } from '../lib/managed-snapshot.ts';

const execute = promisify(execFile);
test('snapshot preserves dirty and new source, round trip leaves the original index and later work intact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'managed-snapshot-'));
  try {
    const source = join(root, 'source');
    await mkdir(source);
    const git = async (...args: string[]) => (await execute('git', args, { cwd: source })).stdout;
    await git('init');
    await writeFile(join(source, 'main.txt'), 'before\n');
    await git('add', 'main.txt');
    await writeFile(join(source, 'main.txt'), 'sent\n');
    await writeFile(join(source, 'new.txt'), 'new file\n');
    await writeFile(join(source, '.gitignore'), 'ignored.txt\n');
    await writeFile(join(source, 'ignored.txt'), 'ignored secret\n');
    // 追跡済みでも、運用状態と依存物は送らない。
    await mkdir(join(source, '.shinaps'));
    await writeFile(join(source, '.shinaps', 'linear.json'), '{}\n');
    await mkdir(join(source, 'node_modules', 'fixture'), { recursive: true });
    await writeFile(join(source, 'node_modules', 'fixture', 'index.js'), '\n');
    await git('add', '--force', '.shinaps/linear.json', 'node_modules/fixture/index.js');
    const before = await git('diff', '--cached');
    const snapshot = await prepareSnapshot(source, join(root, 'snapshots'));
    assert.equal(await git('diff', '--cached'), before);
    assert.ok(snapshot.files.includes('new.txt'));
    assert.deepEqual(snapshot.files, ['.gitignore', 'main.txt', 'new.txt']);
    const remote = join(root, 'remote');
    await execute('git', ['clone', snapshot.bundle, remote]);
    await writeFile(join(remote, 'main.txt'), 'remote result\n');
    await writeFile(join(remote, 'result.txt'), 'created remotely\n');
    await execute('git', ['add', '--all'], { cwd: remote });
    const patch = join(root, 'changes.patch');
    await writeFile(
      patch,
      (await execute('git', ['diff', '--binary', 'HEAD'], { cwd: remote })).stdout,
    );
    await writeFile(join(source, 'main.txt'), 'later local work\n');
    const imported = await importSnapshot(snapshot, patch, join(root, 'result'));
    assert.equal(await readFile(join(imported, 'main.txt'), 'utf8'), 'remote result\n');
    assert.equal(await readFile(join(imported, 'result.txt'), 'utf8'), 'created remotely\n');
    assert.equal(await readFile(join(source, 'main.txt'), 'utf8'), 'later local work\n');
    await assert.rejects(importSnapshot(snapshot, patch, imported), /EEXIST/);
    assert.equal(await readFile(join(imported, 'result.txt'), 'utf8'), 'created remotely\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('snapshot refuses external symlinks and credential files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'managed-snapshot-'));
  try {
    const source = join(root, 'source');
    await mkdir(source);
    await execute('git', ['init'], { cwd: source });
    await symlink('../private.txt', join(source, 'outside'));
    await assert.rejects(prepareSnapshot(source, join(root, 'snapshots')), /leaves the source/);
    await rm(join(source, 'outside'));
    await writeFile(join(source, '.env'), 'FIXTURE=secret');
    await assert.rejects(prepareSnapshot(source, join(root, 'snapshots')), /credential file/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// run は manifest の id を git の引数に、bundle を upload に使う。別の JSON はここで止める。
test('run accepts only manifests written by prepare', async () => {
  const root = await mkdtemp(join(tmpdir(), 'managed-manifest-'));
  try {
    const source = join(root, 'source');
    await mkdir(source);
    await execute('git', ['init'], { cwd: source });
    await writeFile(join(source, 'main.txt'), 'source');
    const snapshot = await prepareSnapshot(source, join(root, 'snapshots'));
    const manifest = join(snapshot.directory, 'snapshot.json');
    assert.deepEqual(await readSnapshot(manifest), snapshot);
    const forged = join(root, 'forged.json');
    await writeFile(forged, JSON.stringify({ ...snapshot, id: '--upload-pack=touch' }));
    await assert.rejects(readSnapshot(forged), /Not a snapshot manifest/);
    await writeFile(forged, JSON.stringify({ ...snapshot, bundle: join(root, 'other.bundle') }));
    await assert.rejects(readSnapshot(forged), /Not a snapshot manifest/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source global excludes remain effective while the synthetic repository is isolated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'managed-ignore-'));
  const previous = process.env.GIT_CONFIG_GLOBAL;
  try {
    const source = join(root, 'source');
    await mkdir(source);
    await execute('git', ['init'], { cwd: source });
    await writeFile(join(root, 'ignore'), 'credentials.json\n');
    await writeFile(join(root, 'config'), `[core]\nexcludesFile = ${join(root, 'ignore')}\n`);
    process.env.GIT_CONFIG_GLOBAL = join(root, 'config');
    await writeFile(join(source, 'main.txt'), 'source');
    await writeFile(join(source, 'credentials.json'), 'fixture-secret');
    const snapshot = await prepareSnapshot(source, join(root, 'snapshots'));
    assert.deepEqual(snapshot.files, ['main.txt']);
    const listed = (
      await execute('git', ['ls-tree', '--name-only', 'HEAD'], {
        cwd: join(snapshot.directory, 'repository'),
      })
    ).stdout;
    assert.equal(listed, 'main.txt\n');
  } finally {
    if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = previous;
    await rm(root, { recursive: true, force: true });
  }
});
