import { spawn } from 'node:child_process';

/**
 * `ant` CLI の 1 回の呼び出し。APIキーは env の `ANTHROPIC_API_KEY` だけで渡し、argv に載せない
 * (argv は同じマシンの他のプロセスから見える)。秘密値を含むリクエスト本文は `body` で渡し、stdin に
 * JSON で書く (`antRequestBody`)。
 */
export type AntCall = { argv: string[]; apiKey: string; cwd?: string; body?: unknown };
/** `ant` を実行して標準出力を返す。終了コードが 0 でなければ throw する。テストでは差し替える。 */
export type Ant = (call: AntCall) => Promise<string>;

/**
 * Managed Agents の beta ヘッダ。ant の `--beta` は既定の beta ヘッダを置き換えるので、既定に頼らず
 * 毎回明示する (agents・environments・sessions の既定と同じ値)。Files は `filesBeta` を使う。
 */
export const managedBeta = ['--beta', 'managed-agents-2026-04-01'];
/** セッションの Files には Files API と Managed Agents の両方の beta が要る。 */
export const filesBeta = ['--beta', 'files-api-2025-04-14', ...managedBeta];

/** 1 アカウントの解決結果。`dir` は `managedAccountDir` の値。 */
export type Account = { name: string; apiKey: string; dir: string };

/**
 * 子プロセスの環境。親の `ANTHROPIC_*` (別のキー・ログインのプロファイル・workspace・federation) と
 * 他アカウントのキー (`SHINAPS_MANAGED_*`) を渡さず、そのアカウントのキーだけを資格情報にする。
 * ant は環境変数をログインより優先するが、複数の資格情報が残ると、どれが使われるかが ant の優先順位に
 * 依存し、別アカウントのリソースを操作しかねないため。
 */
export function antEnvironment(env: NodeJS.ProcessEnv, apiKey: string): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('ANTHROPIC_') && !name.startsWith('SHINAPS_MANAGED_')) {
      result[name] = value;
    }
  }
  result.ANTHROPIC_API_KEY = apiKey;
  // ant は FORCE_COLOR=1 で非端末にも色を付ける。計画の文言や jsonl の解析が ANSI で壊れないよう止める。
  result.FORCE_COLOR = '0';
  return result;
}

/**
 * stdin に渡すリクエスト本文。ant は本文の文字列値のうち `@` で始まるものをファイル参照として展開し
 * (`@notes.md` ならそのファイルの内容を送り、無ければ失敗する)、`\@` で始まるものだけを `@` の文字列に
 * 戻す。題名や回答の本文を書かれたとおりに送るため、`@` で始まる文字列を全て `\@` に置き換える。
 * `\@` で始まる文字列は ant が必ず `@` に変えるので、そのままは送れない (ant の制約)。
 */
export function antRequestBody(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === 'string' && item.startsWith('@') ? `\\${item}` : item,
  );
}

/**
 * PATH 上の `ant` を実行する。本文が無ければ stdin を /dev/null にする。ant は stdin がパイプなら
 * 本文の有無を 10 ms 待って確かめるので、本文の無い呼び出しにパイプを渡さない。本文は起動と同時に
 * パイプへ書き込むので、ant が確かめる時点では既に読める。
 */
export const antCommand =
  (env: NodeJS.ProcessEnv): Ant =>
  ({ argv, apiKey, cwd, body }) =>
    new Promise((resolve, reject) => {
      const child = spawn('ant', argv, {
        cwd,
        env: antEnvironment(env, apiKey),
        stdio: [body === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
      child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
      child.on('error', reject);
      child.on('close', (status, signal) => {
        if (status === 0) {
          resolve(Buffer.concat(stdout).toString('utf8'));
          return;
        }
        // ant は API エラーの本文と、途中で失敗した apply の結果を stdout に出すので、両方を残す。
        // 呼び出し側が秘密値を伏字にしてから表示する。
        const output = [Buffer.concat(stdout), Buffer.concat(stderr)]
          .map((chunk) => chunk.toString('utf8').trim())
          .filter(Boolean)
          .join('\n');
        reject(
          new Error(
            `ant ${argv.slice(0, 2).join(' ')} exited with ${status ?? signal}:\n${output}`,
          ),
        );
      });
      // ant が本文を読む前に終わる (引数の誤りなど) と書き込みは EPIPE で失敗する。その成否は
      // 終了コードとエラー出力で報告するので、書き込みのエラーでプロセスを落とさない。
      child.stdin?.on('error', () => {});
      if (body !== undefined) child.stdin?.end(antRequestBody(body));
    });
