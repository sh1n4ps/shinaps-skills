---
name: linear-execute
description: 指定したIssue・Cycle・バックログの実装からQA・許可された公開まで進める。実行範囲と終了条件を依頼から確定し、プロジェクト設定に従って完了またはブロッカー到達まで継続する。相談やIssue整理だけの依頼はlinear-planを使う。
---

# Linearを起点に開発を進める

Issueの責務・受入条件・ステータスを、実際の成果と一致させる。初版は利用者本人の環境向けで、Codexが進行役として進行・Agent QA・Issueの記録・人への窓口を担当し、実装・修正・コミットはClaude Codeが行う（UIの微調整は[担当と工程](../../references/linear/workflow.md#codexによるuiの微調整)の境界の内側でCodexが行える）。Codexに実装の入口はない。主フローは着手・実装・差分確定・公開確認・結果報告の5工程で、担当と工程は[references/workflow.md](../../references/linear/workflow.md)にある。

## 経路を先に確定する

着手時に作業先設定の通常の `review_flow.mode` で経路を決め、Issueの途中で切り替えない（[経路](../../references/linear/configuration.md#経路)）。

- auto: [ローカルClaude CLI](../../references/linear/claude-cli.md)を起動し、質問への回答・修正・差分確定を同じsessionのresumeで依頼する。許可は `claude_cli` と、起動・resumeを `--permission-mode bypassPermissions` にする同意の `claude_cli_bypass_permissions`。
- manual: WebStorm内の対話Claude Codeセッションへ[Bridge](../../references/linear/bridge.md)で依頼する。人とClaudeの作業中は同じIssueへ指示を送らず（Claudeが依頼した途中確認への応答と、[UIの微調整](../../references/linear/workflow.md#codexによるuiの微調整)の人と調整したうえでの一時停止の依頼・返却を除く）、報告を待つ。QA合格後もcommitを依頼せず、QA結果と判定記録を渡して人の依頼によるcommitの報告を待つ。許可は `bridge_request`。
- ask: Claudeへ依頼する前に、Issueの作業内容と推奨する経路の理由を添えてautoかmanualかを人へ一問で確認し、回答まで着手しない。記録・再質問しない条件・許可は[経路](../../references/linear/configuration.md#経路)に従う。Claudeへの依頼には解決したmodeと回答の記録を添える。

体制判断の材料（受入条件・関連範囲・既存検証・リスク）を依頼に添える。体制は[担当と工程](../../references/linear/workflow.md)の着手で確認して依頼に書き、BASIC・ULTRAでは追加の担当をClaudeのメインが決めて報告する。

## 実行範囲を確定する

[実行範囲とゴール](../../references/linear/execution.md)を読み、Issue単体・Cycle全体・バックログ消化から依頼に合う範囲を確定する。依頼が明確なら聞き直さず、不明な場合だけ一問確認する。対象ID・順序・終了条件を記録してから実装を始める。

開発進行には作業先の明示された設定と `issue_update`、経路の許可が必要（[configuration.md](../../references/linear/configuration.md) の「許可」）。設定の許可・`stop_after` を超えない。Issue未作成の明示的な実装依頼は共通の紐づけ手順でIssueを作って続けられるが、仕様が未決なら `shinaps:linear-plan` へ整理を戻す。

実行には対象と終了条件を持つゴールの設定成功が必須。環境が明示許可を要求する場合は、既存の依頼で満たされるか確認し、なければ開始前に一度確認する。ゴール未設定のまま実装へ進まない。Claudeの作業・manualの人のレビュー・コミットの依頼・Human QA待ちは予定された工程として待機し、待ち方は[execution.md](../../references/linear/execution.md)の「待機の手順（進行役）」に従う。スキルの実行だけで予約実行・定期監視は開始しない。人への確認は会話で一問ずつ行う。

## 設定と補足を読む

- 設定の所在・読み方・補足との関係・不足時の止め方は、[references/configuration.md](../../references/linear/configuration.md) の「設定の読み方」に従う。
- 作業先の特定と作業先の設定による許可は、[execution.md](../../references/linear/execution.md) の「開始時に固定するもの」に従う。
- 依頼の実行に設定が必要で、[設定の読み方](../../references/linear/configuration.md#設定の読み方)で真に未設定と確認した場合だけ、同じセッションで `shinaps:linear-plan` の初期設定ヒアリングに進む。保存・確認後に元の依頼へ戻り、設定と既存の許可の範囲で再開する。設定不要のIssueの読み取り、整理案、明示依頼された更新はそのまま行う。

## 作業ごとに読む資料

| 作業 | 読む資料 |
| --- | --- |
| 設定の確認（初期設定・変更は `shinaps:linear-plan`） | [references/configuration.md](../../references/linear/configuration.md) |
| 着手前の紐づけ、Issueの作成・整理・本文の更新 | [references/issue.md](../../references/linear/issue.md) |
| 担当、工程、共通ルール、待ち状態、人への依頼、継続の範囲 | [references/workflow.md](../../references/linear/workflow.md) |
| auto経路の起動・観測・resume | [references/claude-cli.md](../../references/linear/claude-cli.md) |
| manual経路の宛先・依頼・報告 | [references/bridge.md](../../references/linear/bridge.md) |
| QAの実施・記録・素材 | [references/qa.md](../../references/linear/qa.md) |
| Cycle完了QA・報告 | [references/cycle-report.md](../../references/linear/cycle-report.md) |

コミットはClaudeへ差分確定を依頼して `shinaps:commit` で行い（manualは上の経路の項に従う）、Codexは各コミットの単位照合と全体照合を行う。pushとPRの作成は `shinaps:create-pr`、公開は `shinaps:release` に従い、このスキルで手順を持たない。これらのスキルには[共通設定](../../references/linear/configuration.md)の許可と前工程の結果を渡す。必要な条件が揃えば再確認せずに進み、個別スキルの完了だけで進行を終えず、[終了条件](../../references/linear/execution.md)まで継続する。
