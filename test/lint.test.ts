import { describe, it, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuleTester } from 'eslint';
import vueParser from 'vue-eslint-parser';
import { checkKey, classify, parseLintInput, planUnits } from '../lib/lint-plan.ts';
import { runLint } from '../lib/lint.ts';
import { shinapsPlugin } from '../lib/lint-rules.ts';

/** files（root からの相対パス → 内容）を書いた一時的なプロジェクト。 */
async function project(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'shinaps-lint-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

const stateOf = (
  pairs: Awaited<ReturnType<typeof runLint>>['pairs'],
  ruleId: string,
  file: string,
) => pairs.find((pair) => pair.ruleId === ruleId && pair.file === file);

const ANY = 'export const value: any = 1\n';
const CLEAN = 'export const value: unknown = 1\n';
const NOT_EXHAUSTIVE =
  "type Shape = 'a' | 'b'\nexport function f(shape: Shape): number {\n  switch (shape) {\n    case 'a':\n      return 1\n  }\n  return 0\n}\n";
const TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true, noEmit: true },
  include: ['src/**/*.ts'],
});

describe('runLint', () => {
  // 同じルール・同じ options の 2 規約を 1 つの設定にまとめても、glob の外の規約に結果を付けると落ちる。
  // tests/ のファイルを src/**/*.ts の規約まで covered・violation にすると、実行していない組を AI 照合から外すため。
  it('attributes a shared rule only to the rules whose globs ESLint applies to the file', async (t) => {
    const root = await project(t, { 'src/a.ts': ANY, 'tests/b.ts': ANY, 'src/c.ts': CLEAN });
    const { pairs, units } = await runLint(
      parseLintInput({
        rules: [
          {
            id: 'all',
            checks: [
              { rule: '@typescript-eslint/no-explicit-any', files: ['**/*.ts'], coverage: 'full' },
            ],
          },
          {
            id: 'src',
            checks: [
              {
                rule: '@typescript-eslint/no-explicit-any',
                files: ['src/**/*.ts'],
                coverage: 'full',
              },
            ],
          },
        ],
      }),
      root,
      ['src/a.ts', 'tests/b.ts', 'src/c.ts'],
    );
    assert.equal(units.length, 1);
    assert.equal(stateOf(pairs, 'all', 'tests/b.ts')?.state, 'violation');
    assert.equal(stateOf(pairs, 'src', 'tests/b.ts')?.state, 'not-run');
    assert.equal(stateOf(pairs, 'src', 'src/a.ts')?.state, 'violation');
    assert.equal(stateOf(pairs, 'src', 'src/c.ts')?.state, 'covered');
  });

  // glob のメタ文字を含むパス（Next.js の [id] など）を CLI 側で判定すると取り違える。ESLint の判定に任せる。
  it('applies globs to paths with metacharacters as ESLint does', async (t) => {
    const root = await project(t, {
      'src/[id]/page.ts': ANY,
      'src/(group)/page.ts': CLEAN,
      'src/other.ts': ANY,
    });
    const { pairs } = await runLint(
      parseLintInput({
        rules: [
          {
            id: 'r',
            checks: [
              { rule: '@typescript-eslint/no-explicit-any', files: ['**/*.ts'], coverage: 'full' },
            ],
          },
        ],
      }),
      root,
      ['src/[id]/page.ts', join(root, 'src/(group)/page.ts'), 'src/*.ts'],
    );
    assert.equal(stateOf(pairs, 'r', 'src/[id]/page.ts')?.state, 'violation');
    assert.equal(stateOf(pairs, 'r', 'src/(group)/page.ts')?.state, 'covered');
    assert.equal(stateOf(pairs, 'r', 'src/*.ts')?.state, 'not-run');
  });

  // 型の得られないファイル（tsconfig の外の TS、JS）で型なしの検査や他の型付きの検査まで not-run にすると、
  // 1 件の検査のせいで効果が消える。逆に型付きの検査を covered にすると、実行していない組を合格にする。
  it('isolates type-aware failures to the files that lack types', async (t) => {
    const root = await project(t, {
      'tsconfig.json': TSCONFIG,
      'src/a.ts': NOT_EXHAUSTIVE,
      'tests/b.ts': CLEAN,
      'src/c.js': 'export const c = 1\n',
    });
    const { pairs, units } = await runLint(
      parseLintInput({
        rules: [
          {
            id: 'typed',
            checks: [
              {
                rule: '@typescript-eslint/switch-exhaustiveness-check',
                files: ['**/*.ts'],
                coverage: 'full',
              },
            ],
          },
          {
            id: 'typed-js',
            checks: [
              {
                rule: '@typescript-eslint/no-unnecessary-condition',
                files: ['**/*.js'],
                coverage: 'full',
              },
            ],
          },
          {
            id: 'syntax',
            checks: [
              { rule: '@typescript-eslint/no-explicit-any', files: ['**/*.ts'], coverage: 'full' },
            ],
          },
          // 全てのファイルに一致する glob でも、型付きの検査は型なしと同じ範囲に適用される
          {
            id: 'typed-dir',
            checks: [
              {
                rule: '@typescript-eslint/switch-exhaustiveness-check',
                files: ['src/**'],
                coverage: 'full',
              },
            ],
          },
        ],
      }),
      root,
      ['src/a.ts', 'tests/b.ts', 'src/c.js'],
    );
    assert.deepEqual(units.map((unit) => [unit.id, unit.typed, unit.error]).sort(), [
      ['syntax-0', false, undefined],
      ['typed-0', true, undefined],
    ]);
    assert.equal(stateOf(pairs, 'typed', 'src/a.ts')?.state, 'violation');
    assert.equal(stateOf(pairs, 'typed', 'tests/b.ts')?.state, 'not-run');
    assert.equal(stateOf(pairs, 'typed-js', 'src/c.js')?.state, 'not-run');
    assert.equal(stateOf(pairs, 'syntax', 'tests/b.ts')?.state, 'covered');
    assert.equal(stateOf(pairs, 'typed-dir', 'src/a.ts')?.state, 'violation');
  });

  // 同じルールで options が違う検査を 1 つの設定にすると、後の設定だけが残り、前の検査は実行されない。
  it('runs every options variant of the same rule', async (t) => {
    const root = await project(t, {
      'src/a.ts': 'export function f(...args: any[]) { return args }\n',
    });
    const { pairs, units } = await runLint(
      parseLintInput({
        rules: [
          {
            id: 'strict',
            checks: [
              {
                rule: '@typescript-eslint/no-explicit-any',
                options: [{ ignoreRestArgs: false }],
                files: ['**/*.ts'],
                coverage: 'full',
              },
            ],
          },
          {
            id: 'rest-ok',
            checks: [
              {
                rule: '@typescript-eslint/no-explicit-any',
                options: [{ ignoreRestArgs: true }],
                files: ['**/*.ts'],
                coverage: 'full',
              },
            ],
          },
        ],
      }),
      root,
      ['src/a.ts'],
    );
    assert.equal(units.length, 2);
    assert.equal(stateOf(pairs, 'strict', 'src/a.ts')?.state, 'violation');
    assert.equal(stateOf(pairs, 'rest-ok', 'src/a.ts')?.state, 'covered');
  });

  it('marks checks with rules this version does not ship as not-run without stopping the others', async (t) => {
    const root = await project(t, { 'src/a.ts': ANY });
    const { pairs } = await runLint(
      parseLintInput({
        rules: [
          {
            id: 'old',
            checks: [{ rule: 'shinaps/removed-rule', files: ['**/*.ts'], coverage: 'full' }],
          },
          {
            id: 'ok',
            checks: [
              { rule: '@typescript-eslint/no-explicit-any', files: ['**/*.ts'], coverage: 'full' },
            ],
          },
        ],
      }),
      root,
      ['src/a.ts'],
    );
    assert.match(stateOf(pairs, 'old', 'src/a.ts')?.reason ?? '', /unsupported/);
    assert.equal(stateOf(pairs, 'ok', 'src/a.ts')?.state, 'violation');
  });

  // 不正な options などで ESLint が設定を拒否した検査を covered にすると、実行していない検査を合格にする。
  // 同じ単位に入れると、他の検査まで実行できなくなる。
  it('turns a check whose config ESLint rejects into not-run without stopping the others', async (t) => {
    const root = await project(t, { 'src/a.ts': ANY });
    const { pairs } = await runLint(
      parseLintInput({
        rules: [
          {
            id: 'bad',
            checks: [
              {
                rule: '@typescript-eslint/no-explicit-any',
                options: ['not-an-object'],
                files: ['**/*.ts'],
                coverage: 'full',
              },
            ],
          },
          {
            id: 'ok',
            checks: [
              { rule: '@typescript-eslint/no-explicit-any', files: ['**/*.ts'], coverage: 'full' },
            ],
          },
        ],
      }),
      root,
      ['src/a.ts'],
    );
    assert.match(stateOf(pairs, 'bad', 'src/a.ts')?.reason ?? '', /should be object/);
    assert.equal(stateOf(pairs, 'ok', 'src/a.ts')?.state, 'violation');
  });

  // ファイルを渡さずに ESLint を呼ぶと cwd 配下を全部検査する。適用される検査が無ければ ESLint を呼ばない
  // (呼べば src/other.ts まで検査され、fileCount が 0 にならない)。
  it('does not call ESLint for a unit without files', async (t) => {
    const root = await project(t, { 'src/a.ts': ANY, 'src/other.ts': ANY, 'README.md': '# x\n' });
    const none = await runLint(
      parseLintInput({
        rules: [
          {
            id: 'r',
            checks: [
              { rule: '@typescript-eslint/no-explicit-any', files: ['**/*.ts'], coverage: 'full' },
            ],
          },
        ],
      }),
      root,
      ['README.md'],
    );
    assert.equal(none.units[0]?.fileCount, 0);
    assert.equal(stateOf(none.pairs, 'r', 'README.md')?.state, 'not-run');
  });

  // .jsx を JSX なしで読むと常に parse error になり、対象の一覧にあるのに一度も検査できない。
  it('lints JSX in .jsx files', async (t) => {
    const root = await project(t, { 'src/a.jsx': 'export const a = (x) => <div>{x == 1}</div>\n' });
    const { pairs } = await runLint(
      parseLintInput({
        rules: [{ id: 'r', checks: [{ rule: 'eqeqeq', files: ['**/*.jsx'], coverage: 'full' }] }],
      }),
      root,
      ['src/a.jsx'],
    );
    assert.equal(stateOf(pairs, 'r', 'src/a.jsx')?.state, 'violation');
  });

  // プロジェクトの設定・script・node_modules を読み込むと、利用者のコードを実行し、規約以外の結果が混ざる。
  // react-x は React の版を settings で渡さないと process.cwd() から react を require するので、cwd を
  // プロジェクトにして実行する（利用者はプロジェクトのルートで実行する）。
  it('does not load the project lint config, scripts or packages and leaves files unchanged', async (t) => {
    const markers = await mkdtemp(join(tmpdir(), 'shinaps-lint-markers-'));
    t.after(() => rm(markers, { recursive: true, force: true }));
    const marker = (name: string) =>
      `import { writeFileSync } from 'node:fs'\nwriteFileSync(${JSON.stringify(join(markers, name))}, '1')\n`;
    const root = await project(t, {
      'package.json': JSON.stringify({
        type: 'module',
        scripts: { lint: `touch ${join(markers, 'script')}` },
      }),
      'eslint.config.js': `${marker('eslint-config')}export default [{ rules: { 'no-console': 'error' } }]\n`,
      'bunfig.toml': '[lint.rules]\n"no-console" = "error"\n',
      '.oxlintrc.json': JSON.stringify({ rules: { 'no-console': 'error' } }),
      'src/a.ts': `// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const value: any = 1\nconsole.log(value)\n`,
      'node_modules/eslint/package.json': JSON.stringify({
        name: 'eslint',
        type: 'module',
        exports: './index.js',
      }),
      'node_modules/eslint/index.js': `${marker('eslint')}export default {}\n`,
      'node_modules/typescript-eslint/package.json': JSON.stringify({
        name: 'typescript-eslint',
        type: 'module',
        exports: './index.js',
      }),
      'node_modules/typescript-eslint/index.js': `${marker('typescript-eslint')}export default {}\n`,
      'src/b.tsx':
        "import { useEffect } from 'react'\nexport function Log({ id }: { id: string }) {\n  useEffect(() => console.log(id), [])\n  return null\n}\n",
      'node_modules/react/package.json': JSON.stringify({
        name: 'react',
        version: '18.0.0',
        main: 'index.js',
      }),
      'node_modules/react/index.js': `require('node:fs').writeFileSync(${JSON.stringify(join(markers, 'react'))}, '1')\nmodule.exports = { version: '18.0.0' }\n`,
    });
    const cwd = process.cwd();
    process.chdir(root);
    t.after(() => process.chdir(cwd));
    const digest = async () => {
      const hash = createHash('sha256');
      const walk = async (dir: string): Promise<void> => {
        for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) await walk(path);
          else hash.update(path).update(await readFile(path));
        }
      };
      await walk(root);
      return hash.digest('hex');
    };
    const before = await digest();
    const { pairs } = await runLint(
      parseLintInput({
        rules: [
          {
            id: 'r',
            checks: [
              { rule: '@typescript-eslint/no-explicit-any', files: ['**/*.ts'], coverage: 'full' },
            ],
          },
          {
            id: 'react',
            checks: [{ rule: 'react-x/exhaustive-deps', files: ['**/*.tsx'], coverage: 'partial' }],
          },
        ],
      }),
      root,
      ['src/a.ts', 'src/b.tsx'],
    );
    assert.deepEqual(await readdir(markers), []);
    // react-x の検査はこのパッケージの依存から読み込まれて実行される。
    assert.equal(stateOf(pairs, 'react', 'src/b.tsx')?.findings.length, 1);
    assert.equal(await digest(), before);
    // プロジェクトの eslint-disable では個人の検査を抑止しない。no-console（プロジェクトの設定）は報告しない。
    assert.deepEqual(
      stateOf(pairs, 'r', 'src/a.ts')?.findings.map((finding) => finding.rule),
      ['@typescript-eslint/no-explicit-any'],
    );
  });
});

