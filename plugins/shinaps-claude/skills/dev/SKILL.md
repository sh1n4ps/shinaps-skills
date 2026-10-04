---
name: dev
description: 既存設計とプロジェクトの条件を確認し、計画・実装・簡素化・検証・レビューを行う。機能追加や修正の実装を依頼されたときに使う。コミットは別途明示された場合だけ行う。
argument-hint: <実装したい機能・解決したい課題>
---

## 作業記録の保存先

作業記録はプロジェクトルートの `.shinaps/work/` 以下へ保存する。最初に記録を作るとき、`.shinaps/` を作成し、`.shinaps/.gitignore` がなければ内容 `*` と改行で作成する。既存ファイルは上書きせず、除外が不足する場合だけ `*` を追記する。ユーザーのグローバルignoreやルートの `.gitignore` の編集は不要。Git管理下では `git check-ignore` と `git status --short --untracked-files=all` で記録が未追跡変更に出ないことを確認する。既存の追跡済みファイルは自動で追跡解除しない。

既存の `.claude/shinaps/` 等の記録は渡されたパスから読み、無断で移動・削除しない。新規記録は新しい保存先を使う。共有する仕様書などを `docs/` 等へ出す場合は、明示された成果物の保存先に従う。秘密情報は記録しない。

## 実行環境とプロジェクト条件

この節は以下の工程全体に適用する。適用される `AGENTS.md`・`CLAUDE.md` と参照先、CI、既存スクリプトから今回の条件を読み、明示された依頼・許可を引き継ぐ。仕様に影響する不足だけ一問ずつ確認する。新しい恒久方針の保存はユーザーの了承を得てプロジェクト側へ行う。

Claude Codeの `Skill`・`Agent`・`AskUserQuestion`・`TaskCreate` を利用できる場合は対応するツールを使う。現在のセッションで提供されていないツールは仮定しない。質問は一問ずつ確認して回答を待つ。

別セッションへの委託・新しいworktreeは明示された許可がある場合だけ行う。委託不可なら現在のセッションで調査・計画・レビューの観点を順に確認し、独立レビューとは報告しない。独立レビューがプロジェクトの必須条件なら未完了として扱う。Shinapsのエージェント名はClaudeのpluginで公開された名前を使う。サービスのrule照合が必要な工程でMCPを利用できなければ、その工程を未確認として報告し、照合済みとしない。

## 引数仕様

| 呼び出し | 動作 |
|---|---|
| `/shinaps:dev <task>` | タスク内容を指定して計画策定 → 実装まで一気通貫実行 |
| `/shinaps:dev` | エラー: 引数なし不可。タスクを渡すよう案内 |

引数の文字列がそのままタスクとして扱われる (自由記述、長文可)。

## 使用エージェント

| エージェント | subagent_type | 役割 |
|---|---|---|
| Shinaps Explorer | `shinaps-explorer` | コードベース探索、必読ファイル抽出 (spec / explore の事前調査が十分なら再起動しない) |
| Shinaps Architect | `shinaps-architect` | 複数観点を内包した実装ブループリント策定 |
| Shinaps Plan Reviewer | `shinaps-plan-reviewer` | architect 初回案を批判 + Critical/Warning を反映した修正版最終 plan までを返す |
| Shinaps Reviewer | `shinaps-reviewer` | logic / design / security / performance / maintainability / rule の統合観点でレビュー |

実装フェーズ (Phase 5) は **メインスレッドが直接 Edit/Write で行う**。explorer / architect / plan-review で築いた文脈・設計判断の意図をそのまま実装に持ち込むことで、レビュー指摘の文脈共有と修正ループの精度を最大化する狙い。

## ディレクトリ規約

