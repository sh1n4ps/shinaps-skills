---
name: debug
description: バグ報告・不具合の根本原因を多角的に調査し、対症療法ではなく根本解決を導くスキル。コードトレース + WebSearch + GitHub Issue 検索で仮説を立て、実コード検証で確定させ、必要に応じて shinaps-tech-surveyor + shinaps-survey-validator で外部情報を深掘りし、/shinaps:dev に橋渡しする。過去の memory events と rule カタログを仮説候補の予選材料に使う
argument-hint: <なし | エラーメッセージ / 症状の説明 | ファイルパス>
---

## 引数仕様

| 呼び出し | モード | 動作 |
|---|---|---|
| `/shinaps:debug` | interactive | `AskUserQuestion` で症状・再現手順を段階的に聞く |
| `/shinaps:debug <症状/エラーメッセージ>` | freeform | 記述をそのまま調査対象 |
| `/shinaps:debug <ファイルパス>` | trace | 指定ファイルを起点にコード追跡 |

## 使用エージェント

| エージェント | subagent_type | 役割 |
|---|---|---|
| Shinaps Debugger | `shinaps-debugger` | コードトレース + WebSearch + GitHub Issue 検索で仮説立案 |
| Shinaps Debug Validator | `shinaps-debug-validator` | 仮説を実コードと照合し分類 |
| Shinaps Tech Surveyor | `shinaps-tech-surveyor` | (Phase 4.5) 外部ライブラリの既知バグを深掘り |
| Shinaps Survey Validator | `shinaps-survey-validator` | (Phase 4.5) surveyor 主張を出典 URL で再確認 |

## ディレクトリ規約

```
.claude/shinaps/debug/{YYYYMMDD-HHMMSS}-{slug}/
├── input.md                ← 症状・再現手順のサマリ
├── debug-report.md         ← shinaps-debugger の生レポート (仮説一覧)
├── debug-validated.md      ← shinaps-debug-validator の検証済みレポート (dev にはこのパスを直接渡す)
└── raw/                    ← Phase 4.5 実施時のみ
    ├── survey.md
    └── survey-validated.md
```

`{slug}` は症状の短い英語スラッグ (kebab-case, 30 文字以内)。

## 実行フロー

### Phase 1: 引数判定と入力収集

- **`list_recent_work({ repoOwner, repoName })` を必ず呼ぶ** → 直近 5-10 件を 1 行サマリ化 (Phase 3 の debugger prompt に埋め込む用)
- **interactive モード**: `AskUserQuestion` で以下を段階的に聞く:
  - 何が起きているか (症状)
  - いつから起きているか
  - 再現手順
  - 期待する動作
  - 試した対処
- **freeform モード**: 引数の記述をそのまま調査対象に。曖昧な場合は追加の `AskUserQuestion` で補足
- **trace モード**: 指定ファイル存在確認 → 関連する挙動が何かを `AskUserQuestion` で確認

### Phase 2: input.md 保存

メインが Write で `input.md` に以下を保存:
- モード / 取得時刻
- 症状 / 再現手順 / 期待動作 / 試した対処
- (trace モードの場合) 起点ファイル情報

### Phase 3: shinaps-debugger 起動 (根本原因調査)

#### 前準備 (メインスレッド)

`list_search_facets()` + `search_rules({ repoOwner, repoName, topics: ["debugging", ...推定 topic] })` を実行。

#### プロンプト

- `input.md` 全文
- プロジェクト `CLAUDE.md` 全文
- **Phase 1 で作成した memory events 要約 (直近 5-10 件、1 行サマリ化済み)**
- **前準備の `search_rules` 結果 (userRules + officialRules 全文)**
- 「対症療法ではなく根本原因を特定せよ。過去 memory と rule カタログを仮説予選材料に使う」
- trace モードの場合: 起点ファイル指定

**記録先**: メインが Write で `debug-report.md`

### Phase 4: shinaps-debug-validator 起動 (仮説検証)

#### プロンプト

- `input.md` 全文
- `debug-report.md` 全文
- 前準備の `search_rules` 結果
- 「各仮説について該当コードを Read で確認し、root-cause / contributing-factor / red-herring / needs-reproduction に分類せよ。対症療法禁止、根本解決を提示」

**記録先**: メインが Write で `debug-validated.md`

### Phase 4.5: 外部情報深掘り調査 (任意)

`AskUserQuestion` で「外部ライブラリの既知バグを深掘りするか」を確認 (Recommended: Yes、以下に該当するなら):
- validator が「外部ライブラリの挙動が疑わしい」と示唆
- 症状が特定 library / framework 依存
- 環境依存 (OS / runtime version) の疑い

実施する場合、`shinaps-tech-surveyor` → `shinaps-survey-validator` の 2 段パイプ。

- **shinaps-tech-surveyor プロンプト**: `input.md` + `debug-validated.md` + `search_rules` 結果 + 「関連 library / API の既知バグ / breaking change / 挙動仕様を WebSearch + GitHub Issue で調査」
- **shinaps-survey-validator プロンプト**: `raw/survey.md` 全文 + `search_rules` 結果 + 「出典 URL を再確認、CLAUDE.md / rule 逆行する候補は Critical」

**記録先**: メインが Write で `raw/survey.md` / `raw/survey-validated.md`

Phase 4.5 実施後、`debug-validated.md` を更新して「## 関連する外部情報」セクションに要点を反映する (debug-validator が既に責務として持っているが、メインで直接 Edit も可)。

### Phase 5: 次アクション選択

root-cause または contributing-factor が 1 件以上あれば `AskUserQuestion` で:
- **修正実装に進む** (`/shinaps:dev` へ橋渡し) (推奨)
- **追加調査を依頼する** (Phase 7 へ)
- **保存のみで終了**

**根本原因確定時に `record_memory`** で「症状 → 根本原因 → 修正方針」を記録。

### Phase 6: /shinaps:dev への橋渡し (修正実装選択時)

```
Skill(skill="shinaps:dev", args="以下のデバッグ結果に基づき根本原因を修正する。詳細は .claude/shinaps/debug/{ts}-{slug}/debug-validated.md を参照: {根本原因の 1 行サマリ}")
```

### Phase 7: 追加調査 (選択時)

`AskUserQuestion` で「どこを追加調査するか」を確認 → `input.md` を更新 → Phase 3 に戻る。

## 動作原則

- **根本原因志向**: 対症療法を推奨しない、根本解決を導く
- **多角的調査**: コード + docs + WebSearch + GitHub Issue を組み合わせる
- **二段検証**: debugger の仮説を debug-validator が必ず実コードで検証
- **rule + memory を仮説予選に活用**: `search_rules` + `list_recent_work` の結果を debugger prompt に埋め込む
- **subagent は文字列応答のみ**: ファイル書き込みは必ずメインが担当
- **生レポート保存厳守**: すべての subagent 応答を全文保存
- **根本原因確定時に `record_memory`**: 未来の自分と別 AI agent が辿れるように
