---
name: linear-execute
description: Linearの開発で、Codexから受けた実装・修正・コミット依頼を実行する。作業先の設定の実装担当がManagedの入口なら、Claudeが進行役として実装からQA・許可された公開まで進める。それ以外の開発進行依頼はCodexへ引き渡す。相談・Issue整理はlinear-planを使う。
---

# Linearの開発でClaudeが行うこと

開発進行を依頼されたら、まず[設定の読み方](../../references/linear/configuration.md#設定の読み方)で作業先の設定を読み、`implementation_skill` で役割を決める。設定が真に未設定なら、下の「Codexの依頼なしで起動された場合」の初期設定へ進む。

- Claudeの入口（`dev-claude`）では、Codexが進行・Agent QA・人への窓口を担当する。ClaudeはAI Terminal Bridge（以下Bridge）の受け手として、技術調査と実装・修正を担当し、「読む資料」「依頼を受けて実行する」「結果と人の対応を報告する」に従う。担当を入れ替えない。
- Managedの入口（`dev-managed-cc`）の開発進行では、Claudeが進行役になり、「Managedの入口で進行する」にだけ従う。
- Codexの入口（`dev-codex`）では、開発進行をCodexへ引き渡す。

## 再確認せず進める条件

Codexから許可範囲と受入条件を伴う実装・修正の依頼をBridgeで受けたClaudeは、人へ着手を再確認せず、指定されたスキルで実行する。質問・相談・障害・完了はCodexへ返す。

人のレビュー・コミット完了の報告をBridgeで受けたCodexは、報告の対象とGitの状態を照合し、一致すれば既存の許可の範囲で人へ再確認せず次の工程へ進む。

条件の一覧と報告の項目は `../../references/linear/workflow.md` にある。

## 読む資料

依頼を受けたら、[references/workflow.md](../../references/linear/workflow.md) の「担当と窓口」「再確認せず進める条件」「Bridgeでの依頼と報告」を読む。依頼に添えられたプロジェクトの補足と参照先も読む。

他の資料は次の場合だけ読む: 依頼で指示された場合、Issue整理を依頼された場合（[references/issue.md](../../references/linear/issue.md)）、Codexの依頼なしで実作業を依頼された場合（[references/issue.md](../../references/linear/issue.md) の「着手前に作業をIssueへ紐づける」）、設定を読む必要がある場合（[references/configuration.md](../../references/linear/configuration.md) の「設定の読み方」）。

## 依頼を受けて実行する

- 依頼の範囲・受入条件・Gitの作業ディレクトリ・ブランチ・既存差分・許可範囲を確認する。
- Codexから依頼された実装・修正は、依頼の対象Issueに紐づく。Claudeは別のIssueを作らない。
- 実装・修正には、依頼で指定された入口（`shinaps:dev-claude`）を使う。指定と設定を照合し、欠落・不一致ならCodexへ確認してから進め、受信側で入口を変えない。devの入口は内部で簡素化・規約照合・レビューを行うので、これらを別に起動しない。入口を使えない場合は、独自の手順で代わりに実装せずCodexへ報告する。
- devの入口の委託（サブエージェント）は、依頼の許可範囲に `dev_delegation` が書かれている場合だけ使う。許可範囲に `dev_delegation` がない依頼では委託しない。worktreeの作成は含まない。
- devの入口が利用者に確認する場面（計画の判断、不明点、承認）では、人ではなくCodexへ相談する。Codexが既存の合意で答えた内容を人へ再確認しない。仕様・受入条件・許可範囲の変更が必要な場合は、Codexが人に確認する。
- QAで見つかった不具合の修正依頼も同じ扱いにし、人の着手許可を改めて取らない。
- 同じ作業ツリーをCodexや人と同時に編集しない。人や他のAIの変更を保持する。
- コミットの許可は[共通設定](../../references/linear/configuration.md)、担当とQA後の条件は[担当と工程](../../references/linear/workflow.md)の `code_review` に従う。実装完了の直後に先行してコミットせず、進行役へ結果を返す。条件を満たす依頼を受けたら `shinaps:commit` を使い、許可済みの操作を再確認しない。確認と承認の取り次ぎは同じ文書の「Bridgeでの依頼と報告」に従う。

## 結果と人の対応を報告する

- 完了の報告と、人のレビュー・コミット完了の報告に含める項目は、[references/workflow.md](../../references/linear/workflow.md) の「Bridgeでの依頼と報告」に従う。
- 人へ着手の確認やコミットの依頼をしない。人がClaudeへ直接伝えた指示や結果は保持し、Codexへ報告する。Gitにコミットがあるだけで、人のレビュー済みと報告しない。設定で人のレビューを省略した場合は、省略と報告する。

## Managedの入口で進行する

実行範囲、開始時に固定するもの、継続とゴールは [execution.md](../../references/linear/execution.md) に従う。必要な許可は [configuration.md](../../references/linear/configuration.md) の「許可」に従う。実装・修正は [managed-session.md](../../references/linear/managed-session.md) の手順でセッションへ依頼し、結果を受け取る。

- ゴール: 対象と終了条件を、会話から到達を確かめられる `/goal` の文で示す（例「SHINAPS-xxx が終了地点 <到達点> に達し、PRのURLとIssueとの相互リンクを報告した」）。ProposeGoalツールが使えればそれで提案し、その結果を確認とする。使えなければ `AskUserQuestion` で `/goal` の設定を依頼し、設定済みという回答を受けてから始める。Claude Codeではモデルからゴールの状態を読めないため、この回答を確認とする。設定されなければ、execution.mdの「ゴール機能」に従って開始前で止まる。
- 人への確認（人の判断が要る質問への回答、未完了の扱い、作業ツリーに差がある場合など）は、すべて `AskUserQuestion` でターンの中で受ける。確認のためにターンを終えて待たない。Claude Code では /goal が有効な間、ターンを終えると Stop hook がゴール未達と判定して作業が続き、利用者の回答を待てないため。
- セッションの完了待ち: backgroundのBashで、managed-session.mdの「観測と判定」の待ちを終える条件が現れるまで60秒ごとに確かめるuntilループを回し、終了の通知で再開する。`/goal` によって作業が続いても、動いているループがあれば二重に起動しない。

| 作業 | 読む資料 |
| --- | --- |
| 設定の確認 | [references/configuration.md](../../references/linear/configuration.md) |
| 着手前の紐づけ、Issueの作成・整理・本文の更新 | [references/issue.md](../../references/linear/issue.md) |
| 担当、工程、待ち状態、人への依頼、継続の範囲 | [references/workflow.md](../../references/linear/workflow.md) |
| Managedセッションの作成・観測・取り出し・適用とQAへの受け渡し | [references/managed-session.md](../../references/linear/managed-session.md) |
| QAの実施・記録・素材 | [references/qa.md](../../references/linear/qa.md) |
| Cycle完了QA・報告 | [references/cycle-report.md](../../references/linear/cycle-report.md) |

コミットは `shinaps:commit`、pushとPRの作成は `shinaps:create-pr`、公開は `shinaps:release` に従い、Claudeが自分で行う。これらのスキルには[共通設定](../../references/linear/configuration.md)の許可と前工程の結果を渡す。必要な条件が揃えば再確認せずに進み、個別スキルの完了だけで進行を終えず、[終了条件](../../references/linear/execution.md)まで続ける。

## Codexの依頼なしで起動された場合

相談・Issue整理・設定変更は `shinaps:linear-plan` を使う。実行範囲は [execution.md](../../references/linear/execution.md) に従って引き渡す。

- 利用者から直接依頼された実作業（開発進行の依頼を除く）は、着手前に [references/issue.md](../../references/linear/issue.md) の「着手前に作業をIssueへ紐づける」に従う。Issueの作成は利用者がその場で依頼した場合だけ行い、設定の `issue_update` を根拠にしない。
- 利用者から明示的にIssueの整理を依頼された場合は、[references/issue.md](../../references/linear/issue.md) に従って整理する。Issueの更新は、依頼で指定された範囲だけにする（設定の有無にかかわらない）。
- 開発進行（実装からQAを経て終了地点までの進行）を依頼された場合、設定の `implementation_skill` がManagedの入口なら「Managedの入口で進行する」に従う。それ以外の入口ではClaudeは進行役を兼ねない。[設定の読み方](../../references/linear/configuration.md#設定の読み方)で真に未設定と確認した場合だけ、同じセッションで `shinaps:linear-plan` の初期設定ヒアリングに進み、保存・確認後に元の依頼の引き渡しへ戻る。作業先リポジトリの設定で `bridge_request` が許可され、BridgeでCodexのセッションを特定できる場合は、[references/workflow.md](../../references/linear/workflow.md) の「開発進行の引き渡し」の項目を添えてCodexへ引き渡す。設定は [references/configuration.md](../../references/linear/configuration.md) の「設定の読み方」に従って読む。許可や相手のセッションがない場合は、必要な準備（設定、Codexセッションの起動、Bridgeの導入）を利用者へ案内する。

## 初期体制と途中の増員

[Issue開始時の実装体制](../../references/linear/execution.md#issue開始時の実装体制)と[体制の判断](../../references/dev/staffing.md)に従う。進行役は各Issueの初期体制を設計前に決めて渡し、実装側のメインは現物と照合して必要な担当を追加できる。Claudeが実装の受け手の場合も同じ基準を使い、変更理由と体制を進行役へ返す。Managedの進行役も初期体制をleadへ渡す。人数の固定された入口へ戻さず、必須検証と独立性を保つ。
