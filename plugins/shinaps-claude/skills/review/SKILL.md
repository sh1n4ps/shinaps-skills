---
name: review
description: 差分・PR・既存コードをレビューする。単独実行では指摘検証と外部技術調査を行い、dev の開発レビューでは設計担当と独立 reviewer が同じ実装を確認する。
argument-hint: <なし | PR番号 | ファイル/ディレクトリパス>
---

## 作業記録の保存先

作業記録はプロジェクトルートの `.shinaps/work/` 以下へ保存する。最初に記録を作るとき、`.shinaps/` を作成し、`.shinaps/.gitignore` がなければ内容 `*` と改行で作成する。既存ファイルは上書きせず、除外が不足する場合だけ `*` を追記する。ユーザーのグローバルignoreやルートの `.gitignore` の編集は不要。Git管理下では `git check-ignore` と `git status --short --untracked-files=all` で記録が未追跡変更に出ないことを確認する。既存の追跡済みファイルは自動で追跡解除しない。

既存の `.claude/shinaps/` 等の記録は渡されたパスから読み、無断で移動・削除しない。新規記録は新しい保存先を使う。共有する仕様書などを `docs/` 等へ出す場合は、明示された成果物の保存先に従う。秘密情報は記録しない。

## 実行環境とプロジェクト条件

この節は以下の工程全体に適用する。適用される `AGENTS.md`・`CLAUDE.md` と参照先、CI、既存スクリプトから今回の条件を読み、明示された依頼・許可を引き継ぐ。仕様に影響する不足だけ一問ずつ確認する。新しい恒久方針の保存はユーザーの了承を得てプロジェクト側へ行う。

Claude Codeの `Skill`・`Agent`・`AskUserQuestion`・`TaskCreate` を利用できる場合は対応するツールを使う。現在のセッションで提供されていないツールは仮定しない。質問は一問ずつ確認して回答を待つ。

別セッションへの委託・新しいworktreeは明示された許可がある場合だけ行う。委託不可なら現在のセッションで調査・計画・レビューの観点を順に確認し、独立レビューとは報告しない。独立レビューがプロジェクトの必須条件なら未完了として扱う。Shinapsのエージェント名はClaudeのpluginで公開された名前を使う。サービスのrule照合が必要な工程でMCPを利用できなければ、その工程を未確認として報告し、照合済みとしない。

## dev からの開発レビュー

引数に「開発レビュー」と指定された場合は、この節だけを実行し、以下の単独レビューの引数判定・外部調査・review-validator・devへの引き継ぎは実行しない。

呼び出し元から対象ファイルと差分 (staged / unstaged / untracked を含む)、最終 plan・受入条件・合意済み変更、実装報告と検証結果、rule 全文、設計した Codex CLI のセッションIDと設計判断の理由を受け取る。

- **設計適合性**: [Codex CLI担当](../dev/references/codex-worker.md) の手順で、設計した Codex CLI のセッションを Astra / medium・fastなしで再開する。初回案ではなく Opus が統合しプランレビューを経て確定した plan と現在のコード・検証を照合する。再開できなければ同じモデルに設計判断を引き継ぎ、その旨を記録する。Opus architect を設計適合性レビューとして重複起動しない。
- **独立レビュー**: 新しい `shinaps-reviewer` 1体へ、コードの正しさ・安全性・性能・保守性・規約の確認を依頼する。

両者へ同じ対象を渡し、読み取り専用で並行して確認する。今回の他担当の結果を読ませず、意見を交換させない。全担当が完了するまで対象を編集しない。Opus reviewer はエージェント定義、Codex は上記CLI手順のモデル・effort・service tier を使う。

「起動のみ」と指定された場合は、対応する実行環境で両担当をバックグラウンド起動し、担当名・OpusのエージェントID・CodexのセッションIDと実行ハンドル・対象範囲・未起動分を返す。結果待ちと記録は dev のメイン、全指摘の統合は同じ architect、修正は implementer が行う。起動済みをレビュー完了と報告しない。枠不足やバックグラウンド非対応なら実行可能な範囲を返し、dev が残りを順次進める。委託不可の場合はその制約を返す。

起動のみでない場合は両者の完了を待ち、結果と確認範囲を呼び出し元へ返す。指摘の修正は行わない。再レビューでは最新の計画・修正差分・前回の指摘・修正内容・検証結果を使い、今回の結果が揃うまで同じ独立性を保つ。

## 引数仕様

| 呼び出し | モード | 動作 |
|---|---|---|
| `/shinaps:review` | branch | `git diff <base>...HEAD` を取得してレビュー |
| `/shinaps:review <PR番号>` | PR | GitHub PR の diff をフェッチしてレビュー |
| `/shinaps:review <path>` | path | 指定パス配下のファイルをフルコードレビュー |

引数の型判定: 引数なし → branch、数字のみ → PR、それ以外 → path。

## 使用エージェント

| エージェント | subagent_type | 役割 |
|---|---|---|
| Shinaps Reviewer | `shinaps-reviewer` | logic / design / security / performance / maintainability / rule の統合観点 |
| Shinaps Tech Surveyor | `shinaps-tech-surveyor` | 毎回起動、採用 API / library / 言語機能の現代性・代替・落とし穴を外部調査 |
| Shinaps Survey Validator | `shinaps-survey-validator` | tech-surveyor が具体推奨を出した場合のみ起動、出典を再確認 |
| Shinaps Review Validator | `shinaps-review-validator` | reviewer 指摘の妥当性検証 + tech-survey 統合 |

