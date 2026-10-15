---
name: linear
description: Codexが進行するLinearの開発で、AI Terminal Bridge経由の実装・修正依頼を受けて実行し、結果、許可されたコミット、人のレビュー・コミット完了をCodexへ報告する。利用者から明示的に依頼されたIssue整理も行う。
---

# Linearの開発でClaudeが行うこと

初版では、Codexが進行・Agent QA・人への窓口を担当する。ClaudeはAI Terminal Bridge（以下Bridge）経由の依頼で、技術調査と実装・修正を担当する。担当を入れ替えない。

## 再確認せず進める条件

Codexから許可範囲と受入条件を伴う実装・修正の依頼をBridgeで受けたClaudeは、人へ着手を再確認せず、指定されたスキルで実行する。質問・相談・障害・完了はCodexへ返す。

人のレビュー・コミット完了の報告をBridgeで受けたCodexは、報告の対象とGitの状態を照合し、一致すれば既存の許可の範囲で人へ再確認せず次の工程へ進む。

条件の一覧と報告の項目は `references/workflow.md` にある。

## 読む資料

依頼を受けたら、[references/workflow.md](references/workflow.md) の「担当と窓口」「再確認せず進める条件」「Bridgeでの依頼と報告」を読む。依頼に添えられたプロジェクトの補足と参照先も読む。

他の資料は次の場合だけ読む: 依頼で指示された場合、Issue整理を依頼された場合（[references/issue.md](references/issue.md)）、設定を読む必要がある場合（[references/configuration.md](references/configuration.md) の「設定の読み方」）。

## 依頼を受けて実行する

- 依頼の範囲・受入条件・Gitの作業ディレクトリ・ブランチ・既存差分・許可範囲を確認する。
- 実装・修正には `shinaps:dev` を使う。`shinaps:dev` は内部で簡素化・規約照合・レビューを行うので、これらを別に起動しない。`shinaps:dev` を使えない場合は、独自の手順で代わりに実装せずCodexへ報告する。
- `shinaps:dev` の委託（サブエージェントや別のCLI）は、依頼の許可範囲に `dev_delegation` が書かれている場合だけ使う。許可範囲に `dev_delegation` がない依頼では委託しない。worktreeの作成は含まない。
- `shinaps:dev` が利用者に確認する場面（計画の判断、不明点、承認）では、人ではなくCodexへ相談する。Codexが既存の合意で答えた内容を人へ再確認しない。仕様・受入条件・許可範囲の変更が必要な場合は、Codexが人に確認する。
- QAで見つかった不具合の修正依頼も同じ扱いにし、人の着手許可を改めて取らない。
- 同じ作業ツリーをCodexや人と同時に編集しない。人や他のAIの変更を保持する。
- Claudeは次のいずれかの場合だけコミットする。
  - 利用者本人がその場で明示的に依頼した場合。
  - 作業先リポジトリの設定の `permissions` に `commit` と `stage` があり、CodexがLocal Agent QAの合格後にコミットを依頼した場合。
  - 設定に `document_only_changes: ai_commit` と `stage` があり、CodexがLocal Agent QAの合格後に文書だけの変更としてコミットを依頼した場合。

  後の2つでは、Claude自身が設定（[references/configuration.md](references/configuration.md) の「設定の読み方」）で必要なキーと許可を確認する。3つ目では、依頼された対象差分が、作業ツリー上の同じ対象（ファイルと内容）の差分と一致することも確認する（[references/workflow.md](references/workflow.md) の `code_review`）。実装完了の直後に先行してコミットしない。それ以外のCodexの依頼はコミットの許可にならない。コミットは `shinaps:commit` で行い、進め方は `commit_mode` か開始時の確認で決める。確認と承認の扱いは、[references/workflow.md](references/workflow.md) の「Bridgeでの依頼と報告」に従う。

## 結果と人の対応を報告する

- 完了の報告と、人のレビュー・コミット完了の報告に含める項目は、[references/workflow.md](references/workflow.md) の「Bridgeでの依頼と報告」に従う。
- 人へ着手の確認やコミットの依頼をしない。人がClaudeへ直接伝えた指示や結果は保持し、Codexへ報告する。Gitにコミットがあるだけで、人のレビュー済みと報告しない。設定で人のレビューを省略した場合は、省略と報告する。

## Codexの依頼なしで起動された場合

- 利用者から明示的にIssueの整理を依頼された場合は、[references/issue.md](references/issue.md) に従って整理する。Issueの更新は、依頼で指定された範囲だけにする（設定の有無にかかわらない）。
- 開発進行（実装からQAを経て終了地点までの進行）を依頼された場合、Claudeは進行役を兼ねない。作業先リポジトリの設定で `bridge_request` が許可され、BridgeでCodexのセッションを特定できる場合は、[references/workflow.md](references/workflow.md) の「開発進行の引き渡し」の項目を添えてCodexへ引き渡す。設定は [references/configuration.md](references/configuration.md) の「設定の読み方」に従って読む。許可や相手のセッションがない場合は、必要な準備（設定、Codexセッションの起動、Bridgeの導入）を利用者へ案内する。
