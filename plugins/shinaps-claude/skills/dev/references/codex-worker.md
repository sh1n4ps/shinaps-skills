# Codex CLI 担当の起動と再開

Claude版 dev / review / simplify から使用する。Codexネイティブのエージェント定義は起動せず、依頼する役割とその指示をCLIのプロンプトに渡す。

| 役割 | セッションと渡す役割指示 |
|---|---|
| 独立設計 | 設計時に新規起動する。下記の設計条件を使う。追加の設計確認だけ同じIDを再開し、独立レビューへ流用しない |
| プランレビュー | 設計担当とは別の新規セッション。`../../../agents/shinaps-plan-reviewer.md` の本文（frontmatterのモデル指定は除く）と要件・計画・規約を渡す |
| 計画の簡素化 | 設計・プランレビュー担当とは別の新規セッション。`../../simplify/references/plan-simplification.md` の全文と目的・受入条件・計画・調査結果・規約を渡す |
| 独立コードレビュー | 各実装レビューラウンドで新規セッション。`../../../agents/shinaps-reviewer.md` の本文と確定計画・対象差分・実コード・検証結果・規約を渡す |
| simplify | 各ラウンドで新規セッション。`../../../agents/shinaps-simplifier.md` の本文と目的・契約・対象・規約を渡す |

参照するエージェント定義は本文だけを渡し、frontmatterのモデル指定は渡さない。同一ラウンドのバッチ継続は同じ担当IDを再開する。役割を跨いでセッションを使い回さず、今回の他担当の報告を独立レビューへ混入させない。修正計画は同じプランレビュー・計画簡素化担当へそれぞれ戻してよい。

## 起動と再開

対象repoのcwdで `codex exec --help` と `codex exec resume --help` を確認する。モデルは `gpt-6-astra`、effort は medium、service tier は default。個人用 `ggc` aliasやfast設定を使わず、毎回明示する。ユーザーのグローバル設定は変更しない。

メインが今回の要件・規約・担当範囲をプロンプトファイルに保存し、標準入力から渡す。本文をシェルコードへ展開しない。下の例は設計用。メインが今回の役割・ラウンド・バッチごとに固有の絶対パスへ置き換え、並行実行のプロンプト・レポート・イベントを分ける。`--json` は実行状態とセッションIDの取得、`-o` はレポート保存のために使う。

```sh
codex exec --sandbox read-only -c approval_policy='"never"' \
  -m gpt-6-astra -c model_reasoning_effort='"medium"' -c service_tier='"default"' \
  --json -o /absolute/task/raw/architect-codex.md - \
  < /absolute/task/codex-design-prompt.txt > /absolute/task/codex-design.events.jsonl
```

`thread.started` の `thread_id` を記録する。担当の応答が完成したらプロセスは終了してよい。保持するのはセッションIDと文脈であり、待機プロセスではない。バッチ継続などでは同じrepoのcwdで次のように再開する。以下は独立コードレビュー担当の追加バッチの例で、SESSION_IDには設計担当のIDを使わない。

```sh
codex exec --sandbox read-only -c approval_policy='"never"' \
  -m gpt-6-astra -c model_reasoning_effort='"medium"' -c service_tier='"default"' \
  resume SESSION_ID --json -o /absolute/task/raw/code-review-1-batch-2.md - \
  < /absolute/task/codex-review-prompt.txt > /absolute/task/codex-review.events.jsonl
```

同時実行中の別タスクを再開しないため `--last` は使わない。2回目のレビューは出力パスに `-2` を付け、前回のレポートを保持する。利用可能なバックグラウンド実行機構で起動し、メインがプロセス完了・終了コード・`turn.completed`・空でない最終レポートを確認する。途中の `error` / `turn.failed`、確認範囲の不足を完了扱いにしない。イベントログは失敗診断とID確認に用い、全文を architect に貼り付けない。

CLI・認証・指定モデル・必要な読み取りが利用不能なら失敗の根拠を返し、Fableや他モデルへ黙って切り替えない。失敗実行の部分出力は保存し、再試行・担当変更では前回を上書きしない。起動・再開が利用できない場合は制約を報告し、成功や独立確認を装わない。

## 共通の依頼条件

全役割を読み取り専用とし、編集・コミット・外部書き込み・追加委託・shinaps MCPの直接呼び出しは禁止する。必要なrule全文はメインが渡す。`AGENTS.md` / `CLAUDE.md` と今回の制約を参照させる。相手の今回の結果を読ませず、全担当の完了まで対象コード・計画を変更しない。

設計時は要件・調査結果・規約から一つの推奨案を作らせる。変更する責務・外部契約・データフロー・実装順・テストと、選択理由・不確実性を返させる。

独立コードレビューは計画を正しいと仮定せず、実コード・利用箇所・契約から不具合を確認する。計画と形式的に異なるだけでは不具合にしない。重要度・file:line・影響・根拠・修正案、確認済みと未確認の範囲を返させる。設計適合性はOpus architectの担当なので、設計したCodexをその役割で再開しない。
