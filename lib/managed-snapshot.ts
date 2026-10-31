import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  chmod,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { readJson, writeFileAtomic } from './fs.ts';

const execute = promisify(execFile);
export type Snapshot = {
  id: string;
  source: string;
  directory: string;
  bundle: string;
  files: string[];
};

// 呼び出し元の index の上書き・hooks・filter・署名を snapshot に持ち込まない。
async function git(
  cwd: string,
  args: string[],
  configuration: 'source' | 'snapshot' = 'snapshot',
): Promise<string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith('GIT_') || (configuration === 'source' && key.startsWith('GIT_CONFIG_')),
    ),
  );
  const { stdout } = await execute(
    'git',
    ['-c', 'core.hooksPath=/dev/null', '-c', 'core.autocrlf=false', ...args],
    {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...env,
        ...(configuration === 'snapshot'
          ? { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
          : {}),
        GIT_AUTHOR_NAME: 'Managed Snapshot',
        GIT_AUTHOR_EMAIL: 'snapshot@example.invalid',
        GIT_COMMITTER_NAME: 'Managed Snapshot',
        GIT_COMMITTER_EMAIL: 'snapshot@example.invalid',
        GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
      },
    },
  );
  return stdout;
}

/**
 * 元の index を変えずに、現在のソースのファイルを1コミットだけの独立したリポジトリへ固定する。
 * @param source Git の checkout のルート。未コミットの変更と、無視されていない新規ファイルを含めて送る。
 * @param root checkout の外にある、snapshot の非公開の保存先。
 */
export async function prepareSnapshot(source: string, root: string): Promise<Snapshot> {
  source = await realpath(source);
  const top = (await git(source, ['rev-parse', '--show-toplevel'], 'source')).trim();
  if ((await realpath(top)) !== source)
    throw new Error('Snapshot source must be the Git checkout root.');
  await mkdir(root, { recursive: true, mode: 0o700 });
  root = await realpath(root);
  if (root === source || root.startsWith(source + sep))
    throw new Error('Snapshot storage must be outside the source checkout.');
  const temporary = await mkdtemp(join(root, '.snapshot-'));
  try {
    const repository = join(temporary, 'repository');
    await mkdir(repository);
    // 方式を固定する。git の既定が変わっても、readSnapshot が受け付ける 40 桁の id にする。
    await git(repository, ['init', '--object-format=sha1', '--initial-branch=snapshot']);
    const candidates = [
      ...new Set(
        (
          await git(
            source,
            ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
            'source',
          )
        )
          .split('\0')
          .filter(Boolean),
      ),
    ].sort();
    const files: string[] = [];
    for (const name of candidates) {
      // ローカルの運用状態・資格情報・Git の内部・生成された依存物は送らない。
      const parts = name.split('/');
      if (parts.some((part) => ['.git', '.shinaps', 'node_modules', '.local'].includes(part)))
        continue;
      if (
        parts.some(
          (part) => /^\.env(?:\.|$)/.test(part) && !/\.(example|sample|template)$/.test(part),
        ) ||
        /\.(pem|p12|pfx|key)$/i.test(name)
      ) {
        throw new Error(`Remove credential file from the snapshot source before sending: ${name}`);
      }
      const input = join(source, name);
      let info;
      try {
        info = await lstat(input);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      if (!info.isFile() && !info.isSymbolicLink())
        throw new Error(`Snapshot does not support directories or submodules as files: ${name}`);
      // 親ディレクトリも確かめる。途中のディレクトリを差し替えると、checkout 外のファイルを読めてしまう。
      const parent = await realpath(dirname(input));
      if (parent !== source && !parent.startsWith(source + sep))
        throw new Error(`Snapshot path leaves the source checkout: ${name}`);
      const output = join(repository, name);
      await mkdir(dirname(output), { recursive: true });
      if (info.isSymbolicLink()) {
        const target = await readlink(input);
        const destination = resolve(dirname(input), target);
        if (
          target.startsWith('/') ||
          (destination !== source && !destination.startsWith(source + sep))
        )
          throw new Error(`Snapshot symlink leaves the source checkout: ${name}`);
        await symlink(target, output);
      } else {
        await copyFile(input, output);
        await chmod(output, info.mode & 0o111 ? 0o755 : 0o644);
      }
      files.push(name);
    }
    await git(repository, ['add', '--all', '--force']);
    await git(repository, [
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--allow-empty',
      '-m',
      'Local source snapshot',
    ]);
    const id = (await git(repository, ['rev-parse', 'HEAD'])).trim();
    const directory = join(root, id);
    await git(repository, ['bundle', 'create', join(temporary, 'source.bundle'), 'HEAD']);
    const snapshot: Snapshot = {
      id,
      source,
      directory,
      bundle: join(directory, 'source.bundle'),
      files,
    };
    await writeFileAtomic(
      join(temporary, 'snapshot.json'),
      JSON.stringify(snapshot, null, 2) + '\n',
    );
    try {
      await rename(temporary, directory);
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error;
      // 同じ内容は別の checkout からも作られうるが、比較元としては同じ tree である。
      return readSnapshot(join(directory, 'snapshot.json'));
    }
    return snapshot;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/**
 * prepare が書いた manifest だけを受け付ける。id は git の引数と lead への指示文に、bundle は upload に
 * 使うので、別のファイルを渡された場合にそのまま使わない。
 * @param manifest prepare が出力した `snapshot.json` のパス。
 */
export async function readSnapshot(manifest: string): Promise<Snapshot> {
  const { id, source, directory, bundle, files } =
    (await readJson<Partial<Snapshot> | null>(manifest)) ?? {};
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{40}$/.test(id) ||
    typeof source !== 'string' ||
    typeof directory !== 'string' ||
    !isAbsolute(directory) ||
    bundle !== join(directory, 'source.bundle') ||
    !Array.isArray(files) ||
    !files.every((file) => typeof file === 'string')
  )
    throw new Error(`Not a snapshot manifest written by managed prepare: ${manifest}`);
  return { id, source, directory, bundle, files };
}

/**
 * 比較元と差分を新しいディレクトリに復元する。元の checkout は変更しない。
 * @param snapshot リモートのセッションが使った、保存済みの比較元。
 * @param patch 回収した lead の差分。比較元からの全体の差分。
 * @param destination 復元先の新しいディレクトリ。既に存在してはいけない。
 */
export async function importSnapshot(
  snapshot: Snapshot,
  patch: string,
  destination: string,
): Promise<string> {
  destination = resolve(destination);
  await mkdir(destination, { mode: 0o700 });
  try {
    await git(destination, [
      'clone',
      '--no-local',
      '--',
      join(snapshot.directory, 'repository'),
      '.',
    ]);
    await git(destination, ['checkout', '--detach', snapshot.id]);
    const content = await readFile(patch);
    if (content.length) await git(destination, ['apply', '--index', '--', resolve(patch)]);
    return destination;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}