// full の検査が実行された証拠（単位の完了・結果がある・致命的な報告も ruleId の無い報告も無い）が
// 1 つでも欠けた組を covered にすると、実行していない規約を AI 照合から外す。
test('classify covers a pair only with a completed full check without fatal or ruleless reports', () => {
  const ran = { reports: new Map([['f', { fatal: false, messages: [] }]]) };
  const cases = [
    { applied: ['f'], outcome: ran, coverage: 'full', unusable: undefined, expected: 'covered' },
    { applied: [], outcome: ran, coverage: 'full', unusable: undefined, expected: 'not-run' },
    {
      applied: ['f'],
      outcome: { error: 'boom', reports: new Map() },
      coverage: 'full',
      unusable: undefined,
      expected: 'not-run',
    },
    {
      applied: ['f'],
      outcome: { reports: new Map() },
      coverage: 'full',
      unusable: undefined,
      expected: 'not-run',
    },
    {
      applied: ['f'],
      outcome: { reports: new Map([['f', { fatal: true, messages: [] }]]) },
      coverage: 'full',
      unusable: undefined,
      expected: 'not-run',
    },
    {
      applied: ['f'],
      outcome: {
        reports: new Map([
          [
            'f',
            {
              fatal: false,
              messages: [{ ruleId: null, line: 0, column: 0, message: 'File ignored' }],
            },
          ],
        ]),
      },
      coverage: 'full',
      unusable: undefined,
      expected: 'not-run',
    },
    {
      applied: ['f'],
      outcome: ran,
      coverage: 'full',
      unusable: 'unsupported',
      expected: 'not-run',
    },
    { applied: ['f'], outcome: ran, coverage: 'partial', unusable: undefined, expected: 'partial' },
    {
      applied: ['f'],
      outcome: {
        reports: new Map([
          ['f', { fatal: false, messages: [{ ruleId: 'x', line: 1, column: 1, message: 'bad' }] }],
        ]),
      },
      coverage: 'full',
      unusable: undefined,
      expected: 'violation',
    },
  ] as const;
  for (const { applied, outcome, coverage, unusable, expected } of cases) {
    const [pair] = classify({
      rules: [{ id: 'r', checks: [{ rule: 'x', options: [], files: ['**/*'], coverage }] }],
      files: ['f'],
      applied: new Map([[checkKey('r', 0), new Set<string>(applied)]]),
      outcomeOf: new Map([[checkKey('r', 0), outcome]]),
      unusable: new Map(unusable === undefined ? [] : [[checkKey('r', 0), unusable]]),
    });
    assert.equal(pair?.state, expected, JSON.stringify({ coverage, unusable, applied }));
  }
  assert.deepEqual(
    classify({
      rules: [{ id: 'r', checks: [] }],
      files: ['f'],
      applied: new Map(),
      outcomeOf: new Map(),
      unusable: new Map(),
    }),
    [],
  );
});

