import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const PLUGINS = ['plugins/shinaps-claude', 'plugins/shinaps-codex'];

// 配布先は配布単位のディレクトリだけを持つので、その外を指すリンクは導入後に解決できない。
// 各インストーラは plugin ディレクトリをそのまま配置するため、リポジトリ上で単位の中に
// 解決できれば配置先でも解決できる。
test('relative Markdown links resolve inside the same distribution unit', async () => {
  const broken: string[] = [];
  for (const plugin of PLUGINS) {
    const root = resolve(plugin);
    const files = await readdir(root, { recursive: true, withFileTypes: true });
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const file = join(entry.parentPath, entry.name);
      const text = await readFile(file, 'utf8');
      for (const [, href] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        // URL（スキーム付き）と同じファイル内のアンカーは対象外
        if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
        const target = resolve(dirname(file), decodeURI(href.split('#')[0]));
        const label = `${relative(process.cwd(), file)} -> ${href}`;
        if (!target.startsWith(root + sep)) {
          broken.push(`${label} (配布単位の外)`);
          continue;
        }
        await access(target).catch(() => broken.push(`${label} (存在しない)`));
      }
    }
  }
  assert.deepEqual(broken, []);
});
