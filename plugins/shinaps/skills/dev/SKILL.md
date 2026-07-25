---
name: dev
description: 計画策定 + 実装 + セルフレビューを一気通貫で行う開発ワークフロー。shinaps-explorer でコードベース調査 (spec.md からの handoff なら spec が取った explorer 結果を再利用) → shinaps-architect で実装ブループリント策定 → shinaps-plan-reviewer が plan を批判して修正版最終 plan を返す → メインスレッドが plan.md を直接実装 + 動作確認 (型/lint/test) + implementation.md 執筆 → shinaps-reviewer と Skill(shinaps:refine) を発火してセルフレビュー + rule 照合 → Critical 自動修正までを単一スキルで完走する。実装フェーズをメインスレッドが担うことで、explorer / architect / plan-review で築いた文脈をそのまま実装判断に活用し、レビュー指摘や修正ループでもブレない実装精度を保つ。EnterPlanMode は使わず bypassPermissions モード (リモート実行など) と両立する設計。不明な論点は AskUserQuestion で必ずユーザーに確認する
argument-hint: <実装したい機能・解決したい課題>
---

## 引数仕様

| 呼び出し | 動作 |
|---|---|
| `/shinaps:dev <task>` | タスク内容を指定して計画策定 → 実装まで一気通貫実行 |
| `/shinaps:dev` | エラー: 引数なし不可。タスクを渡すよう案内 |

引数の文字列がそのままタスクとして扱われる (自由記述、長文可)。

## 使用エージェント

| エージェント | subagent_type | 役割 |
|---|---|---|
| Shinaps Explorer | `shinaps-explorer` | コードベース探索、必読ファイル抽出 (spec からの handoff 時は再起動しない) |
| Shinaps Architect | `shinaps-architect` | 複数観点を内包した実装ブループリント策定 |
| Shinaps Plan Reviewer | `shinaps-plan-reviewer` | architect 初回案を批判 + Critical/Warning を反映した修正版最終 plan までを返す |
| Shinaps Reviewer | `shinaps-reviewer` | logic / design / security / performance / maintainability / rule の統合観点でレビュー |

実装フェーズ (Phase 5) は **メインスレッドが直接 Edit/Write で行う**。explorer / architect / plan-review で築いた文脈・設計判断の意図をそのまま実装に持ち込むことで、レビュー指摘の文脈共有と修正ループの精度を最大化する狙い。

## ディレクトリ規約

```
.claude/shinaps/{YYYYMMDD-HHMMSS}-{slug}/
├── plan.md                    ← Phase 4 で確定する最終 plan (plan-reviewer Part 2)
├── raw/                       ← 計画フェーズの生レポート (全文保存)
│   ├── explorer.md            ← または explorer-1.md, explorer-2.md ... (並列時、または spec handoff で再利用時は既存参照)
│   ├── architect.md           ← architect の初回案
│   ├── plan-review.md         ← plan-reviewer の Part 1 (レビュー結果のみ)
│   ├── refine.md              ← Phase 6 で走らせた Skill(shinaps:refine) の findings 集約
│   └── architect-revised-{n}.md  ← 差し戻し再策定時のみ (n は 1 始まり)
├── implementation.md          ← 実装ログ・変更ファイル一覧・動作確認結果
├── review.md                  ← shinaps-reviewer の生レポート
├── review-{n}.md              ← 修正後の再レビュー (n は 2 始まり)
└── fix-log.md                 ← 修正ループの履歴 (修正があった場合のみ)
```

`spec.md` からの handoff の場合、spec が取った `raw/explorer.md` を再利用するため自前で explorer を起動しない (Phase 2 参照)。

`{slug}` はタスク内容の短い英語スラッグ (kebab-case, 30 文字以内)。

## 実行フロー

### Phase 1: タスク受領

1. 引数なし → エラー終了「`/shinaps:dev <task>` でタスクを指定してください」
2. 引数の文字列をタスク内容として確定
3. **`list_recent_work({ repoOwner, repoName })` を必ず呼ぶ** → 返却の直近 20 件から **直近 5-10 件のみ 1 行サマリ化** して保持する (subagent prompt に埋め込む用の要約)
4. **spec.md からの handoff 判定**: 引数に `.claude/shinaps/specs/.../spec.md` のパスが含まれていれば spec モードと判定し、その spec.md を Read してタスク詳細・採用技術・既存実装との関係を取り込む。同 spec ディレクトリ配下の `raw/explorer.md` も存在するか確認 (Phase 2 で再利用)
5. タスクから英語 slug を生成 (kebab-case, 30 文字以内)
6. 作業ディレクトリを確定: `.claude/shinaps/{YYYYMMDD-HHMMSS}-{slug}/` + `raw/`
7. タスク文字列が曖昧 / 制約が不明確な場合は `AskUserQuestion` で要件を確認 (何回聞いても良い)

