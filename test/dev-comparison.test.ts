import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const PLUGINS = ['plugins/shinaps-claude', 'plugins/shinaps-codex'];
const CLAUDE_REFERENCES = 'plugins/shinaps-claude/references/dev-comparison';
const CODEX_REFERENCES = 'plugins/shinaps-codex/references/dev-comparison';

async function readTree(root: string): Promise<Record<string, string>> {
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  const entries = await Promise.all(
    files
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);
        return [path.slice(root.length + 1), await readFile(path, 'utf8')] as const;
      }),
  );
  return Object.fromEntries(entries);
}

// 比較用入口の共通資料は Claude 版を編集元として Codex 版へ複製する。片方だけを更新すると、
// 構成によって工程や担当指示が変わり、比較の前提が崩れる。
test('dev-comparison references are identical in the Claude and Codex plugins', async () => {
  assert.deepEqual(
    await readTree(CODEX_REFERENCES),
    await readTree(CLAUDE_REFERENCES),
    'references/dev-comparison は Claude 版を編集元として Codex 版へ複製する',
  );
});

// 配布先は plugin ディレクトリだけを持つので、plugin の外を指すリンクは導入後に解決できない。
// Codex のインストーラは plugin ディレクトリをそのままコピーするため、リポジトリ上で
// 解決できれば配置先でも解決できる。
test('relative Markdown links resolve inside the same plugin directory', async () => {
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
          broken.push(`${label} (plugin の外)`);
          continue;
        }
        await access(target).catch(() => broken.push(`${label} (存在しない)`));
      }
    }
  }
  assert.deepEqual(broken, []);
});

// Claude の比較用入口は、Codex が AI Terminal Bridge で依頼して Skill ツールから起動する。
// disable-model-invocation: true を付けると、Skill ツールからの起動が拒否される。
test('Claude comparison entries can be invoked through the Skill tool', async () => {
  for (const skill of ['dev-mixed', 'dev-claude']) {
    const text = await readFile(`plugins/shinaps-claude/skills/${skill}/SKILL.md`, 'utf8');
    const frontmatter = text.split('---')[1];
    assert.doesNotMatch(frontmatter, /^disable-model-invocation:\s*true\s*$/m, skill);
  }
});