```
.shinaps/work/{YYYYMMDD-HHMMSS}-{slug}/
├── plan.md                    ← Phase 4 で確定する最終 plan (plan-reviewer Part 2)
├── raw/                       ← 計画フェーズの生レポート (全文保存)
│   ├── explorer.md            ← または explorer-1.md, explorer-2.md ... (事前調査 handoff 時は既存レポートを参照)
│   ├── architect.md           ← architect の初回案
│   ├── plan-review.md         ← plan-reviewer の Part 1 (レビュー結果のみ)
│   ├── refine.md              ← Phase 6 で走らせた Skill(shinaps:refine) の findings 集約
│   ├── simplify.md            ← Phase 6 の簡素化レビューの生レポート
│   └── architect-revised-{n}.md  ← 差し戻し再策定時のみ (n は 1 始まり)
├── implementation.md          ← 実装ログ・変更ファイル一覧・動作確認結果
├── review.md                  ← shinaps-reviewer の生レポート
├── review-{n}.md              ← 修正後の再レビュー (n は 2 始まり)
└── fix-log.md                 ← 修正ループの履歴 (修正があった場合のみ)
```

`spec.md` / `exploration.md` からの handoff では、同ディレクトリの既存調査を再利用し、情報が十分なら自前で explorer を起動しない (Phase 2 参照)。

`{slug}` はタスク内容の短い英語スラッグ (kebab-case, 30 文字以内)。

## 実行フロー

### Phase 1: タスク受領

1. 引数なし → エラー終了「`/shinaps:dev <task>` でタスクを指定してください」
2. 引数の文字列をタスク内容として確定
3. 今回の依頼に関連する既存の spec・調査レポート・Git の変更履歴を確認し、引き継ぐ決定と根拠を要約する。既存成果物がなければ追加取得は不要。
4. **他スキルからの handoff 判定**: 引数に成果物パス（旧 `.claude/shinaps/` を含む）が含まれていれば必ず Read し、タスク詳細・確定事項・未解決点を取り込む。特に以下を Phase 2 の事前調査として扱う:
   - `specs/.../spec.md`: 同ディレクトリの `raw/explorer*.md` を確認する
   - `explorations/.../exploration.md`: `## 実装 handoff` の `status: ready` を確認し、同ディレクトリの `raw/investigation-*.md` を確認する。status が欠落・不明・`not-ready` なら変更内容を推測せず、`AskUserQuestion` で「explore に戻る / 実装内容をここで確定する」を確認する
5. タスクから英語 slug を生成 (kebab-case, 30 文字以内)
6. 作業ディレクトリを確定: `.shinaps/work/{YYYYMMDD-HHMMSS}-{slug}/` + `raw/`
7. タスク文字列が曖昧 / 制約が不明確な場合は `AskUserQuestion` で要件を確認 (何回聞いても良い)

### Phase 2: コードベース探索

#### spec.md / exploration.md からの handoff の場合 (推奨パス)

Phase 1 で読んだ成果物と同ディレクトリの raw report を取り込み、現在の実装を理解するための証拠として再利用する。

- spec handoff: `raw/explorer*.md` から必読ファイル一覧を抽出し、メインが直接 Read する
- explore handoff: `exploration.md` の confirmed findings / 実装 handoff と `raw/investigation-*.md` の証拠・関連ファイルを取り込み、メインが重要箇所を直接 Read する
- handoff の `evidenceSnapshot` にある各ローカル根拠ファイルの content hash を現在値と照合する。hash の不一致・ファイル欠落はその根拠を stale とみなし、同じ path を直接 Read して結論を再検証する。branch / HEAD / worktree status が同じでも hash 照合を省略しない
- 現行仕様・バージョンなど時間依存の外部根拠は、実装判断を左右する場合に公式情報で再確認する
- 情報が十分かつ最新なら **自前で `shinaps-explorer` を起動しない**
- 情報不足、陳腐化、実装範囲の追加がある場合だけ補完的に `shinaps-explorer` を起動し、今回の作業ディレクトリの `raw/explorer-supplement.md` に保存する

`search_rules` の結果はメインスレッドで Phase 2 冒頭に:
- `list_search_facets()` で facet master を確認
- `search_rules({ repoOwner, repoName, ...推定 facet })` で userRules + officialRules 全文を取得