### Phase 2: コードベース探索

#### spec.md からの handoff の場合 (推奨パス)

`spec.md` のディレクトリ配下に `raw/explorer.md` があれば、それをそのまま Read で取り込み、**自前で `shinaps-explorer` を起動しない**。spec フェーズで既に同じタスク領域を調査済みなので二重探索を避ける。

- spec の `raw/explorer.md` から必読ファイル一覧を抽出 → メインが直接 Read
- 追加の探索が必要だと判断した場合 (spec から時間が経って差分がある / 追加領域が必要) のみ補完的に `shinaps-explorer` を起動し、`raw/explorer-supplement.md` に保存

`search_rules` の結果はメインスレッドで Phase 2 冒頭に:
- `list_search_facets()` で facet master を確認
- `search_rules({ repoOwner, repoName, ...推定 facet })` で userRules + officialRules 全文を取得

する形で確保しておく (Phase 3 以降で subagent prompt に埋め込む用)。

#### handoff でない / explorer.md が存在しない場合

`list_search_facets()` + `search_rules({ repoOwner, repoName, ...推定 facet })` を呼び、rule カタログ (userRules + officialRules 全文) を確保 → `shinaps-explorer` を起動 (領域が広ければ複数並列)。

**`shinaps-explorer` に渡す prompt に含める情報**:
- タスク内容
- **Phase 1 で作成した「直近 5-10 件の memory events 要約」**
- 探索の狙い

**記録先**: メインが Write で `raw/explorer.md` (並列時は `raw/explorer-{n}.md`)

### Phase 3: 実装ブループリント策定

`shinaps-architect` を 1 体起動。

**プロンプトに含める情報**:
- タスク内容
- Phase 2 の explorer 結果 (必読ファイル一覧 + 要点)
- **Phase 2 で取得した `search_rules` 結果 (userRules + officialRules 全文)**
- 「作業前に必ず CLAUDE.md / プロジェクト規約を Read し、rule カタログと突き合わせよ」

**記録先**: メインが Write で `raw/architect.md`

### Phase 4: プランレビュー

`shinaps-plan-reviewer` を 1 体起動する。

**プロンプトに含める情報**:
- タスク内容
- Phase 2 の explorer 結果
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
- 不明点 (命名 / 依存方向 / 例外処理の落とし所など plan で曖昧な点) は **必ず `AskUserQuestion`** で確認 (回数制限なし)
- plan からの逸脱は `AskUserQuestion` で確認した上で `implementation.md` に経緯を記録
- 1 サブタスク完了ごとに `TaskUpdate` で `completed` に進める
- **判断 / ブロッカー / 方針転換で `record_memory`** を残す

#### C. `implementation.md` 執筆

実装と並行して `implementation.md` を更新し、以下を全文記録する:

- 変更ファイル一覧 (パス + 1 行サマリ)
- 各ファイルでの **設計上の WHY** (なぜこの設計を選んだか / plan からの逸脱があれば理由)
- 実装中に判断した重要事項
- 残課題・規約衝突・未解決の論点

#### D. 動作確認

- 型 / lint / build / test を順に実行
- 結果を `implementation.md` の「動作確認結果」セクションに記録
- 自分の実装ミスによる失敗は **3 回まで自己修正**。それを超える場合は `AskUserQuestion` で「さらに修正試行 / Phase 6 のレビュー対象として diff を渡す / Phase 4 に戻って plan-reviewer に再策定させる」を確認

### Phase 6: セルフレビュー + refine (並列 spawn)

**`shinaps-reviewer` と `Skill(shinaps:refine)` を 1 メッセージ内で並列 spawn する** (workflow に bake された rule 照合 checkpoint)。

#### 1 メッセージ内に以下 2 tool 呼び出しを含める

1. `Agent(subagent_type="shinaps-reviewer", prompt=<下記>)`:
   - plan.md 全文
   - implementation.md 全文 (動作確認結果含む)
   - 変更ファイル一覧と diff (`git diff` の出力。git 管理されていないファイルは Read 結果)
   - **Phase 2 で取得した `search_rules` 結果 (userRules + officialRules 全文)**
   - 「confidence ≥ 80 のみ報告、rule 違反は必ず Critical タグ」

2. `Skill(skill="shinaps:refine")`:
   - 引数なし → `git diff HEAD` で変更ファイルを特定し、それらの現状全文を対象に refine が Step 0-6 を実行

#### 並列 dispatch フォールバック

