---
name: review
description: 差分・PR・コミット範囲・既存コードをレビューする。LITE・BASIC・ULTRAの体制を開発時の体制と関係なく選べ、規約照合・可読性・慣習・実装の簡素化も同じ入口で扱う。「レビューして」「規約に合っているか確かめて」「簡素化できるか見て」と依頼されたとき、追加修正の後に確かめたいときに使う。指摘の検証と報告までを行い（確定した規約の適用結果は既定で記録し、依頼でOFFにできる）、修正は明示の依頼があるときだけ開発の担当へ引き継ぐ。
argument-hint: "[<PR番号/URL> | <コミット/範囲> | <path>] [LITE|BASIC|ULTRA] [規約照合|簡素化 など種類の限定]"
---

## 質問の実行経路（全工程に優先）

対話セッションでは利用可能な質問UIで一問ずつ回答を受ける。CodexからローカルClaude CLIで呼び出された場合、以下の `AskUserQuestion`・確認・回答待ちの指示はすべて、質問一問・判断に必要な情報・再開する工程を最終resultへ返してターンを終了する手順に読み替える。CLI内で `AskUserQuestion` を呼んだり人の入力を待ち続けたりしない。Codexが回答を取り次ぎ、同じsessionをresumeして指定の工程から再開する。回答が必要な作業を先に進めず、終了を完了と報告しない。単独commitのflow選択にも同じ規則を適用する。

## 実行環境とプロジェクト条件

適用される `AGENTS.md`・`CLAUDE.md` と参照先、CI、既存スクリプトから今回の条件を読み、明示された依頼・制約を引き継ぐ（[依頼範囲と操作](../../references/request-scope.md)）。仕様に影響する不足だけ一問ずつ確認する。現在のセッションで提供されていないツールは仮定しない。

# レビュー

[単独レビューの手順](../../references/review-standalone.md)と[レビューの共通契約](../../references/review.md)を先に読み、その順に進める。ここには Claude Code 固有の部分だけを書く。

## 担当の起動

契約の構成で `shinaps-reviewer` を起動する。起動・継続・交代は[担当の起動](../../references/dev/launch.md)に従う。

外部のAPI・ライブラリ・版の仕様が判断を左右するとき、または外部調査を依頼されたときは、`shinaps-tech-surveyor` に調査を依頼し、具体的な推奨を採る前に `shinaps-survey-validator` で出典を確かめる。

## 修正の引き継ぎ

手順の「到達点」で修正へ進むときは、手順に挙げた項目を args に書いて `Skill(skill="shinaps:dev-claude", args="レビューの指摘を修正する。<手順の「到達点」の「修正」に挙げた項目>")` へ渡す。すでにdevの中で動いているセッションでは、同じ内容で修正サイクルに入る。

Linear進行への成果引き渡しでは、確定済みの経路を維持する。autoは同じ[Claude CLI](../../references/linear/claude-cli.md)のsessionのresultへ返す。manualは同じ対話セッションで続け、[Bridge](../../references/linear/bridge.md)で依頼元のCodexへ報告する。調査スキルから経路を切り替えない。
