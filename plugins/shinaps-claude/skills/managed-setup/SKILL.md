---
name: managed-setup
description: Claude Managed Agents の共通 dev 構成（lead・役割・skill・環境）を、利用者の1つ以上のアカウントへ一コマンドで導入・更新する。アカウントごとの lock を使い、同じリソースを重複して作らない。導入・更新の依頼があるときに使う。
---

## 作業記録の保存先

作業記録は現在の作業先の `.shinaps/work/` 以下へ保存する。初期化と保全は [作業記録の共通手順](../../references/work-records.md) に従う。

# Managed 構成を導入・更新する

[設定とアカウント](../../references/managed/configuration.md)と[導入・更新の手順](../../references/managed/setup.md)を読んで進める。操作は配布CLIの `managed setup` で行い、`ant apply` を手で実行しない。

- 前提: `ant` CLI 2.4.0 以上と、利用中の skill と同じ版の配布CLI。導入するアカウントの名前と、各アカウントのキーを利用者が環境変数に設定していること。キーを受け取らない・表示しない・記録しない。
- まず `--apply` 無しで計画を示し、利用者の合意を得てから同じアカウントで `--apply` を付けて適用する。`--apply` は計画を作り直してそのまま適用するので、その間に CLI の版・同梱の定義・lock を変えない。適用時の計画が合意と違えば報告する。
- lock が無いアカウントに同名のリソースがあれば止まる。lock を戻すまで適用しない。
- セッションの作成・予定実行は行わない。依頼と観測は managed-execute で扱う。
- lock から許可・予算を推定しない。
