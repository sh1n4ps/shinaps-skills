# 規約の機械検査（`shinaps-skills lint`）

Shinaps AIの規約が持つ機械検査（`checks`）を手元で実行し、規約×ファイルの組ごとに、AI照合を省けるかを判定するCLIです。エージェント向けの使い方は plugin の `references/lint.md` にあります。

## 前提と保証

- プロジェクトの変更は要りません。プロジェクトのlint設定（`eslint.config.*`・`.oxlintrc.json`・`bunfig.toml` など）・`package.json` のscript・`node_modules` のパッケージは読み込みません。ESLintのNode APIを `overrideConfigFile: true` で使い、パーサーとプラグインはこのパッケージの依存から渡します。読むのは対象ファイルと、型情報を使うルールのための `tsconfig.json`・型宣言だけです（実行はしません）。React のルール（react-x）が判定に使う React の版は、プロジェクトの `react` から検出させず `19.3.0` に固定します（React 18 のプロジェクトでも 19 の前提で判定するので、`<Context value>` の省略形を provider として扱うなど、報告が増える側に寄ります）。
- 対象ファイルへ書き込みません（自動修正はしません）。結果はローカルのファイルに書き、サーバーへは送りません。
- プロジェクトの `eslint-disable` コメントでは検査を抑止しません（`allowInlineConfig: false`）。プロジェクトの都合の例外は、指摘を確認する側で扱います。
- 組をAI照合から外してよいのは、coverage が `full` の検査が、ESLintの判定でそのファイルに適用され、検査の実行単位が完了し、そのファイルに致命的な報告もruleIdの無い報告も無いときだけです。それ以外の組は `not-run`（または `partial`）として返し、合格にしません。coverage は検査を登録したときの判断で、このCLIは値を読むだけです。

## 使い方

```sh
shinaps-skills lint --checks <checks.json> --root <project> --out <result.json> -- <files...>
```

- `--checks`・`--out` のパスは、コマンドを実行したディレクトリが基準です。
- `--checks`: `{ "rules": [{ "id": "<規約id>", "checks": [{ "rule": "...", "options": [...], "files": ["**/*.ts"], "coverage": "full" }] }] }`。形が違えば何も書かずに終了コード1で終わります。
- `--root`: 対象プロジェクトのルート。ESLintの `cwd` と、結果のパスの基準になります。
- `<files...>`: 対象ファイル（`--root` からの相対パスか絶対パス）。どの検査も適用されないファイルはESLintに渡しません。渡すファイルが無ければESLintを起動しません（ファイルを省くとESLintはルート配下を全て検査するため）。
- `--out`: 結果のJSON。

結果:

```json
{
  "root": "/path/to/project",
  "units": [{ "id": "syntax-0", "typed": false, "rules": ["@typescript-eslint/method-signature-style"], "fileCount": 3 }],
  "pairs": [
    { "ruleId": "<規約id>", "file": "src/a.ts", "state": "covered", "findings": [] },
    { "ruleId": "<規約id>", "file": "src/b.ts", "state": "violation", "findings": [{ "rule": "@typescript-eslint/method-signature-style", "line": 2, "column": 3, "message": "..." }] },
    { "ruleId": "<規約id>", "file": "tests/c.ts", "state": "not-run", "reason": "...", "findings": [] }
  ]
}
```

| state | 意味 | 照合 |
| --- | --- | --- |
| `covered` | `full` の検査が実行され、違反が無い | 外す |
| `violation` | `full` の検査が実行され、指摘がある（同じ規約の `partial` の検査の指摘を含む） | 外し、`findings` を指摘にする |
| `partial` | `partial` の検査だけが実行された | 残し、`findings` も指摘にする |
| `not-run` | 実行していない（`reason` に理由） | 残す |

## 実行の仕組み

1. 各検査のルールを、ESLint core・`@typescript-eslint`・`vue`・`react-x`（下の6ルールだけ）・`regexp`・同梱の `shinaps` から引きます。この版に無いルールの検査は `not-run` になり、他の検査は止まりません。
   - `react-x`（eslint-plugin-react-x）: `rules-of-hooks`・`exhaustive-deps`・`no-array-index-key`・`no-missing-key`・`no-nested-component-definitions`・`no-unstable-context-value`。react-x には型情報を使うのに `meta.docs.requiresTypeChecking` を宣言しないルールがあり、型なしの実行単位に入ると単位の全ての検査を止めるため、型を使わないことをソースで確かめたルールだけを登録します（`lib/lint.ts` の `REACT_X_RULES`）。他の外部プラグインでも、型を使うのに宣言しないルールは登録しません。
   - `regexp`（eslint-plugin-regexp）: 全てのルール。型情報は有無を確かめてから使います。