する形で確保しておく (Phase 3 以降で subagent prompt に埋め込む用)。

#### handoff でない / 事前調査が不足する場合

`list_search_facets()` + `search_rules({ repoOwner, repoName, ...推定 facet })` を呼び、rule カタログ (userRules + officialRules 全文) を確保 → `shinaps-explorer` を起動 (領域が広ければ複数並列)。

**`shinaps-explorer` に渡す prompt に含める情報**:
- タスク内容
- **Phase 1 で作成した「既存成果物の要約」**
- 探索の狙い

**記録先**: メインが Write で `raw/explorer.md` (並列時は `raw/explorer-{n}.md`)

### Phase 3: 実装ブループリント策定

`shinaps-architect` を 1 体起動。

**プロンプトに含める情報**:
- タスク内容
- Phase 2 の調査結果 (explorer または handoff 済み investigation の必読ファイル一覧 + 要点)
- **Phase 2 で取得した `search_rules` 結果 (userRules + officialRules 全文)**
- 「作業前に必ず CLAUDE.md / プロジェクト規約を Read し、rule カタログと突き合わせよ」

**記録先**: メインが Write で `raw/architect.md`

### Phase 4: プランレビュー

`shinaps-plan-reviewer` を 1 体起動する。

**プロンプトに含める情報**:
- タスク内容
- Phase 2 の調査結果 (explorer または handoff 済み investigation)
- Phase 3 の architect 初回案 (`raw/architect.md` 全文)
- Phase 2 の search_rules 結果 (userRules + officialRules 全文)
- 「architect 案を批判的にレビューし、Critical / Warning を反映した修正版最終 plan を Part 2 として返せ。rule はアーキテクチャ / 責務分割 / 依存方向など実装後に気付くと手戻りが大きい設計レベルの違反を拾い、コードレベルの規約 (コメントの WHY / 命名 / import 経路) には踏み込まなくてよい」

計画段階で `Skill(shinaps:refine)` を併走させない理由: rule の大半はコードレベルの規約で、自然言語の plan からは検出できない。plan で拾う価値がある設計レベルの違反は plan-reviewer の担当範囲と重なるため、独立した照合層を挟んでも search_rules の二重取得と agent 起動コストに見合わない。コードレベルの rule 照合は Phase 6 で実装後の実ファイルに対して行う。

#### 統合

応答を受け取ったら、メインスレッドで以下を Write:

1. plan-reviewer Part 1 (レビュー結果のみ) を `raw/plan-review.md` に Write
2. plan-reviewer Part 2 (修正版最終 plan、Full text) を `plan.md` として Write (これが最終 plan.md)

#### 判定別のアクション

| plan-reviewer 判定 | アクション |
|---|---|
| **承認** | Part 2 で確定した plan.md をそのまま Phase 5 へ |
| **条件付き承認** | Part 2 で確定した plan.md をそのまま Phase 5 へ (条件は Phase 5 実装時に判断) |
| **差し戻し** | `AskUserQuestion` で「再策定する / 指摘を未解決リスクとして明記して進む / タスク見直し」を確認。再策定の場合は Part 1 の差し戻し理由を渡して `shinaps-architect` を再起動、`raw/architect-revised-{n}.md` に保存 → 再度 plan-reviewer を起動 |

### Phase 5: 実装フェーズ (メインスレッド直接実装)

メインスレッドが Phase 4 で確定した `plan.md` の実装を **直接 Edit/Write で行う**。

#### A. 事前整合性チェック

1. `plan.md` を再読し、ビルド順序を `TaskCreate` で展開
2. Phase 2-4 で確定した必読ファイル・plan-reviewer 指摘は既にメイン context に保有済み。再 Read は不要 — 新たに発生した疑問だけ Read で補う
3. 既存実装との衝突や前提の不一致を発見した場合は `AskUserQuestion` で「plan を上書く / 既存に合わせる / Phase 4 に戻って plan-reviewer に再策定させる」を確認

