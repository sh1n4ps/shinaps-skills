import { writeFile } from 'node:fs/promises';
import { isAbsolute, normalize, relative } from 'node:path';
import { flagValues, splitFiles } from './args.ts';
import { hashFiles, readJson } from './fs.ts';
import type { PairState } from './lint-plan.ts';
import { verifySnapshot, type Manifest } from './rule-snapshot.ts';

export const RULE_COVERAGE_COMMAND =
  'shinaps-skills rule-coverage --manifest <manifest.json> --target-version <version> [--lint <result.json>] [--report <report.json> ...] --out <coverage.json> -- <files...>';

/**
 * 担当のレポート末尾の JSON の 1 要素。担当ごとの範囲を持ち、全領域を担当する場合は manifest ごとに 1 要素を返す。
 * completedFiles は照合を終えたファイルの肯定の一覧で、書かれていないファイルは担当の申告に数えない。
 */
type RuleReport = {
  contentHash: string;
  targetVersion: string;
  completedFiles: string[];
  unchecked: { id: string; reason: string }[];
  incompleteFiles: { path: string; reason: string }[];
};
type LintResult = {
  root: string;
  checksSha256: string;
  files: Record<string, string>;
  pairs: { ruleId: string; file: string; state: PairState }[];
};
type RuleCoverage = {
  contentHash: string;
  targetVersion: string;
  counts: { machine: number; reported: number; unconfirmed: number };
  unconfirmedRules: { id: string; reason: string }[];
  unconfirmedFiles: { path: string; reason: string }[];
};

const NO_REPORT = 'no report for this snapshot and target version covers this file';

/**
 * 規約×ファイルの組を次の優先順でちょうど一つに区分する。機械が保証するのは同じ snapshot と ID・保存データ・対象の版の
 * 整合までで、reported は担当の申告（読了や理解の証明ではない）。
 * - machine: lint の covered・violation
 * - reported: この snapshot と版の報告のどれかが、そのファイルを completedFiles に挙げ、その規約を unchecked に挙げていない
 * - unconfirmed: それ以外。報告に書かれていないファイルは、省略から自動で reported にならない
 * @param input.manifest snapshot の manifest
 * @param input.targetVersion 確認対象の固定版。報告の版と比べる
 * @param input.files 対象ファイル（lint の結果と同じ基準の相対パス）
 * @param input.lint 最新の版で実行した lint の結果。実行できなければ null
 * @param input.reports 担当の報告。分担したときは担当ごとの要素を全部渡す。対象の外のファイルの記述は数えない
 */
export function classifyCoverage(input: {
  manifest: Pick<Manifest, 'contentHash' | 'ruleIds'>;
  targetVersion: string;
  files: string[];
  lint: Pick<LintResult, 'pairs'> | null;
  reports: RuleReport[];
}): RuleCoverage {
  const { manifest, targetVersion } = input;
  const targets = new Set(input.files.map((file) => normalize(file)));
  const ids = new Set(manifest.ruleIds);
  const machinePairKeys = new Set(
    (input.lint?.pairs ?? [])
      .filter((pair) => pair.state === 'covered' || pair.state === 'violation')
      .map((pair) => `${pair.ruleId}\0${normalize(pair.file)}`),
  );
  const reports = input.reports
    .filter(
      (entry) =>
        entry.contentHash === manifest.contentHash && entry.targetVersion === targetVersion,
    )
    .map((entry) => {
      const incomplete = new Map(
        entry.incompleteFiles.map((file) => [normalize(file.path), file.reason]),
      );
      return {
        incomplete,
        completed: new Set(
          entry.completedFiles
            .map((file) => normalize(file))
            .filter((file) => !incomplete.has(file)),
        ),
        unchecked: new Map(entry.unchecked.map((rule) => [rule.id, rule.reason])),
      };
    });
  for (const { unchecked } of reports) {
    for (const id of unchecked.keys()) {
      if (!ids.has(id)) throw new Error(`The report names a rule outside the snapshot: ${id}`);
    }
  }

  const counts = { machine: 0, reported: 0, unconfirmed: 0 };
  const unconfirmedRules = new Map<string, string>();
  const unconfirmedFiles = new Map<string, string>();
  for (const id of manifest.ruleIds) {
    for (const file of targets) {
      const covering = reports.filter((report) => report.completed.has(file));
      if (machinePairKeys.has(`${id}\0${file}`)) {
        counts.machine++;
      } else if (covering.some((report) => !report.unchecked.has(id))) {
        counts.reported++;
      } else {
        counts.unconfirmed++;
        const ruleReason = reports.find((report) => report.unchecked.has(id))?.unchecked.get(id);
        if (ruleReason !== undefined) unconfirmedRules.set(id, ruleReason);
        if (covering.length === 0) {
          const fileReason = reports
            .find((report) => report.incomplete.has(file))
            ?.incomplete.get(file);
          unconfirmedFiles.set(file, fileReason ?? NO_REPORT);
        }
      }
    }
  }
  return {
    contentHash: manifest.contentHash,
    targetVersion,
    counts,
    unconfirmedRules: [...unconfirmedRules].map(([id, reason]) => ({ id, reason })),
    unconfirmedFiles: [...unconfirmedFiles].map(([path, reason]) => ({ path, reason })),
  };
}

