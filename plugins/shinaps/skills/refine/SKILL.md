---
name: refine
description: 現在の uncommitted 変更 (`git diff HEAD` または `gh pr diff`) または計画テキスト (plan.md) を search_rules と 1 件ずつ照合し、Violation / Improvement / Question に分類する skill。3-5 カテゴリに束ねて Agent tool で shinaps-refine-agent を並列 dispatch → findings 集約 → diff mode は自明な修正を Edit で自動適用し判断要は 4 択 AskUserQuestion (修正する / 許容する / ルール側を直す / 後回し) で処理、plan mode は findings 一覧を返して終了 (plan.md への反映は呼び出し元の責務)。セルフレビュー直前 (diff mode) または plan-review 時 (plan mode) に発火。shinaps-ai server 未登録時は search_rules 呼び出しが自動で失敗して abort する。
argument-hint: "[<PR URL> | <commit SHA> | <range> | plan:<path>] (省略時は git diff HEAD)"
---

# shinaps:refine — 規約照合の checkpoint

このスキルは「commit / report 直前の self-review」および「plan 確定直前の rule 事前照合」を確実にやるためのバッチ照合手順書。CLAUDE.md に「セルフレビュー直前 → search_rules で規約照合」と書かれていても AI (あなた) が頻繁にスキップする現実への対症療法として、ユーザーが手動で発火するためにある。

shinaps-ai サーバは git / file / AI 推論を一切呼ばない。すべて Claude Code 側のあなたが手元の `git` / `Read` / 既存 MCP tools で実行する (private repo の内容をサーバ境界に渡さない設計)。

## 2 mode サポート

- **diff mode** (デフォルト、後方互換): 対象は git diff (uncommitted / commit range / PR)。findings を集約 → 自明な修正は Edit で自動適用、判断要は 4 択 AskUserQuestion
- **plan mode**: 対象は plan.md 等の計画テキスト。findings 一覧を返して終了 (plan.md への反映は呼び出し元 = shinaps:dev の Phase 4-C or ユーザーの責務)。plan-review 時に呼び出される想定

## 全体アーキテクチャ

メインスレッド (あなた) は **オーケストレータ** に徹する:

1. 入力モードと対象の確定、規約カタログの集約 (Step 0-1)
2. 規約を意味論的に 3〜5 カテゴリに束ねる (Step 2)
3. カテゴリごとに `shinaps-refine-agent` を **並列 dispatch** し、各 agent は担当カテゴリと mode に応じて対象を取りに行く (Step 3)
4. 返ってきた findings を集約 → mode 別に振り分け (Step 4-5)

こうすることで、rule 数が増えても 1 パスの照合密度が落ちない (各 agent は担当カテゴリのルールにフォーカスする) 上に、メインスレッドの context に巨大 diff / 巨大 plan を積まずに済む (対象は agent 側で必要な部分だけ取得する)。

## Step 0. 対象を確定する (MUST)

### 0-0. 入力モードの判定

まず引数を確認し、以下のモードに振り分ける:

- **plan mode**: 引数が `plan:<path>` 形式 (例: `plan:.claude/shinaps/20260709-120000-foo/plan.md`)
  - `<path>` 部分を絶対 path または repo 相対 path として解釈 → 存在確認 (不在ならエラー終了: 「plan.md が見つかりません: <path>」)
  - Step 0-1 (diff 確定ロジック) は完全に迂回
  - Step 3 で各 agent に渡す「対象取得コマンド」は `Read <plan.md 絶対 path>` の 1 行
- **diff mode** (デフォルト、`plan:` プレフィックス無し): 従来通り以下のロジックで diff を確定

### 0-1. diff 確定 (diff mode 時のみ)

以下の優先順位で対象 diff を決める:

