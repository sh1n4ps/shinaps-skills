---
name: dev-managed-cc
description: Claude Managed Agents のセッションで、初回メッセージで受けた体制（LITE・BASIC・ULTRA）の担当で進め、BASIC・ULTRAでは作業に応じて追加の担当を決めて計画・実装・検証・独立レビューを進め、範囲を限ったコミット・push・draft PR で終える。
---

# Managed Agents で開発する

[体制の判断](references/staffing.md)・[工程](references/workflow.md)・[起動手順](references/launch.md)を読んで進める。初回メッセージの体制の担当で進め、BASIC・ULTRAでは lead が関連コードを確認して計画の前に追加の担当を決める。継続のターンでは初回の体制を引き継ぎ、利用者がメッセージに体制を書けばそれに従う。途中でも必要な役割・人数を追加する（BASIC・ULTRA。LITEで足りないときは `状態: 質問` で体制の変更を相談する）。

## 初回メッセージ

必須入力:

- リポジトリの URL とマウント先（例 `/workspace/<repo>`）
- base ブランチと、その比較元の SHA
- head ブランチ名
- 範囲と受入条件
- 体制（LITE・BASIC・ULTRA）
- 許可（commit・push・draft PR 作成のうち、明示されたものだけ）
- 予算

任意入力:

- 必須検証のコマンド。無ければリポジトリの規約・CI・既存スクリプトに従う
- コミットの author（`user.name`・`user.email`）
- 利用者 CLAUDE.md の添付（`/mnt/session/uploads/CLAUDE.md`）

必須入力が一つでも欠けていれば作業を始めず、欠落を列挙して `状態: 質問` でターンを終える。次の利用者メッセージで揃えば始める。許可は利用者のメッセージで明示された操作だけとし、構成の導入やリポジトリの設定から推定しない。

予算はセッション作成時の `max_list_cost` でだけ強制される。lead は消費額を観測できないので、追加の担当と再確認の回数を決める目安として扱う。

## 規約

規約はマウントしたリポジトリの `AGENTS.md`・`CLAUDE.md` とその参照先、添付された利用者 CLAUDE.md（添付時のみ）だけとする。Shinaps AI の rule は取得せず、未照合と報告する。リポジトリ側で人の承認を要する方針（例: `review_flow: manual`、ブランチ保護）は迂回せず、そこで止めて未完了で返す。

## 終了地点

範囲を限ったコミット → head ブランチへの push → draft PR の作成で終える。許可されていない操作はその手前で止め、行わなかった操作を最終報告に書く。merge・deploy・release・Issue の更新・`ant apply`・予定実行の登録・force push・base への push はしない。

## 最終報告

起動手順の状態行に続けて、次の項目を書く。

- 変更範囲
- コミット一覧
- push 先
- PR の URL
- 検証結果
- 独立レビューの結果と未解決の指摘
- 体制（必須担当の完了・未完了と、合意による未実施を含む）と、途中で変えた場合の理由
- 書き込み制限の比較で見つかった違い
- 未検証の事項
- Shinaps AI rule: 未照合
- Codex QA: セッション外で未実施
