# ローカルClaude CLIによる実装

通常設定が `review_flow.mode: auto` のIssue（[経路](configuration.md#経路)）で、Codexが作業先でローカル `claude -p` を起動する。初回実装前に、正確なcheckout・branch・HEAD・既存差分、`claude_cli` の許可（または今回の明示依頼）、必須検証とそのツールチェーンの状態、依頼で使うコマンドの許可を確定する。必須検証は対象リポジトリの規約・CI・スクリプトから読み、ツールチェーンは実際のコマンド（例: `node --version`、依存の導入状態の確認）の結果で確かめる。確かめるのは依頼で実際に使うコマンドに限る。

パス例外はコミット単位のreview_flowを全体置換し、実装sessionを途中で切り替えない。manual単位が生じた場合は[経路](configuration.md#経路)に従う。

## 起動と観測

通常の `-p` は既存の設定・skills・plugins・Agentを読み込む。`--bare` やsafe-modeで省かない。model・effort・plugin構成を指定して上書きせず、利用者のCLI設定を保持する。Skill/Agentを技術的に呼べることと、その操作の権限が許可されることは別である。

依頼本文を作業記録のpromptファイルへ保存し、stdinで渡す。本文をshellへ展開しない。以下は絶対パスを今回の記録先に置き換え、コマンドのcwdを確定済みcheckoutへ指定して実行する例。毎回異なる出力名を使い、既存記録を上書きしない。必要なSkill/Agent・Read/Edit・検証コマンド等の `--allowedTools` は依頼の許可と範囲から個別に追加する。たとえばcommit段階の `Bash(git add <対象パス>)` と `Bash(git commit -m <確定メッセージ>)` は実際の引数に限定し、初回実装にはcommit権限を渡さない。広範な既存allow設定がある場合も対象外操作の許可とは扱わない。

```sh
claude -p --output-format json --permission-mode dontAsk --permission-prompts none < /absolute/work/request.txt > /absolute/work/result.json 2> /absolute/work/stderr.log
```

途中経過が必要なら `--output-format stream-json --verbose` を使い、JSONLへ保存する。シェル実行ツールのprocess/session ID、開始時刻、cwd、Issue、出力パスを記録する。実行中は同じprocessを短い待機（最大60秒）で観測し、終了コードを取得する。新しいCLIを並行起動せず、進捗を会話へ返す。stream-jsonはイベントを読み、最終resultがない途中出力を完了と扱わない。

jsonの `session_id`、`result`、`is_error`、`permission_denials` を読み、stream-jsonではsession初期化と最終resultを照合する。session_idをIssueとcwdに紐づけてローカル作業記録に保持する。終了コード0だけで成功にせず、エラー・拒否・質問・成果を確認して実差分と検証結果を独立QAする。ID欠落、異常終了、出力欠落なら停止してprocessと記録を調べる。結果不明のまま新規セッションを起動したり同じ依頼を再送したりしない。

## 依頼・質問・修正・コミット

promptにはIssue、`shinaps:dev-claude`、成果物と受入条件、体制判断の材料、exact cwd・branch・HEAD・既存差分、必須検証コマンドと確かめたツールチェーンの状態、許可・禁止操作と起動時に渡す `--allowedTools` の個別エントリ、規約と参照先、返却条件を含める。初期体制はClaudeのメインが材料と現物から決め、体制と理由をresultに含める。linear-executeを再起動せず、実装後は未コミット差分を返してLocal Agent QAを待つ。spec/explore/review/debugの結果も同じ依頼へ渡す。質問・障害は最終resultに返し、Codexが既存合意で回答できれば回答、目的・権限の判断が必要なら人へ一問ずつ取り次ぐ。CLIからBridge送信や人の対話入力を待たせない。

回答・QA修正・QA後のautoコミット依頼は、元のprocess終了後、記録済みの正確なIDで同じセッションをresumeする。`--continue` で別セッションを推測しない。

```sh
claude -p --resume '<recorded-session-id>' --output-format json --permission-mode dontAsk --permission-prompts none < /absolute/work/follow-up.txt > /absolute/work/follow-up-result.json 2> /absolute/work/follow-up-stderr.log
```

resumeにも同じcwdと許可境界を指定し、外部で変化したHEAD・差分を渡す。commit依頼にはLocal Agent QA結果、独立レビュー、単位案と全差分、実効review_flowと合意根拠を含める。完了報告は体制と途中の増員、変更範囲、検証、未解決事項、単位案、commitした場合はSHA・単位照合・残差分・stash復元結果を含める。復帰不能時は理由を報告し、黙って別sessionに作り直さない。

## 操作権限

`review_flow.mode: auto` はClaudeの `--permission-mode auto` を意味しない。非対話起動では `--permission-mode dontAsk` を明示し、既存設定がbypassでも継承しない。model・effort・pluginsは保持し、操作許可は既存の個別allow設定と今回の範囲に限定する。`--permission-prompts none` は対話できないpromptを拒否として返すためであり、許可を付与しない。permission_denialsがあれば操作と必要な権限を報告し、既存の明示許可が対象を満たすか確認する。満たす場合だけ必要なSkill/Agentや対象を限定した `--allowedTools` を明示し、同じsessionへ明示的に再依頼する。新しい権限が必要ならCodexが人へ確認する。`--allowedTools` を使う場合も対象・操作に限定し、無条件の `Bash(*)`、bypassPermissions、dangerously-skip-permissionsを使わない。拒否を隠すsilent retryをしない。会話上の許可はCLIの権限チェックを消さない。

CLI仕様の参照: [headless](https://code.claude.com/docs/en/headless)、[CLI reference](https://code.claude.com/docs/en/cli-reference)。利用版で必要なflagが非対応なら状態を報告して停止し、権限回避へ切り替えない。
