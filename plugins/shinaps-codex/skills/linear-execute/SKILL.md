---
name: linear-execute
description: 指定したIssue・Cycle・バックログの実装からQA・許可された公開まで進める。実行範囲と終了条件を依頼から確定し、プロジェクト設定に従って完了またはブロッカー到達まで継続する。相談やIssue整理だけの依頼はlinear-planを使う。
---

# Linearを起点に開発を進める

Issueの責務・受入条件・ステータスを、実際の成果と一致させる。初版は利用者本人の環境向けで、Codexが進行・Agent QA・人への窓口を担当する。実装担当は作業先リポジトリの設定の `implementation_skill` で決まる。Claudeの入口ではClaudeがAI Terminal Bridge（以下Bridge）経由の依頼で実装し、Codexの入口（`dev-codex`・`dev-codex-ultra`）ではIssueごとの別Codexタスクが `$shinaps:<入口>` で実装・QA指摘の修正を行う。Managedの入口（`dev-managed-cc`・`dev-managed-cc-ultra`）では、会話側のCodexが進行役のまま、IssueごとのClaude Managed Agentsセッションが実装する（[managed-session.md](../../references/linear/managed-session.md)）。担当の対応は[references/workflow.md](../../references/linear/workflow.md) の「担当と窓口」にある。設定と異なる担当への入れ替えは扱わない。

## 再確認せず進める条件

Codexから許可範囲と受入条件を伴う実装・修正の依頼をBridgeで受けたClaudeは、人へ着手を再確認せず、指定されたスキルで実行する。質問・相談・障害・完了はCodexへ返す。

人のレビュー・コミット完了の報告をBridgeで受けたCodexは、報告の対象とGitの状態を照合し、一致すれば既存の許可の範囲で人へ再確認せず次の工程へ進む。

条件の一覧と照合の項目は `../../references/linear/workflow.md` にある。

## 実行範囲を確定する

[実行範囲とゴール](../../references/linear/execution.md)を読み、Issue単体・Cycle全体・バックログ消化から依頼に合う範囲を確定する。依頼が明確なら聞き直さず、不明な場合だけ一問確認する。対象ID・順序・終了条件を記録してから実装を始める。

開発進行には作業先の明示された設定と `issue_update` が必要。入口ごとに必要な許可とツールは [configuration.md](../../references/linear/configuration.md) の「許可」に従う。設定の許可・`stop_after` を超えない。Issue未作成の明示的な実装依頼は共通の紐づけ手順でIssueを作って続けられるが、仕様が未決なら `shinaps:linear-plan` へ整理を戻す。

実行には対象と終了条件を持つゴールの設定成功が必須。環境が明示許可を要求する場合は、既存の依頼で満たされるか確認し、なければ開始前に一度確認する。ゴール未設定のまま実装へ進まない。人レビュー・Human QA待ちは予定された工程として待機する。スキルの実行だけで予約実行・定期監視は開始しない。Managedの入口では、セッションの完了を、シェルで[managed-session.md](../../references/linear/managed-session.md)の「観測と判定」の確認を60秒ごとに繰り返して待つ。これは進行中のIssueの観測であり、予約実行・定期監視には当たらない。人への確認は会話で一問ずつ行う。

## 設定と補足を読む

- 設定の所在・読み方・補足との関係・不足時の止め方は、[references/configuration.md](../../references/linear/configuration.md) の「設定の読み方」に従う。
- 作業先の特定と作業先の設定による許可は、[execution.md](../../references/linear/execution.md) の「開始時に固定するもの」に従う。
- 依頼の実行に設定が必要で、[設定の読み方](../../references/linear/configuration.md#設定の読み方)で真に未設定と確認した場合だけ、同じセッションで `shinaps:linear-plan` の初期設定ヒアリングに進む。保存・確認後に元の依頼へ戻り、設定と既存の許可の範囲で再開する。設定不要のIssueの読み取り、整理案、明示依頼された更新はそのまま行う。

## 作業ごとに読む資料

| 作業 | 読む資料 |
| --- | --- |
| 設定の確認（初期設定・変更は `shinaps:linear-plan`） | [references/configuration.md](../../references/linear/configuration.md) |
| 着手前の紐づけ、Issueの作成・整理・本文の更新 | [references/issue.md](../../references/linear/issue.md) |
| 担当、工程、待ち状態、Bridge、人への依頼、継続の範囲 | [references/workflow.md](../../references/linear/workflow.md) |
| Codex実装タスクの作成・再利用・依頼とQAへの受け渡し | [codex-task.md](../../references/linear/codex-task.md) |
| Managedセッションの作成・観測・取り出し・適用とQAへの受け渡し | [managed-session.md](../../references/linear/managed-session.md) |
| QAの実施・記録・素材 | [references/qa.md](../../references/linear/qa.md) |
| Cycle完了QA・報告 | [references/cycle-report.md](../../references/linear/cycle-report.md) |

コミットは `shinaps:commit`（Claudeの入口ではClaudeへ依頼し、Codexの入口では会話側がQA後に実装タスクへ依頼し、Managedの入口では会話側がQA後に自分で行う）、pushとPRの作成は `shinaps:create-pr`、公開は `shinaps:release` に従い、このスキルで手順を持たない。これらのスキルには[共通設定](../../references/linear/configuration.md)の許可と前工程の結果を渡す。必要な条件が揃えば再確認せずに進み、個別スキルの完了だけで進行を終えず、[終了条件](../../references/linear/execution.md)まで継続する。
