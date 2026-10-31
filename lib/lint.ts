import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { ESLint as ESLintType, Linter, Rule } from 'eslint';
import {
  type Binding,
  checkKey,
  classify,
  type FileReport,
  type LintInput,
  parseLintInput,
  planUnits,
  type Unit,
  type UnitOutcome,
} from './lint-plan.ts';
import { shinapsPlugin } from './lint-rules.ts';
import { errorMessage } from './fs.ts';

const USAGE =
  'Usage: shinaps-skills lint --checks <checks.json> --root <project> --out <result.json> -- <files...>';

/**
 * `shinaps-skills lint`: 規約の検査を、プロジェクトの設定を使わずに ESLint の Node API で実行し、
 * 規約 × ファイルの組を分類して result.json に書く。プロジェクトの lint 設定・script・node_modules の
 * パッケージは読み込まない（overrideConfigFile: true、プラグインはこのパッケージの依存から渡す）。
 * 対象ファイルへは書き込まない。
 */
export async function lint(args: string[]): Promise<void> {
  const options = parseArgs(args);
  const input = parseLintInput(JSON.parse(await readFile(options.checks, 'utf8')));
  const result = await runLint(input, options.root, options.files);
  await writeFile(options.out, `${JSON.stringify(result, null, 2)}\n`);
  const counts = Object.fromEntries(
    (['covered', 'violation', 'partial', 'not-run'] as const).map((state) => [
      state,
      result.pairs.filter((pair) => pair.state === state).length,
    ]),
  );
  console.log(`Shinaps lint: ${JSON.stringify(counts)} → ${options.out}`);
}

function parseArgs(args: string[]) {
  const separator = args.indexOf('--');
  const flags = separator === -1 ? args : args.slice(0, separator);
  const files = separator === -1 ? [] : args.slice(separator + 1);
  const value = (name: string) => {
    const index = flags.indexOf(name);
    const found = index === -1 ? undefined : flags[index + 1];
    if (!found) throw new Error(`${name} is required. ${USAGE}`);
    return found;
  };
  return { checks: value('--checks'), root: resolve(value('--root')), out: value('--out'), files };
}

type Registry = {
  plugins: Record<string, ESLintType.Plugin>;
  rules: Map<string, Rule.RuleModule>;
  parsers: { typescript: Linter.Parser; vue: Linter.Parser };
};

/**
 * @param root 対象プロジェクトのルート（絶対パス）
 * @param files 対象ファイル。root からの相対パスか絶対パス。結果では root からの相対パス（区切りは `/`）で表す
 */
export async function runLint(input: LintInput, root: string, files: string[]) {
  const { ESLint } = await import('eslint');
  const registry = await loadRegistry();
  const relativeFiles = [...new Set(files.map((file) => toRelative(root, file)))];

  const newESLint = (overrideConfig: Linter.Config[]) =>
    new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig,
      allowInlineConfig: false,
      // 削除済みなどで存在しないファイルを渡しても単位全体を失敗にせず、そのファイルを「結果なし」
      // (not-run) にするため。
      errorOnUnmatchedPattern: false,
      // 渡すのはファイルだけ。`src/*.ts` のような名前のファイルを glob として展開し、渡していない
      // ファイルまで検査しないため。
      globInputPaths: false,
    });
  const needsTypes = (rule: string) =>
    // ESLint の型の docs には requiresTypeChecking が無い (typescript-eslint が付ける独自の項目)。
    (registry.rules.get(rule)?.meta?.docs as { requiresTypeChecking?: boolean } | undefined)
      ?.requiresTypeChecking === true;

  // 検査が F に適用されるかは ESLint だけが判定する。その検査の設定だけを入れたインスタンスで
  // calculateConfigForFile を呼び、ルールが有効なら適用される。glob の解釈を CLI 側で再現しない。
  // ESLint が設定（不正な options など）を拒否した検査は、ここで not-run にして実行単位に入れない。
  // 単位に入れると、同じ単位の他の検査まで実行できなくなるため。
  const unusable = new Map<string, string>();
  const applied = new Map<string, Set<string>>();
  const bindings: Binding[] = [];
  for (const rule of input.rules) {
    for (const [index, check] of rule.checks.entries()) {
      const key = checkKey(rule.id, index);
      if (!registry.rules.has(check.rule)) {
        unusable.set(key, 'unsupported rule in this version of @shinaps/skills');
        continue;
      }
      const binding = { ruleId: rule.id, index, check };
      const single = newESLint(
        unitConfig(registry, root, needsTypes(check.rule), [
          { rule: check.rule, options: check.options, bindings: [binding] },
        ]),
      );
      try {
        const hits = new Set<string>();
        for (const file of relativeFiles) {
          if (isActive(await single.calculateConfigForFile(resolve(root, file)), check.rule))
            hits.add(file);
        }
        applied.set(key, hits);
        bindings.push(binding);
      } catch (error) {
        unusable.set(key, oneLine(error));
      }
    }
  }

  const outcomeOf = new Map<string, UnitOutcome>();
  const units = [];
  for (const unit of planUnits(bindings, needsTypes)) {
    const unitBindings = unit.rules.flatMap((planned) => planned.bindings);
    const targets = [
      ...new Set(
        unitBindings.flatMap((binding) => [
          ...(applied.get(checkKey(binding.ruleId, binding.index)) ?? []),
        ]),
      ),
    ];
    const outcome = await runUnit(unit, targets);
    for (const binding of unitBindings)
      outcomeOf.set(checkKey(binding.ruleId, binding.index), outcome);
    units.push({
      id: unit.id,
      typed: unit.typed,
      rules: unit.rules.map((planned) => planned.rule),
      // ESLint が結果を返したファイルの数。単位のエラーや存在しないファイルでは、渡した数より少なくなる。
      fileCount: outcome.reports.size,
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    });
  }

  async function runUnit(unit: Unit, targets: string[]): Promise<UnitOutcome> {
    // 渡すファイルが無ければ実行しない。ファイルを省くと ESLint は cwd 配下を全部検査するため。
    if (targets.length === 0) return { reports: new Map() };
    try {
      const results = await newESLint(unitConfig(registry, root, unit.typed, unit.rules)).lintFiles(
        targets.map((file) => resolve(root, file)),
      );
      const reports = new Map<string, FileReport>();
      for (const result of results) {
        reports.set(toRelative(root, result.filePath), {
          fatal: result.fatalErrorCount > 0,
          messages: result.messages.map((message) => ({
            ruleId: message.ruleId,
            line: message.line,
            column: message.column,
            message: message.message,
          })),
        });
      }
      return { reports };
    } catch (error) {
      return { error: oneLine(error), reports: new Map() };
    }
  }

  return {
    root,
    units,
    pairs: classify({ rules: input.rules, files: relativeFiles, applied, outcomeOf, unusable }),
  };
}

