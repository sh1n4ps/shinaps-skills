---
name: review
description: 差分・PR・コミット範囲・既存コードをレビューする。LITE・BASIC・ULTRAの体制を開発時の体制と関係なく選べ、規約照合・可読性・慣習・実装の簡素化も同じ入口で扱う。「レビューして」「規約に合っているか確かめて」「簡素化できるか見て」と依頼されたとき、追加修正の後に確かめたいときに使う。指摘の検証と報告までを行い（確定した規約の適用結果は既定で記録し、依頼でOFFにできる）、修正は明示の依頼があるときだけClaude Codeの開発担当へ引き継ぐ。
---

## 質問の実行経路（全工程に優先）

対話セッションでは利用可能な質問UIで一問ずつ回答を受ける。CodexからローカルClaude CLIで呼び出された場合、以下の `AskUserQuestion`・確認・回答待ちの指示はすべて、質問一問・判断に必要な情報・再開する工程を最終resultへ返してターンを終了する手順に読み替える。CLI内で `AskUserQuestion` を呼んだり人の入力を待ち続けたりしない。Codexが回答を取り次ぎ、同じsessionをresumeして指定の工程から再開する。回答が必要な作業を先に進めず、終了を完了と報告しない。単独commitのflow選択にも同じ規則を適用する。

# レビュー

対象プロジェクトのAGENTS.md、既存設計、依頼範囲を確認する。[単独レビューの手順](../../references/review-standalone.md)と[レビューの共通契約](../../references/review.md)を先に読み、その順に進める。ここには Codex 固有の部分だけを書く。

## 担当の起動

契約の構成で登録済みのshinaps-reviewerを起動する。起動・継続は[担当の起動](../../references/dev/launch.md)に従い、委託の数や範囲をユーザーが制限した場合はそれに従う。委託できなければ担当を未完了とし、現在のセッションで同じ観点を確認した結果を独立レビューとは報告しない。

外部のAPI・ライブラリ・版の仕様が判断を左右するとき、または外部調査を依頼されたときは、shinaps-tech-surveyorに調査を依頼し、具体的な推奨を採る前にshinaps-survey-validatorで出典を確かめる。

## 修正の引き継ぎ

Codexに実装の入口はなく、修正はClaude Codeが行う。手順の「到達点」で修正へ進むときは、Codexがファイルを編集せず、次の経路でClaudeへ渡して進める。

- Linear進行では `$shinaps:linear-execute` の確定した経路で、採用した指摘と `findings.md` を渡す。
- Linear進行でなければ、[Claude CLI](../../references/linear/claude-cli.md)の「起動と観測」「操作権限」のとおり作業先でローカルの `claude -p` を起動する。promptには `shinaps:dev-claude`、指摘（`findings.md` のパスと本文）、固定した版、体制（選んでいれば）、exact cwd・branch・HEAD・既存差分、必須検証、依頼範囲と制約（今回の範囲限定を含む）、「修正と再レビューをして未コミットの差分を返す」という到達点、依頼にない commit・push・公開をしないことを書く。同じ文書のとおり、質問への回答と追加の修正は同じsessionのresumeで行う。
- 終了後はresultと実際の差分・再レビューの結果を確かめて報告する。CLIが無い、または必要な指定を使えないときは、その状態と渡す内容を報告して止まる。

Linear進行への成果引き渡しでは、確定済みの経路を維持する。autoは同じ[Claude CLI](../../references/linear/claude-cli.md)のsessionのresultへ返す。manualは同じ対話セッションで続け、[Bridge](../../references/linear/bridge.md)で依頼元のCodexへ報告する。調査スキルから経路を切り替えない。
