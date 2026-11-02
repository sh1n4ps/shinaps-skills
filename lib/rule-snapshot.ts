import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { flagValues } from './args.ts';
import { errorMessage, readJson, sha256 } from './fs.ts';

export const RULE_SNAPSHOT_COMMAND =
  'shinaps-skills rule-snapshot --since <epoch-ms> --input <search-input.json> [--input ...] [--exclude-label <slug> ...] [--captures <dir>] --out <dir>';

// Codex の担当のファイル読取りが切り詰められない大きさ（モックのモデルで 8KB は全文が届き、18KB は切り詰められた）。
// 1 件で超える規約は 1 件だけの part にし、行範囲で読めるよう整形する。
const PART_MAX_BYTES = 8000;
const CAPTURE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type Rule = { id: string; labels?: string[]; checks?: unknown[]; [key: string]: unknown };
type SearchInput = Record<string, unknown>;
type Page = { userRules: Rule[]; officialRules: Rule[]; nextCursor: string | null };
type Capture = {
  session: string;
  time: number;
  name: string;
  input: SearchInput;
  page: Page | null;
};

export type Manifest = {
  contentHash: string;
  inputs: SearchInput[];
  ruleIds: string[];
  excluded: { id: string; reason: string }[];
  parts: { file: string; sha256: string }[];
  lintChecksSha256: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

const inputKey = ({ cursor: _cursor, ...rest }: SearchInput) => JSON.stringify(canonical(rest));

const isRule = (value: unknown) => isRecord(value) && typeof value.id === 'string';

const isPage = (value: unknown): value is Page =>
  isRecord(value) &&
  Array.isArray(value.userRules) &&
  value.userRules.every(isRule) &&
  Array.isArray(value.officialRules) &&
  value.officialRules.every(isRule) &&
  'nextCursor' in value;

/** 応答の本文からページを取り出す。切り詰めやエラーの応答はページの形にならないので null になる。 */
function parsePage(response: unknown): Page | null {
  const content = isRecord(response) ? response.content : response;
  if (!Array.isArray(content)) return null;
  const text = content.map((item: unknown) => (isRecord(item) ? item.text : '')).join('');
  let page: unknown;
  try {
    page = JSON.parse(text);
  } catch {
    return null;
  }
  return isPage(page) ? page : null;
}

/**
 * 捕捉の形式: plugin の hook が PostToolUse の標準入力の全体を
 * `<captures>/<session>/<時刻 ms>-<tool_use_id>.json` に書いたもの。使う項目は tool_input と tool_response で、
 * tool_response は Claude Code では content の配列、Codex では `{ content }`。
 * @param session 捕捉の session のディレクトリ名
 * @param name 捕捉のファイル名（先頭が時刻 ms）
 * @param text 捕捉のファイルの内容
 */
function parseCapture(session: string, name: string, text: string): Capture | null {
  const event: unknown = JSON.parse(text);
  const time = Number.parseInt(name, 10);
  if (!isRecord(event) || !isRecord(event.tool_input) || Number.isNaN(time)) return null;
  return { session, time, name, input: event.tool_input, page: parsePage(event.tool_response) };
}

export async function readCaptures(root: string): Promise<Capture[]> {
  if (!existsSync(root)) return [];
  const captures: Capture[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const session = entry.name;
    for (const name of await readdir(join(root, session))) {
      if (!name.endsWith('.json')) continue;
      const capture = parseCapture(
        session,
        name,
        await readFile(join(root, session, name), 'utf8'),
      );
      if (capture !== null) captures.push(capture);
    }
  }
  return captures.sort((a, b) => a.time - b.time || (a.name < b.name ? -1 : 1));
}

/**
 * since 以降で最新の先頭ページから nextCursor null まで辿る。古い連鎖へは戻らない。戻ると、hook が止まった後や
 * 取り直しが途中で止まった後に、以前の規約で成功してしまうため。
 * @param captures 時刻の昇順の捕捉
 * @param input cursor を含まない search_rules の入力
 * @param since この時刻 (epoch ms) より前の捕捉を使わない
 */
function walkChain(captures: Capture[], input: SearchInput, since: number): Page[] {
  const key = inputKey(input);
  const matching = captures.filter((row) => row.time >= since && inputKey(row.input) === key);
  const first = matching.findLast((row) => row.input.cursor === undefined);
  if (first === undefined) {
    throw new Error(
      `No captured response since ${since} for ${key}. Check that the Shinaps hook is enabled and trusted, that this command runs in the same Git root as the fetch (or pass --captures), and that --input is the exact input of the fetch. Then fetch again from the first page.`,
    );
  }
  const sessionRows = matching.filter((row) => row.session === first.session);
  const pages: Page[] = [];
  let currentIndex = sessionRows.indexOf(first);
  for (;;) {
    const { page } = sessionRows[currentIndex];
    if (page === null) {
      throw new Error(
        `Incomplete chain: unusable response for ${key}. Fetch again from the first page.`,
      );
    }
    pages.push(page);
    if (page.nextCursor === null) return pages;
    const after = currentIndex;
    const nextIndex = sessionRows.findIndex(
      (row, index) => index > after && row.input.cursor === page.nextCursor && row.page !== null,
    );
    if (nextIndex === -1) {
      throw new Error(
        `Incomplete chain: missing cursor ${page.nextCursor} for ${key}. Fetch again from the first page.`,
      );
    }
    currentIndex = nextIndex;
  }
}

/**
 * @param source.captures 時刻の昇順の捕捉
 * @param source.inputs search_rules の入力。複数のときは id の和を取る
 * @param source.since この時刻 (epoch ms) より前の捕捉を使わない
 * @param source.excludeLabels これらの label を持つ規約を除外する（理由を残す）
 */
export function buildSnapshot(source: {
  captures: Capture[];
  inputs: SearchInput[];
  since: number;
  excludeLabels?: string[];
}): { rules: Rule[]; excluded: Manifest['excluded'] } {
  const byId = new Map<string, Rule>();
  for (const input of source.inputs) {
    for (const page of walkChain(source.captures, input, source.since)) {
      for (const rule of [...page.userRules, ...page.officialRules]) {
        const seen = byId.get(rule.id);
        if (seen !== undefined && !isDeepStrictEqual(seen, rule)) {
          throw new Error(`Rule ${rule.id} was captured with different content. Fetch again.`);
        }
        byId.set(rule.id, rule);
      }
    }
  }
  const rules: Rule[] = [];
  const excluded: Manifest['excluded'] = [];
  for (const rule of [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const label = rule.labels?.find((slug) => source.excludeLabels?.includes(slug) === true);
    if (label === undefined) rules.push(rule);
    else excluded.push({ id: rule.id, reason: `label ${label} is on an empty axis` });
  }
  return { rules, excluded };
}

const partText = (rules: Rule[]) => `${JSON.stringify(rules, null, 1)}\n`;
const checksText = (rules: Rule[]) =>
  `${JSON.stringify({ rules: rules.filter((rule) => (rule.checks?.length ?? 0) > 0).map((rule) => ({ id: rule.id, checks: rule.checks })) }, null, 1)}\n`;
const contentHashOf = (rules: Rule[]) => sha256(JSON.stringify(canonical(rules)));

export function splitParts(rules: Rule[]): Rule[][] {
  const parts: Rule[][] = [];
  for (const rule of rules) {
    const last = parts.at(-1);
    if (last !== undefined && Buffer.byteLength(partText([...last, rule])) <= PART_MAX_BYTES) {
      last.push(rule);
    } else {
      parts.push([rule]);
    }
  }
  return parts;
}

/**
 * @param snapshot buildSnapshot の結果
 * @param inputs manifest に残す search_rules の入力
 * @param out 出力先のディレクトリ
 */
export async function writeSnapshot(
  snapshot: { rules: Rule[]; excluded: Manifest['excluded'] },
  inputs: SearchInput[],
  out: string,
): Promise<Manifest> {
  await rm(join(out, 'parts'), { recursive: true, force: true });
  await mkdir(join(out, 'parts'), { recursive: true });
  const parts: Manifest['parts'] = [];
  for (const [index, rules] of splitParts(snapshot.rules).entries()) {
    const file = `parts/part-${String(index + 1).padStart(3, '0')}.json`;
    const text = partText(rules);
    await writeFile(join(out, file), text);
    parts.push({ file, sha256: sha256(text) });
  }
  const lintChecks = checksText(snapshot.rules);
  await writeFile(join(out, 'lint-checks.json'), lintChecks);
  const manifest: Manifest = {
    contentHash: contentHashOf(snapshot.rules),
    inputs,
    ruleIds: snapshot.rules.map((rule) => rule.id),
    excluded: snapshot.excluded,
    parts,
    lintChecksSha256: sha256(lintChecks),
  };
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  return manifest;
}

/** snapshot のファイルが作成時から変わっていないことを確かめ、manifest を返す。 */
export async function verifySnapshot(manifestPath: string): Promise<Manifest> {
  const directory = dirname(manifestPath);
  const manifest = await readJson<Manifest>(manifestPath);
  const rules: Rule[] = [];
  for (const part of manifest.parts) {
    const text = await readFile(join(directory, part.file), 'utf8');
    if (sha256(text) !== part.sha256)
      throw new Error(`Snapshot part changed: ${part.file}. Run rule-snapshot again.`);
    const partRules: unknown = JSON.parse(text);
    if (!Array.isArray(partRules))
      throw new Error(`Snapshot part is not a list: ${part.file}. Run rule-snapshot again.`);
    rules.push(...partRules);
  }
  if (contentHashOf(rules) !== manifest.contentHash)
    throw new Error('Snapshot content changed. Run rule-snapshot again.');
  if (
    !isDeepStrictEqual(
      rules.map((rule) => rule.id),
      manifest.ruleIds,
    )
  ) {
    throw new Error('manifest.json ruleIds do not match the parts. Run rule-snapshot again.');
  }
  const checks = await readFile(join(directory, 'lint-checks.json'), 'utf8');
  if (sha256(checks) !== manifest.lintChecksSha256)
    throw new Error('lint-checks.json changed. Run rule-snapshot again.');
  return manifest;
}

/** 24 時間より古い捕捉だけを消す。他の session の取得中の捕捉は残す。 */
async function removeOldCaptures(root: string, now: number) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(root, entry.name);
    for (const name of await readdir(directory)) {
      if (now - Number.parseInt(name, 10) > CAPTURE_MAX_AGE_MS)
        await rm(join(directory, name), { force: true });
    }
    if ((await readdir(directory)).length === 0)
      await rm(directory, { recursive: true, force: true });
  }
}