2. 検査ごとに、その検査の設定だけを入れたESLintで `calculateConfigForFile` を呼び、ルールが有効なファイルを適用先にします。globの解釈はESLintだけが行います。ESLintが設定を拒否した検査（不正なoptionsなど）は、ここで `not-run` になります。
3. 同じルール・同じoptionsの検査は1つの設定にまとめ、同じルールでoptionsが違うものだけを別の実行単位にします。型情報を使うルール（`meta.docs.requiresTypeChecking`）は `projectService` を使う単位に分けます。この単位は全てのファイルを typescript-eslint で読み、型の得られないファイル（`tsconfig.json` に含まれないTS・JS、Vue）はそのファイルだけが `not-run` になります。型なしの検査と、他のファイルの型付きの検査は影響を受けません。型情報を使うルールはVueのファイルでは実行できません。
4. 実行単位ごとに `lintFiles` を1回呼び、組を分類します。指摘は、ESLintがそのファイルに適用すると判定した検査の規約にだけ付けます。

## 同梱ルール

| ルールID | 内容 | 型情報 |
| --- | --- | --- |
| `shinaps/prefer-promise-with-resolvers` | Promiseのexecutorが受け取る `resolve`・`reject` を、executorの外で使うために変数・プロパティへ代入する書き方（deferred promise）を報告する。`Promise.withResolvers()` で書ける。包んだ関数の代入や、値として渡す呼び出しは報告しない | 不要 |
| `shinaps/vue-no-index-key` | Vueの `:key` が v-for の2番目以降の別名（配列の index）を参照する書き方を報告する。オブジェクトの反復の2番目（プロパティ名）も構文では区別できないので報告する。`items[i].id` のようにメンバーの計算プロパティとしてだけ使う参照は報告しない。HTML以外のテンプレート（`lang="pug"` など）は解析しないので何も報告しない | 不要 |

### 同梱ルールの追加

規約の検査に既存のルールが使えないとき、レビュー済みでテスト済みのルールをこのパッケージに同梱します。サーバーにはルールのIDとoptionsだけを保存し、コードは配布しません。同梱していないルールは、実装・テスト・レビュー・リリースを経るまで使えません（それまでは、その規約はAI照合のままです）。

1. `lib/lint-rules.ts` にルールを足し、`shinapsPlugin.rules` に登録します。IDは意味を変えずに使い続けます（規約の検査はIDで保存され、登録時の意味のレビューがその挙動を前提にするため）。意味が変わるなら別のIDにします。型情報を使うルールには `meta.docs.requiresTypeChecking: true` を付けます（付けないと型なしの実行単位に入り、その単位の検査が全て `not-run` になります）。
2. `test/lint.test.ts` に、ESLintの `RuleTester` で報告する例・しない例を書きます。規約の good・bad の例と、誤って報告しやすい形（同じ名前の別の変数など）を含めます。型情報を使わないルールは、型情報なしの `RuleTester` で動くことがそのまま確認になります。型情報を使うルールは、`languageOptions.parserOptions` に `projectService` を付けた `RuleTester` で試します。
3. この文書の「同梱ルール」の表に追加し、通常の変更と同じくレビュー・リリースします。
4. 規約に検査を付けるのはリリースの後です。規約の全文を読んで coverage を決めます（plugin の `references/lint.md`）。

実例: `shinaps/prefer-promise-with-resolvers`（`lib/lint-rules.ts`）。右辺の識別子をscopeで解決し、Promiseのexecutorの引数そのものかを確かめることで、内側の関数の同じ名前の引数を取り違えないようにしています。テストは `test/lint.test.ts` の末尾にあります。

## 依存

ESLint・typescript-eslint・TypeScript・vue-eslint-parser・eslint-plugin-vue・eslint-plugin-react-x・eslint-plugin-regexp を完全一致の版で依存に持ちます（パッケージの導入は約65MBになります）。外部プラグインの版を上げるときは、そのルールを使う公式規約の checks の coverage がルールの挙動を前提にしているので、規約の Good・Bad と見逃しの境界の例を同じ版で実行し直して確かめます。typescript-eslint は TypeScript 7 に対応していないため、TypeScript は6系です（開発用の `tsc` も同じ版を使います）。
