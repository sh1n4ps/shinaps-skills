---
name: explore
description: バグか確定していない違和感、既存挙動の「なぜ」、実装方針や変更影響について、人間が理解・納得できるまで質問を重ねる対話型 read-only 調査スキル。質問ごとにコード、テスト、設定、git history、必要な公式情報を調べ、confirmed / inference / unknown を分けて根拠付きで回答する。debug のように根本原因確定を急がず、spec のように仕様策定を目的にせず、実装は行わない。理解が揃い実装内容に合意したら exploration.md を /shinaps:dev-claude に直接渡す。「今の実装はどうなっている？」「なぜこうなる？」「この変更はどこに効く？」「実装前に一緒に調べたい」「質問しながら理解したい」で使う
argument-hint: <調べたいバグ・挙動・実装上の疑問（省略可）>
---

## 質問の実行経路（全工程に優先）

対話セッションでは利用可能な質問UIで一問ずつ回答を受ける。CodexからローカルClaude CLIで呼び出された場合、以下の `AskUserQuestion`・確認・回答待ちの指示はすべて、質問一問・判断に必要な情報・再開する工程を最終resultへ返してターンを終了する手順に読み替える。CLI内で `AskUserQuestion` を呼んだり人の入力を待ち続けたりしない。Codexが回答を取り次ぎ、同じsessionをresumeして指定の工程から再開する。回答が必要な作業を先に進めず、終了を完了と報告しない。単独commitのflow選択にも同じ規則を適用する。


## 作業記録の保存先

作業記録は現在の作業先の `.shinaps/work/` 以下へ保存する。初期化と保全は [作業記録の共通手順](../../references/work-records.md) に従う。

## 実行環境とプロジェクト条件

この節は以下の工程全体に適用する。適用される `AGENTS.md`・`CLAUDE.md` と参照先、CI、既存スクリプトから今回の条件を読み、明示された依頼・許可を引き継ぐ。仕様に影響する不足だけ一問ずつ確認する。新しい恒久方針の保存はユーザーの了承を得てプロジェクト側へ行う。

Claude Codeの `Skill`・`Agent`・`AskUserQuestion`・`TaskCreate` を利用できる場合は対応するツールを使う。現在のセッションで提供されていないツールは仮定しない。質問は一問ずつ確認して回答を待つ。

別セッションへの委託・新しいworktreeは明示された許可がある場合だけ行う。委託不可なら現在のセッションで調査・計画・レビューの観点を順に確認し、独立レビューとは報告しない。独立レビューがプロジェクトの必須条件なら未完了として扱う。Shinapsのエージェント名はClaudeのpluginで公開された名前を使う。サービスのrule照合が必要な工程でMCPを利用できなければ、その工程を未確認として報告し、照合済みとしない。

## このスキルの責務

人間を質問の主体にして、1 つの疑問を調査して答えるサイクルを、本人が理解できたと明示するまで繰り返す。

| スキル | 主目的 | 終了成果物 |
|---|---|---|
| `shinaps:explore` | 現状・因果・選択肢を対話で理解する | `exploration.md` |
| `shinaps:debug` | 具体的な不具合の根本原因を仮説検証で確定する | `debug-validated.md` |
| `shinaps:spec` | 要望と受け入れ条件を確定する | `spec.md` |
| `shinaps:dev-claude` | 計画し、実装・検証・セルフレビューする | コード + `implementation.md` |

`explore` では最初から「バグ」「採用案」「修正対象」を決めつけない。調査中に不具合らしさが高まっても、自動で `debug` や dev の入口へ移らず、人間の質問に答え続ける。

## 引数仕様

| 呼び出し | 動作 |
|---|---|
| `/shinaps:explore <疑問・違和感・調べたい実装>` | 記述を最初の質問として調査を開始する |
| `/shinaps:explore <ファイルパス>` | 指定ファイルを起点に「何を理解したいか」を 1 問だけ確認して開始する |
| `/shinaps:explore` | `AskUserQuestion` で最初に理解したいことを確認する |

引数は完成したバグ報告や要件でなくてよい。「この辺がよく分からない」「本当にこの設計でよい？」のような未整理の疑問を受け付ける。

引数なしでは「現在の挙動・バグの可能性 / 実装構造・データフロー / 変更案・影響範囲」の 3 択を、ファイルパスだけなら「責務と呼び出し元 / 特定挙動との関係 / 変更時の影響」の 3 択を提示する。`Other` の自由記述を、人間自身の最初の質問として扱う。

## 使用エージェント

| エージェント | subagent_type | 役割 |
|---|---|---|
| Shinaps Investigator | `shinaps-investigator` | そのラウンドの質問だけを、コード・テスト・設定・履歴から read-only で調べて回答する |
| Shinaps Tech Surveyor | `shinaps-tech-surveyor` | 外部仕様やライブラリ挙動が結論を左右するときだけ調査する |
| Shinaps Survey Validator | `shinaps-survey-validator` | 外部情報に依存する重要な主張を出典で再確認する |