1. **ユーザーが対象を明示していたらそれを最優先**。`/shinaps:refine` と一緒に PR URL / commit SHA / range を書いてくることがある:
   - **PR URL** (例: `https://github.com/owner/repo/pull/123`) → `gh pr diff 123 --repo owner/repo` で diff を取得。カレント repo と同じなら `--repo` は省略可。以降の diff コマンドは `gh pr diff 123 --repo owner/repo` (patch 出力) を使い、ファイル一覧が欲しいときは `gh pr diff 123 --repo owner/repo --name-only` を使う (`git diff --stat` の代替)
   - **commit SHA / range** (例: `abc123` / `main..feature` / `HEAD~3..HEAD`) → 以降の `git diff` の引数を `<指定範囲>` に置換する (`git diff <range>`, `git diff --stat <range>`, `git diff <range> -- <path>`)
2. 明示指定がなければ `git diff HEAD` (= staged + unstaged の合計、ローカル差分全部)
3. それでも出力が 0 件なら **ユーザーに確認**: 「変更がありません。直近の commit (`git diff HEAD~`) または特定 commit / PR を対象にしますか?」
4. 対象が決まったら `git diff --stat <対象範囲>` (PR の場合は `gh pr diff <n> --name-only`) で概観を掴む (変更ファイル数と各ファイルの ± 行数を頭に入れる)

対象が決まったらユーザーに「以下の diff を refine します (対象 / N files, ±X lines)」と 1 行で宣言してから先に進む。**Step 3 で各 agent に渡す「対象 diff の指定」も、ここで決めた範囲に必ず合わせること** (agent が独立に `git diff HEAD` を叩いてしまわないよう prompt に具体コマンドを埋め込む)。

**巨大 diff (1500 行超) でも scope 絞りは不要**。reviewer subagent 側で担当カテゴリに関係あるファイルだけを見に行くため、メインスレッドが事前に絞り込む必要がない。

## Step 1. 規約と context を集約する (並列取得)

以下を並列で取得:

- shinaps-ai MCP server の `list_search_facets()` で facet master (languages / platforms / frameworks / topics の登録済 slug 空間) を取得 → 対象 diff の内容から関係する facet slug を推定して確定
- shinaps-ai MCP server の `search_rules({ repoOwner, repoName, languages?, platforms?, frameworks?, topics?, kind? })` を呼ぶ → userRules + officialRules (両方を照合対象にする。userRules は facet に関係なく継承マージ全件、officialRules は admin が人間レビューで approved にした rule のうち指定 facet 一致で絞られる)。**repoOwner / repoName は現在の git workspace から必ず渡す** (`gh repo view` or `git remote get-url origin` から取得)。userRules は scope=user (横断) + scope=repo_owner (owner 一致) + scope=repo (owner+name 一致) の継承マージで返る。各 rule に乗る `scope` flag を見て「横断 / owner 限定 / repo 限定」を判別できる。facet を 1 つも指定せずに呼ぶと officialRules は空配列で返るので、必ず推定 facet を 1 つ以上指定すること。`kind` は通常指定しない (diff 全体を rule 集合と広く照合する用途のため、絞り込むと見落としが増える)
- repo root の `AGENTS.md` / `CLAUDE.md` を Read (プロジェクト規約)
- AGENTS.md が `docs/` 等を「source of truth」として参照していたら **その docs も Read** (今回触った領域に関連するものに限定して良い)
- グローバル `~/.claude/CLAUDE.md` の `## コメントルール` `## 実装・設計に関して` 等の節 (一度読んだセッションなら conversation history で代替可)
- 該当 repo の auto-memory `~/.claude/projects/<slug>/memory/MEMORY.md` がもしあれば Read

これらは「Step 2 でカテゴリ束ねる」ための素材。全文を再 Read で context に積まなくても、必要時に grep / Read で引ければ十分。

## Step 2. 規約を 3〜5 カテゴリに束ねる (意味論分類)

Step 1 で集めた rules と AGENTS.md / CLAUDE.md のガイドラインを **意味論的に 3〜5 個のカテゴリ** に束ねる。カテゴリ数はルール本数と多様性で判断する:

