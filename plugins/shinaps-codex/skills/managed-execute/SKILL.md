---
name: managed-execute
description: 作業先の Managed 設定を読み、Claude Managed Agents の lead へ dev を依頼し、観測・質問の取り次ぎ・成果物と draft PR の確認を行う。dev の工程自体は lead に任せる。依頼があるときに使う。
---

## 作業記録の保存先

作業記録は現在の作業先の `.shinaps/work/` 以下へ保存する。初期化と保全は [作業記録の共通手順](../../references/work-records.md) に従う。

# Managed Agents へ依頼する

[設定](../../references/managed/configuration.md)と[依頼と観測の手順](../../references/managed/execute.md)を読んで進める。

- 呼び出しのたびに base ブランチと SHA・head ブランチ・範囲と受入条件・許可・予算を利用者と合意する。設定・lock・過去の作業から推定しない。
- 設定から読むのは `definitions`（lock の場所）・`repository`・`vault_id` だけで、lead と環境の ID は lock から読む。lock が無ければ止め、導入は managed-setup で行う。
- 計画・実装・レビューの工程と体制は lead に任せ、ここでは指示しない。
- Linear の進行とは独立した入口である。merge・deploy・release・Issue の更新・セッションのアーカイブは行わない。
- 秘密値を表示・記録しない。
