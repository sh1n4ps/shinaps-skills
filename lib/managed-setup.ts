import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { errorCode, readJsonIfExists, readTextIfExists, writeFileAtomic } from './fs.ts';
import { withLock } from './lock.ts';
import { managedTemplatePath } from './layout.ts';
import { type Account, type Ant, managedBeta } from './managed-ant.ts';

/** 共通定義の 3 ディレクトリ。`definitions/` には、これと `claude-lock.json` 以外を置かない。 */
const definitionDirs = ['agents', 'environments', 'skills'];
const lockName = 'claude-lock.json';
const upToDate = /Everything is up to date\./;

/**
 * 1 アカウントへ共通定義を導入・更新する。`apply` が false なら dry-run の計画を表示するだけで、
 * クラウドを変更しない。`--prune`・`--force` は使わない (リソースを削除・上書きしないため)。
 * @param source 同梱の共通定義を含むパッケージのルート。
 * @returns 計画だけを示した (`planned`)、適用した (`applied`)、変更が無かった (`up-to-date`)。
 */
export async function setupAccount(
  account: Account,
  options: { apply: boolean; ant: Ant; log: (message: string) => unknown; source: string },
): Promise<'planned' | 'applied' | 'up-to-date'> {
  const { ant, log } = options;
  const definitions = join(account.dir, 'definitions');
  // ant は --lock-file が無いと lock を cwd から上へ探す。definitions に lock が無いとき祖先の lock を
  // 拾うと、別の組織や構成の lock で対応づけてしまうので、definitions 直下の lock を常に指定する
  // (指定した lock が無ければ ant はそこへ新しく作る。キーは lock のディレクトリ基準で変わらない)。
  const run = (mode: '--dry-run' | '--yes') =>
    ant({
      argv: ['apply', mode, '--lock-file', lockName, '.'],
      apiKey: account.apiKey,
      cwd: definitions,
    });
  return withLock(account.dir, async () => {
    await syncDefinitions(
      definitions,
      join(options.source, managedTemplatePath),
      join(account.dir, 'definitions.json'),
    );
    if ((await readTextIfExists(join(definitions, lockName))) === null) {
      await refuseDuplicates(account, definitions, ant);
    }
    const plan = await run('--dry-run');
    log(plan.trimEnd());
    // dry-run は適用不能な計画でも終了コード 0 で返るので、計画の文言で判定する。
    if (/This plan cannot be applied/.test(plan)) {
      throw new Error(
        `The plan for account ${account.name} cannot be applied. See the plan above.`,
      );
    }
    if (upToDate.test(plan)) return 'up-to-date';
    if (!options.apply) return 'planned';
    log((await run('--yes')).trimEnd());
    if (!upToDate.test(await run('--dry-run'))) {
      throw new Error(
        `Account ${account.name} still has pending changes after apply. Run setup again without --apply to see them.`,
      );
    }
    return 'applied';
  });
}

/**
 * definitions の3ディレクトリを同梱の定義に揃える。書き換え・削除するのは、setup が最後に書いた
 * 内容 (`definitions.json` の記録) か今回書く内容と一致するファイルだけ。利用者の編集・追加や、
 * 記録の無い既存ファイル (旧版の定義ごと複写した場合など) があれば、何も変えずに止める。apply は
 * ディレクトリ内の定義をすべて送るので、利用者の変更を黙って送ることも失うこともしないため。
 * definitions には同梱の定義だけを置く。利用者の変更は取り込まず、止めて退避してもらう。
 * 途中で止まった同期は、各ファイルが記録か今回のどちらかに一致するので、再実行で続きから揃う。
 * @param record 最後に書いたファイルの相対パス → sha256。apply が送らないよう definitions の外に置く。
 */
