import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lint } from '../lib/lint.ts';
import { classifyCoverage, ruleCoverage } from '../lib/rule-coverage.ts';
import {
  buildSnapshot,
  readCaptures,
  splitParts,
  verifySnapshot,
  writeSnapshot,
  type Rule,
} from '../lib/rule-snapshot.ts';

const HOOK = 'plugins/shinaps-claude/hooks/capture-rule-response.mjs';
const INPUT = { fields: 'full', frameworks: ['vue'] };
const OTHER = { fields: 'full', frameworks: ['hono'] };

async function temp(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'shinaps-rules-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

type Entry = {
  session?: string;
  input?: object;
  cursor?: string;
  rules?: Rule[];
  next?: string | null;
  text?: string;
};

/** 捕捉を hook の形式のファイルにして読み直す。時刻は配列の位置 + 1000。 */
async function captures(t: TestContext, entries: Entry[]) {
  const root = await temp(t);
  for (const [index, entry] of entries.entries()) {
    const directory = join(root, entry.session ?? 's1');
    await mkdir(directory, { recursive: true });
    const text =
      entry.text ??
      JSON.stringify({
        userRules: [],
        officialRules: entry.rules ?? [],
        nextCursor: entry.next ?? null,
      });
    await writeFile(
      join(directory, `${1000 + index}-t${index}.json`),
      JSON.stringify({
        tool_input: {
          ...(entry.input ?? INPUT),
          ...(entry.cursor !== undefined ? { cursor: entry.cursor } : {}),
        },
        tool_response: [{ type: 'text', text }],
      }),
    );
  }
  return readCaptures(root);
}

const idsOf = (snapshot: { rules: Rule[] }) => snapshot.rules.map((item) => item.id);

// 同じ入力の全ページが揃うときだけ snapshot ができ、他の捕捉は混ざらない。壊れると規約が黙って欠けるか、別条件の規約で照合する。
test('a snapshot holds exactly the rules of one complete chain of the same input', async (t) => {
  const complete: Entry[] = [
    { rules: [{ id: 'a' }], next: 'o:1' },
    { cursor: 'o:1', rules: [{ id: 'b' }], next: 'o:2' },
    { cursor: 'o:2', rules: [{ id: 'c' }] },
  ];
  const snapshot = buildSnapshot({
    captures: await captures(t, complete),
    inputs: [INPUT],
    since: 0,
  });
  assert.deepEqual(idsOf(snapshot), ['a', 'b', 'c']);

  const withRetryAndOtherInput = await captures(t, [
    { rules: [{ id: 'a' }], next: 'o:1' },
    { input: OTHER, rules: [{ id: 'z' }] },
    { cursor: 'o:1', rules: [{ id: 'b' }] },
    { cursor: 'o:1', rules: [{ id: 'b' }] },
  ]);
  assert.deepEqual(
    idsOf(buildSnapshot({ captures: withRetryAndOtherInput, inputs: [INPUT], since: 0 })),
    ['a', 'b'],
  );
  assert.deepEqual(
    idsOf(buildSnapshot({ captures: withRetryAndOtherInput, inputs: [OTHER], since: 0 })),
    ['z'],
  );
});

test('an incomplete chain fails and names what is missing', async (t) => {
  assert.throws(
    () => buildSnapshot({ captures: [], inputs: [INPUT], since: 0 }),
    /No captured response.*hook is enabled and trusted/,
  );
  const incomplete: Entry[][] = [
    [{ rules: [{ id: 'a' }], next: 'o:1' }],
    [
      { rules: [{ id: 'a' }], next: 'o:1' },
      { cursor: 'o:1', text: '{"userRules":[{"id":"…7 tokens truncated…' },
    ],
    [
      { rules: [{ id: 'a' }], next: 'o:1' },
      { cursor: 'o:1', text: '{"error":{"code":"RATE_LIMITED"}}' },
    ],
    [
      { rules: [{ id: 'a' }], next: 'o:1' },
      { cursor: 'o:1', input: OTHER, rules: [{ id: 'b' }] },
    ],
    [
      { rules: [{ id: 'a' }], next: 'o:1' },
      { cursor: 'o:1', session: 's2', rules: [{ id: 'b' }] },
    ],
  ];
  for (const entries of incomplete) {
    const rows = await captures(t, entries);
    assert.throws(() => buildSnapshot({ captures: rows, inputs: [INPUT], since: 0 }), /o:1/);
  }
});

// hook が止まった後や取り直しの途中停止で以前の規約を使って成功すると、削除・更新された規約で照合してしまう。
test('an old complete chain is never used instead of a newer or missing walk', async (t) => {
  const complete: Entry = { rules: [{ id: 'a' }] };
  const afterEveryCapture = 5000;
  const old = await captures(t, [complete]);
  assert.throws(
    () => buildSnapshot({ captures: old, inputs: [INPUT], since: afterEveryCapture }),
    /No captured response/,
  );
  const stopped = await captures(t, [complete, { rules: [{ id: 'a' }], next: 'o:9' }]);
  assert.throws(() => buildSnapshot({ captures: stopped, inputs: [INPUT], since: 0 }), /o:9/);
  const failed = await captures(t, [complete, { text: '{"error":{"code":"INTERNAL_ERROR"}}' }]);
  assert.throws(
    () => buildSnapshot({ captures: failed, inputs: [INPUT], since: 0 }),
    /unusable response/,
  );
  const newer = await captures(t, [complete, { rules: [{ id: 'a', why: 'new' }] }]);
  assert.equal(buildSnapshot({ captures: newer, inputs: [INPUT], since: 0 }).rules[0].why, 'new');
});

test('inputs are joined by id, conflicting content fails, and exclusions keep a reason', async (t) => {
  const joined = await captures(t, [
    { rules: [{ id: 'a' }] },
    { input: OTHER, rules: [{ id: 'a' }, { id: 'h', labels: ['cloudflare-workers'] }] },
  ]);
  const inputs = [INPUT, OTHER];
  assert.deepEqual(idsOf(buildSnapshot({ captures: joined, inputs, since: 0 })), ['a', 'h']);
  const excluded = buildSnapshot({
    captures: joined,
    inputs,
    since: 0,
    excludeLabels: ['cloudflare-workers'],
  });
  assert.deepEqual(idsOf(excluded), ['a']);
  assert.equal(excluded.excluded[0].id, 'h');

  const conflict = await captures(t, [
    { rules: [{ id: 'a', why: 'one' }] },
    { input: OTHER, rules: [{ id: 'a', why: 'other' }] },
  ]);
  assert.throws(() => buildSnapshot({ captures: conflict, inputs, since: 0 }), /different content/);
});

// Codex の担当の読取りは大きな出力を切り詰める。part が大きいと担当に全文が届かない。
test('parts stay within the reading limit, keep every rule, and an oversized rule stands alone', () => {
  const partLimitBytes = 8000;
  const rules: Rule[] = Array.from({ length: 30 }, (_, index) => ({
    id: `r${index}`,
    why: '理'.repeat(500),
  }));
  rules.splice(5, 0, { id: 'huge', why: '理'.repeat(9000) });
  const parts = splitParts(rules);
  assert.deepEqual(parts.flat(), rules);
  for (const part of parts) {
    const size = Buffer.byteLength(`${JSON.stringify(part, null, 1)}\n`);
    assert.ok(size <= partLimitBytes || part.length === 1, `${size} bytes, ${part.length} rules`);
  }
});

// checks を AI が写すと partial を full と誤写して照合を省きうる。生成物が元の値のままで、改変が検出されることを固定する。
test('lint-checks and parts come unchanged from the responses, and later edits are detected', async (t) => {
  const out = await temp(t);
  const check = { rule: 'no-var', files: ['**/*.js'], coverage: 'partial' };
  const rules: Rule[] = [{ id: 'a' }, { id: 'b', checks: [check] }];
  const manifest = await writeSnapshot({ rules, excluded: [] }, [INPUT], out);
  const manifestPath = join(out, 'manifest.json');
  assert.deepEqual(JSON.parse(await readFile(join(out, 'lint-checks.json'), 'utf8')), {
    rules: [{ id: 'b', checks: [check] }],
  });
  const stored = await Promise.all(
    manifest.parts.map(async (part) => JSON.parse(await readFile(join(out, part.file), 'utf8'))),
  );
  assert.deepEqual(stored.flat(), rules);
  assert.deepEqual((await verifySnapshot(manifestPath)).ruleIds, ['a', 'b']);

  const checksPath = join(out, 'lint-checks.json');
  const originalChecks = await readFile(checksPath, 'utf8');
  await writeFile(checksPath, originalChecks.replace('partial', 'full'));
  await assert.rejects(verifySnapshot(manifestPath), /lint-checks.json changed/);
  await writeFile(checksPath, originalChecks);

  const originalManifest = await readFile(manifestPath, 'utf8');
  await writeFile(manifestPath, JSON.stringify({ ...manifest, ruleIds: ['a'] }));
  await assert.rejects(verifySnapshot(manifestPath), /ruleIds do not match/);
  await writeFile(manifestPath, originalManifest);

  await appendFile(join(out, manifest.parts[0].file), ' ');
  await assert.rejects(verifySnapshot(manifestPath), /part changed/);
});

const coverageOf = (
  input: Pick<Parameters<typeof classifyCoverage>[0], 'files' | 'reports' | 'lint'>,
) =>
  classifyCoverage({
    manifest: { contentHash: 'h', ruleIds: ['a', 'b'] },
    targetVersion: 'v1',
    ...input,
  });

test('each pair lands in one bucket, machine results outrank reports, and no reason is lost', () => {
  const coverage = coverageOf({
    files: ['f1', 'f2', 'f3'],
    lint: { pairs: [{ ruleId: 'a', file: 'f1', state: 'covered' }] },
    reports: [
      {
        contentHash: 'h',
        targetVersion: 'v1',
        completedFiles: ['f1', './f2'],
        unchecked: [{ id: 'a', reason: 'not read' }],
        incompleteFiles: [{ path: './f3', reason: '' }],
      },
    ],
  });
  assert.deepEqual(coverage.counts, { machine: 1, reported: 2, unconfirmed: 3 });
  assert.deepEqual(coverage.unconfirmedRules, [{ id: 'a', reason: 'not read' }]);
  assert.deepEqual(coverage.unconfirmedFiles, [{ path: 'f3', reason: '' }]);
});

// 報告が一部のファイルだけを見たとき、省略したファイルを申告に数えると、誰も読んでいない組が確認済みに見える。
test('a file no report completed stays unconfirmed, whatever else the report says', () => {
  const coverage = coverageOf({
    files: ['seen', 'never-reviewed'],
    lint: null,
    reports: [
      {
        contentHash: 'h',
        targetVersion: 'v1',
        completedFiles: ['seen'],
        unchecked: [],
        incompleteFiles: [],
      },
    ],
  });
  assert.deepEqual(coverage.counts, { machine: 0, reported: 2, unconfirmed: 2 });
  assert.equal(coverage.unconfirmedFiles[0].path, 'never-reviewed');
});

// 担当を分けたときは、それぞれの範囲の和だけが申告になる。片方の未読を別の担当の報告で消さない。
test('split reports keep their own scopes and one reporter does not cancel what another completed', () => {
  const entry = { contentHash: 'h', targetVersion: 'v1', incompleteFiles: [] };
  const coverage = coverageOf({
    files: ['one', 'two', 'three'],
    lint: null,
    reports: [
      { ...entry, completedFiles: ['one'], unchecked: [{ id: 'a', reason: 'one skipped a' }] },
      { ...entry, completedFiles: ['one', 'two'], unchecked: [] },
      { ...entry, completedFiles: ['two'], unchecked: [{ id: 'b', reason: 'unread' }] },
    ],
  });
  assert.deepEqual(coverage.counts, { machine: 0, reported: 4, unconfirmed: 2 });
  assert.deepEqual(
    coverage.unconfirmedFiles.map((file) => file.path),
    ['three'],
  );
  // 未確認の組の規約については、担当が未読と報告した理由を規約ごとに残す。
  assert.deepEqual(coverage.unconfirmedRules, [
    { id: 'a', reason: 'one skipped a' },
    { id: 'b', reason: 'unread' },
  ]);
});

// 読めなかった規約の id が一覧から消えると、どの規約が未確認か追えない。
test('an unchecked rule keeps its reason even when no report completed the file', () => {
  const coverage = coverageOf({
    files: ['f'],
    lint: null,
    reports: [
      {
        contentHash: 'h',
        targetVersion: 'v1',
        completedFiles: [],
        unchecked: [{ id: 'a', reason: 'unreadable' }],
        incompleteFiles: [{ path: 'f', reason: 'stopped' }],
      },
    ],
  });
  assert.deepEqual(coverage.counts, { machine: 0, reported: 0, unconfirmed: 2 });
  assert.deepEqual(coverage.unconfirmedRules, [{ id: 'a', reason: 'unreadable' }]);
  assert.deepEqual(coverage.unconfirmedFiles, [{ path: 'f', reason: 'stopped' }]);
});

test('a report for another snapshot or version, or none, leaves everything but machine pairs unconfirmed', () => {
  const entry = { completedFiles: ['f1'], unchecked: [], incompleteFiles: [] };
  for (const reports of [
    [],
    [{ ...entry, contentHash: 'old', targetVersion: 'v1' }],
    [{ ...entry, contentHash: 'h', targetVersion: 'v0' }],
  ]) {
    const lint = { pairs: [{ ruleId: 'a', file: 'f1', state: 'covered' as const }] };
    assert.deepEqual(coverageOf({ files: ['f1'], lint, reports }).counts, {
      machine: 1,
      reported: 0,
      unconfirmed: 1,
    });
  }
});

test('a report naming a rule outside the snapshot is an error', () => {
  assert.throws(
    () =>
      coverageOf({
        files: ['f1'],
        lint: null,
        reports: [
          {
            contentHash: 'h',
            targetVersion: 'v1',
            completedFiles: [],
            unchecked: [{ id: 'x', reason: 'r' }],
            incompleteFiles: [],
          },
        ],
      }),
    /outside the snapshot/,
  );
});

function runHook(cwd: string, event: object) {
  const result = spawnSync(process.execPath, [join(process.cwd(), HOOK)], {
    input: JSON.stringify({ cwd, ...event }),
  });
  assert.equal(result.status, 0, result.stderr.toString());
}

// hook・snapshot・実際の lint・coverage をつなぐ。保存先、捕捉の形式、結果のパスの形のずれは、単体の試験では見つからない。
test('hook output feeds snapshot, lint and coverage end to end, from a subdirectory, and stays out of Git status', async (t) => {
  const repository = await temp(t);
  execFileSync('git', ['init', '-q'], { cwd: repository });
  const nested = join(repository, 'apps/web');
  await mkdir(nested, { recursive: true });
  const check = { rule: 'no-var', files: ['**/*.js'], coverage: 'full' };
  const since = Date.now();
  const pages = [
    { input: INPUT, id: 'a', checks: [check], next: 'o:1' },
    { input: { ...INPUT, cursor: 'o:1' }, id: 'b', checks: [], next: null },
  ];
  for (const [index, page] of pages.entries()) {
    runHook(nested, {
      session_id: '../odd/session',
      tool_use_id: `call/${index}`,
      tool_input: page.input,
      tool_response: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              userRules: [],
              officialRules: [{ id: page.id, checks: page.checks }],
              nextCursor: page.next,
            }),
          },
        ],
      },
    });
  }
  runHook(nested, { session_id: 's', tool_use_id: 'x', tool_input: { fields: 'summary' } });

  const root = join(repository, '.shinaps/work/rule-captures');
  const sessions = (await readdir(root)).filter((name) => name !== '.gitignore');
  assert.deepEqual(sessions, ['___odd_session']);
  assert.equal((await readdir(join(root, sessions[0]))).length, 2);
  assert.equal(execFileSync('git', ['status', '--short'], { cwd: repository }).toString(), '');

  const inputPath = join(repository, 'input.json');
  await writeFile(inputPath, JSON.stringify(INPUT));
  const out = join(repository, 'snapshot');
  // 既定の保存先を通す。CLI 側のパスが hook とずれると、全ての利用者の snapshot が「捕捉が無い」で失敗する。
  const cli = spawnSync(
    process.execPath,
    [
      join(process.cwd(), 'bin/skills.ts'),
      'rule-snapshot',
      '--since',
      String(since),
      '--input',
      inputPath,
      '--out',
      out,
    ],
    { cwd: nested },
  );
  assert.equal(cli.status, 0, cli.stderr.toString());
  const manifestPath = join(out, 'manifest.json');
  assert.deepEqual((await verifySnapshot(manifestPath)).ruleIds, ['a', 'b']);

  await writeFile(join(repository, 'x.js'), 'export const value = 1;\n');
  const lintResult = join(repository, 'lint.json');
  await lint([
    '--checks',
    join(out, 'lint-checks.json'),
    '--root',
    repository,
    '--out',
    lintResult,
    '--',
    'x.js',
  ]);
  const coveragePath = join(repository, 'coverage.json');
  const coverageArgs = [
    '--manifest',
    manifestPath,
    '--target-version',
    'v1',
    '--lint',
    lintResult,
    '--out',
    coveragePath,
    '--',
    join(repository, 'x.js'),
  ];
  await ruleCoverage(coverageArgs);
  const readCoverage = async () => {
    const parsed: unknown = JSON.parse(await readFile(coveragePath, 'utf8'));
    assert.ok(typeof parsed === 'object' && parsed !== null);
    return parsed;
  };
  const coverage = await readCoverage();
  assert.ok('counts' in coverage && 'unconfirmedFiles' in coverage);
  assert.deepEqual(coverage.counts, { machine: 1, reported: 0, unconfirmed: 1 });
  assert.match(JSON.stringify(coverage.unconfirmedFiles), /"path":"x\.js"/);

  // 対象が lint の結果とずれると、機械確認の組が黙って申告や未確認に変わる。
  await writeFile(join(repository, 'y.js'), 'export const other = 1;\n');
  await assert.rejects(
    ruleCoverage([...coverageArgs, join(repository, 'y.js')]),
    /is not in the lint result/,
  );

  // lint より狭い対象でも、数えるのは渡した組だけ。担当ごとの --report は範囲を保ったまま合わせる (絶対パスの報告を含む)。
  await writeFile(join(repository, 'z.js'), 'export const third = 1;\n');
  await lint([
    '--checks',
    join(out, 'lint-checks.json'),
    '--root',
    repository,
    '--out',
    lintResult,
    '--',
    'x.js',
    'z.js',
  ]);
  const { contentHash } = await verifySnapshot(manifestPath);
  const reportFor = async (name: string, completedFiles: string[]) => {
    const path = join(repository, name);
    await writeFile(
      path,
      JSON.stringify([
        { contentHash, targetVersion: 'v1', completedFiles, unchecked: [], incompleteFiles: [] },
      ]),
    );
    return path;
  };
  await ruleCoverage([
    '--report',
    await reportFor('one.json', [join(repository, 'x.js')]),
    '--report',
    await reportFor('two.json', ['z.js']),
    ...coverageArgs.slice(0, -1),
    'x.js',
    'z.js',
  ]);
  const split = await readCoverage();
  assert.ok('counts' in split);
  assert.deepEqual(split.counts, { machine: 2, reported: 2, unconfirmed: 0 });
  await ruleCoverage(coverageArgs);
  const subset = await readCoverage();
  assert.ok('counts' in subset);
  assert.deepEqual(subset.counts, { machine: 1, reported: 0, unconfirmed: 1 });

  // lint の後に変わったファイルを機械確認にすると、担当の照合から外した組を誰も見ないまま残す。
  await writeFile(join(repository, 'x.js'), 'var value = 1;\n');
  await assert.rejects(ruleCoverage(coverageArgs), /changed after lint/);

  const lintText = await readFile(lintResult, 'utf8');
  await writeFile(lintResult, lintText.replace(/"checksSha256": "\w+"/, '"checksSha256": "other"'));
  await assert.rejects(ruleCoverage(coverageArgs), /not made from this snapshot/);

  // 報告の形の揺れを受け入れると、未確認の規約が一覧から消えるか、申告扱いになる。
  const report = join(repository, 'report.json');
  const reportArgs = [
    '--manifest',
    manifestPath,
    '--target-version',
    'v1',
    '--report',
    report,
    '--out',
    coveragePath,
    '--',
    'x.js',
  ];
  const entry = {
    contentHash: 'h',
    targetVersion: 'v1',
    completedFiles: ['x.js'],
    unchecked: [],
    incompleteFiles: [],
  };
  for (const malformed of [
    { unchecked: [] },
    [{ ...entry, completedFiles: undefined }],
    [{ ...entry, unchecked: [{ id: 'a' }] }],
    [{ ...entry, incompleteFiles: [{}] }],
  ]) {
    await writeFile(report, JSON.stringify(malformed));
    await assert.rejects(ruleCoverage(reportArgs), /must be an array/);
  }
});