Claude Code の実行エンジンが Skill tool と Agent tool を並列 dispatch できず直列化された場合は、`shinaps-reviewer` を先に単独起動 → `Skill(shinaps:refine)` を単独発火する 2 段直列に切り替える。どちらも独立に対象を取りに行くので、順序が変わっても結果は変わらない。

#### 記録先

- `review.md`: shinaps-reviewer の生レポート (メインが Write)
- `raw/refine.md`: refine の findings 集約 (メインが Write)

### Phase 7: 修正ループ

- **Critical は必ず自動修正** (reviewer Critical + refine の `scope=changed` な Violation、承認不要 — 動作を壊している / 規約違反の指摘)
- **Phase 5 サブフェーズ D で検出された動作確認の失敗** も Critical として修正
- **Warning は `AskUserQuestion` で確認**: 「全部修正 / 個別に確認 / 後回し (Issue 化) / スコープ外として記録」 (reviewer Warning + refine Improvement)
- **refine の `scope=pre-existing` な finding は自動修正しない**。今回の実装と無関係な差分が commit に混ざるため、Violation でも `AskUserQuestion` で「今回直す / 別タスクにする」を確認する
- **Info は記録のみで修正しない**

修正を行った場合、`fix-log.md` に「指摘 → 修正内容 → 該当ファイル」を記録。修正判断は `record_memory` を残す。

修正実装はメインが直接 Edit/Write で行う (Phase 5 と同じ主体)。reviewer / refine の指摘文脈をメインがそのまま保持しているため、修正判断のブレが起きにくい。大規模な再実装が必要な場合は `AskUserQuestion` で「メインで修正継続 / Phase 4 に戻って plan-reviewer に再策定させる」を確認する。

### Phase 8: 修正後の再レビュー (Critical / Warning 修正時のみ)

Phase 7 で **Critical または Warning を修正した場合のみ**、もう一度 `shinaps-reviewer` を起動する (refine の再発火は Phase 8 では不要)。

これは「修正で別バグを生むリスク」を検出するため。

- プロンプトには「修正後の差分」「修正前の指摘」「修正内容」を渡す
- 応答は `review-{n}.md` として保存 (n は 2 始まり)
- 再レビューでさらに Critical が出た場合は再修正 → 再レビューを Critical が無くなるまで繰り返す
- 各ラウンドの修正は `fix-log.md` に追記し、ラウンド数が判別できるようにする

修正がなかった場合は再レビューをスキップして終了。

## 動作原則

- **EnterPlanMode は使わない**: bypassPermissions モード (リモート実行など) と両立させるため
- **実装はメインスレッドが担う**: explorer / architect / plan-review で築いた文脈・設計判断の WHY をそのまま実装と修正ループに引き継ぐため。サブエージェント委譲は計画フェーズとレビューフェーズに限定
- **subagent は文字列応答のみを返す**: raw/*.md への Write / Edit は必ずメインスレッドが担当
- **rule 照合を各 Phase に bake**: Phase 2 の `search_rules` → Phase 3 の architect prompt 埋め込み → Phase 4 の plan-reviewer (設計レベルの違反) → Phase 6 の refine 並列 (コードレベルの違反)
- **判断・方針転換で `record_memory`**
- **不明な論点は必ず AskUserQuestion で確認**: 回数に制限なし。「わからないまま自動進行」より「ユーザーに聞く」を優先
- **生レポート保存厳守**: explorer / architect / plan-reviewer / reviewer / refine の応答は全文保存
- **Critical は自動修正、Warning は確認**
- **plan からの逸脱は確認 + 記録**: AskUserQuestion で確認した上で `implementation.md` に経緯を残す
- **git 操作は自動化しない**: commit / push / PR は別スキルへ案内のみ

## 他スキルからの呼び出し

`/shinaps:spec` `/shinaps:review` `/shinaps:debug` などから handoff される際は、それらが生成した **生成物のパス** を引数に直接渡す (専用の handoff ファイルは生成しない):

| 元スキル | 渡すパス | dev での扱い |
|---|---|---|
| `/shinaps:spec` | `.claude/shinaps/specs/{ts}-{slug}/spec.md` | Phase 1 で Read してタスク詳細・採用技術を取り込み、Phase 2 で同ディレクトリ配下の `raw/explorer.md` を再利用 |
| `/shinaps:review` | `.claude/shinaps/reviews/{ts}-{mode}/review-validated.md` | Phase 1 で Read し、確定指摘を修正タスクとして扱う |
| `/shinaps:debug` | `.claude/shinaps/debug/{ts}-{slug}/debug-validated.md` | Phase 1 で Read し、root-cause / contributing-factor を修正タスクとして扱う |

```
Skill(skill="shinaps:dev", args="<元タスク要約>。詳細は <生成物パス> を参照")
```
