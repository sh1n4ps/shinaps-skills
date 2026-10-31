/**
 * `shinaps-skills lint` の入力・実行単位・結果の分類。ESLint を呼ばない純関数だけを置き、実行は lint.ts が行う。
 *
 * 規約 R × ファイル F の組を AI 照合から外してよいのは、次がすべて成り立つときだけ（docs/lint.md）。
 * - R の検査の coverage が full（登録時の意味のレビューの結果。ここでは値を読むだけ）
 * - その検査が F に適用されると ESLint が判定し、検査が属する実行単位が完了し、F に致命的な報告も
 *   ruleId の無い報告も無い
 * どれかが欠けた組は not-run にして AI へ回す。
 */

type Coverage = 'full' | 'partial';

type RuleCheck = {
  rule: string;
  options: unknown[];
  files: string[];
  coverage: Coverage;
};

export type LintInput = { rules: Array<{ id: string; checks: RuleCheck[] }> };

/** 検査を引く key。規約 id と、その規約の checks の中の位置で決まる。 */
export const checkKey = (ruleId: string, index: number) => `${ruleId}#${index}`;

/** 規約の検査 1 件。index は規約の checks の中の位置。 */
export type Binding = { ruleId: string; index: number; check: RuleCheck };

type PlannedRule = { rule: string; options: unknown[]; bindings: Binding[] };
export type Unit = { id: string; typed: boolean; rules: PlannedRule[] };

type Finding = { rule: string; line: number; column: number; message: string };
type PairState = 'covered' | 'violation' | 'partial' | 'not-run';
type Pair = {
  ruleId: string;
  file: string;
  state: PairState;
  reason?: string;
  findings: Finding[];
};