- 目安: rule 10 件未満なら 2〜3 束、10〜30 件なら 3〜4 束、30 件超なら 4〜5 束
- 上限は 5 束 (超えると agent 起動コストとメインスレッド集約コストが体感を悪化させる)
- カテゴリ名は動的に命名して良い (例: "naming & readability" / "testing & mocks" / "security & secrets" / "architecture & abstraction" / "commit & workflow")
- rule が 1 件しか属さないカテゴリは避け、隣接カテゴリに寄せる
- 逆に 1 カテゴリに rule が偏りすぎたら分割する

AGENTS.md / CLAUDE.md 側の記述も **同じカテゴリ体系に振り分ける** (「コメントルール」節は "naming & readability" に、「実装・設計に関して」は "architecture & abstraction" に、など)。rule と docs をカテゴリ単位でセットにして agent に渡すのがポイント。

分類が終わったら、ユーザーに「以下 N カテゴリで並列レビューします」と 1 行で報告 (どのカテゴリに何件 rule が入ったか)。

## Step 3. カテゴリごとに shinaps-refine-agent を並列 dispatch (MUST)

`Agent` tool を **同一メッセージ内で複数呼び出す** ことで全カテゴリを並列起動する (`subagent_type` は `shinaps-refine-agent`)。1 メッセージ内に含めることが並列実行の必須条件。

subagent 側は system prompt で mode 分岐 / finding severity 解釈 / JSON 返却フォーマット / credit 最適化原則を既に持っているので、Skill 側は必要最小限の情報だけ渡せばよい。

### 各 agent への prompt テンプレ

各 agent には以下を渡す (カテゴリごとに埋める):

- **モード**: `diff` または `plan` (subagent の分岐に使う)
- **担当カテゴリ名** と、そのカテゴリに属する **rule 全件** (title / why / recommend / avoid / source_urls を full text で。id も添えて後で record_memory / update_rule するとき参照できるように)
- そのカテゴリに関連する **AGENTS.md / CLAUDE.md / docs の該当節** (全文でよい、agent 側で context 消費するので原文をそのまま貼る)
- **repo root の絶対 path**
- **対象取得コマンド** (Step 0 で確定したモード / 対象に応じて、以下のうちいずれか 1 組を具体コマンドとして埋め込む):
  - **diff mode - ローカル**: `git diff HEAD` / `git diff --stat HEAD` / `git diff HEAD -- <path>`
  - **diff mode - commit range**: `git diff <range>` / `git diff --stat <range>` / `git diff <range> -- <path>` (例: `main..feature`, `HEAD~3..HEAD`)
  - **diff mode - PR**: `gh pr diff <n> --repo owner/repo` / `gh pr diff <n> --repo owner/repo --name-only` / `gh pr diff <n> --repo owner/repo -- <path>` (owner/repo 込みで固定して渡す。agent が自分で解決しないよう完全形にする)
  - **plan mode**: `Read <plan.md 絶対 path>` (単一コマンド)

### 各 agent が踏む手順 (mode 別、prompt 内に明記する)

**diff mode**:

1. 「ファイル一覧コマンド」(`--stat` or `--name-only`) を repo root で実行し、変更ファイル一覧を把握する
2. 担当カテゴリのルールに **関連しそうなファイル** を選ぶ (拡張子 / パス / 変更行数から判断)。カテゴリと明らかに無関係なファイル (例: "testing & mocks" 担当が `docs/*.md` を見る) はスキップして良い
3. 選んだファイルごとに「詳細取得コマンド」を `<path>` に差し替えて実行し、hunk を取得
4. 必要なら周辺コードを `Read` して「なぜこの変更が入ったか」の文脈を掴む
5. 各 hunk を担当カテゴリのルールと突き合わせ、findings を分類する

**plan mode**:

