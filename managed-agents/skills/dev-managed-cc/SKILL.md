---
name: dev-managed-cc
description: 実装の不確実性・影響範囲・失敗時の影響から必要な担当と人数を決め、計画・実装・検証・独立レビューを進める。途中の新しい根拠で体制を追加する。コミットは許可に従い、Linear進行ではQAへ結果を返す。
---

# 作業に応じた体制で開発する

[体制の判断](references/dev/staffing.md)・[工程](references/dev/workflow.md)・[起動手順](references/dev/launch.md)を読む。人数を入口名で固定しない。linear-executeから渡された初期体制を引き継ぎ、なければメインが関連コードを確認して設計前に決める。途中でも必要な役割・人数を追加する。

依頼や成果物からタスクが確定していれば、形式的な引数の再入力を求めずPhase 1から進める。
