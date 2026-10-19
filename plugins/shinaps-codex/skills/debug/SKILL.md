---
name: debug
description: 再現手順、コード、ログと必要な外部情報から不具合の根本原因を調べ、仮説を実際の証拠で検証する。
---

## 質問の実行経路（全工程に優先）

対話セッションでは利用可能な質問UIで一問ずつ回答を受ける。CodexからローカルClaude CLIで呼び出された場合、以下の `AskUserQuestion`・確認・回答待ちの指示はすべて、質問一問・判断に必要な情報・再開する工程を最終resultへ返してターンを終了する手順に読み替える。CLI内で `AskUserQuestion` を呼んだり人の入力を待ち続けたりしない。Codexが回答を取り次ぎ、同じsessionをresumeして指定の工程から再開する。回答が必要な作業を先に進めず、終了を完了と報告しない。単独commitのflow選択にも同じ規則を適用する。


# 原因調査

症状・期待する挙動・発生条件を依頼と既存情報から確定する。不足は一問ずつ確認する。プロジェクトの指示と過去の調査を読み、関係するコードとログを追う。再現が必要なら許可された環境を使い、本番データを変更しない。

仮説ごとに支持する証拠と反証を調べ、根本原因・寄与要因・否定済み・再現待ちを区別する。外部ライブラリが関係する場合だけ公式資料や既知のIssueを確認する。対症療法だけで根本原因が確定したと報告しない。

委託が許可され登録されている場合はshinaps-debuggerで仮説を立て、shinaps-debug-validatorで実コードを検証する。外部調査にはshinaps-tech-surveyorとshinaps-survey-validatorを必要に応じて使う。担当の起動・継続は[担当の起動](../../references/dev/launch.md)に従う。取得済みのShinapsルールは親が担当へ渡す。MCP不可ならルール照合未確認とする。

結論、証拠、再現状況、最小の修正方針と未確認を報告する。修正はClaude Codeが行い、Codexに実装の入口はない。Linear進行で修正まで依頼されている場合は `$shinaps:linear-execute` でClaudeへ依頼する。調査だけなら変更しない。

必要な記録は.shinaps/work/debug/へ保存し、[作業記録の共通手順](../../references/work-records.md)に従って初期化・保全する。秘密情報・既存記録の削除・外部投稿は含めない。

Linear進行への成果引き渡しでは、確定済みの経路を維持する。autoは同じ[Claude CLI](../../references/linear/claude-cli.md)のsessionのresultへ返す。manualは同じ対話セッションで続け、[Bridge](../../references/linear/bridge.md)で依頼元のCodexへ報告する。調査スキルから経路を切り替えない。
