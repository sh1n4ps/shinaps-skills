import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const json = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const pkg = await json('package.json');
assert.equal(pkg.name, '@shinaps/skills');
for (const path of [
  'plugins/shinaps-claude/.claude-plugin/plugin.json',
  'plugins/shinaps-codex/.codex-plugin/plugin.json',
]) {
  const { version } = await json(path);
  assert.equal(
    version,
    pkg.version,
    `${path} has version ${version}, but package.json has ${pkg.version}. Set the same version in both.`,
  );
}
if (process.env.RELEASE_TAG) {
  assert.equal(
    process.env.RELEASE_TAG,
    `v${pkg.version}`,
    `RELEASE_TAG ${process.env.RELEASE_TAG} does not match package.json version v${pkg.version}.`,
  );
}

const destination = await mkdtemp(join(tmpdir(), 'shinaps-package-'));
const packed = JSON.parse(
  execFileSync('npm', ['pack', '--json', '--pack-destination', destination], { encoding: 'utf8' }),
);
// npm 11 までは配列、npm 12 からは tarball 名をキーにしたオブジェクトで返る。どちらも要素は 1 つ。
const [artifact] = Array.isArray(packed) ? packed : Object.values(packed);
const actual = artifact.files.map((file: { path: string }) => file.path).sort();
// パッケージに入るファイルの一覧をすべて比較する。skill の欠落や、意図しないトップレベルのファイルが
// そのまま公開されないようにするため。テストや作業用のファイルは npm パッケージに含めない。
const expected = ['package.json', 'README.md', 'LICENSE', '.agents/plugins/marketplace.json'];
async function collect(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) await collect(child);
    else if (entry.isFile()) expected.push(child);
    else throw new Error(`Unsupported package entry: ${child}`);
  }
}
for (const path of ['dist', 'docs', 'plugins']) await collect(path);
assert.deepEqual(actual, expected.sort());
const tarball = join(destination, artifact.filename);
// tarball を実際に install して起動する。Node は node_modules 配下の .ts に型除去を適用しないので、
// ビルド結果ではなくソースを配布してしまった場合など、一覧の比較では見つからない失敗を公開前に止める。
const consumer = await mkdtemp(join(tmpdir(), 'shinaps-consumer-'));
await writeFile(join(consumer, 'package.json'), '{ "name": "consumer", "private": true }\n');
execFileSync('npm', ['install', '--no-audit', '--no-fund', tarball], {
  cwd: consumer,
  stdio: 'ignore',
});
const help = execFileSync(join(consumer, 'node_modules/.bin/shinaps-skills'), ['--help'], {
  encoding: 'utf8',
});
assert.match(help, /^Usage: shinaps-skills /);
// 配布後もschemaとAjvが揃い、外部schemaを取得せず検証できることを確認する。
const configuration = JSON.parse(
  (await readFile('plugins/shinaps-claude/references/linear/configuration.md', 'utf8'))
    .split('## 設定例')[1]
    .match(/```json\n([\s\S]*?)\n```/)![1],
);
configuration.$schema = 'https://invalid.example/not-fetched.json';
const configurationPath = join(consumer, 'linear.json');
const configurationText = JSON.stringify(configuration);
await writeFile(configurationPath, configurationText);
const networkGuard = join(consumer, 'no-network.cjs');
await writeFile(
  networkGuard,
  "require('node:net').Socket.prototype.connect = () => { throw new Error('Network forbidden'); }; globalThis.fetch = () => { throw new Error('Network forbidden'); };\n",
);
const executable = join(consumer, 'node_modules/.bin/shinaps-skills');
execFileSync(
  process.execPath,
  ['--require', networkGuard, executable, 'validate-linear-config', configurationPath],
  { cwd: consumer, stdio: 'pipe' },
);
assert.equal(await readFile(configurationPath, 'utf8'), configurationText);
configuration.review_flow = { mode: 'manual', tool: 'webstorm' };
await writeFile(configurationPath, JSON.stringify(configuration));
assert.throws(() =>
  execFileSync(executable, ['validate-linear-config', configurationPath], {
    cwd: consumer,
    stdio: 'pipe',
  }),
);
assert.equal(execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim(), pkg.version);
console.log(`${pkg.name}@${pkg.version}: ${actual.length} files verified\n${tarball}`);
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tarball=${tarball}\n`);
