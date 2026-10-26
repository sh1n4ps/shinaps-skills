---
name: dev-claude
description: 選んだ体制（LITE・BASIC・ULTRA）で、メインが調査・設計・実装・検証・修正・指摘の採否を行い、体制に応じた担当が独立した別案（ULTRAでは必須）と計画・実装の独立レビューを行う。BASIC・ULTRAでは不確実性・影響範囲・失敗時の影響から担当を追加する（LITEは体制の変更を相談する）。コミットは許可に従い、Linear進行ではQAへ結果を返す。
---

# 作業に応じた体制で開発する

[体制の判断](../../references/dev/staffing.md)・[工程](../../references/dev/workflow.md)・[起動手順](../../references/dev/launch.md)を読む。メインが調査・設計・実装・検証・修正・指摘の採否を行い、選んだ体制の担当（独立設計・計画レビュー・実装後の独立レビュー）に、独立した別案と独立確認を依頼する。BASIC・ULTRAではlinear-executeから渡された材料と現物から、メインが関連コードを確認して設計前に追加の担当を決める。途中でも必要な役割・人数を追加する（BASIC・ULTRA。LITEは体制の変更を相談する）。

devの完了後に同じ会話・sessionで来る依頼も[工程](../../references/dev/workflow.md)の「役割と継続」に従って続ける。

依頼や成果物からタスクが確定していれば、形式的な引数の再入力を求めずPhase 1から進める。