対話、主要根拠の再確認、成果物の更新、次アクションの判断はメインスレッドが担当する。subagent は文字列応答のみ返し、ファイルを書かない。

## ディレクトリ規約

```
.shinaps/work/explorations/{YYYYMMDD-HHMMSS}-{slug}/
├── exploration.md                 ← 現在の理解と dev handoff 契約を保つ、随時更新する文書
├── question-log.md                ← 質問と回答の要約。会話の逐語録にはしない
└── raw/
    ├── investigation-001.md       ← 各ラウンドの investigator 生レポート
    ├── investigation-002.md
    ├── survey-002.md              ← 外部調査を行ったラウンドのみ
    └── survey-validated-002.md
```

`{slug}` は最初の論点を表す短い英語スラッグ (kebab-case、30 文字以内)。途中で論点が深まっても同じディレクトリを使う。別機能へ完全に移った場合だけ、新しい explore を開始するかを確認する。

## 実行フロー

### Phase 1: セッション初期化

1. 最初の質問を受領する。引数が空、またはファイルパスだけなら、理解したいことを `AskUserQuestion` で 1 問だけ確認する
2. git remoteから `repoOwner` / `repoName` を解決する。今回の依頼に関連する既存の spec・調査レポート・Git の変更履歴を確認し、引き継ぐ決定と根拠を要約する。既存成果物がなければ追加取得は不要。
3. `list_search_facets()` と、最初の質問に対応する `search_rules({ repoOwner, repoName, ...推定 facet })` を呼ぶ。論点が別領域へ移ったら、その時点で facet を取り直す
4. リポジトリの `CLAUDE.md` / `AGENTS.md` / その他の指示ファイルを読む
5. `git status --short --branch` と HEAD を記録する。調査対象の revision は未コミット変更を含む現在の worktree をデフォルトにし、production / PR / commit が明示された場合は対象 revision を特定して別に記録する。reset / stash / checkout / clean は行わない
6. 作業ディレクトリを作り、最初の質問と調査基準を `exploration.md` / `question-log.md` に要約して保存する

`explore` が変更してよいのは、この作業ディレクトリ内の調査成果物だけ。プロダクトコード、テスト、設定、依存関係、生成物、git index は変更しない。

### Phase 2: 質問ラウンド

1 ラウンドでは、相互に関係する 1 つの疑問を扱う。人間が複数の独立した質問を一度に出した場合は、質問ごとに investigator を分け、独立なら並列起動する。

#### ラウンド開始時

1. 質問をそのまま `question-log.md` に要約して追記する
2. `git status --short --branch` を再確認し、confirmed findings の根拠ファイルは保存済み content hash と現在値を比較する。前ラウンドから変わっていれば、古い根拠を流用せず読み直す
3. 現在の `exploration.md` を読み、既に確認済みの事実と今回の未解決点を分ける

#### `shinaps-investigator` に渡す情報

- 今回の質問。言い換えで論点を狭めすぎず、ユーザーの表現も残す
- `exploration.md` 全文と、必要な過去ラウンドの要点
- target revision / environment と、現在の branch / HEAD / worktree 状態
- 関連する既存成果物の要約
- `search_rules` の userRules + officialRules 全文
- 関連するプロジェクト指示
- 「今回の質問へ直接答え、confirmed / inference / unknown を混ぜない。一般的な設計案や修正案へ先回りしない」

応答全文を `raw/investigation-{NNN}.md` に保存する。

#### 外部情報が必要な場合

ライブラリの現行仕様、既知バグ、OS / runtime 差、公式推奨が答えを左右する場合だけ、`shinaps-tech-surveyor` → `shinaps-survey-validator` を追加で起動する。外部情報は公式 docs、一次資料、upstream issue を優先し、重要な結論は validator を通す。生レポートを同じラウンド番号で保存し、検証済み内容だけを回答へ採用する。

### Phase 3: メインスレッドによる根拠確認

investigator の回答をそのまま転送しない。結論を支える主要な file:line、テスト、設定、git history をメインスレッドでも直接確認する。

- 実行経路の主張は entry point から結果まで因果がつながるか読む
- HEAD と未コミット差分を混同しない
- 既存テストや安全なローカル再現で不確実性を大きく減らせるなら、tracked file を変更しないと確認できるコマンドだけ実行し、実行後に worktree 状態を再確認する
- production deploy、外部データ変更、依存追加など調査を越える操作は行わない
- 確認できない主張は `inference` または `unknown` に下げ、解消に必要な証拠を示す

### Phase 4: 回答と exploration.md 更新

各ラウンドの回答は次の順で短く提示する。

1. **直接の答え**
2. **確認できたこと (`confirmed`)** — file:line / test / docs URL を添える
3. **推測 (`inference`)** — 推測である理由と確信度を添える
4. **まだ分からないこと (`unknown`)** — 何を見れば確定できるかを添える
5. **次に調べる価値が高い論点** — 最大 3 件