const isKeyWithReason = (entry: Record<string, unknown> | null, key: 'id' | 'path') =>
  typeof entry?.[key] === 'string' && typeof entry.reason === 'string';

const isReport = (entry: Partial<RuleReport> | null): entry is RuleReport =>
  typeof entry?.contentHash === 'string' &&
  typeof entry.targetVersion === 'string' &&
  Array.isArray(entry.completedFiles) &&
  entry.completedFiles.every((file) => typeof file === 'string') &&
  Array.isArray(entry.unchecked) &&
  entry.unchecked.every((item) => isKeyWithReason(item, 'id')) &&
  Array.isArray(entry.incompleteFiles) &&
  entry.incompleteFiles.every((item) => isKeyWithReason(item, 'path'));

/** AI が書いた報告を読む。形の揺れを受け入れると未確認が一覧から消えるので、何を直すかが分かるように失敗する。 */
function parseReports(raw: unknown): RuleReport[] {
  if (!Array.isArray(raw) || !raw.every(isReport)) {
    throw new Error(
      'The report must be an array of { contentHash, targetVersion, completedFiles: [], unchecked: [{ id, reason }], incompleteFiles: [{ path, reason }] }.',
    );
  }
  return raw;
}

/**
 * lint の結果を、この snapshot と現在の内容のものだけ受け入れる。機械確認の組は担当の照合から外すので、古い結果を使うと
 * 誰も見ていない組が残る。
 */
async function readCurrentLint(path: string, manifest: Manifest): Promise<LintResult> {
  const lint = await readJson<LintResult>(path);
  if (lint.checksSha256 !== manifest.lintChecksSha256) {
    throw new Error('The lint result was not made from this snapshot. Run lint again.');
  }
  const current = await hashFiles(lint.root, Object.keys(lint.files));
  for (const [file, hash] of Object.entries(lint.files)) {
    if (current[file] !== hash) throw new Error(`${file} changed after lint. Run lint again.`);
  }
  return lint;
}

export async function ruleCoverage(args: string[]): Promise<void> {
  const { flags, files } = splitFiles(args);
  const value = (name: string) => flagValues(flags, name)[0];
  const manifestPath = value('--manifest');
  const targetVersion = value('--target-version');
  const out = value('--out');
  if (
    manifestPath === undefined ||
    targetVersion === undefined ||
    out === undefined ||
    files.length === 0
  ) {
    throw new Error(`Usage: ${RULE_COVERAGE_COMMAND}`);
  }
  const manifest = await verifySnapshot(manifestPath);
  const lintPath = value('--lint');
  const lint = lintPath === undefined ? null : await readCurrentLint(lintPath, manifest);
  const toTarget = (file: string) =>
    normalize(isAbsolute(file) ? relative(lint?.root ?? process.cwd(), file) : file);
  const targets = files.map(toTarget);
  // lint の対象に無いファイルは機械確認にならない。パスの基準がずれると、外した組を誰も見ないまま申告に数えてしまう。
  const linted = new Set(Object.keys(lint?.files ?? {}).map((file) => normalize(file)));
  const outside = lint === null ? undefined : targets.find((file) => !linted.has(file));
  if (outside !== undefined) {
    throw new Error(`${outside} is not in the lint result. Run lint again with the same files.`);
  }
  const reports = await Promise.all(
    flagValues(flags, '--report').map(async (path) => parseReports(await readJson(path))),
  );
  const coverage = classifyCoverage({
    manifest,
    targetVersion,
    files: targets,
    lint,
    reports: reports.flat().map((report) => ({
      ...report,
      completedFiles: report.completedFiles.map(toTarget),
      incompleteFiles: report.incompleteFiles.map((file) => ({
        ...file,
        path: toTarget(file.path),
      })),
    })),
  });
  await writeFile(out, `${JSON.stringify(coverage, null, 1)}\n`);
  console.log(`Shinaps rule coverage: ${JSON.stringify(coverage.counts)} → ${out}`);
}