## ディレクトリ規約

```
.shinaps/work/reviews/{YYYYMMDD-HHMMSS}-{mode}/
├── input.md                  ← レビュー対象のサマリ
├── review.md                 ← shinaps-reviewer の生レポート
├── tech-survey.md            ← shinaps-tech-surveyor の生レポート
├── tech-survey-validated.md  ← shinaps-survey-validator の検証済みレポート (surveyor が具体推奨を出した場合のみ)
└── review-validated.md       ← shinaps-review-validator の検証済み指摘リスト (dev にはこのパスを直接渡す)
```

`{mode}` は `branch` / `pr-{N}` / `path-{slug}`。

## 実行フロー

### Phase 1: 引数判定とレビュー対象の取得

- 今回の依頼に関連する既存の spec・調査レポート・Git の変更履歴を確認し、引き継ぐ決定と根拠を要約する。既存成果物がなければ追加取得は不要。
- **branch モード**: ベースブランチ判定 → `git diff <base>...HEAD` を取得。空ならエラー終了 (「差分がありません」)
- **PR モード**: `gh pr view <番号>` で PR 情報、`gh pr diff <番号>` で diff を取得
- **path モード**: 存在確認 → Read。50 ファイル超えたら `AskUserQuestion` で「全部レビューする / 主要ファイルに絞る / 中断」を確認

### Phase 2: 入力サマリ保存

メインが Write で `input.md` に以下を保存:
- モード / 取得時刻 / 対象情報
- 変更ファイル一覧
- diff 全文 (branch / PR) または コード本体一覧 (path)

### Phase 3: reviewer + tech-surveyor を並列起動 (一次レビュー)

**1 メッセージ内で 2 subagent を並列 spawn する** (Agent tool を 1 メッセージ内で複数呼び出す)。

#### 前準備 (メインスレッド)

`list_search_facets()` + `search_rules({ repoOwner, repoName, ...推定 facet })` を実行して rule カタログを確保。

#### shinaps-reviewer プロンプト

- レビューモード (branch / pr / path)
- `input.md` 全文
- **Phase 1 で作成した既存成果物の要約**
- **前準備の `search_rules` 結果 (userRules + officialRules 全文)**
- モード別追加指示 (branch なら base branch との差分の背景、PR なら PR description、path ならファイル配下の責務)
- 「confidence ≥ 80 のみ報告、rule 違反は必ず Critical タグ」

#### shinaps-tech-surveyor プロンプト

- `input.md` 全文
- **Phase 1 で作成した既存成果物の要約**
- **前準備の `search_rules` 結果**
- 「(a) 採用 API / library / 言語機能は現代的か、(b) より良い代替があるか、(c) 既知の落とし穴、(d) 採用バージョンの安全性、を WebSearch / WebFetch で調査せよ。既存スタック + rule カタログ整合性を予選条件に」

**記録先**: メインが Write で `review.md` / `tech-survey.md` に全文保存

### Phase 3.5: shinaps-survey-validator 起動 (条件付き)

tech-surveyor が「特筆事項なし」以外を返した場合のみ起動。

**プロンプト**:
- `tech-survey.md` 全文
- 前準備の `search_rules` 結果
- 「全ての出典 URL を WebFetch で再確認せよ」

**記録先**: メインが Write で `tech-survey-validated.md`

### Phase 4: shinaps-review-validator 起動

**プロンプト**:
- `input.md` 全文
- `review.md` 全文
- **前準備の `search_rules` 結果**
- `tech-survey-validated.md` 全文 (Phase 3.5 実施時のみ、なければ tech-survey.md を渡す)
- 「指摘ごとに該当コードを Read で確認し、confirmed / false positive / partial / out-of-scope に分類せよ。rule 起点の追加発見は積極的に報告」

**記録先**: メインが Write で `review-validated.md`

### Phase 5: 次アクション選択

確定指摘が 1 件以上あれば `AskUserQuestion` で:
- **修正実装に進む** (`/shinaps:dev` へ橋渡し) (推奨)
- **PR にコメント投稿する** (PR モードのみ)
- **ローカル保存のみで終了**

**修正実装選択時 (Phase 6 前) に ローカル成果物（implementation.md / 調査・レビューレポート）** で修正方針決定の記録を残す。

### Phase 6: /shinaps:dev への橋渡し (修正実装選択時)

```
Skill(skill="shinaps:dev", args="以下のレビュー指摘を修正する。詳細は .shinaps/work/reviews/{ts}-{mode}/review-validated.md を参照: {修正タスクの 1 行サマリ}")
```

### Phase 7: PR コメント投稿 (PR モードかつ選択時)

`gh pr review <番号> --comment --body-file <review-validated.md>` で投稿。**投稿前に本文確認必須** (`AskUserQuestion` で「投稿する / 本文を編集する / 中断」)。

## 動作原則

- **並列 + 検証パイプライン**: reviewer + tech-surveyor を並列、その結果を review-validator が統合
- **tech-surveyor は毎回起動**: 現代的な代替や落とし穴を必ずチェック
- **survey-validator は省略可**: tech-surveyor が「特筆事項なし」なら起動しない
- **rule 照合を reviewer / review-validator に bake**: `search_rules` 結果を prompt に埋め込む
- **subagent は文字列応答のみ**: raw/*.md への Write / Edit は必ずメインが担当
- **生レポート保存厳守**: すべての subagent 応答を全文保存
- **PR コメント投稿は要承認**: 外部影響のある操作は必ず本文確認
- **diff が空ならエラー終了**: 何もしない旨を明示
