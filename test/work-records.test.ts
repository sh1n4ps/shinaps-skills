import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const configuration = await readFile(
  'plugins/shinaps-claude/references/linear/configuration.md',
  'utf8',
);
const records = await readFile('plugins/shinaps-claude/references/work-records.md', 'utf8');
const [localIgnore, sharedIgnore] = [...configuration.matchAll(/```gitignore\n([^`]+)```/g)].map(
  ([, content]) => content,
);
const [newRecordIgnore, recordExclusion] = [...records.matchAll(/```gitignore\n([^`]+)```/g)].map(
  ([, content]) => content,
);

async function fixture(context: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'shinaps-work-records-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repository');
  const globalIgnore = join(directory, 'global-ignore');
  await mkdir(repository);
  await writeFile(globalIgnore, '*.private\n');
  // 個人の Git 設定・hooks・ignore によって共有対象の結果が変わらないよう分離する。
  function git(cwd: string, ...args: string[]) {
    const result = spawnSync(
      'git',
      ['-c', `core.excludesFile=${globalIgnore}`, '-c', 'core.hooksPath=/dev/null', ...args],
      {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      },
    );
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  }
  async function put(path: string, content: string) {
    await mkdir(dirname(join(repository, path)), { recursive: true });
    await writeFile(join(repository, path), content);
  }
  git(repository, 'init', '-b', 'main');
  git(repository, 'config', 'user.name', 'Fixture');
  git(repository, 'config', 'user.email', 'fixture@example.invalid');
  return { directory, repository, git, put };
}

// 新規記録・local設定がGitへ混入しないことを、配布手順の例を使って確認する。
test('local configuration and new work records stay untracked and ignored', async (context) => {
  const { repository, git, put } = await fixture(context);
  for (const ignore of [localIgnore, newRecordIgnore]) {
    await put('.shinaps/.gitignore', ignore);
    await put('.shinaps/linear.yaml', 'config_storage: local\n');
    await put('.shinaps/linear/instructions.md', 'Local operation conditions\n');
    await put('.shinaps/work/result.md', 'Work evidence\n');
    assert.equal(git(repository, 'status', '--short', '--untracked-files=all'), '');
    assert.equal(git(repository, 'ls-files', '--', '.shinaps'), '');
    assert.equal(
      git(repository, 'check-ignore', '--no-index', '.shinaps/work/result.md'),
      '.shinaps/work/result.md',
    );
  }
});

// 記録初期化が共有例外を消すと、設定と必要補足が次のcheckoutに渡らなくなる。
test('shared configuration survives work exclusion repair and transfers only selected supplements', async (context) => {
  const { directory, repository, git, put } = await fixture(context);
  const selected = [
    '.shinaps/.gitignore',
    '.shinaps/linear.yaml',
    '.shinaps/linear/instructions.md',
    '.shinaps/linear/references/qa.md',
  ];
  await put('.shinaps/.gitignore', `${sharedIgnore}\n!/keep.md\n!/work/\n!/work/**\n`);
  await put('.shinaps/linear.yaml', 'config_storage: shared\n');
  await put('.shinaps/linear/instructions.md', 'Shared operation conditions\n');
  await put('.shinaps/linear/references/qa.md', 'Shared validation conditions\n');
  await put('.shinaps/linear/references/private.md', 'Unselected notes\n');
  await put('.shinaps/work/result.md', 'Work evidence\n');
  await put('.shinaps/keep.md', 'Existing unrelated exception\n');
  assert.ok(
    git(repository, 'status', '--short', '--untracked-files=all').includes(
      '.shinaps/work/result.md',
    ),
  );
  await appendFile(join(repository, '.shinaps/.gitignore'), recordExclusion);
  const visible = git(repository, 'ls-files', '--others', '--exclude-standard').split('\n').sort();
  assert.deepEqual(visible, [...selected, '.shinaps/keep.md'].sort());
  git(repository, 'add', '--', ...selected);
  git(repository, 'commit', '-m', 'Shared fixture');
  assert.deepEqual(git(repository, 'ls-files', '--', '.shinaps').split('\n').sort(), selected);
  const clone = join(directory, 'clone');
  const worktree = join(directory, 'worktree');
  git(directory, 'clone', repository, clone);
  git(repository, 'worktree', 'add', '-b', 'fixture-work', worktree);
  for (const checkout of [clone, worktree]) {
    assert.deepEqual(git(checkout, 'ls-files', '--', '.shinaps').split('\n').sort(), selected);
    for (const path of selected) {
      assert.equal(
        await readFile(join(checkout, path), 'utf8'),
        await readFile(join(repository, path), 'utf8'),
      );
    }
    assert.equal(git(checkout, 'status', '--short', '--untracked-files=all'), '');
  }
});

// 親ディレクトリが除外されたままでは、内側の共有例外だけでは設定を共有できない。
test('root exception exposes selected configuration without changing global or unrelated ignores', async (context) => {
  const { repository, git, put } = await fixture(context);
  await put('.gitignore', '.shinaps/\n*.cache\n');
  await put('.shinaps/.gitignore', sharedIgnore);
  await put('.shinaps/linear.yaml', 'config_storage: shared\n');
  await put('.shinaps/work/result.md', 'Work evidence\n');
  await put('unrelated.cache', 'Cache\n');
  await put('unrelated.private', 'Private\n');
  assert.equal(
    git(repository, 'check-ignore', '--no-index', '.shinaps/linear.yaml'),
    '.shinaps/linear.yaml',
  );
  await appendFile(join(repository, '.gitignore'), '!/.shinaps/\n');
  assert.deepEqual(git(repository, 'ls-files', '--others', '--exclude-standard').split('\n'), [
    '.gitignore',
    '.shinaps/.gitignore',
    '.shinaps/linear.yaml',
  ]);
});
