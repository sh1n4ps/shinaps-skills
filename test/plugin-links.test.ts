import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Managed Agents の skill は `ant apply` がディレクトリ単位で送信するので、それ自体が配布単位になる。
const UNITS = [
  'plugins/shinaps-claude',
  'plugins/shinaps-codex',
  'plugins/shinaps-claude/managed-agents/skills/dev-managed-cc',
];

/** `file` の相対リンクのうち、`isInside` が配布先に無いと判定するもの・実在しないものを返す。 */
async function brokenLinks(file: string, isInside: (target: string) => boolean) {
  const broken: string[] = [];
  const text = await readFile(file, 'utf8');
  for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    // URL（スキーム付き）と同じファイル内のアンカーは対象外
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
    const target = resolve(dirname(file), decodeURI(href.split('#')[0]));
    const label = `${relative(process.cwd(), file)} -> ${href}`;
    if (!isInside(target)) {
      broken.push(`${label} (配布単位の外)`);
      continue;
    }
    await access(target).catch(() => broken.push(`${label} (存在しない)`));
  }
  return broken;
}

// 配布先は配布単位のディレクトリだけを持つので、その外を指すリンクは導入後に解決できない。
// 各インストーラは単位のディレクトリをそのまま配置するため、リポジトリ上で単位の中に
// 解決できれば配置先でも解決できる。
test('relative Markdown links resolve inside the same distribution unit', async () => {
  const broken: string[] = [];
  for (const unit of UNITS) {
    const root = resolve(unit);
    const files = await readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const file = join(entry.parentPath, entry.name);
      broken.push(...(await brokenLinks(file, (target) => target.startsWith(root + sep))));
    }
  }
  assert.deepEqual(broken, []);
});

// npm パッケージは package.json の files だけを含むので、README と docs/ のリンクがその外の
// ファイル（test・scripts・workflow など）を指すと、npm で取得した利用者の手元では解決できない。
test('relative Markdown links in the npm package resolve inside the published files', async () => {
  const { files } = JSON.parse(await readFile('package.json', 'utf8')) as { files: string[] };
  const published = files.map((path) => resolve(path));
  const isPublished = (target: string) =>
    published.some((path) => target === path || target.startsWith(path + sep));
  const documents = ['README.md'];
  for (const entry of await readdir('docs', { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md'))
      documents.push(join(entry.parentPath, entry.name));
  }
  const broken: string[] = [];
  for (const file of documents) broken.push(...(await brokenLinks(resolve(file), isPublished)));
  assert.deepEqual(broken, []);
});