// plugin の hook は依存なしで動かすため同じ処理を持つ。同じ保存先になることは test/rule-snapshot.test.ts の通しの試験が確かめる。
function projectRoot(cwd: string): string {
  for (let directory = cwd; ; directory = dirname(directory)) {
    if (existsSync(join(directory, '.git'))) return directory;
    if (dirname(directory) === directory) return cwd;
  }
}

export async function ruleSnapshot(args: string[]): Promise<void> {
  const since = Number(flagValues(args, '--since')[0]);
  const inputPaths = flagValues(args, '--input');
  const out = flagValues(args, '--out')[0];
  if (!Number.isFinite(since) || inputPaths.length === 0 || out === undefined) {
    throw new Error(`Usage: ${RULE_SNAPSHOT_COMMAND}`);
  }
  const rawInputs = await Promise.all(inputPaths.map((path) => readJson(path)));
  const inputs = rawInputs.filter(isRecord);
  if (inputs.length !== rawInputs.length || inputs.some((input) => input.fields !== 'full')) {
    throw new Error(`--input must be an object with fields "full": ${JSON.stringify(rawInputs)}`);
  }
  const root =
    flagValues(args, '--captures')[0] ??
    join(projectRoot(process.cwd()), '.shinaps/work/rule-captures');
  let snapshot: ReturnType<typeof buildSnapshot>;
  try {
    snapshot = buildSnapshot({
      captures: await readCaptures(root),
      inputs,
      since,
      excludeLabels: flagValues(args, '--exclude-label'),
    });
  } catch (error) {
    throw new Error(`${errorMessage(error)} Captures: ${root}`, { cause: error });
  }
  const manifest = await writeSnapshot(snapshot, inputs, resolve(out));
  await removeOldCaptures(root, Date.now());
  console.log(
    `Shinaps rule snapshot: ${manifest.ruleIds.length} rules, ${manifest.excluded.length} excluded, ${manifest.parts.length} parts, contentHash ${manifest.contentHash} → ${out}`,
  );
}