#### B. 実装

- ビルド順序に従って Edit / Write で実装
- 目的・仕様を左右する不明点だけ一問ずつ確認する。命名等の通常の実装判断は既存規約に合わせて進める
- plan からの逸脱は `AskUserQuestion` で確認した上で `implementation.md` に経緯を記録
- 1 サブタスク完了ごとに `TaskUpdate` で `completed` に進める
- **判断 / ブロッカー / 方針転換で ローカル成果物（implementation.md / 調査・レビューレポート）** を残す

#### C. `implementation.md` 執筆

実装と並行して `implementation.md` を更新し、以下を全文記録する:

- 変更ファイル一覧 (パス + 1 行サマリ)
- 各ファイルでの **設計上の WHY** (なぜこの設計を選んだか / plan からの逸脱があれば理由)
- 実装中に判断した重要事項
- 残課題・規約衝突・未解決の論点

#### D. 動作確認

- プロジェクト規約・CI・変更の影響から必要な検証を実行する。UI変更は `verify-ui` で対象環境を確定して実画面を確認する。全案件に同じコマンド・端末構成を強制しない
- 結果を `implementation.md` の「動作確認結果」セクションに記録
- 自分の実装ミスによる失敗は **3 回まで自己修正**。それを超える場合は `AskUserQuestion` で「さらに修正試行 / Phase 6 のレビュー対象として diff を渡す / Phase 4 に戻って plan-reviewer に再策定させる」を確認

### Phase 6: 簡素化後のセルフレビュー + refine

まず `simplify` を適用し、目的を維持できる削除・簡素化をメインセッションで実施する。仕様変更の提案は確認してから進める。影響する検証を再実行し、その結果を `raw/simplify.md` に残す。

その後、最終差分（staged / unstaged / untrackedを含む）と現在のファイル、plan、implementation、ruleカタログを使ってレビューする。許可された独立レビューでは `shinaps-reviewer` に読み取りだけを依頼し、`refine` で規約と照合する。委託できなければメインで両観点を確認し、独立レビュー済みとは報告しない。

結果は `review.md` と `raw/refine.md` に記録する。簡素化前の差分だけをレビューして完了しない。

### Phase 7: 修正ループ

- **Critical は必ず自動修正** (reviewer Critical + refine の `scope=changed` な Violation、承認不要 — 動作を壊している / 規約違反の指摘)
- **Phase 5 サブフェーズ D で検出された動作確認の失敗** も Critical として修正
- **Warning は `AskUserQuestion` で確認**: 「全部修正 / 個別に確認 / 後回し (Issue 化) / スコープ外として記録」 (reviewer Warning + refine Improvement)
- **refine の `scope=pre-existing` な finding は自動修正しない**。今回の実装と無関係な差分が commit に混ざるため、Violation でも `AskUserQuestion` で「今回直す / 別タスクにする」を確認する
- **Info は記録のみで修正しない**
- **簡素化レビューの「仕様を変えない削除・統合」は自動適用**し、Phase 5 サブフェーズ D の動作確認を再実行する。削除は追加より検証しやすく、残すほうが保守の負債になるため。**「仕様変更を伴う提案」は `AskUserQuestion` で確認**: 「採用して仕様を変える / 現状維持 / 別タスクにする」

修正を行った場合、`fix-log.md` に「指摘 → 修正内容 → 該当ファイル」を記録。修正判断も `fix-log.md` に残す。

修正実装はメインが直接 Edit/Write で行う (Phase 5 と同じ主体)。reviewer / refine の指摘文脈をメインがそのまま保持しているため、修正判断のブレが起きにくい。大規模な再実装が必要な場合は `AskUserQuestion` で「メインで修正継続 / Phase 4 に戻って plan-reviewer に再策定させる」を確認する。

### Phase 8: 修正後の再レビュー (Critical / Warning 修正時のみ)