1. `Read <plan.md 絶対 path>` で plan.md を全文取得する
2. 担当カテゴリのルールに **関連する記述** を選ぶ (該当節・見出し・具体的な設計判断)
3. 各記述を担当カテゴリのルールと突き合わせ、findings を分類する

**共通の finding 分類基準** (subagent 側の system prompt で mode 別に解釈済み):

- **Violation**: 現在の対象が rule に既に反している
- **Improvement**: 違反ではないが規約の趣旨に沿った改善余地がある / plan mode では将来違反の可能性
- **Question**: 規約が曖昧 or 規約に載っていない判断

**共通**: 各 finding には **根拠** を必ず添える (rule id + title / docs 引用)。根拠なしは report しない。

### Agent の返却フォーマット (JSON 構造で返させる)

各 agent には以下の JSON を返すよう prompt 末尾で指示する:

```json
{
  "category": "<担当カテゴリ名>",
  "findings": [
    {
      "severity": "violation" | "improvement" | "question",
      "file": "<repo root からの相対 path>",
      "line": <該当行番号 or null>,
      "summary": "<1 文で何が問題か>",
      "detail": "<どう直すべきかの提案 (1-3 文)>",
      "rule_id": "<引用した rule の id (docs だけを根拠にした場合は null)>",
      "rule_title": "<引用した rule / docs 節のタイトル>",
      "evidence": "<引用元 rule / docs の該当文 (最大 200 字)>"
    }
  ],
  "notes": "<担当範囲で気になったが finding には昇格しなかった観察 (optional)>"
}
```

**Info レベルは含めない** (Critical / Warning 相当だけを扱う)。findings が 0 件でも空配列で返す。**mode field は返却フォーマットに含めない** (Skill 側で既知、schema evolution コスト回避)。

## Step 4. findings を集約する

全 agent の返却を受け取ったら、メインスレッドで以下を実施:

- **重複マージ**: 同じ file + line で意味が重なる finding は 1 件に統合し、根拠を両方併記する (異なるカテゴリの agent が同じ問題を別観点で拾うことがある)
- **優先度整列**: Violation → Improvement → Question の順に並べ、Violation 内は影響範囲が大きいものから
- **注意**: Info レベルは元々含まれない前提だが、agent 出力に混じっていたら破棄する

集約結果の総数と内訳を 1 行で報告してから Step 5 に進む。

## Step 5. mode 別振り分け

**Mode ごとに Step 5 の挙動が分岐する** ので、まず入力モードを確認する。

### plan mode の場合 (単純)

**findings 一覧を集約したまま Step 6 のサマリに渡して skill 終了**。plan.md への Edit は行わず、AskUserQuestion も発火しない。plan.md への反映判断は **呼び出し元 (shinaps:dev Phase 4-C または手動発火時のユーザー)** の責務。

具体的には Step 6 のサマリに findings 全件を Markdown 表 or JSON 形式でそのまま含めて返す (呼び出し元がそのまま消費できる形で)。

### diff mode の場合

集約後の finding を「自明な修正」と「判断が必要なもの」の 2 群に振り分ける。

### 自明な修正 (auto-apply、diff mode のみ)

修正方法が一意で設計判断を伴わない finding は、ユーザーに確認せず `Edit` / `Write` で即修正する:

- コメント / 文言 / typo の修正 (規約が指す直し方が一つしかない)
- 既存パターンへの機械的な追従 (隣接コードと同じ流儀に揃えるだけ)
- import 経路や命名の規約違反で、直し先が明白なもの

自動修正を終えたら型 / lint / test を回して green を確認する。修正内容は Step 6 のサマリで「何をどう直したか」を file 単位で必ず一覧報告する (ユーザーが事後確認できるように)。

### 判断が必要なもの (要確認、diff mode のみ)

以下に該当する finding は `AskUserQuestion` で確認する。**迷ったら確認側に倒す**:

- 設計トレードオフがある (複数の修正方針があり得る / 影響範囲が広い / 構造変更を伴う)
- 規約側が現実と乖離している可能性がある (finding の severity=question 全般)
- 修正コストが大きく「後回し」が現実的な選択肢になるもの

