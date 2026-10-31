---
name: managed-execute
description: Claude Managed Agents の lead へ、アカウントを選んで dev を依頼し、観測・質問の取り次ぎ・出力のローカル回収と draft PR の確認を行う。dev の工程自体は lead に任せる。依頼があるときに使う。
---

## 作業記録の保存先

作業記録は現在の作業先の `.shinaps/work/` 以下へ保存する。初期化と保全は [作業記録の共通手順](../../references/work-records.md) に従う。

# Managed Agents へ依頼する

[設定とアカウント](../../references/managed/configuration.md)と[依頼と観測の手順](../../references/managed/execute.md)を読んで進める。操作は配布CLIの `managed prepare`・`run`・`status`・`reply`・`collect`・`import` で行う。

- 呼び出しのたびにアカウント・base ブランチと SHA・head ブランチ・範囲と受入条件・体制（LITE・BASIC・ULTRA）・許可・予算を利用者と合意し、引数で明示する。設定・lock・過去の作業から推定しない。
- 設定（`.shinaps/managed.json`）が無いか旧版なら、手順の「設定を用意する」に従って一問ずつ確認して作る。設定から読むのは `repository` とアカウントの `vault_id` だけで、lead と環境の ID はアカウントの lock から読む。lock が無ければ止め、導入は managed-setup で行う。
- 計画・実装・レビューの工程と追加の担当は lead に任せ、ここでは指示しない。
- 回収した差分を既存の作業ツリーへ適用しない（importは新しいディレクトリにだけ復元する）。確認と統合の判断は利用者と行う。push・merge・deploy・release・Issue の更新・セッションのアーカイブは行わない。Linear の進行とは独立した入口である。
- キーと token は利用者が環境変数に設定する。受け取らない・表示しない・記録しない。

## Routerとローカルでの再開

利用者がClaude Account Routerとの連携を選んだ場合は、アプリ内CLIの `cloud managed` を使う。APIキーを読み出して会話へ返さない。作成結果のaccountとsession_idを保存し、後続操作でその組を使う。

未コミットのローカルコードを渡す依頼では、[ローカルコードの往復](../../references/managed/execute.md#routerとローカルコードの往復)に従ってprepareし、送信する一覧・内容を確認してからsnapshotを指定する。比較元はsnapshotのSHA。collect後、ローカルでの再開が許可されていればimportで新規checkoutへ復元し、差分と報告を確認してQAへ進む。元の作業ツリーには自動適用しない。