test('planUnits groups equal rule and options and splits only conflicting options and typed rules', () => {
  const units = planUnits(
    [
      {
        ruleId: 'a',
        index: 0,
        check: { rule: 'x', options: [{ b: 1, a: 2 }], files: ['**/*.ts'], coverage: 'full' },
      },
      {
        ruleId: 'b',
        index: 0,
        check: { rule: 'x', options: [{ a: 2, b: 1 }], files: ['**/*.ts'], coverage: 'full' },
      },
      {
        ruleId: 'c',
        index: 0,
        check: { rule: 'x', options: [{ a: 3 }], files: ['**/*.ts'], coverage: 'full' },
      },
      {
        ruleId: 'd',
        index: 0,
        check: { rule: 'typed', options: [], files: ['**/*.ts'], coverage: 'full' },
      },
    ],
    (rule) => rule === 'typed',
  );
  assert.deepEqual(
    units.map((unit) => [
      unit.id,
      unit.rules.map((rule) => [rule.rule, rule.bindings.map((binding) => binding.ruleId)]),
    ]),
    [
      ['syntax-0', [['x', ['a', 'b']]]],
      ['syntax-1', [['x', ['c']]]],
      ['typed-0', [['typed', ['d']]]],
    ],
  );
});

test('parseLintInput rejects malformed checks instead of guessing', () => {
  assert.throws(
    () =>
      parseLintInput({
        rules: [{ id: 'r', checks: [{ rule: 'x', files: [], coverage: 'full' }] }],
      }),
    /files/,
  );
  assert.throws(
    () =>
      parseLintInput({
        rules: [{ id: 'r', checks: [{ rule: 'x', files: ['*'], coverage: 'all' }] }],
      }),
    /coverage/,
  );
  assert.throws(
    () =>
      parseLintInput({
        rules: [{ id: 'r', checks: [{ rule: 'x', files: ['*'], coverage: 'full', options: {} }] }],
      }),
    /options/,
  );
  assert.throws(() => parseLintInput({ checks: [] }), /rules/);
});

