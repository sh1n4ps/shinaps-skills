import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from '../lib/install.ts';
import { autoUpdate, newer } from '../lib/auto-update.ts';
import { readJson } from '../lib/fs.ts';
import {
  CONFIG,
  JOURNAL,
  MANIFEST,
  PACKAGE_VERSION,
  PLIST,
  RESULT,
  assertMissing,
  fakeLaunchd,
  installationSnapshot,
  isPluginAdd,
  packageWithVersion,
  recordingCodex,
  temporaryHome,
} from './support/fixtures.ts';

const lastStatus = async (root: string) =>
  (await readJson<{ status: string }>(join(root, RESULT))).status;

test('newer compares versions numerically and rejects prerelease versions', () => {
  assert.equal(newer('0.10.0', '0.9.9'), true);
  assert.equal(newer('0.9.9', '0.10.0'), false);
  assert.equal(newer('1.0.0', '1.0.0'), false);
  assert.throws(() => newer('1.0.0-beta', '1.0.0'), /stable version/);
});

test('enabling before installing says that install comes first', async (t) => {
  const { options } = await temporaryHome(t);
  await assert.rejects(autoUpdate(['enable', 'codex'], options), /install codex/);
});

test('re-enabling replaces the registered job and disabling removes it but keeps skills', async (t) => {
  const { options, root } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  const launchd = fakeLaunchd();
  const withLaunchd = { ...options, launch: launchd.launch };

  await autoUpdate(['enable', 'codex'], withLaunchd);
  await autoUpdate(['enable', 'codex'], withLaunchd);
  assert.equal(launchd.registered(), true);

  await autoUpdate(['disable', 'codex'], withLaunchd);
  await autoUpdate(['disable', 'codex'], withLaunchd);
  assert.equal(launchd.registered(), false);
  await assertMissing(join(root, CONFIG));
  await assertMissing(join(options.home, PLIST));
  await access(join(options.codexHome, 'agents/shinaps-reviewer.toml'));
});

test('uninstall also removes the scheduled job', async (t) => {
  const { options } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  const launchd = fakeLaunchd();
  const withLaunchd = { ...options, launch: launchd.launch };

  await autoUpdate(['enable', 'codex'], withLaunchd);
  await run(['uninstall', 'codex'], withLaunchd);

  assert.equal(launchd.registered(), false);
  await assertMissing(join(options.home, PLIST));
});

test('check updates only when the running package is newer than the installed one', async (t) => {
  const { options, root } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  await autoUpdate(['enable', 'codex'], options);
  const manifest = await readFile(join(root, MANIFEST), 'utf8');

  // 古いパッケージとして実行された check は何もしない。
  const olderPackage = await packageWithVersion(options.home, PACKAGE_VERSION.belowRelease);
  const codex = recordingCodex();
  await autoUpdate(['check', 'codex'], {
    ...options,
    source: olderPackage,
    command: codex.command,
  });
  assert.equal(await lastStatus(root), 'up-to-date');
  assert.equal(codex.calls.length, 0);
  assert.equal(await readFile(join(root, MANIFEST), 'utf8'), manifest);

  // 新しいパッケージとして実行された check は、そのパッケージで update する。
  const newerPackage = await packageWithVersion(options.home, PACKAGE_VERSION.aboveRelease);
  await autoUpdate(['check', 'codex'], { ...options, source: newerPackage });
  assert.equal(await lastStatus(root), 'updated');
  assert.equal(
    JSON.parse(await readFile(join(root, MANIFEST), 'utf8')).version,
    PACKAGE_VERSION.aboveRelease,
  );
});

test('a failed automatic update is recorded as failed and leaves the installation unchanged', async (t) => {
  const { options, root } = await temporaryHome(t);
  await run(['install', 'codex'], options);
  await autoUpdate(['enable', 'codex'], options);
  const before = await installationSnapshot(root);
  const newerPackage = await packageWithVersion(options.home, PACKAGE_VERSION.aboveRelease);
  const codex = recordingCodex(isPluginAdd);

  await assert.rejects(
    autoUpdate(['check', 'codex'], { ...options, source: newerPackage, command: codex.command }),
    /cache failure/,
  );

  assert.equal(await lastStatus(root), 'failed');
  assert.deepEqual(await installationSnapshot(root), before);
  await assertMissing(join(root, JOURNAL));
});
