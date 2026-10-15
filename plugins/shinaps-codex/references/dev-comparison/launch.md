# 担当の起動手順

[構成表](configurations.md)の担当割当と起動手段に従う。Claude の親（P1〜P3）は、O の担当を Claude Agent で、A の担当を `codex exec` で起動する。Codex の親（P4〜P7）は、A・S の担当を、比較専用の役割を指定した Codex のサブエージェントで起動する。

担当指示（`roles/<役割>.md`）は、Claude Agent と `codex exec` では依頼の本文に全文を入れて渡す。Codex のサブエージェントでは、担当指示から生成した比較専用の役割定義（`shinaps-comparison-<役割>`）で渡すので、依頼の本文には入れない。どの起動手段でも、今回の入力を依頼の本文で渡す。今回の入力は、役割名・担当番号・ラウンド・今回の割当と担当数、工程が定める渡す情報である。読む資料はパスで指定し、作業記録にある他の担当の成果物は、工程が渡すと定めたもの以外を読ませない。担当には、他のエージェントを起動しないこと、実装担当以外はファイルを変更しないことを伝える。起動・再開・交代の履歴、ID、指定値、開始・終了時刻は、[実行記録](record.md)の担当表へ書く。

## Claude Agent

- Agent ツールで `subagent_type: "general-purpose"`、`model: "opus"`、`effort: "medium"` を毎回明示して起動する。Shinaps の登録エージェント（`shinaps:shinaps-*`）は使わない。
- プロンプトには担当指示の全文と今回の入力を含める。
- 並行して動かす担当はバックグラウンドで起動し、全担当の完了を待つ。
- 同じ役割の継続は、同じ ID へ SendMessage で再開する。ID は担当表に記録する。
- Agent の `model`・`effort` を指定できない環境では起動せず、その制約を報告する。Fable や他のモデルへ切り替えない。
- Claude の担当は sandbox を個別に持たず、親の実行権限で動く。

## codex exec

Claude の親（P1）が Codex の担当を起動するときに使う。

```sh
codex exec --sandbox <構成表の sandbox> -c approval_policy='"never"' \
  -m <model> -c model_reasoning_effort='"medium"' -c service_tier='"default"' \
  --json -o <report> - < <prompt> > <events>
```

- cwd は実行の作業環境（worktree またはクローン）のルートにする。
- sandbox は構成表に従う。許可の範囲を超える sandbox を指定しない。
- 再開は `codex exec <同じフラグ> resume <thread_id> --json -o <report> - < <prompt> > <events>` で行う。起動時と同じモデル・推論・tier・sandbox を毎回明示する。同時に動いている別の担当を再開しないよう、`--last` は使わない。
- プロンプトは `raw/cli/` にファイルとして保存して標準入力で渡し、担当指示の全文と今回の入力を含める。本文をシェルのコマンド文字列へ展開しない。プロンプト・レポート・イベントログのパスは役割・担当番号・ラウンド・バッチごとに分ける。
- `thread.started` の `thread_id` を担当表に記録する。完了はプロセスの終了コード、`turn.completed`、空でない最終レポートの 3 つで判定し、`error` / `turn.failed` は未完了とする。担当の応答が完成したらプロセスは終了してよい。継続に使うのは thread_id と文脈である。
- 失敗時は他のモデル・Fable・個人用 alias へ切り替えない。部分出力を保存し、再試行は別のファイル名で行って前回を残す。ユーザーのグローバル設定を変更しない。起動の失敗を理由に権限を広げない。許可された権限で `codex exec` を実行できない場合は、担当を親自身で代行せず、制約を報告して止まる。

## Codex のサブエージェント

Codex の親（P4〜P7）が使う。`codex exec` は使わない。

- 起動は `spawn_agent` で行い、毎回 `agent_type: "shinaps-comparison-<役割>"`、`fork_turns: "none"`、`model: <構成表のモデル>`、`reasoning_effort: "medium"` を明示する。役割は `roles/` のファイル名（`architect`、`explorer`、`implementer`、`plan-reviewer`、`refine-agent`、`review-verifier`、`reviewer`、`simplifier`）である。設計担当1・2 は `architect`、計画・実装の簡素化は `simplifier` を使う。
- 比較専用の役割定義には model・推論を書かない。モデルと推論は、この指定で構成ごとに選ぶ。`fork_turns` を省略すると、親の履歴・モデル・推論を引き継いで上書きできず、独立した担当にもならない。
- 比較専用の役割以外の `agent_type`（通常の dev の `shinaps-architect` などを含む）は使わない。
- 実行で最初に起動した担当の完了後に、その子の rollout の `turn_context` のモデル・推論を指定と照合する。違えば不一致として記録し、報告して実行を止める（以後の担当も同じ仕組みで起動するので、照合は最初の 1 体で足りる。その実行は比較データにならないため、続けない。全担当の照合は Phase 9 の[実行記録](record.md)の手順で行う）。
- `task_name` は、実行の中で重複しない名前にする。起動時に一度だけ決め、継続（`followup_task`）では変えない。一意にするため、`p<起動した Phase>_<役割>_<担当番号>_r<ラウンド>` の形で作る。役割の `-` は `_` に置き換え、使う文字は英小文字・数字・`_` だけにする（例: `p4_plan_reviewer_2_r1`、`p6_review_verifier_1_r2`）。交代した担当は、末尾に `_s<交代の回数>` を付ける。担当表には、`agent_type`・`task_name`・返された ID を記録する。
- 渡した `message` の全文を `raw/agents/<task_name>-<n>.md`（n は、その担当への依頼の通し番号。起動が 1、継続ごとに 1 増える）に保存する。rollout には、`message` が暗号化されて残るためである。
- サブエージェントは、親と同じ作業ディレクトリで動き、sandbox・承認・tier を親から引き継ぐ（[構成表](configurations.md#環境の条件)）。読み取り専用の役割は、担当への指示で変更を禁止する。変更が無いことは、[工程](workflow.md)の作業ツリーの確認で確かめる。
- 同じ役割の継続には、同じ ID へ `followup_task` で依頼する。`send_message` は担当のターンを開始しないので、継続には使わない。工程に、実行中の担当へ補足を送る場面は無い。
- 完了は `wait_agent` で待つ。待つ時間は分単位にし、短い間隔で繰り返さない。完了は、担当の完了通知と、空でない最終回答で判定する。`wait_agent` の時間切れや、`followup_task` の受領だけでは完了としない。
- 同時実行の上限: Phase 1 で、親のセッションの開発者メッセージが示す枠の数（親を含む）を実行記録に書く。同時に実行中にする担当は、枠から 1 を引いた数までにする。工程が並行起動を求める担当がそれを超えるときは、役割表の順に枠の分だけ起動し、残りは実行中の担当が完了してから起動する（渡す情報と独立性は[工程](workflow.md)の規則のまま）。起動を待った担当は、待ち始めと起動の時刻を担当表に書く。
- 起動できない（実行中の担当が無いのに枠の不足で失敗する場合を含む）、または完了しない担当は、[工程](workflow.md)の「実行の制約」のとおり、その担当を未完了として記録し、工程の終了条件に従う。`codex exec`・ほかのモデル・モデルごとの役割定義へ切り替えず、親が代わりに作業せず、ユーザーのグローバル設定（同時実行の上限を含む）を変更しない。
