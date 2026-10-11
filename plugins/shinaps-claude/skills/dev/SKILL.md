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
| Shinaps Architect | `shinaps-architect` | 設計を担当し、実装後は再開して設計適合性をレビュー |
| Shinaps Plan Reviewer | `shinaps-plan-reviewer` | Opus 2体で同じ計画を独立レビューし、指摘と修正案を返す |
| Shinaps Implementer | `shinaps-implementer` | 確定した計画の実装・検証と、レビュー後に決まった修正 (Opus) |
| Shinaps Reviewer | `shinaps-reviewer` | logic / design / security / performance / maintainability / rule の統合観点でレビュー |

委託が許可されている場合、実装と修正は **`shinaps-implementer` (Opus) 1 体**が担当し、メインは仕様判断・進行管理・成果物の確認を担う。設計判断を実装へ引き継ぎつつモデルの利用を分けるため、確定した計画・判断理由・規約を実装担当へ渡す。委託不可またはエージェントを利用できない場合はメインが担当し、その旨を報告する。

## ディレクトリ規約

```
.shinaps/work/{YYYYMMDD-HHMMSS}-{slug}/
├── plan.md                    ← Phase 4 で2体の指摘を統合した最終 plan
├── raw/                       ← 計画フェーズの生レポート (全文保存)
│   ├── explorer.md            ← または explorer-1.md, explorer-2.md ... (事前調査 handoff 時は既存レポートを参照)
│   ├── architect.md           ← architect の初回案
│   ├── plan-review-{round}-{1,2}.md ← 各プランレビューの結果
│   ├── refine.md              ← Phase 6 で走らせた Skill(shinaps:refine) の findings 集約
│   ├── simplify.md            ← Phase 6 の簡素化レビューの生レポート
│   └── architect-revised-{n}.md  ← 差し戻し再策定時のみ (n は 1 始まり)
├── implementation.md          ← 実装ログ・変更ファイル一覧・動作確認結果
├── architecture-review.md     ← architect の実装レビュー
├── architecture-review-{n}.md ← 修正後の設計適合性レビュー
├── review.md                  ← 独立 reviewer の生レポート
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

`shinaps-architect` を 1 体起動。実装レビューで同じ担当を再開できるよう、応答時のエージェントIDを保持する。

**プロンプトに含める情報**:
- タスク内容
- Phase 2 の調査結果 (explorer または handoff 済み investigation の必読ファイル一覧 + 要点)
- **Phase 2 で取得した `search_rules` 結果 (userRules + officialRules 全文)**
- 「作業前に必ず CLAUDE.md / プロジェクト規約を Read し、rule カタログと突き合わせよ」

**記録先**: メインが Write で `raw/architect.md`

### Phase 4: プランレビュー

委託が許可されている場合、`shinaps-plan-reviewer` (Opus / high) を **2体並列**で起動し、両者へ同じ情報を渡す。起動時にモデルを上書きしない。同時実行枠が不足する場合は順次起動し、2体分の独立した結果を揃える。

- タスクの目的・受入条件、Phase 2 の調査結果と rule 全文
- Phase 3 の architect 案全文 (再策定時は最新案)
- 「設計・要件・実装可能性・リスク・テスト戦略・過剰設計をレビューし、判定と具体的な修正案を返す。他のプランレビュー担当の結果は読まず、意見を交換しない」

両者の完了までは対象の計画を変更しない。メインは結果を `raw/plan-review-{round}-1.md` と `raw/plan-review-{round}-2.md` に保存する (round は 1 始まり)。片方が失敗・未完了なら2体で検証済みと扱わず、未完了分を完了させてから統合する。

メインが各指摘を要件・コード・規約と照合し、重複をまとめる。多数決では判断せず、採否と根拠を記録する。採用した修正を architect 案に反映し、単一の最終 `plan.md` を保存する。仕様判断や設計の対立が既存の合意で解決できない場合はユーザーへ一問ずつ確認する。

差し戻しがある場合は、その根拠を検証し、必要な再策定を同じ architect に依頼する。修正版を `raw/architect-revised-{n}.md` に保存し、2体とも同じ修正版を改めてレビューする。採用した Critical / Warning が計画に反映され、未解決の判断がなくなってから Phase 5 へ進む。委託不可の場合はメインが同じ観点で確認し、独立レビュー未実施と明記する。

計画段階では `refine` を併走させない。設計に効く規約はプランレビューで確認し、コードの規約照合は実装後に行う。

### Phase 5: 実装フェーズ

#### A. 引き継ぎ

メインが `plan.md` を再読し、ビルド順序を `TaskCreate` で展開する。委託が許可されている場合は `shinaps-implementer` を 1 体起動し、以下を渡す:

- タスクの目的・受入条件、確定した `plan.md` 全文
- Phase 2 の調査結果と必読ファイル、Phase 4 のレビュー指摘と設計判断の理由
- 適用するプロジェクト規約と Phase 2 の search_rules 結果 (userRules + officialRules 全文)
- 作業ディレクトリ、担当するファイル・責務、既存の未コミット変更、必要な検証
- 「同じ作業ツリーには他の作業があるため、他者の変更を戻さず、現在の内容に合わせて実装する」

実装担当が作業している間は、メインも同じ範囲を編集しない。実装担当のモデルを起動時に上書きせず、定義の `model: opus` を使う。

#### B. 実装と確認

実装担当は確定した計画を実装し、仕様を保つ簡素化と必要な検証まで行う。メインは報告と実際の差分を確認し、完了した項目を `TaskUpdate` で更新する。

目的・仕様を左右する不明点、計画と既存実装の不一致があれば、実装担当は変更を広げずメインへ返す。メインが既存の合意で解決できない点だけ `AskUserQuestion` で一問ずつ確認し、決定を実装担当へ返す。通常の実装判断は既存規約に従って進める。

実装担当の実装ミスによる検証失敗は 3 回まで自己修正する。それを超える場合はメインへ失敗の根拠と未解決点を返し、メインが「さらに修正試行 / Phase 6 のレビュー対象として diff を渡す / Phase 4 に戻って再策定する」を確認する。

#### C. 記録と検証

メインが実装担当の報告を `implementation.md` に保存する:

- 変更ファイルと変更内容、設計上の理由
- 実装中の重要な判断、計画からの変更とその合意
- 実行した検証コマンドと結果、未実施の確認
- 残課題・規約衝突・未解決の論点

必要な検証はプロジェクト規約・CI・変更の影響から決める。UI変更の実画面確認は簡素化の適用後に Phase 6 の `verify-ui` 呼び出しで行う。メインは報告だけで完了とせず、差分と検証の根拠を確認して Phase 6 へ進む。

### Phase 6: 簡素化後のセルフレビュー + refine

`Skill(skill="shinaps:simplify", args="提案のみ。対象・目的・受入条件・最終 plan・規約・現在の差分を参照し、2体の独立した提案を統合して返す")` を呼ぶ。引数には今回の具体的な対象と成果物のパスを含める。単にメインが簡素化を考えることでスキル呼び出しを省略しない。

メインが統合された提案を確認し、採用する削除・統合を同じ実装担当へ渡す。仕様変更が必要な提案はユーザーに確認する。適用後に影響する検証を再実行し、メインが結果を `raw/simplify.md` に残す。UI変更があれば `Skill(skill="shinaps:verify-ui", args="今回のUI変更と対象環境・受入条件")` を呼んで確認する。

その後、`Skill(skill="shinaps:refine", args="照合のみ。今回の対象ファイルと変更範囲を、2体で独立して照合して返す。編集しない")` を具体的な対象とともに呼び、結果を `raw/refine.md` に保存する。これらのスキル内でエージェントを起動するため、dev が simplify / refine の担当を重複起動しない。未提供のツールやスキルを実行したことにせず、実施できなかった工程を明記する。

簡素化後の同じ最終差分 (staged / unstaged / untrackedを含む) を、以下の2担当が **並行して読み取り専用でレビュー**する:

| 担当 | 主な観点 |
|---|---|
| Phase 3 の architect を再開 | 最終 plan・受入条件・合意済み変更に対して実装と検証が成立しているか |
| 新しい `shinaps-reviewer` 1体 | コードの正しさ・安全性・性能・保守性・規約を独立して確認 |

両者に最終 plan、実装報告、現在の差分とファイル、検証結果、rule 全文を渡す。architect には「実装レビューとして、初回案ではなく確定した計画と現在のコードを照合する」と明記する。再開できない場合は設計時の判断理由も渡して新しい architect を起動し、同じ担当の再開ではないことを記録する。

両者は今回の相手のレビュー結果を読まず、意見を交換しない。メインと実装担当も、両者が完了するまで対象を編集しない。同時実行枠が不足する場合は順次実行し、独立性を保つ。先に実行した `refine` の照合結果も統合し、修正は全結果が揃ってから Phase 7 で実装担当へ渡す。

結果はそれぞれ `architecture-review.md`、`review.md`、`raw/refine.md` に保存する。メインが全指摘を実コードと照合し、重複を整理し、異なる判断は根拠から解決する。完了していない担当の確認を成功扱いにしない。委託不可の場合はメインが各観点を確認し、独立レビュー未実施と明記する。

### Phase 7: 修正ループ

- **Critical は必ず自動修正** (architect / reviewer Critical + refine の `scope=changed` な Violation、承認不要 — 動作を壊している / 規約違反の指摘)
- **Phase 5 で検出された検証の失敗** も Critical として修正
- **Warning は `AskUserQuestion` で確認**: 「全部修正 / 個別に確認 / 後回し (Issue 化) / スコープ外として記録」 (architect / reviewer Warning + refine Improvement)
- **refine の `scope=pre-existing` な finding は自動修正しない**。今回の実装と無関係な差分が commit に混ざるため、Violation でも `AskUserQuestion` で「今回直す / 別タスクにする」を確認する
- **Info は記録のみで修正しない**
- **簡素化レビューの「仕様を変えない削除・統合」は自動適用**し、Phase 5 の動作確認を再実行する。削除は追加より検証しやすく、残すほうが保守の負債になるため。**「仕様変更を伴う提案」は `AskUserQuestion` で確認**: 「採用して仕様を変える / 現状維持 / 別タスクにする」

修正を行った場合、`fix-log.md` に「指摘 → 修正内容 → 該当ファイル」を記録。修正判断も `fix-log.md` に残す。

修正実装は Phase 5 の `shinaps-implementer` を再開して依頼する。メインは確定した指摘・修正判断・現在の差分・必要な再検証を渡す。再開できなければ Phase 5 の引き継ぎ情報と実装・修正履歴を新しい実装担当へ渡す。委託不可の場合はメインが修正する。大規模な再実装が必要な場合は、メインが「現行の計画で修正継続 / Phase 4 に戻って再策定」を確認する。

### Phase 8: 修正後の再レビュー (Critical / Warning 修正時のみ)

Phase 7 で **Critical または Warning を修正した場合のみ**、Phase 6 と同じ分担で architect を再開し、独立した `shinaps-reviewer` を起動する。両者が同じ修正後の差分をレビューし、結果が揃うまで編集しない (refine の再発火は Phase 8 では不要)。

これは「修正で別バグを生むリスク」を検出するため。

- プロンプトには最新の最終 plan と「修正後の差分」「修正前の指摘」「修正内容」「検証結果」を渡す。今回の相手のレビュー結果は渡さない
- 応答は `architecture-review-{n}.md` と `review-{n}.md` に保存 (n は 2 始まり)
- 再レビューでさらに Critical が出た場合は再修正 → 再レビューを Critical が無くなるまで繰り返す
- 各ラウンドの修正は `fix-log.md` に追記し、ラウンド数が判別できるようにする

修正がなかった場合は再レビューをスキップして Phase 9 へ。

### Phase 9: 完了と必要なhandoff

変更、簡素化、検証結果、未確認事項を報告する。コミットが明示されていれば、その許可範囲と通常／自律モードを `commit` へ引き継ぐ。コミット依頼がなければ未コミットのまま完了し、毎回コミット許可を要求しない。PRやリリースは明示された場合だけ、それぞれ `create-pr`・`release` へ進む。

## 動作原則

- **EnterPlanMode は使わない**: bypassPermissions モード (リモート実行など) と両立させるため
- **実装と修正は同じ担当へ引き継ぐ**: 委託が許可されている場合は Opus の `shinaps-implementer` を使い、メインが確定した計画・規約・判断理由を渡して差分を確認する
- **レポートの保存はメインが担当**: subagent は結果を文字列で返す。実装担当は担当範囲のコード・テスト・必要なドキュメントを編集し、raw/*.md など進行管理の成果物はメインが保存する
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