// 同梱ルールは型情報なしの RuleTester で動く。型を使うルールを同梱するときは requiresTypeChecking を付け、
// projectService 付きの RuleTester で試す（docs/lint.md の「同梱ルールの追加」）。
RuleTester.describe = describe;
RuleTester.it = it;
new RuleTester({ languageOptions: { ecmaVersion: 'latest', sourceType: 'module' } }).run(
  'shinaps/prefer-promise-with-resolvers',
  shinapsPlugin.rules['prefer-promise-with-resolvers'],
  {
    valid: [
      'const { promise, resolve } = Promise.withResolvers()',
      'new Promise((resolve) => { resolve(1) })',
      'new Promise((resolve) => { setTimeout(resolve, 0) })',
      // executor の内側の関数の同名の引数は、executor の resolve ではない
      'let other; new Promise((resolve) => { [1].forEach((resolve) => { other = resolve }) })',
      'let f; function g(resolve) { f = resolve }',
      'let f; new Thenable((resolve) => { f = resolve })',
      // 第 1 引数でない関数の引数は executor の引数ではない
      'let f; new Promise(executor, (resolve) => { f = resolve })',
    ],
    invalid: [
      {
        code: 'let resolveFn; const p = new Promise((resolve) => { resolveFn = resolve })',
        errors: [{ messageId: 'leaked', line: 1, column: 53 }],
      },
      {
        code: 'const self = {}; new Promise(function (ok, fail) { self.ok = ok; self.fail = fail })',
        errors: [{ messageId: 'leaked' }, { messageId: 'leaked' }],
      },
      {
        // executor の中のさらに内側の関数からの代入も、executor の引数を外へ出している
        code: 'let f; new Promise((resolve) => { queueMicrotask(() => { f = resolve }) })',
        errors: [{ messageId: 'leaked' }],
      },
    ],
  },
);

