# 規約の機械検査（Shinaps lint）

Shinaps AIの規約は、機械検査（`checks`）を持てる。検査は配布CLI `shinaps-skills lint` が、プロジェクトのlint設定・script・依存を使わずに手元で実行する。プロジェクトの変更は要らない。対象のコード・差分・結果はサーバーへ送らない。CLIの入出力と同梱ルールの追加手順は、配布パッケージの `docs/lint.md` にある。

検査で照合を省いてよいのは、静的に保証できた組（規約×ファイル）だけ。未実行・対象外・エラー・一部だけの検査は合格にせず、AI照合に回す。

## 照合で使う

[Shinaps規約の取得](rules.md)で全文を取得した後、照合の担当へ渡す前に行う。

1. 全文の `checks` を持つ規約を、`{ "rules": [{ "id": "<規約id>", "checks": [<全文のchecksのまま>] }] }` の形で作業記録の下（例: `.shinaps/work/<作業>/lint-checks.json`）に書く。checksを書き換えない。持つ規約が無ければこの節を省く。
2. 対象ファイル（照合の対象として確定したもの。削除されたファイルを除く）を付けて1回実行する。

   ```sh
   shinaps-skills lint --checks <lint-checks.json> --root <リポジトリのルート> --out <lint-result.json> -- <対象ファイル...>
   ```

   コマンドが無い、終了コードが0でない、または結果を読めないときは、全ての規約をAI照合に回し、理由を報告する。CLIは利用中のスキルと同じ版を使う。
3. 結果の `pairs` は規約×ファイルの組ごとに状態を持つ。
   - `covered`: 全体を検査する検査（coverage `full`）が実行され、違反が無い。この組は担当の照合から外す。
   - `violation`: 全体を検査する検査が実行され、指摘がある（同じ規約の一部だけを検査する検査の指摘を含む）。照合から外し、`findings` を指摘にする。
   - `partial`: 一部だけを検査する検査だけが実行された。`findings` を指摘にし、規約はそのファイルの照合に残す（担当にはlintの指摘も渡す）。
   - `not-run`: 実行していない（対象外、この版に無いルール、ESLintが設定を拒否した、型が得られない、致命的な報告など）。照合に残し、`reason` を記録する。
4. lint由来の指摘は、根拠に規約idとルールID（`findings[].rule`）を付けて集約に入れる。誤報告がありうるので自動修正にせず、メインがその位置を読んで確認してから扱う。
5. 報告に、状態ごとの組の数、`not-run` の理由、`units[].error` を書く。照合から外した組を「AIが照合した」と書かない。

## 検査を登録・更新する

[Shinaps規約の書き方](rule-writing.md)で書き込む規約に、検査を付けられるかを判断する。

- **使えるルール**: ESLint core、`@typescript-eslint/*`（型情報を使うものを含む）、`vue/*`、`react-x/*` のうち `rules-of-hooks`・`exhaustive-deps`・`no-array-index-key`・`no-missing-key`・`no-nested-component-definitions`・`no-unstable-context-value`、`regexp/*`、同梱の `shinaps/*`（`docs/lint.md` の一覧）。版によって違うので、同じ版のCLIで確かめる。使えるルールが無い規約には検査を付けない（AI照合のまま）。同梱ルールの追加は `docs/lint.md` の手順で別の作業として提案する。
- **coverageの判断**: 規約の全文（scope・labelsを含み、更新では更新後の全文）と、検査の `rule`・`options`・`files` を照らす。`files` の範囲で、規約が求めることへの違反をこのルールが全て報告すると言えるときだけ `full`、見逃しが一つでもありうれば `partial`。lintが規約より広く報告する（例外も報告する）ことは `full` の妨げにならない（指摘はメインが確認する）。例で通ることは根拠にならない。Vueのテンプレートを見るルール（`vue/*` のテンプレート用、`shinaps/vue-no-index-key`）は、HTML以外のテンプレート（`lang="pug"` など）を解析せず報告なしで終わるので、それだけでは `.vue` を対象に `full` にできない。
- **補助の確認**: 規約のgood・badの例を一時ディレクトリにファイルとして書き、同じ入口で実行して、badで報告され、goodで報告されないことを確かめる。対象プロジェクトのコードを写さない。
- **書き込み**: `record_rule`・`update_rule` の `checks` に渡す。一括の `record_rules` は `checks` を受け取らない（付けると呼出し全体が入力エラーになる）ので、検査は登録後に `update_rule` で付ける。`update_rule` は配列ごと置換し、`[]` で外す。検査を持つ規約の内容（出典とrepoの表示名以外。適用先はscope、repo_ownerのowner、repoのrepoIdで比べる）を変える更新では、更新後の全文で検査を見直し、同じ要求で `checks` を渡す。渡さないと `CHECKS_REQUIRED` で保存されない。見直した結果が同じなら同じ配列を渡す。
