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
| Shinaps Architect | `shinaps-architect` | 設計・プラン統合・設計適合性レビュー・全指摘の統合を担当 |
| Shinaps Plan Reviewer | `shinaps-plan-reviewer` | Opus 2体で同じ計画を独立レビューし、指摘と修正案を返す |
| Shinaps Implementer | `shinaps-implementer` | 確定した計画の実装・検証と、レビュー後に決まった修正 (Opus) |
| Shinaps Reviewer | `shinaps-reviewer` | logic / design / security / performance / maintainability / rule の統合観点でレビュー |

委託が許可されている場合、実装と修正は **`shinaps-implementer` (Opus) 1 体**が担当し、architect が設計判断と全指摘の統合を担い、メインはスキル呼び出し・エージェントの起動と再開・待機・記録・ユーザーへの確認を担う。設計判断を実装へ引き継ぎつつモデルの利用を分けるため、確定した計画・判断理由・規約を実装担当へ渡す。委託不可またはエージェントを利用できない場合はメインが担当し、その旨を報告する。

## モデルと指摘の事前整理

メインは Opus / medium、architect は定義の best / medium を使う構成を推奨する。スキルからユーザーのモデル設定を変更しない。メインが別モデルの場合は Opus で整理したとは報告しない。

プランレビューと実装後レビューの全結果が揃ったら、メインが次の形で整理してから architect へ渡す。整理専用のエージェントは追加しない。

- 生レポートは全文保存し、全指摘に出典ID（担当・ラウンド・項番）を付ける。同じ原因・影響・修正方針の指摘だけまとめ、元の全IDと原文のパス・節を残す。判断が割れる指摘や同じ場所の別問題は統合しない。
- 各項目に要点、重要度、対象の file:line、根拠、修正案、維持する契約、異論・不確実性を残す。全出典IDが整理後の項目に対応することを照合し、確認範囲・未確認事項も引き継ぐ。件数や文字数で指摘を落とさない。
- メインは採否・重要度の引き下げ・対立の解消を行わない。architect が全項目を判断し、曖昧な要約や対立は原文・実コードで確かめる。
- 整理結果はプラン用 `raw/plan-findings-{round}.md`、実装用 `raw/findings-{round}.md` に保存する。architect には整理結果と原文への参照、前回からの変更・検証結果を渡す。既に渡した計画・規約・レポート全文を毎回貼り直さず、変更部分を示す。再開できず文脈を失った場合は必要な情報を引き継ぐ。

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

`shinaps-architect` を 1 体起動。応答時のエージェントIDを保持し、プラン統合・実装レビュー・指摘統合で同じ担当を再開する。implementer が作業する間もIDと文脈を保持し、architect を破棄しない。再開できない場合だけ設計判断・最新計画・過去の指摘と採否を後任に引き継ぎ、その旨を記録する。

**プロンプトに含める情報**:
- タスク内容
- Phase 2 の調査結果 (explorer または handoff 済み investigation の必読ファイル一覧 + 要点)
- **Phase 2 で取得した `search_rules` 結果 (userRules + officialRules 全文)**
- 「作業前に必ず CLAUDE.md / プロジェクト規約を Read し、rule カタログと突き合わせよ」

**記録先**: メインが Write で `raw/architect.md`

### Phase 4: プランレビュー

委託が許可されている場合、`shinaps-plan-reviewer` (Opus / medium) を **2体並列**で起動し、両者へ同じ情報を渡す。起動時にモデルを上書きしない。同時実行枠が不足する場合は順次起動し、2体分の独立した結果を揃える。

- タスクの目的・受入条件、Phase 2 の調査結果と rule 全文
- Phase 3 の architect 案全文 (再策定時は最新案)
- 「設計・要件・実装可能性・リスク・テスト戦略・過剰設計をレビューし、判定と具体的な修正案を返す。他のプランレビュー担当の結果は読まず、意見を交換しない」

両者の完了までは対象の計画を変更しない。メインは結果を `raw/plan-review-{round}-1.md` と `raw/plan-review-{round}-2.md` に保存する (round は 1 始まり)。片方が失敗・未完了なら2体で検証済みと扱わず、未完了分を完了させてから統合する。

メインが同じ architect を「プラン統合」として再開し、メインが事前整理した全指摘と原文への参照を渡す。architect が根拠を検証して対立を判断し、採否と修正版の最終計画を返す。メインは結果を保存し、単一の `plan.md` を確定する。architect が仕様判断や範囲拡大の相談を返した場合だけ、メインがユーザーへ一問ずつ確認して決定を戻す。

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

必要な検証はプロジェクト規約・CI・変更の影響から決める。UIレビューはこの開発フローとは別に Codex 側で行う。未実施のUIレビューを完了と報告しない。メインは報告だけで完了とせず、差分と検証の根拠を確認して Phase 6 へ進む。

### Phase 6: review・refine・simplify を並行実行

実装と必要な検証が終わった同じ差分を固定し、メインが次の3スキルを明示的に呼ぶ。各スキルは担当エージェントをバックグラウンド起動してIDを返し、メインが全体の起動・待機・記録を管理する。実装後のレビューラウンドは初回を1として数え、この依頼内で最大2回までとする。計画段階のプランレビューはこの回数に含めない。

| スキル呼び出し | 担当 |
|---|---|
| `Skill(skill="shinaps:review", args="開発レビュー、起動のみ。…")` | 設計した architect を再開 + 独立 reviewer 1体 |
| `Skill(skill="shinaps:refine", args="照合のみ、起動のみ。…")` | Opus / medium 2体 |
| `Skill(skill="shinaps:simplify", args="提案のみ、起動のみ。…")` | Opus / medium 2体 |

