# ローカルClaude CLIによる実装

通常設定が `review_flow.mode: auto` のIssueと、`ask` で着手時にautoを選んだIssue（[経路](configuration.md#経路)）で、Codexが作業先でローカル `claude -p` を起動する。初回実装前に、正確なcheckout・branch・HEAD・既存差分、`claude_cli` と `claude_cli_bypass_permissions` の許可（または今回の明示依頼）、必須検証とそのツールチェーンの状態、依頼で許可・禁止する操作を確定する。必須検証は対象リポジトリの規約・CI・スクリプトから読み、ツールチェーンは実際のコマンド（例: `node --version`、依存の導入状態の確認）の結果で確かめる。確かめるのは依頼で実際に使うコマンドに限る。

パス例外はコミット単位のreview_flowを全体置換し、実装sessionを途中で切り替えない。manual単位が生じた場合は[経路](configuration.md#経路)に従う。

## 起動と観測

通常の `-p` は既存の設定・skills・plugins・Agentを読み込む。`--bare` やsafe-modeで省かない。メインのモデルは[経路](configuration.md#経路)のとおり、起動とすべてのresumeで `--model opus` を指定する。resumeで省くと既定のモデルで再開され得るため、毎回指定する。権限モードも同じ理由で、起動とすべてのresumeで `--permission-mode bypassPermissions` を指定する（下の「操作権限」）。effort・plugin構成は指定して上書きせず、利用者のCLI設定を保持する。Skill/Agentを技術的に呼べることと、その操作の権限が許可されることは別である。

依頼本文を作業記録のpromptファイルへ保存し、stdinで渡す。本文をshellへ展開しない。以下は絶対パスを今回の記録先に置き換え、コマンドのcwdを確定済みcheckoutへ指定して実行する例。毎回異なる出力名を使い、既存記録を上書きしない。

```sh
claude -p --model opus --output-format json --permission-mode bypassPermissions --permission-prompts none < /absolute/work/request.txt > /absolute/work/result.json 2> /absolute/work/stderr.log
```

途中経過が必要なら `--output-format stream-json --verbose` を使い、JSONLへ保存する。シェル実行ツールのprocess/session ID、開始時刻、cwd、Issue、出力パスを記録する。実行中は、実行ツールがprocessの終了を通知する場合はその通知を待つ。通知を受け取れるかは、利用時の実行ツールが実際に提供する機能で判断する。通知を受け取れない場合だけ、起動または前回の確認から5分おきに同じprocessの終了だけを確認する。この5分は確認の間隔で、進行役の1回の待機の長さ（[実行](execution.md) の「待機の手順（進行役）」）とは別に扱い、短い待機から戻るたびには確認しない。終了を待つ間は、stream-json・stderr・出力ファイルなどのログや途中成果を読まない。異常の根拠がある場合と利用者に依頼された場合だけ、必要な範囲で調べる。新しいCLIを並行起動せず、終了したら終了コードを取得して結果を会話へ返す。

jsonの `session_id`、`result`、`is_error`、`permission_denials` を読み、stream-jsonではsession初期化と最終resultを照合し、最終resultがない出力を完了と扱わない。session_idをIssueとcwdに紐づけてローカル作業記録に保持する。終了コード0だけで成功にせず、エラー・拒否・質問・成果を確認して実差分と検証結果を独立QAする。ID欠落、異常終了、出力欠落なら停止してprocessと記録を調べる。結果不明のまま新規セッションを起動したり同じ依頼を再送したりしない。

## 依頼・質問・修正・コミット

promptにはIssue、`shinaps:dev-claude`、成果物と受入条件、体制と体制判断の材料、exact cwd・branch・HEAD・既存差分、必須検証コマンドと確かめたツールチェーンの状態、許可・禁止操作、規約と参照先、返却条件を含める。通常設定が `ask` なら、解決したmodeと回答の記録も含め、Claudeが再質問しないようにする。依頼の体制で進め、BASIC・ULTRAでは追加の担当をClaudeのメインが材料と現物から決め、体制と理由をresultに含める。linear-executeを再起動せず、実装後は未コミット差分を返してLocal Agent QAを待つ。spec/explore/review/debugの結果も同じ依頼へ渡す。質問・障害は最終resultに返し、Codexが既存合意で回答できれば回答、目的・権限の判断が必要なら人へ一問ずつ取り次ぐ。[途中確認](qa.md#qaの時点対象最終qa)の依頼は、実行中の担当が無い時点でresultに返す。この依頼は完了報告ではなく、CodexはLocal Agent QAへ進めない。CLIからBridge送信や人の対話入力を待たせない。

回答・QA修正・QA後のautoコミット依頼は、元のprocess終了後、記録済みの正確なIDで同じセッションをresumeする。`--continue` で別セッションを推測しない。

```sh
claude -p --resume '<recorded-session-id>' --model opus --output-format json --permission-mode bypassPermissions --permission-prompts none < /absolute/work/follow-up.txt > /absolute/work/follow-up-result.json 2> /absolute/work/follow-up-stderr.log
```

resumeにも同じcwdと許可境界を指定し、外部で変化したHEAD・差分を渡す。commit依頼にはLocal Agent QA結果、独立レビュー、単位案と全差分、実効review_flowと合意根拠（askでは解決したmodeと回答の記録）を含める。完了報告は体制（必須担当の完了・未完了と合意による未実施を含む）と途中の増員、変更範囲、検証、未解決事項、単位案と予定差分、Local Agent QAの後に修正があった場合は変更記録（[qa.md](qa.md#qaの時点対象最終qa)）、commitした場合はSHA・単位照合・残差分・stash復元結果・修正サイクルで確定した変更を含める。復帰不能時は理由を報告し、黙って別sessionに作り直さない。

## 操作権限

`review_flow.mode: auto` はClaudeの `--permission-mode auto` を意味しない。非対話起動と同じsessionのresumeでは `--permission-mode bypassPermissions` を明示する。依頼で必要になる操作を個別のallowで事前に列挙しきれず、非対話では足りない許可を求められないまま作業が止まるためである。`--allowedTools` で個別の許可を足したり、dontAskなど別のモードで起動したりしない。`--permission-prompts none` は、bypassでも残る確認を入力待ちにせず拒否としてresultへ返すために付け、許可を付与しない。

bypassでの起動には、`claude_cli` に加えて利用者が明示的に同意した `claude_cli_bypass_permissions`（または今回の明示依頼）が必要で、`claude_cli` だけをbypassへの同意とみなさない。同意が無ければCodexは起動前に人へ一問で確認し、回答まで起動しない。回答は同じIssueの起動とすべてのresumeに引き継ぐ。同意が得られなければauto経路では起動せず、許可不足のブロッカー（[実行](execution.md)）として報告する。manual経路で進めるかは利用者が決め、その場合は[経路](configuration.md#経路)のとおり設定（通常設定がaskなら同じIssueの選択）を見直してから着手する。

bypassはCLIの権限チェックを省くだけで、操作の許可ではない。Claudeが行う操作は依頼の範囲と、[共通設定](configuration.md)の `permissions`・合意済みの `review_flow` に限る。stage・commitは、QA後の差分確定の依頼を受けたときだけ `shinaps:commit` に従って行う。push・公開・外部への送信・破壊的操作は、それぞれの許可と工程に従う。CLIで実行できることや会話上の許可を、依頼の範囲外の操作の許可とは扱わない。

permission_denialsがあれば操作と理由を報告し、拒否を隠すsilent retryをしない。bypassでも残る拒否（deny設定・保護されたパス・組織の設定など）は、同じ指定で再依頼しても解消しない。依頼の範囲内で別の手段を指示できる場合だけ同じsessionへ再依頼し、それ以外や新しい許可が必要な場合はCodexが人へ確認する。

CLI仕様の参照: [headless](https://code.claude.com/docs/en/headless)、[CLI reference](https://code.claude.com/docs/en/cli-reference)。利用版で必要なflagが非対応、またはbypassPermissionsが組織の設定などで無効なら、状態を報告して停止し、別の権限モードへ切り替えて進めない。
