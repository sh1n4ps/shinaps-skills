# 構成表と担当割当

比較の構成（P1〜P7）ごとに、親の起動コマンド、各担当のモデルと起動手段を決める。工程・役割・担当指示・成果物・終了条件は全構成で同じで、[工程](workflow.md)に従う。担当の起動方法は[起動手順](launch.md)に従う。

この表が指定値の正本である。比較条件ファイルには、比較セットで使う構成の行をこの表の写しとして書き、実行権限を加える。

## 全構成で共通の指定

- 推論は medium。
- Fast なし。Claude は standard（Fast を有効にしない）、Codex は `service_tier="default"` を指定する。Fast の有無はモデルと別の比較条件で、P1〜P7 はすべて Fast なしに固定する。
- `gpt-6.1-sol` の既定の推論は low で、利用者のグローバル設定の service_tier が priority の場合があるため、親・子とも推論と tier を起動のたびに明示する。
- 実行権限はこの表で固定しない。比較条件ファイルに記録した「実施者が既に許可した実行権限」（例: Claude の `--permission-mode <mode>`、Codex の `--sandbox <mode> --ask-for-approval <policy>`）を親の起動コマンドに明示する。

## 観測手段の無い項目

次の項目は、各 CLI のローカル記録に実際の値が残らないため、指定値だけを記録する（実行記録の「指定のみ」）。どの構成でも同じ扱いで、比較記録に必ず併記する。

- Codex の service_tier（親・子）
- Claude の permission mode（親。子は親の権限で動く）

これ以外の指定（モデル・推論、Claude の service_tier、Codex の sandbox・承認）は観測値と照合する。

## 構成

| 構成 | 入口・担当数 | 親（新しいセッションの起動コマンド） | 子の基本モデル | 担当2 |
|---|---|---|---|---|
| P1 混成 | `dev-mixed`（2体固定） | `claude --model opus --effort medium <条件ファイルの Claude 実行権限>` | Opus | Codex `gpt-6-astra` |
| P2 | `dev-claude 1体` | 同上 | Opus | なし |
| P3 | `dev-claude 2体` | 同上 | Opus | Opus（別コンテキスト） |
| P4 | `dev-codex-astra 1体` | `codex -m gpt-6-astra -c model_reasoning_effort='"medium"' -c service_tier='"default"' <条件ファイルの Codex 実行権限>` | `gpt-6-astra` | なし |
| P5 | `dev-codex-astra 2体` | 同上 | `gpt-6-astra` | `gpt-6-astra`（別スレッド） |
| P6 | `dev-codex-sol 1体` | `codex -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -c service_tier='"default"' <条件ファイルの Codex 実行権限>` | `gpt-6.1-sol` | なし |
| P7 | `dev-codex-sol 2体` | 同上 | `gpt-6.1-sol` | `gpt-6.1-sol`（別スレッド） |

## 担当割当

O = Opus（Claude Agent）、A = `gpt-6-astra`（codex exec）、S = `gpt-6.1-sol`（codex exec）。担当数と継続／新規の規則は[工程](workflow.md#2-役割と継続の規則)の役割表に従う。「—/O」は 1体の設定ではなし、2体の設定では O を表す。

| Phase | 役割 | P1 | P2/P3 | P4/P5 | P6/P7 | Codex の sandbox |
|---|---|---|---|---|---|---|
| 2 | 探索 | O | O | A | S | read-only |
| 3 | 設計担当1（設計統合・プラン統合・設計適合性・指摘統合） | O | O | A | S | read-only |
| 3 | 設計担当2 | A | —/O | —/A | —/S | read-only |
| 4 | 計画レビュー担当1 | O | O | A | S | read-only |
| 4 | 計画レビュー担当2 | A | —/O | —/A | —/S | read-only |
| 4 | 計画簡素化担当1 | O | O | A | S | read-only |
| 4 | 計画簡素化担当2 | A | —/O | —/A | —/S | read-only |
| 4, 6 | 指摘検証（verifier） | O | O | A | S | read-only |
| 5, 7 | 実装 | O | O | A | S | 親に許可された sandbox（条件ファイル） |
| 6 | 設計適合性 | O | O | A | S | read-only |
| 6 | 独立コードレビュー | A | O | A | S | read-only |
| 6 | refine | O | O | A | S | read-only |
| 6 | 実装の簡素化 | A | O | A | S | read-only |

- P1 は eafbbc5 の Claude 版 `dev` の割当を再現し、担当1 を Opus、担当2 を Codex とする。ただし比較専用の担当指示を使い、review / refine / simplify スキルを経由しないので、現行 `dev` の実行結果そのものではない。
- 担当番号は起動前に固定する。
- Claude の担当は sandbox を個別に持たず親の権限で動き、Codex の担当は担当ごとに sandbox を持つ。この権限機構の差は同一とみなさず、条件ファイルと比較記録に書く。
- P4〜P7 の親は Codex だが、子はすべて `codex exec` で起動する。Codex の親で使わない手段は[起動手順](launch.md#codex-の親で使わない手段)に書く。

## 比較の組み合わせ

- 担当数の比較: P2/P3、P4/P5、P6/P7（同じモデル・同じ条件）。
- モデルの比較: P2/P4/P6 または P3/P5/P7（同じ担当数・同じ条件）。
- P1 は混成の割当を含む構成全体として評価する。
