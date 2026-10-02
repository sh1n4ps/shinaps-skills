# shinaps-skills

shinaps-ai と統合した開発 workflow skill 集。Claude Code plugin として配布。

**Overview**: plugin 名は `shinaps` (skill レジストリでの namespace prefix)、shinaps-ai MCP server 名は `shinaps-ai`。同じ ecosystem 内で 2 表記が並ぶが、レイヤーが違う (plugin/skill と MCP server) のでプレフィックスの意味論も別と割り切って良い。

## 設計の核

- **rule 照合 + ローカル成果物への判断記録 + セルフレビューが workflow に bake**: AI の instruction 遵守度に依存しない
- **EnterPlanMode は一切使わない**: bypassPermissions モード (リモート実行など) でも全フェーズが走り切る
- **不明な論点は必ず AskUserQuestion で確認**: 「わからないまま自動進行」より「ユーザーに聞く」を優先
- **実装前の理解は人間主導で深める**: `explore` は 1 回の診断で打ち切らず、人間が納得するまで質問 → 調査 → 根拠付き回答を繰り返す
- **subagent は shinaps MCP を叩かない**: rule 全文は Skill 側から prompt 経由で渡す (credit 最適化)
- **実装はメインスレッドが担う**: 計画 / レビューフェーズの subagent 委譲は維持しつつ、実装フェーズは explorer / architect / plan-review で築いた文脈を活かしてメインが直接 Edit/Write

## Prerequisites

事前に **shinaps-ai MCP server** を Claude Code / Codex CLI の `.mcp.json` に登録すること。skill 群は shinaps-ai server の tool を呼び出す前提で書かれており、未登録だと呼び出しが失敗する。

`.mcp.json` の例:

```json
{
  "mcpServers": {
    "shinaps-ai": {
      "type": "http",
      "url": "https://app.shinaps.ai/mcp"
    },
    "shinaps-ai-local": {
      "type": "http",
      "url": "http://localhost:5173/mcp"
    }
  }
}
```

認証は shinaps-ai 側の OAuth 2.1 (memory:read / memory:write scope)。初回接続時にブラウザで認可を求められる。

## Install (Claude Code, 主線)

```
/plugin marketplace add sh1n4ps/shinaps-skills
/plugin install shinaps@shinaps-skills
```

`marketplace add` は repo 内の `.claude-plugin/marketplace.json` を読み、そこに列挙された plugin 一覧をレジストリに登録する。`install shinaps@shinaps-skills` は「marketplace `shinaps-skills` から plugin `shinaps` を入れる」の意味。Install 後、Skill レジストリに以下 8 skill が登録される:

- `/shinaps:explore` — 人間が納得するまで質問を重ねる read-only 対話調査
- `/shinaps:spec` — 対話ヒアリング + フィジビリ調査で仕様を詰める
- `/shinaps:dev` — 計画策定 + 実装 + セルフレビュー一気通貫
- `/shinaps:review` — 差分 / PR / パス指定の単独レビュー
- `/shinaps:debug` — 根本原因調査
- `/shinaps:refine` — セルフレビュー直前の並列 rule 照合 (対象ファイルの現状全文を照合)
- `/shinaps:extract-rules` — 過去 PR review から userRules 一括生成
- `/shinaps:commit` — 差分をレビュー単位に分割 (区切り方は shinaps-split-reviewer が判定) し、単位ごとに人間レビュー + 単独検証を回して段階コミット

user が直接叩くことも、AI が description matching で自動発火することもできる。

## Install (Codex CLI, best-effort)

```bash
npx skills add sh1n4ps/shinaps-skills -a codex -g
```

**注意 (Codex CLI の非対称性)**:

- Codex CLI では `shinaps:` namespace prefix は付与されず、`explore` / `dev` / `spec` / `review` / `debug` / `refine` などの平名で登録される可能性が高い (Codex 側の namespace 概念は非公式)
- 既存の同名 skill と衝突する可能性がある — 衝突時は user 側で個別 skill を rename すること
- skills.sh CLI は Codex global を `~/.codex/skills/` に書き込むが、Codex 公式 docs は `~/.agents/skills/` を示している (path 不整合の実測は環境依存)
- SKILL.md 本文の `${CLAUDE_SKILL_DIR}` などの Claude Code 固有 syntax は使わず portable に書いてあるので、Codex 側でも読み進められる想定

## Skills (詳細)

### Workflow skills (5)

| Skill | 用途 |
|---|---|
| `shinaps:explore` | バグか未確定の違和感、既存挙動、実装方針や影響範囲を、人間の質問ごとに read-only 調査。コード・テスト・設定・履歴の根拠を `confirmed / inference / unknown` に分け、納得するまでラウンド数無制限で続ける。合意した変更は `exploration.md` から `shinaps:dev` へ橋渡し可能 |
| `shinaps:spec` | ざっくり要望をヒアリング → 既存実装調査 (shinaps-explorer) → フィジビリ調査 (shinaps-tech-surveyor + shinaps-survey-validator) → 必要ならプロトタイプ → 構造化 spec.md 作成。そのまま `shinaps:dev` に橋渡し可能 |
| `shinaps:dev` | 計画策定 (shinaps-architect) → plan-review (shinaps-plan-reviewer) → メインスレッドが直接実装 → セルフレビュー + refine 並列 (shinaps-reviewer + `Skill(shinaps:refine)`) → Critical 自動修正 → ユーザー承認の上 `shinaps:commit` へ handoff、まで一気通貫 |
| `shinaps:review` | 差分 (branch) / PR / パスの単独レビュー。shinaps-reviewer + shinaps-tech-surveyor を並列起動 → shinaps-review-validator で妥当性検証。確定指摘は `shinaps:dev` へ橋渡し可能、PR モードでは PR コメント投稿も可 |
| `shinaps:debug` | 症状から根本原因を追跡 (shinaps-debugger) → 実コード検証で分類 (shinaps-debug-validator) → 必要なら外部情報深掘り (shinaps-tech-surveyor + shinaps-survey-validator) → 修正実装は `shinaps:dev` へ橋渡し可能 |