引数の省略部分には具体的な対象ファイル・変更範囲、最終 plan・受入条件・合意済み変更、実装報告、検証結果、規約・rule 全文と成果物のパスを渡す。review には設計担当のエージェントIDと設計判断も渡す。単独の review とは異なる開発レビューの手順を使い、外部調査や review-validator を追加起動しない。

先に起動した担当の完了を待ってから次のスキルを呼ぶのではなく、3スキルの担当を起動してから結果を待つ。dev 自身が同じ担当を重複起動しない。同時実行枠が足りなければ未起動分を記録して順次実行し、台数や確認範囲を黙って減らさない。ツールや委託が利用できなければその制約を明記し、独立確認済みと扱わない。

全担当は読み取り専用で、今回の他担当の結果を読まず、意見を交換しない。メインと実装担当も全結果が揃うまで対象を編集しない。途中で外部の変更が入った場合は、その影響範囲を最新の同じ差分で確認し直してから統合する。

各スキルの確認範囲・未完了報告を確認し、未確認部分は同じ担当へ戻す。対象が大きい場合も継続または後任への引き継ぎで全対象を確認する。失敗・未完了を「指摘なし」として処理しない。

自分のレビューを確定した architect と全担当の結果を保存する。初回は `architecture-review.md` / `review.md` / `raw/refine.md` / `raw/simplify.md`、2回目は各ファイル名に `-2` を付ける。全結果が揃った後、メインが architect 自身の確定済みレビューも含めて事前整理する。その後で同じ architect を「指摘統合」として再開し、整理した全指摘・原文への参照・差分の更新・検証結果・ラウンド番号を渡す。独立レビュー中に他担当の結果を渡さない。

### Phase 7: architect が統合し、implementer が修正

architect が review・refine・simplify の整理された全指摘を根拠から検証し、対立を判断する。全指摘の採否と理由、採用した修正の対象・責務・具体的な変更・維持する契約・必要な検証を、一つの修正指示として返す。メインはそのまま記録し、仕様・受入条件の変更や未許可の範囲拡大が必要な点だけユーザーに確認する。通常の設計・修正判断をメインでやり直さない。

修正不要なら Phase 9 へ進む。修正があれば、メインが同じ `shinaps-implementer` を再開し、architect の修正指示・確定した計画・現在の差分・規約・検証条件を渡す。再開できなければ実装履歴と採否を新しい担当へ引き継ぐ。architect は次のレビューに備えて保持し、自分でコードを編集したり、実装担当を追加起動したりしない。

implementer が修正と必要な検証を行い、変更・検証結果・未解決点を返す。メインは architect の採否と修正結果を `fix-log.md` に記録する。委託不可の場合はメインが同じ観点で対応し、独立した確認とは報告しない。

### Phase 8: 最大2ラウンドで終了する

- **1回目のレビュー後に修正した場合**: 修正後の同じ差分について、Phase 6 の review・refine・simplify を2回目として並行実行する。最新の計画、前回の指摘と採否、修正内容、検証結果を渡す。全結果を同じ architect に集約し、Phase 7 で必要な最終修正を実施する。
- **2回目のレビュー後に修正した場合**: implementer が最終修正と必要なテストを行ったら Phase 9 へ進む。3回目のレビュー・refine・simplify は起動しない。
- **修正不要の場合**: 回数を埋めるために再実行せず Phase 9 へ進む。

最大2回は実装後の全体レビューに対する上限であり、担当の再開・差し替えや計画の変更でリセットしない。検証失敗・重大な未解決事項・未完了の担当が残る場合も追加ラウンドで無期限に続けず、その状態を明記してユーザーへ返す。未完了の確認を完了済みのラウンドと偽らない。

### Phase 9: 完了と必要なhandoff

実施したレビュー回数、architect の判断と修正内容、検証結果、未解決事項を報告する。2回目の後に修正した場合は、その最終差分が再レビューされていないことを明記する。必須検証の失敗や重大な未解決事項があれば作業終了と品質上の完了を区別し、完了済みとは報告しない。コミットが明示されていれば、その許可範囲と通常／自律モードを `commit` へ引き継ぐ。コミット依頼がなければ未コミットのまま完了し、毎回コミット許可を要求しない。PRやリリースは明示された場合だけ、それぞれ `create-pr`・`release` へ進む。

## 動作原則

- **EnterPlanMode は使わない**: bypassPermissions モード (リモート実行など) と両立させるため
- **実装と修正は同じ担当へ引き継ぐ**: 委託が許可されている場合は Opus の `shinaps-implementer` を使い、メインが確定した計画・規約・判断理由を渡して差分を確認する
- **レポートの保存はメインが担当**: subagent は結果を文字列で返す。実装担当は担当範囲のコード・テスト・必要なドキュメントを編集し、raw/*.md など進行管理の成果物はメインが保存する
- **rule 照合を各 Phase に bake**: Phase 2 の `search_rules` → Phase 3 の architect prompt 埋め込み → Phase 4 の plan-reviewer (設計レベルの違反) → Phase 6 の refine 並列 (コードレベルの違反)
- **判断・方針転換で ローカル成果物（implementation.md / 調査・レビューレポート）**
- **目的・仕様を左右する不明点を確認**: 既存の指示で分かることや任された細部は再質問しない
- **生レポート保存厳守**: explorer / handoff 済み investigation / architect / plan-reviewer / reviewer / refine の応答は全文参照可能な状態を保つ
- **architect が指摘の採否と修正方針を統合する**: 合意済み仕様内は任せ、仕様や許可範囲が変わる判断だけユーザーに確認する
- **レビュー・規約照合・簡素化は同じ差分に並行して行う**: 全結果を統合してから実装担当が修正する
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