回答後、`question-log.md` には質問と回答の要約だけを追記し、`exploration.md` を現在の理解へ更新する。confirmed finding を支えるローカルファイルは、現在内容の hash (`git hash-object` など、object を書き込まない read-only 計算) を関連リソースへ記録する。過去の誤った仮説を残す必要がある場合は「却下済み」と明記し、現在の結論と混ぜない。

`exploration.md` は最低限、次を保つ。

- 調査対象と人間が理解したいこと
- 現在のメンタルモデル / 実行フロー
- confirmed findings と根拠
- inference / unknown
- 意思決定済みの事項と理由
- 実装する場合の目的・制約・非目標
- 関連ファイルと raw report の索引

初期化時は次の構造で作り、明示的な実装合意までは `status: not-ready` を維持する。

```markdown
# Exploration: {topic}

## セッション基準
- repository / branch / HEAD
- targetRevision / targetEnvironment
- initialWorktreeStatus
- lastVerifiedAt
- evidenceSnapshot:
  - `{confirmed 根拠の path}`: `{contentHash}`
  - `{外部資料 URL}`: `checkedAt={timestamp}`

## 調査対象
## 現在のメンタルモデル
## Confirmed findings
## Inference
## Unknown
## 意思決定
## 関連リソース

## 実装 handoff
- status: not-ready
- objective:
- expectedBehavior:
- constraints:
- nonGoals:
- unresolvedRisks:
```

### Phase 5: 理解チェックポイント

1 回答しただけで自動終了・自動実装しない。人間が次の質問を直接入力した場合は、そのまま Phase 2 に戻る。次の質問がまだ無い場合は `AskUserQuestion` で、状況に合わせた相互排他的な 3 択を提示する。

- **次の論点を調べる (Recommended)** — Phase 4 で挙げた最重要の未解決点を具体名で示す
- **実装へ進む** — 実装したい変更が合意済みの場合だけ提示する
- **保存して終了** — 現在の理解を残して終了する

自由記述の `Other` は、人間自身の次の質問として扱う。ラウンド数に上限を設けず、「十分理解できた」「実装へ進みたい」「終了したい」のいずれかを人間が明示するまで調査を続ける。

実装内容がまだ曖昧な状態で「実装へ進む」が選ばれたら、望む変更を 1 問ずつ確認する。未解決点が残る場合は、残したまま実装するか調査を続けるかを選んでもらう。

### Phase 6: `/shinaps:dev-claude` への引き継ぎ

実装へ進む前に `exploration.md` の「実装 handoff」セクションを確定する。

- 実装目的と期待する挙動
- confirmed な現状と問題
- 合意した変更、制約、非目標
- 関連 entry point / data flow / tests
- 未解決点と受容したリスク
- 再利用すべき `raw/investigation-*.md` の一覧

handoff 直前に confirmed 根拠の content hash を再計算し、`evidenceSnapshot` を最新化する。人間が内容を確認した後にだけ `status: ready` へ更新する。説明を理解して終了するだけのセッションや、望む変更が曖昧なセッションは `not-ready` のまま残す。

安定した設計判断や再利用価値のある発見だけをローカル成果物（implementation.md / 調査・レビューレポート）へ短く記録する。質問ログや長いコード引用は記録しない。

中間 handoff ファイルは作らず、`exploration.md` のパスを直接渡す。担当と人数はdevのメインが作業に応じて判断する。

```
Skill(skill="shinaps:dev-claude", args="以下の対話調査で合意した変更を実装する。詳細は .shinaps/work/explorations/{ts}-{slug}/exploration.md を参照: {実装目的の 1 行サマリ}")
```

dev の入口は「実装 handoff」の `status: ready` と `evidenceSnapshot` の内容ハッシュを確認してから合意済み変更・confirmed findings・未解決点を取り込む。`exploration.md` と同ディレクトリの `raw/investigation-*.md` を既存実装調査として再利用し、情報が不足・陳腐化している場合だけ `shinaps-explorer` で補完する。

## 動作原則

- **人間が質問の主体**: 固定チェックリストを一方的に消化せず、その人が納得するための次の疑問を優先する
- **実装を急がない**: 明示的な handoff までは read-only 調査に徹する
- **事実・推測・未知を分離**: もっともらしい説明を confirmed として扱わない
- **調査対象を固定する**: デフォルトの現在 worktree、HEAD、PR、指定 commit、production のどれを説明しているかを明示し、未コミット変更も無視しない
- **質問ごとに調査する**: 過去の一般論だけで即答せず、そのラウンドの問いに必要な証拠を取り直す
- **理解完了を代行しない**: 終了判定は人間が行う。回数制限を設けない
- **生レポートを保存する**: subagent 応答は全文保存し、会話ログは要約だけ残す
- **shinaps MCP はメインだけが呼ぶ**: subagent は `search_rules` / `list_search_facets` を直接呼ばない

Linear進行への成果引き渡しでは、確定済みの経路を維持する。autoは同じ[Claude CLI](../../references/linear/claude-cli.md)のsessionのresultへ返す。manualは同じ対話セッションで続け、[Bridge](../../references/linear/bridge.md)で依頼元のCodexへ報告する。調査スキルから経路を切り替えない。