async function syncDefinitions(
  definitions: string,
  template: string,
  record: string,
): Promise<void> {
  await mkdir(definitions, { recursive: true });
  const unexpected = (await readdir(definitions)).filter(
    (name) => name !== lockName && !definitionDirs.includes(name),
  );
  const current = await hashTree(definitions, unexpected);
  const next = await hashTree(template, []);
  const written = (await readJsonIfExists<Record<string, string>>(record)) ?? {};
  // 無いファイルは変更にしない。同梱の定義を書き直すだけで利用者の内容は失われず、停止して退避を
  // 求めると、退避した後の再実行も同じ理由で止まり続けるため。
  const changed = Object.keys(current)
    .filter((path) => current[path] !== written[path] && current[path] !== next[path])
    .sort();
  if (changed.length) {
    throw new Error(
      `Files in ${definitions} differ from what setup wrote: ${changed.join(', ')}. Setup does not overwrite, delete or apply them; it applies only the bundled definitions. Move them out of ${definitions} (keep ${lockName}), then retry and review the plan: it reverts cloud resources that were changed to match the bundled definitions.`,
    );
  }
  for (const [path, hash] of Object.entries(next)) {
    if (current[path] === hash) continue;
    await mkdir(dirname(join(definitions, path)), { recursive: true });
    await writeFileAtomic(join(definitions, path), await readFile(join(template, path), 'utf8'));
  }
  for (const path of Object.keys(current).filter((path) => !(path in next))) {
    await rm(join(definitions, path));
  }
  await removeEmptyDirectories(definitions);
  await writeFileAtomic(record, JSON.stringify(next, null, 2) + '\n');
}

/**
 * 3ディレクトリ配下の通常ファイルの相対パス → sha256。通常ファイル以外 (シンボリックリンクなど) と
 * `extra` の項目は、内容を比べられない変更として値を空にする (記録・同梱のどちらとも一致しない)。
 */
async function hashTree(root: string, extra: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = Object.fromEntries(extra.map((name) => [name, '']));
  for (const directory of definitionDirs) {
    const kind = await lstat(join(root, directory)).catch((error) => {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    });
    if (!kind) continue;
    // 3ディレクトリ自体がシンボリックリンクなどなら、辿るとリンク先へ書き込むので変更として止める。
    if (!kind.isDirectory()) {
      result[directory] = '';
      continue;
    }
    const entries = await readdir(join(root, directory), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      const path = relative(root, join(entry.parentPath, entry.name)).split(sep).join('/');
      result[path] = entry.isFile()
        ? createHash('sha256')
            .update(await readFile(join(root, path)))
            .digest('hex')
        : '';
    }
  }
  return result;
}

// 定義を消した後に残る空のディレクトリを消す。中身の無い skill のディレクトリを apply に渡さないため。
async function removeEmptyDirectories(definitions: string): Promise<void> {
  for (const directory of definitionDirs) {
    const root = join(definitions, directory);
    const nested = (await readdir(root, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(entry.parentPath, entry.name))
      .sort((a, b) => b.length - a.length);
    for (const path of nested) {
      if ((await readdir(path)).length === 0) await rm(path, { recursive: true });
    }
  }
}

// lock が無いと apply は既存のリソースと対応づかず、同じ名前で新しく作る。lock の hash は既存の
// リソースから作り直せないので、同名のリソースがあれば作らずに止め、lock を戻してもらう。
async function refuseDuplicates(account: Account, definitions: string, ant: Ant): Promise<void> {
  const names = new Set<string>();
  for (const directory of ['agents', 'environments']) {
    for (const file of await readdir(join(definitions, directory))) {
      const name = (await readFile(join(definitions, directory, file), 'utf8')).match(
        /^name: (.+)$/m,
      )?.[1];
      if (name) names.add(name.trim());
    }
  }
  const existing: string[] = [];
  for (const resource of ['beta:agents', 'beta:environments']) {
    const output = await ant({
      argv: [
        resource,
        'list',
        ...managedBeta,
        '--format',
        'jsonl',
        '--transform',
        '{name,archived_at}',
      ],
      apiKey: account.apiKey,
    });
    for (const line of output.split('\n').filter((text) => text.trim())) {
      const item: { name?: string; archived_at?: string | null } = JSON.parse(line);
      if (item.name && names.has(item.name) && !item.archived_at) existing.push(item.name);
    }
  }
  if (existing.length) {
    throw new Error(
      `Account ${account.name} has no lock, but resources with the same names exist: ${[...new Set(existing)].join(', ')}. Applying would create duplicates. If you used Managed Agents before, move the previous claude-lock.json (for example <definitions>/claude-lock.json from .shinaps/managed.json version 1) to ${definitions}/, then retry.`,
    );
  }
}
