# 担当の起動手順

[構成表](configurations.md)の担当割当で、O の担当は Claude Agent、A・S の担当は `codex exec` で起動する。どの起動手段でも、該当する担当指示（`roles/<役割>.md`）の全文と今回の入力（役割名・担当番号・ラウンド・今回の割当と担当数、工程が定める渡す情報）を渡す。起動・再開・交代の履歴、ID、指定値、開始・終了時刻は[実行記録](record.md)の担当表へ書く。

## Claude Agent

- Agent ツールで `subagent_type: "general-purpose"`、`model: "opus"`、`effort: "medium"` を毎回明示して起動する。Shinaps の登録エージェント（`shinaps:shinaps-*`）は使わない。
- プロンプトには担当指示の全文と今回の入力を含める。
- 並行して動かす担当はバックグラウンドで起動し、全担当の完了を待つ。
- 同じ役割の継続は、同じ ID へ SendMessage で再開する。ID は担当表に記録する。
- Agent の `model`・`effort` を指定できない環境では起動せず、その制約を報告する。Fable や他のモデルへ切り替えない。
- Claude の担当は sandbox を個別に持たず、親の実行権限で動く。

## codex exec

```sh
codex exec --sandbox <構成表の sandbox> -c approval_policy='"never"' \
  -m <model> -c model_reasoning_effort='"medium"' -c service_tier='"default"' \
  --json -o <report> - < <prompt> > <events>
```

- cwd は実行の作業環境（worktree またはクローン）のルートにする。
- sandbox は構成表に従う。実装担当は条件ファイルに記録した、親に許可された sandbox の範囲で起動し、他の担当は `read-only` で起動する。許可の範囲を超える sandbox を指定しない。
- 再開は `codex exec <同じフラグ> resume <thread_id> --json -o <report> - < <prompt> > <events>` で行う。起動時と同じモデル・推論・tier・sandbox を毎回明示する。同時に動いている別の担当を再開しないよう、`--last` は使わない。
- プロンプトは `raw/cli/` にファイルとして保存して標準入力で渡し、担当指示の全文と今回の入力を含める。本文をシェルのコマンド文字列へ展開しない。プロンプト・レポート・イベントログのパスは役割・担当番号・ラウンド・バッチごとに分ける。
- `thread.started` の `thread_id` を担当表に記録する。完了はプロセスの終了コード、`turn.completed`、空でない最終レポートの 3 つで判定し、`error` / `turn.failed` は未完了とする。担当の応答が完成したらプロセスは終了してよい。継続に使うのは thread_id と文脈である。
- 失敗時は他のモデル・Fable・個人用 alias へ切り替えない。部分出力を保存し、再試行は別のファイル名で行って前回を残す。ユーザーのグローバル設定を変更しない。起動の失敗を理由に権限を広げない。許可された権限で `codex exec` を実行できない場合は、担当を親自身で代行せず、制約を報告して止まる。

## Codex の親で使わない手段

登録済みのカスタムエージェント（`$CODEX_HOME/agents/shinaps-*.toml`）と `spawn_agent` は、制作工程の担当に使わない。`spawn_agent` でも `fork_turns:"none"` でモデル・推論は明示できるが、次の 4 点で構成間の条件を揃えられないためである。

- 子ごとに tier を指定できない（`spawn_agent` に tier の引数が無い）。
- 担当ごとに sandbox を指定できず、子は親の sandbox を引き継ぐ。独立担当を `read-only` で起動できない。
- 子の同時実行枠（親を含めて 4）があり、2体の設定の Phase 4 が順次になって、起動手段の制約で時間の比較が変わる。
- P1 の Codex 担当（Claude の親から `codex exec` で起動）と起動手段が揃わない。

このため、Codex ネイティブの子エージェントの使い勝手は比較の対象外である。