// index の key を見逃すと、行の挿入・削除で入力の値やコンポーネントの状態が別の行に移る。逆に index で引いた
// 値の id（items[i].id）まで報告すると、正しい書き方を指摘にする。
new RuleTester({
  languageOptions: { parser: vueParser, ecmaVersion: 'latest', sourceType: 'module' },
}).run('shinaps/vue-no-index-key', shinapsPlugin.rules['vue-no-index-key'], {
  valid: [
    { code: '<template><li v-for="item in items" :key="item.id" /></template>', filename: 'a.vue' },
    {
      code: '<template><li v-for="(item, i) in items" :key="items[i].id" /></template>',
      filename: 'a.vue',
    },
    // 外側の index と同じ名前でも、内側の v-for の 1 番目の別名（値）は index ではない（名前ではなく scope で解決する）
    {
      code: '<template><li v-for="(item, i) in items" :key="item.id"><span v-for="i in item.tags" :key="i" /></li></template>',
      filename: 'a.vue',
    },
    // 範囲の v-for の 1 番目の別名は値そのもの
    { code: '<template><li v-for="n in 10" :key="n" /></template>', filename: 'a.vue' },
  ],
  invalid: [
    {
      code: '<template><li v-for="(item, i) in items" :key="i" /></template>',
      filename: 'a.vue',
      errors: [{ messageId: 'indexKey', data: { name: 'i' } }],
    },
    {
      code: '<template><li v-for="(value, name, position) in groups" :key="`row-${position}`" /></template>',
      filename: 'a.vue',
      errors: [{ messageId: 'indexKey', data: { name: 'position' } }],
    },
    // 内側の要素の key に外側の v-for の index を使う形も、外側の行の入れ替えで key が変わる
    {
      code: '<template><section v-for="(group, groupIndex) in groups" :key="group.id"><p v-for="item in group.items" :key="groupIndex + item.name" /></section></template>',
      filename: 'a.vue',
      errors: [{ messageId: 'indexKey', data: { name: 'groupIndex' } }],
    },
  ],
});