選択肢は 4 つ:

1. **修正する** — どう直すかを 1-2 文で提案 (agent が返した `detail` を活用)。承認されたら `Edit` / `Write` で実行
2. **このまま許容する** — 妥当な理由があるとき。理由を shinaps-ai MCP server の `record_memory` に残す (将来の自分が「なぜ違反のままにしたか」を辿れるように)
3. **ルールの方を修正する** — 規約自体が現実と乖離している場合。shinaps-ai MCP server の `record_rule` (新規) or `update_rule` (既存修正) を実行。新規 record_rule のときは scope (user / repo_owner / repo) も選ばせる (横断的なら user、この repo 限定なら repo)
4. **後回し** — 別タスクとして扱う。`TaskCreate` で TODO 化し、後の作業セッションで拾えるようにする

**提示順は Violation → Improvement → Question**。件数が少なければ 1 回の `AskUserQuestion` に複数 question をまとめてよい (各 finding には前提説明を添える)。

## Step 6. 完了サマリ (mode 明示)

処理が一巡したら、最後にユーザーへ mode を明示して箇条書きでサマリ報告する。

### diff mode の場合

- 「refine を diff mode で実行」を冒頭に明示
- 走らせたカテゴリ数と各カテゴリの finding 件数
- 検出 / 処理した finding の総数と内訳 (自動修正 X 件 / 確認の上修正 Y 件 / 許容 Z 件 / rule 更新 W 件 / 後回し V 件)
- **自動修正した内容の一覧** (file + 1 行の何をどう直したか。ユーザーが事後確認する唯一の接点なので省略しない)
- 新しく `record_rule` / `update_rule` した内容があれば「次セッション以降に効きます」と明示
- まだ未処理の Question / 後回しの TaskCreate id を列挙

この後 user は通常 `git add` / commit に進む想定なので、refine 自体は commit しない (ユーザー操作の自然な境界を奪わない)。

### plan mode の場合

- 「refine を plan mode で実行 (対象: <plan.md path>)」を冒頭に明示
- 走らせたカテゴリ数と各カテゴリの finding 件数
- 集約 findings の内訳 (Violation X 件 / Improvement Y 件 / Question Z 件)
- **findings 全件を Markdown 表または JSON 形式でそのまま出力** (呼び出し元がそのまま消費できる形で。各 finding には file / line / severity / summary / detail / rule_id / rule_title / evidence を含める)
- 「plan.md への反映判断は呼び出し元 (shinaps:dev Phase 4-C or ユーザー) に委譲」を明示

plan mode では refine 自体は plan.md を Edit しない (呼び出し元との責務境界を明確にする)。

## 注意点

- **Info レベルは report しない**。Critical / Warning 相当だけを扱う。ノイズが多いと「規約照合は手間」というネガティブ印象が定着するため
- **並列は 1 メッセージ内での複数 Agent 呼び出しが必須**。順次呼びだと本 skill の高速化メリット (rule 数増加に対する耐性) が失われる
- **Agent への rule 受け渡しは full text**。id + title だけを渡して agent 側に search_rules を再取得させると shinaps MCP を N 回叩くことになるため無駄。メインスレッドが 1 度取得したものを prompt に貼る
- **各 agent の scope 逸脱を防ぐ**: prompt 内で「担当カテゴリ以外の観点で finding を上げない」と明示する。violation と思っても他カテゴリ担当ならスキップする (別 agent が拾う想定)
- finding 同士が重複していたら Step 4 の集約で統合する (「同じファイルで console.log 3 件、まとめて削除しますか?」等)
- 規約が 0 件 (= `search_rules` の userRules / officialRules が空) のとき: 「rule が登録されていません。今日の作業で rule 化したい習慣はありますか?」と逆に質問して、`record_rule` を引き出すきっかけにする (この場合 Step 2-4 はスキップ)