/** ESLint の結果のうち分類に使う部分。 */
export type FileReport = {
  fatal: boolean;
  messages: Array<{ ruleId: string | null; line: number; column: number; message: string }>;
};
export type UnitOutcome = {
  /** 例外で完了しなかった単位の理由。完了した単位では undefined。 */
  error?: string;
  /** ファイル（root からの相対パス）ごとの結果。lintFiles に渡さなかったファイルは含まない。 */
  reports: Map<string, FileReport>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 入力 JSON を検査の一覧にする。形が違えば throw し、呼び出し側は結果を書かずに失敗する（全組を AI へ）。
 * 形だけを見る。ルール ID・options・glob の中身は検査せず、ESLint が拒否すればその検査だけが not-run になる。
 */
export function parseLintInput(raw: unknown): LintInput {
  if (!isObject(raw) || !Array.isArray(raw.rules))
    throw new Error('checks: expected { "rules": [...] }');
  return {
    rules: raw.rules.map((rule, ruleIndex) => {
      const where = `checks: rules[${ruleIndex}]`;
      if (!isObject(rule) || typeof rule.id !== 'string' || rule.id === '')
        throw new Error(`${where}: expected a non-empty "id"`);
      if (!Array.isArray(rule.checks))
        throw new Error(`${where}: expected "checks" to be an array`);
      return {
        id: rule.id,
        checks: rule.checks.map((check, checkIndex) =>
          parseCheck(check, `${where}.checks[${checkIndex}]`),
        ),
      };
    }),
  };
}

function parseCheck(raw: unknown, where: string): RuleCheck {
  if (!isObject(raw)) throw new Error(`${where}: expected an object`);
  const { rule, options, files, coverage } = raw;
  if (typeof rule !== 'string' || rule === '')
    throw new Error(`${where}: expected a non-empty "rule"`);
  if (options !== undefined && !Array.isArray(options))
    throw new Error(`${where}: expected "options" to be an array`);
  if (
    !Array.isArray(files) ||
    files.length === 0 ||
    !files.every((file) => typeof file === 'string' && file !== '')
  )
    throw new Error(`${where}: expected "files" to be a non-empty array of globs`);
  if (coverage !== 'full' && coverage !== 'partial')
    throw new Error(`${where}: expected "coverage" to be "full" or "partial"`);
  return { rule, options: options ?? [], files, coverage };
}

/** キーの順を揃えた JSON。同じ options を同じ文字列にして、実行単位でまとめるために使う。 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/**
 * 検査を実行単位に分ける。同じルール・同じ options の検査は 1 つの設定にまとめ、同じルールで options が
 * 違うものだけを別の単位にする（flat config では同じルールの設定は後勝ちで 1 つしか残らないため）。
 * 型が要るルールは projectService を付けた単位に分ける。型の得られないファイルはその単位だけが fatal になり、
 * 型なしの検査を巻き込まない。
 * @param needsTypes ルール ID が型情報を要するか。解決できたルールについてだけ呼ぶ
 */
export function planUnits(bindings: Binding[], needsTypes: (rule: string) => boolean): Unit[] {
  const groups = new Map<string, PlannedRule>();
  for (const binding of bindings) {
    const key = `${binding.check.rule}\0${canonicalJson(binding.check.options)}`;
    const group = groups.get(key);
    if (group) group.bindings.push(binding);
    else
      groups.set(key, {
        rule: binding.check.rule,
        options: binding.check.options,
        bindings: [binding],
      });
  }
  const units = new Map<string, Unit>();
  const variants = new Map<string, number>();
  for (const group of groups.values()) {
    const typed = needsTypes(group.rule);
    const variant = variants.get(group.rule) ?? 0;
    variants.set(group.rule, variant + 1);
    const id = `${typed ? 'typed' : 'syntax'}-${variant}`;
    const unit = units.get(id) ?? { id, typed, rules: [] };
    unit.rules.push(group);
    units.set(id, unit);
  }
  return [...units.values()];
}

/**
 * 組を分類する。検査は checkKey で引く。
 * @param applied 検査ごとに、ESLint が適用すると判定したファイル（root からの相対パス）
 * @param outcomeOf 検査ごとの、その検査が属する実行単位の結果。unusable の検査は含まない
 * @param unusable 実行しなかった検査とその理由（この版に無いルール、ESLint が拒否した設定）
 */
export function classify(input: {
  rules: LintInput['rules'];
  files: string[];
  applied: Map<string, Set<string>>;
  outcomeOf: Map<string, UnitOutcome>;
  unusable: Map<string, string>;
}): Pair[] {
  const pairs: Pair[] = [];
  for (const rule of input.rules) {
    if (rule.checks.length === 0) continue;
    for (const file of input.files) {
      const findings: Finding[] = [];
      const reasons: string[] = [];
      let fullRan = false;
      let anyRan = false;
      for (const [index, check] of rule.checks.entries()) {
        const key = checkKey(rule.id, index);
        const unusable = input.unusable.get(key);
        if (unusable !== undefined) {
          reasons.push(`${check.rule}: ${unusable}`);
          continue;
        }
        if (!input.applied.get(key)?.has(file)) continue;
        const outcome = input.outcomeOf.get(key);
        if (outcome?.error !== undefined) {
          reasons.push(`${check.rule}: ${outcome.error}`);
          continue;
        }
        const report = outcome?.reports.get(file);
        if (!report) {
          reasons.push(`${check.rule}: no result for the file`);
          continue;
        }
        const ruleless = report.messages.find((message) => message.ruleId === null);
        if (report.fatal || ruleless) {
          reasons.push(`${check.rule}: ${ruleless?.message ?? 'fatal error'}`);
          continue;
        }
        anyRan = true;
        if (check.coverage === 'full') fullRan = true;
        for (const message of report.messages) {
          if (message.ruleId === check.rule)
            findings.push({
              rule: check.rule,
              line: message.line,
              column: message.column,
              message: message.message,
            });
        }
      }
      const state: PairState = fullRan
        ? findings.length > 0
          ? 'violation'
          : 'covered'
        : anyRan
          ? 'partial'
          : 'not-run';
      const pair: Pair = { ruleId: rule.id, file, state, findings: dedupe(findings) };
      if (state === 'not-run')
        pair.reason = reasons.length > 0 ? reasons.join('; ') : 'no check applies to the file';
      pairs.push(pair);
    }
  }
  return pairs;
}

// 同じルール・同じ options の検査を 1 規約が 2 つ持つと、同じ報告が 2 回集まるため 1 つにする。
function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.rule}:${finding.line}:${finding.column}:${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