### Support skills (3)

| Skill | 用途 |
|---|---|
| `shinaps:extract-rules` | 過去 PR のレビューコメントから userRules を bulk 生成。新規リポジトリ着手時や userRules が空 / 少ないとき (5 件未満) に提案・起動 |
| `shinaps:refine` | rule 照合を並列 subagent で行う共通スキル。**対象ファイルの現状全文** を rule と照合する (diff の hunk だけではファイル全体の規約適合を判断できないため)。対象ファイルは path 指定 / `git diff --name-only HEAD` / PR / commit range から決まる。今回の変更箇所 (`changed`) の自明な違反は Edit で自動適用、既存箇所 (`pre-existing`) と判断要は 4 択 AskUserQuestion |
| `shinaps:commit` | working tree の差分を「コミットメッセージ一言で説明できる範囲」のレビュー単位に分割し、分割案は `shinaps-split-reviewer` が「各単位の diff だけで妥当性を判断できるか」を批判的にレビューして修正版最終計画を返すため、区切り方を人間に確認しない (人間の判断は単位ごとのコミット可否のみ)。サイクルごとに「次の単位以外を stash へ退避 → 単位だけの worktree で単独検証 → 人間レビュー → 修正ループ → コミット → stash を全部 pop で戻してコンフリクトをその場で解消」を繰り返すコミットモード。pop のたびに残差分がコミット済み内容と整合した状態へリセットされるため、レビュー指摘の修正を制約なく取り込める。`shinaps:dev` 完了後の handoff 先だが、手動で作った差分にも単独発火できる。どのコミットに checkout しても壊れていない履歴を作る |

## Subagents (13)

| Subagent | 役割 |
|---|---|
| `shinaps-explorer` | コードベース探索、必読ファイル抽出 |
| `shinaps-investigator` | `shinaps:explore` の現在の質問をコード・テスト・設定・履歴から調べ、確実性を分けて回答 |
| `shinaps-architect` | 実装ブループリント策定 (複数観点 → 単一案収束) |
| `shinaps-plan-reviewer` | architect 案の批判 + 修正版最終 plan (confidence 閾値 70) |
| `shinaps-reviewer` | logic / design / security / performance / maintainability / rule 統合レビュー (confidence 閾値 80) |
| `shinaps-review-validator` | reviewer 指摘の実コード検証 (confirmed / false positive / partial / out-of-scope 分類) |
| `shinaps-refine-agent` | rule 照合の並列 dispatch (ファイル現状全文と照合、Violation / Improvement / Question 分類 + changed / pre-existing 切り分け) |
| `shinaps-spec-writer` | ヒアリング + 調査結果を spec.md 構造化 |
| `shinaps-tech-surveyor` | 外部技術調査 (WebSearch + WebFetch で 3-5 候補比較) |
| `shinaps-survey-validator` | tech-surveyor の出典を WebFetch で再確認 |
| `shinaps-debugger` | 症状から根本原因の仮説立案 (コードトレース + WebSearch + GitHub Issue) |
| `shinaps-debug-validator` | 仮説の実コード検証 (root-cause / contributing-factor / red-herring / needs-reproduction 分類) |
| `shinaps-split-reviewer` | `shinaps:commit` の分割案を「単位の diff だけで妥当性を判断できるか」で批判 + 修正版最終分割計画 (worktree は read-only) |

全 subagent の frontmatter は `name` / `description` / `model` / `permissionMode: bypassPermissions` / `effort` / `color` の 6 項目統一。**subagent 内では shinaps MCP を直接叩かず、rule 全文は Skill 側から prompt 経由で渡す** 原則を全 system prompt に明記 (credit 最適化)。

## 出力ディレクトリ

各 skill は `.claude/shinaps/` 配下にタイムスタンプ付きディレクトリを作る:

```
.claude/shinaps/
├── {ts}-{slug}/               ← shinaps:dev の作業ディレクトリ
├── explorations/{ts}-{slug}/  ← shinaps:explore の living document と質問別調査レポート
├── specs/{ts}-{slug}/         ← shinaps:spec の作業ディレクトリ (dev が spec.md を再利用)
├── reviews/{ts}-{mode}/       ← shinaps:review の作業ディレクトリ (dev が review-validated.md を再利用)
└── debug/{ts}-{slug}/         ← shinaps:debug の作業ディレクトリ (dev が debug-validated.md を再利用)
```

生レポート (investigator / explorer / architect / plan-reviewer / reviewer / refine / tech-surveyor / survey-validator / debugger / debug-validator の応答) は `raw/` 配下に全文保存する規約。

## License

MIT
