# サブエージェント

スキルが内部で起動する担当（サブエージェント）の一覧です。概要は [README](../README.md) を参照してください。

Claude 版は 14、Codex 版は 10 の担当を配布します。

| 担当 | 配布 | 役割 |
|---|---|---|
| `shinaps-explorer` | 両方 | コードベース探索、必読ファイル抽出 |
| `shinaps-investigator` | 両方 | `shinaps:explore` の現在の質問をコード・テスト・設定・履歴から調べ、確実性を分けて回答 |
| `shinaps-architect` | Claudeのみ | dev で独立設計担当を置く場合（ULTRA、または追加した BASIC）の独立設計。メインの案を見ずに、要件・制約・規約・引き継いだ成果物から別案を返す |
| `shinaps-plan-reviewer` | Claudeのみ | 計画レビュー (confidence 閾値 70) と計画の簡素化。体制に応じて1〜2名で独立に指摘・修正案・削減の提案を返す |
| `shinaps-reviewer` | 両方 | logic / design / security / performance / maintainability / rule 統合レビュー (confidence 閾値 80)。Claude の dev では、「可読性・慣習レビュー」「規約照合」「実装の簡素化」も同じ役割の種類として担う |
| `shinaps-review-validator` | 両方 | reviewer 指摘の実コード検証 (confirmed / false positive / partial / out-of-scope 分類) |
| `shinaps-simplifier` | Claudeのみ | `shinaps:simplify` の計画・実装の簡素化の提案。仕様・構造・処理の削減を読み取り専用で提案 |
| `shinaps-refine-agent` | 両方 | rule 照合 (ファイル現状全文と照合、Violation / Improvement / Question 分類 + changed / pre-existing 切り分け) |
| `shinaps-spec-writer` | 両方 | ヒアリング + 調査結果を spec.md 構造化 |
| `shinaps-tech-surveyor` | 両方 | 外部技術調査 (WebSearch + WebFetch で 3-5 候補比較) |
| `shinaps-survey-validator` | 両方 | tech-surveyor の出典を WebFetch で再確認 |
| `shinaps-debugger` | 両方 | 症状から根本原因の仮説立案 (コードトレース + WebSearch + GitHub Issue) |
| `shinaps-debug-validator` | 両方 | 仮説の実コード検証 (root-cause / contributing-factor / red-herring / needs-reproduction 分類) |
| `shinaps-split-reviewer` | Claudeのみ | `shinaps:commit` のmanualの分割案を「単位の diff だけで妥当性を判断できるか」で批判 + 修正版最終分割計画 (worktree は read-only) |

Claude 版は全エージェントが `opus / medium` で動きます。Codex 版はモデルを指定せず、親セッションの設定を引き継ぎます。調査・レビューの担当は読み取り専用を既定にしますが、親セッションの実行時設定が優先される場合もあるため、権限の強制境界としては扱いません。