Phase 7 で **Critical または Warning を修正した場合のみ**、もう一度 `shinaps-reviewer` を起動する (refine の再発火は Phase 8 では不要)。

これは「修正で別バグを生むリスク」を検出するため。

- プロンプトには「修正後の差分」「修正前の指摘」「修正内容」を渡す
- 応答は `review-{n}.md` として保存 (n は 2 始まり)
- 再レビューでさらに Critical が出た場合は再修正 → 再レビューを Critical が無くなるまで繰り返す
- 各ラウンドの修正は `fix-log.md` に追記し、ラウンド数が判別できるようにする

修正がなかった場合は再レビューをスキップして Phase 9 へ。

### Phase 9: 完了と必要なhandoff

変更、簡素化、検証結果、未確認事項を報告する。コミットが明示されていれば、その許可範囲と通常／自律モードを `commit` へ引き継ぐ。コミット依頼がなければ未コミットのまま完了し、毎回コミット許可を要求しない。PRやリリースは明示された場合だけ、それぞれ `create-pr`・`release` へ進む。

## 動作原則

- **EnterPlanMode は使わない**: bypassPermissions モード (リモート実行など) と両立させるため
- **実装はメインスレッドが担う**: explorer / architect / plan-review で築いた文脈・設計判断の WHY をそのまま実装と修正ループに引き継ぐため。サブエージェント委譲は計画フェーズとレビューフェーズに限定
- **subagent は文字列応答のみを返す**: raw/*.md への Write / Edit は必ずメインスレッドが担当
- **rule 照合を各 Phase に bake**: Phase 2 の `search_rules` → Phase 3 の architect prompt 埋め込み → Phase 4 の plan-reviewer (設計レベルの違反) → Phase 6 の refine 並列 (コードレベルの違反)
- **判断・方針転換で ローカル成果物（implementation.md / 調査・レビューレポート）**
- **目的・仕様を左右する不明点を確認**: 既存の指示で分かることや任された細部は再質問しない
- **生レポート保存厳守**: explorer / handoff 済み investigation / architect / plan-reviewer / reviewer / refine の応答は全文参照可能な状態を保つ
- **Critical は自動修正、Warning は確認**
- **簡素化をレビュー前に実行する**: 目的を保つ削除を先に適用し、最終差分をレビューする
- **plan からの逸脱は確認 + 記録**: AskUserQuestion で確認した上で `implementation.md` に経緯を残す
- **コミットは明示依頼時のみ**: Phase 9 で既存の許可を引き継ぐ。

## 他スキルからの呼び出し

`/shinaps:explore` `/shinaps:spec` `/shinaps:review` `/shinaps:debug` などから handoff される際は、それらが生成した **生成物のパス** を引数に直接渡す (専用の handoff ファイルは生成しない):

| 元スキル | 渡すパス | dev での扱い |
|---|---|---|
| `/shinaps:explore` | `.shinaps/work/explorations/{ts}-{slug}/exploration.md` | `status: ready` と `evidenceSnapshot` を確認して合意済み変更・confirmed findings・未解決点を取り込み、Phase 2 で同ディレクトリ配下の `raw/investigation-*.md` を再利用。status 欠落 / `not-ready` なら変更内容を推測しない |
| `/shinaps:spec` | `.shinaps/work/specs/{ts}-{slug}/spec.md` | Phase 1 で Read してタスク詳細・採用技術を取り込み、Phase 2 で同ディレクトリ配下の `raw/explorer.md` を再利用 |
| `/shinaps:review` | `.shinaps/work/reviews/{ts}-{mode}/review-validated.md` | Phase 1 で Read し、確定指摘を修正タスクとして扱う |
| `/shinaps:debug` | `.shinaps/work/debug/{ts}-{slug}/debug-validated.md` | Phase 1 で Read し、root-cause / contributing-factor を修正タスクとして扱う |

```
Skill(skill="shinaps:dev", args="<元タスク要約>。詳細は <生成物パス> を参照")
```
