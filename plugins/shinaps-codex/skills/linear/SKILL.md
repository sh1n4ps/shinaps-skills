---
name: linear
description: LinearのIssue・Cycleを起点に、Issue整理、開発の進行とAgent QA、AI Terminal Bridge経由のClaudeへの実装依頼、設定に従った人のレビューの確認または省略の記録、許可されたコミットの依頼と確認、設定した終了地点までの進行とCycle完了報告を行う。.shinaps/linear.yamlの初期設定・変更にも使う。
---

# Linearを起点に開発を進める

Issueの責務・受入条件・ステータスを、実際の成果と一致させる。初版は利用者本人の環境向けで、Codexが進行・Agent QA・人への窓口を担当し、ClaudeがAI Terminal Bridge（以下Bridge）経由の依頼で実装する。Codexが実装を代わりに行う運用や、担当の入れ替えは扱わない。

## 再確認せず進める条件

Codexから許可範囲と受入条件を伴う実装・修正の依頼をBridgeで受けたClaudeは、人へ着手を再確認せず、指定されたスキルで実行する。質問・相談・障害・完了はCodexへ返す。

人のレビュー・コミット完了の報告をBridgeで受けたCodexは、報告の対象とGitの状態を照合し、一致すれば既存の許可の範囲で人へ再確認せず次の工程へ進む。

条件の一覧と照合の項目は `references/workflow.md` にある。

## 依頼の種類と必要な条件

| 依頼 | 必要な条件 | 止まる地点 |
| --- | --- | --- |
| Issueを読む・整理案を示す | なし | 整理案の提示 |
| Issueを更新する | 設定の `issue_update`、またはその場の明示依頼 | 依頼された範囲 |
| 初期設定・設定変更 | 利用者との合意 | 合意した設定の保存。チーム設定の変更は別に確認する |
| Issue単位の開発進行 | 作業先リポジトリの設定（`issue_update`・`bridge_request` を含む）とBridge | 設定の `stop_after` |
| Cycle単位の継続 | 上記に加えて、Cycle全体を任す明示依頼 | 対象Issueがすべて終了地点に達するか、進められる作業がなくなる |
| Cycle完了報告 | 設定の `cycle_report` と、報告の明示依頼またはCycle全体の委任 | [references/cycle-report.md](references/cycle-report.md) の完了条件 |

開発進行を始めるときは、指定された対象（IssueまたはCycle）の完了までを一つのゴールとして設定し、通常の人の対応待ちで一時停止・完了にしない（[references/workflow.md](references/workflow.md) の「開発進行のゴール」「待ち状態」）。読み取り・整理だけの呼び出しではゴールを設定しない。スキルの実行だけでは、予約実行・定期監視を開始しない。

## 設定と補足を読む

- 設定の所在・読み方・補足との関係・不足時の止め方は、[references/configuration.md](references/configuration.md) の「設定の読み方」に従う。
- 作業先リポジトリは、Issue本文の「対象・範囲外」で特定する。ローカルの場所は、自分の作業ディレクトリ、`list_sessions` の `project_path`、利用者の指示から確認し、確定できなければ一問確認する。ローカルの絶対パスをIssueに書かない。
- 操作の許可は作業先リポジトリの設定で決める。同じLinear projectに属するだけでは、別のリポジトリの作業を現在の設定に含めない。作業先を特定できないIssueや、作業先に設定がないIssueでは、開発進行を始めない。
- 設定がない場合は、Issueの読み取り、整理案、明示依頼された更新だけを行い、初期設定を案内する。

## 作業ごとに読む資料

| 作業 | 読む資料 |
| --- | --- |
| 初期設定・設定変更 | [references/configuration.md](references/configuration.md) |
| Issueの作成・整理・本文の更新 | [references/issue.md](references/issue.md) |
| 担当、工程、待ち状態、Bridge、人への依頼、継続の範囲 | [references/workflow.md](references/workflow.md) |
| QAの実施・記録・素材 | [references/qa.md](references/qa.md) |
| Cycle完了QA・報告 | [references/cycle-report.md](references/cycle-report.md) |

コミットは `shinaps:commit`（Claudeへ依頼する）、pushとPRの作成は `shinaps:create-pr`、公開は `shinaps:release` に従い、このスキルで手順を持たない。これらのスキルには設定で許可された操作を継続的な許可として渡し、許可済みの操作を再確認しない。
