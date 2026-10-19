---
name: managed-setup
description: Claude Managed Agents の共通 dev 構成（lead・役割・skill・環境）を自分の組織へ導入・更新する。既存の lock を使い、同じリソースを重複して作らない。導入・更新の依頼があるときに使う。
---

## 作業記録の保存先

作業記録は現在の作業先の `.shinaps/work/` 以下へ保存する。初期化と保全は [作業記録の共通手順](../../references/work-records.md) に従う。

# Managed 構成を導入・更新する

[設定](../../references/managed/configuration.md)と[導入・更新の手順](../../references/managed/setup.md)を読んで進める。共通定義はこのスキルを含む plugin の `managed-agents/` にある。

- 前提: `ant` CLI 1.30 以上、利用者本人による `ant auth login`、作業先の `.shinaps/managed.json`。設定が無ければ一問ずつ確認して作る。
- 適用は dry-run の計画を利用者に示し、合意を得てから行う。同じ計画の適用を明示的に許可されていれば `--yes` で進め、同じ範囲の承認を繰り返さない。`--prune`・`--force` は使わない。
- 既存の `<definitions>` を置き換える前にテンプレートとの差分を示し、利用者の変更を黙って失わせない。
- lock が無い状態で既存のリソースへ適用しない。lock を失った場合は戻すまで止める。
- セッションの作成・予定実行は行わない。依頼と観測は managed-execute で扱う。
- 設定と lock から許可・予算を推定しない。秘密値を表示・記録しない。
