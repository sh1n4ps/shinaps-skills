import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const pkg = await json('package.json');
assert.equal(pkg.name, '@shinaps/skills');
for (const path of [
  'plugins/shinaps-claude/.claude-plugin/plugin.json',
  'plugins/shinaps-codex/.codex-plugin/plugin.json',
]) {
  assert.equal((await json(path)).version, pkg.version, `Version differs: ${path}`);
}
if (process.env.RELEASE_TAG)
  assert.equal(
    process.env.RELEASE_TAG,
    `v${pkg.version}`,
    'Release tag must match package version',
  );

const destination = await mkdtemp(join(tmpdir(), 'shinaps-package-'));
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--json', '--pack-destination', destination], { encoding: 'utf8' }),
);
const [artifact] = Array.isArray(packed) ? packed : Object.values(packed);
const actual = artifact.files.map((file) => file.path).sort();
// Compare the complete payload, so a missing skill or an accidental new root
// cannot silently become a release. Tests and local work never belong in npm.
const expected = ['package.json', 'README.md', 'LICENSE', '.agents/plugins/marketplace.json'];
async function collect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) await collect(child);
    else if (entry.isFile()) expected.push(child);
    else throw new Error(`Unsupported package entry: ${child}`);
  }
}
for (const path of ['bin', 'lib', 'plugins']) await collect(path);
assert.deepEqual(actual, expected.sort(), 'Packed files differ from the intended payload');
const tarball = join(destination, artifact.filename);
console.log(`${pkg.name}@${pkg.version}: ${actual.length} files verified\n${tarball}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tarball=${tarball}\n`);