// ESLint の設定エラーは複数行で、理由が 2 行目以降にあるため、1 行にまとめて結果に残す。
const oneLine = (error: unknown) =>
  errorMessage(error)
    .replace(/\s*\n\s*/g, ' ')
    .trim();

function toRelative(root: string, file: string): string {
  const absolute = isAbsolute(file) ? file : resolve(root, file);
  return relative(root, absolute).split(sep).join('/');
}

function isActive(config: Linter.Config | undefined, rule: string): boolean {
  const entry = config?.rules?.[rule];
  const severity = Array.isArray(entry) ? entry[0] : entry;
  return severity !== undefined && severity !== 0 && severity !== 'off';
}

async function loadRegistry(): Promise<Registry> {
  const [{ builtinRules }, tseslint, vue, vueParser] = await Promise.all([
    import('eslint/use-at-your-own-risk'),
    import('typescript-eslint'),
    import('eslint-plugin-vue'),
    import('vue-eslint-parser'),
  ]);
  // typescript-eslint と eslint-plugin-vue が公開する型は ESLint の Plugin・Parser・RuleModule の型と
  // 細部が一致しない (どちらも実行時は ESLint の API に従う)。flat config に渡すために ESLint の型にする。
  const plugins: Record<string, ESLintType.Plugin> = {
    '@typescript-eslint': tseslint.default.plugin as ESLintType.Plugin,
    vue: vue.default as ESLintType.Plugin,
    shinaps: shinapsPlugin,
  };
  const rules = new Map<string, Rule.RuleModule>(builtinRules);
  for (const [prefix, plugin] of Object.entries(plugins)) {
    for (const [name, rule] of Object.entries(plugin.rules ?? {}))
      rules.set(`${prefix}/${name}`, rule as Rule.RuleModule);
  }
  return {
    plugins,
    rules,
    parsers: {
      typescript: tseslint.default.parser as Linter.Parser,
      vue: vueParser.default as Linter.Parser,
    },
  };
}

const TS_FILES = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];
// 検査の対象にする拡張子。ESLint は `src/**` のように全てのファイルに一致する glob だけではファイルを検査の
// 対象にしないので、拡張子を指定したパターンを両方の単位に置く。単位の種類で適用範囲が変わらないよう、
// 型付き・型なしで同じ一覧を使う。
const LINTED_FILES = [...TS_FILES, '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs', '**/*.vue'];

/**
 * 実行単位の設定。parser は拡張子ごとの設定オブジェクトで指定し、ルールは検査の glob の和に付ける。
 * 型付きの単位は、対象の全てのファイルを projectService 付きの typescript-eslint で読む。型の得られない
 * ファイル (tsconfig に含まれない JS、Vue など) はそのファイルだけが fatal (not-run) になる。JS を ESLint
 * の既定の parser で読むと、型を要求するルールが単位全体を例外で止め、他の検査を巻き込むため。
 * 型付きの単位では Vue を扱わない (vue-eslint-parser と projectService の組み合わせは使っていない)。
 */
function unitConfig(
  registry: Registry,
  root: string,
  typed: boolean,
  rules: Unit['rules'],
): Linter.Config[] {
  const parsers: Linter.Config[] = typed
    ? [
        {
          files: LINTED_FILES,
          languageOptions: {
            parser: registry.parsers.typescript,
            parserOptions: { projectService: true, tsconfigRootDir: root },
          },
        },
      ]
    : [
        { files: LINTED_FILES },
        // 既定の parser は JSX を読まないので、.jsx では JSX を有効にする (無いと常に parse error で not-run)。
        {
          files: ['**/*.jsx'],
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        },
        { files: TS_FILES, languageOptions: { parser: registry.parsers.typescript } },
        {
          files: ['**/*.vue'],
          languageOptions: {
            parser: registry.parsers.vue,
            parserOptions: { parser: registry.parsers.typescript, sourceType: 'module' },
          },
        },
      ];
  return [
    ...parsers,
    ...rules.map(
      (planned): Linter.Config => ({
        files: [...new Set(planned.bindings.flatMap((binding) => binding.check.files))],
        plugins: registry.plugins,
        // options は JSON の配列 (unknown[]) で、ESLint の RuleEntry は要素の型を持たないので型だけを合わせる。
        rules: { [planned.rule]: ['error', ...planned.options] as Linter.RuleEntry },
      }),
    ),
  ];
}
