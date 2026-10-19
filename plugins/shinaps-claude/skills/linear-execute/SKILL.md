---
name: linear-execute
description: Linearの開発で、Codexから受けた実装・修正・コミット依頼をClaude Codeで実行する。autoはローカルClaude CLI、manualはWebStormの対話セッションでBridgeの依頼を受ける。開発進行の依頼はCodexへ引き渡す。相談・Issue整理はlinear-planを使う。
---

# Linearの開発でClaudeが行うこと

Claudeは実装担当で、Codexが進行・Agent QA・Issueの記録・人への窓口を担当する。担当を入れ替えない。依頼を受けたら[設定の読み方](../../references/linear/configuration.md#設定の読み方)で作業先の設定を読み、依頼の経路と照合する。設定が真に未設定なら、下の「Codexの依頼なしで起動された場合」の初期設定へ進む。

## 経路

経路は着手時に通常設定の `review_flow.mode` で決まり、Issueの途中で切り替えない（[経路](../../references/linear/configuration.md#経路)）。

- auto: Codexが起動する[ローカルClaude CLI](../../references/linear/claude-cli.md)で依頼を受け、質問・障害・完了はresultへ返す。回答・修正・コミットの依頼は同じsessionのresumeで受ける。
- manual: WebStorm内の対話Claude Codeセッションで[Bridge](../../references/linear/bridge.md)の依頼を受ける。人と直接作業し、計画上の判断・仕様の不明点は人へ `AskUserQuestion` で一問ずつ確認する。完了・障害・人の承認とcommitの完了は、Bridgeで依頼元のCodexへ報告する。

## 読む資料

依頼を受けたら、[担当と工程](../../references/linear/workflow.md)の「担当と窓口」「工程とステータス」「失敗・許可・停止の共通ルール」と、経路の資料（[Claude CLI](../../references/linear/claude-cli.md) または [Bridge](../../references/linear/bridge.md)）を読む。依頼に添えられたプロジェクトの補足と参照先も読む。

他の資料は次の場合だけ読む: 依頼で指示された場合、Issue整理を依頼された場合（[references/issue.md](../../references/linear/issue.md)）、Codexの依頼なしで実作業を依頼された場合（[references/issue.md](../../references/linear/issue.md) の「着手前に作業をIssueへ紐づける」）、設定を読む必要がある場合（[references/configuration.md](../../references/linear/configuration.md) の「設定の読み方」）。

## 依頼を受けて実行する

- 依頼の範囲・受入条件・Gitの作業ディレクトリ・ブランチ・既存差分・許可範囲を確認する。Codexから許可範囲と受入条件を伴う依頼を受けたら、人へ着手を再確認せず実行する。
- Codexから依頼された実装・修正は、依頼の対象Issueに紐づく。Claudeは別のIssueを作らない。
- 実装・修正には `shinaps:dev-claude` を使う。devの入口は内部で簡素化・規約照合・レビューを行うので、これらを別に起動しない。入口を使えない場合は、独自の手順で代わりに実装せずCodexへ報告する。
- 初期体制は、Codexが渡した材料と現物から、Claudeのメインが[体制の判断](../../references/dev/staffing.md)に従って決めて報告する。途中の新しい根拠で必要な担当を増やし、変更理由と体制を報告する。人数の固定された入口へ戻さず、必須検証と独立性を保つ。
- devの入口の委託（サブエージェント）は、依頼の許可範囲に `dev_delegation` が書かれている場合だけ使う。worktreeの作成は含まない。
- QAで見つかった不具合の修正依頼も同じ扱いにし、人の着手許可を改めて取らない。
- 同じ作業ツリーをCodexや人と同時に編集しない。人や他のAIの変更を保持する。
- コミットの許可は[共通設定](../../references/linear/configuration.md)、担当とQA後の条件は[担当と工程](../../references/linear/workflow.md)の差分確定に従う。実装完了の直後に先行してコミットせず、Codexへ結果を返す。差分確定の依頼を受けたら `shinaps:commit` を使い、許可済みの操作を再確認しない。

## 結果と人の対応を報告する

- 完了の報告と、人の承認・commit完了の報告に含める項目は、経路の資料に従う。
- 人がClaudeへ直接伝えた指示・決定・承認は保持し、Codexへ報告する。Gitにコミットがあるだけで、人の承認済みと報告しない。設定で人のレビューを省略した単位は、省略と報告する。

## Codexの依頼なしで起動された場合

相談・Issue整理・設定変更は `shinaps:linear-plan` を使う。実行範囲は [execution.md](../../references/linear/execution.md) に従って引き渡す。

- 利用者から直接依頼された実作業（開発進行の依頼を除く）は、着手前に [references/issue.md](../../references/linear/issue.md) の「着手前に作業をIssueへ紐づける」に従う。Issueの作成は利用者がその場で依頼した場合だけ行い、設定の `issue_update` を根拠にしない。
- 利用者から明示的にIssueの整理を依頼された場合は、[references/issue.md](../../references/linear/issue.md) に従って整理する。Issueの更新は、依頼で指定された範囲だけにする（設定の有無にかかわらない）。
- 開発進行（実装からQAを経て終了地点までの進行）を依頼された場合、Claudeは進行役を兼ねない。設定は [references/configuration.md](../../references/linear/configuration.md) の「設定の読み方」に従って読み、真に未設定と確認した場合だけ、同じセッションで `shinaps:linear-plan` の初期設定ヒアリングに進み、保存・確認後に元の依頼の引き渡しへ戻る。`bridge_request` が許可され、BridgeでCodexのセッションを特定できる場合は、[Bridge](../../references/linear/bridge.md) の「開発進行の引き渡し」の項目を添えてCodexへ引き渡す。許可や相手のセッションがない場合は、必要な準備（設定、Codexのセッション）を利用者へ案内する。
