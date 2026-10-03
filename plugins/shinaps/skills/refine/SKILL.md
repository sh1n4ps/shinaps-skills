---
name: refine
description: 対象ファイルの現状全文を search_rules と 1 件ずつ照合し、Violation / Improvement / Question に分類する skill。対象ファイルは引数の path 指定、または変更ファイル一覧 (`git diff --name-only HEAD` / PR / commit range) から決まる。3-5 カテゴリに束ねて Agent tool で shinaps-refine-agent を並列 dispatch → findings 集約 → 今回の変更箇所の自明な修正を Edit で自動適用し、既存箇所の指摘と判断要は 4 択 AskUserQuestion (修正する / 許容する / ルール側を直す / 後回し) で処理。セルフレビュー直前に発火。shinaps-ai server 未登録時は search_rules 呼び出しが自動で失敗して abort する。
argument-hint: "[<file/dir path> | <PR URL> | <commit SHA> | <range>] (省略時は git diff HEAD の変更ファイル)"
---

# shinaps:refine — 規約照合の checkpoint

このスキルは「commit / report 直前の self-review」を確実にやるためのバッチ照合手順書。CLAUDE.md に「セルフレビュー直前 → search_rules で規約照合」と書かれていても AI (あなた) が頻繁にスキップする現実への対症療法として、ユーザーが手動で発火するためにある。

照合対象は **ファイルの現状全文** であって diff ではない。diff の hunk だけでは「この関数全体の責務が正しいか」「この命名は周囲と揃っているか」「規約が要求する構造がファイル内に揃っているか」を判断できず、追加行だけ見て規約準拠に見えても、ファイル全体としては規約から外れているケースを取り逃すため。git は **どのファイルを見るか** を決める用途と、finding が **今回の変更に含まれる箇所か** を判定する用途に使う。

計画段階では発火しない。rule の大半はコメントの WHY / 命名 / import 経路といったコードレベルの規約で、自然言語の計画テキストからは検出できないため。計画段階で拾う価値がある設計レベルの規約違反は `shinaps-plan-reviewer` が担当する。

shinaps-ai サーバは git / file / AI 推論を一切呼ばない。すべて Claude Code 側のあなたが手元の `git` / `Read` / 既存 MCP tools で実行する (private repo の内容をサーバ境界に渡さない設計)。

## 全体アーキテクチャ

メインスレッド (あなた) は **オーケストレータ** に徹する:

1. 対象ファイル集合の確定、規約カタログの集約 (Step 0-1)
2. 規約を意味論的に 3〜5 カテゴリに束ねる (Step 2)
3. カテゴリごとに `shinaps-refine-agent` を **並列 dispatch** し、各 agent は担当カテゴリに関係するファイルだけを現状全文で読みに行く (Step 3)
4. 返ってきた findings を集約 → 変更箇所 / 既存箇所で振り分け (Step 4-5)

こうすることで、rule 数が増えても 1 パスの照合密度が落ちない (各 agent は担当カテゴリのルールにフォーカスする) 上に、メインスレッドの context にファイル全文を積まずに済む (対象は agent 側で必要なものだけ取得する)。

## Step 0. 対象ファイルを確定する (MUST)

以下の優先順位で **対象ファイル集合** を決める:

1. **ユーザーが対象を明示していたらそれを最優先**。`/shinaps:refine` と一緒に以下を書いてくることがある:
   - **ファイル / ディレクトリ path** (例: `apps/api/src/mcp/`) → その path 配下のファイルをそのまま対象集合にする (変更の有無を問わない)。ディレクトリなら `git ls-files <path>` で列挙する
   - **PR URL** (例: `https://github.com/owner/repo/pull/123`) → `gh pr diff 123 --repo owner/repo --name-only` で変更ファイル一覧を取得。カレント repo と同じなら `--repo` は省略可
   - **commit SHA / range** (例: `abc123` / `main..feature` / `HEAD~3..HEAD`) → `git diff --name-only <range>` で変更ファイル一覧を取得
2. 明示指定がなければ `git diff --name-only HEAD` (= staged + unstaged の合計、ローカルで触ったファイル全部)
3. それでも 0 件なら **ユーザーに確認**: 「変更がありません。直近の commit (`git diff --name-only HEAD~`) または特定のファイル / commit / PR を対象にしますか?」
4. 削除されたファイルは対象集合から除く (現状が存在しない)

対象が決まったらユーザーに「以下 N ファイルの現状を refine します」と 1 行で宣言してから先に進む。**Step 3 で各 agent に渡すファイル一覧と「変更範囲の確認コマンド」も、ここで決めた集合に必ず合わせること** (agent が独立に `git diff HEAD` を叩いて対象を取り違えないよう prompt に具体コマンドを埋め込む)。

**ファイル数による一律の上限は設けない**。確定した対象集合を維持し、件数の多さだけを理由に対象の縮小やユーザーへの分割確認を求めない。各カテゴリの担当量が大きい場合は、ファイルの行数・内容量と関連性（ディレクトリ、機能、依存関係）を見て自動的にバッチへ分ける。小規模なら分割は不要。関連ファイルはできるだけ同じバッチにまとめ、バッチをまたぐ契約は集約時に照合する。

## Step 1. 規約と context を集約する (並列取得)

以下を並列で取得:

- shinaps-ai MCP server の `list_search_facets()` で facet master (languages / platforms / frameworks / topics の登録済 slug 空間) を取得 → 対象ファイルの拡張子・パス・内容から関係する facet slug を推定して確定
- `list_search_facets()` の `versionTargets` と manifest / lockfile / compiler config / deployment target を照合し、確認できたバージョンだけを `projectVersions: [{ targetKind, targetSlug, version }]` に指定する。facet取得後に検索する。targetやバージョンは推測しない。確認できない対象は条件付きルールが除外されるため、共通ルールのみの照合になったことを結果に明記する。
- shinaps-ai MCP server の `search_rules({ repoOwner, repoName, languages?, platforms?, frameworks?, topics?, kind?, projectVersions? })` を呼ぶ → userRules + officialRules (両方を照合対象にする。userRules は facet に関係なく継承マージ全件、officialRules は admin が保存した rule のうち指定 facet とバージョン適用条件に一致するものへ絞られる（承認操作は不要）)。**repoOwner / repoName は現在の git workspace から必ず渡す** (`gh repo view` or `git remote get-url origin` から取得)。userRules は scope=user (横断) + scope=repo_owner (owner 一致) + scope=repo (owner+name 一致) の継承マージで返る。各 rule に乗る `scope` flag を見て「横断 / owner 限定 / repo 限定」を判別できる。facet を 1 つも指定せずに呼ぶと officialRules は空配列で返るので、必ず推定 facet を 1 つ以上指定すること。`kind` は通常指定しない (対象ファイル全体を rule 集合と広く照合する用途のため、絞り込むと見落としが増える)
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

カテゴリごと（分割した場合はカテゴリ × バッチごと）に `shinaps-refine-agent` を起動する。利用環境の同時実行枠内で独立した担当を並列に進め、残りは順次実行する。カテゴリ数とバッチ数は別に扱い、Step 2 のカテゴリ数の目安を対象ファイル数や総バッチ数の制限にしない。メインは担当一覧と完了状況を保持し、全バッチの結果を集約する。

subagent 側は system prompt で finding severity 解釈 / JSON 返却フォーマット / credit 最適化原則を既に持っているので、Skill 側は必要最小限の情報だけ渡せばよい。

### 各 agent への prompt テンプレ

各 agent には以下を渡す (カテゴリごとに埋める):

- **担当カテゴリ名** と、そのカテゴリに属する **rule 全件** (title / why / recommend / avoid / source_urls を full text で。id も添えて後で update_rule するとき参照できるように)
- そのカテゴリに関連する **AGENTS.md / CLAUDE.md / docs の該当節** (全文でよい、agent 側で context 消費するので原文をそのまま貼る)
- **repo root の絶対 path**
- **担当ファイル一覧とバッチID** (Step 0 の対象集合から割り当てた repo root 相対 path を列挙する。未分割なら対象集合全体を渡す。agent が独立に対象を再決定しないよう明示する)
- **変更範囲の確認コマンド** (finding を「今回の変更箇所」と「元からある箇所」に切り分けるために使わせる。Step 0 で確定した対象に応じて 1 つを具体コマンドとして埋め込む):
  - **ローカル**: `git diff HEAD -- <path>`
  - **commit range**: `git diff <range> -- <path>` (例: `main..feature`, `HEAD~3..HEAD`)
  - **PR**: `gh pr diff <n> --repo owner/repo -- <path>` (owner/repo 込みで固定して渡す)
  - **path 指定で変更を伴わない場合**: 「変更範囲の判定は不要、全 finding を `pre-existing` として返せ」と明示する

### 各 agent が踏む手順 (prompt 内に明記する)

1. 渡されたファイル一覧から、担当カテゴリのルールに **関連しそうなファイル** を選ぶ (拡張子 / パスから判断)。カテゴリと明らかに無関係なファイル (例: "testing & mocks" 担当が `docs/*.md` を見る) はスキップして良い
2. 選んだファイルを `Read` で **現状全文** 取得する (diff の hunk ではなく、いま repo にある状態そのもの)
3. 「変更範囲の確認コマンド」を `<path>` に差し替えて実行し、そのファイルの **どの行が今回の変更に含まれるか** を把握する
4. ファイル全体を担当カテゴリのルールと突き合わせ、findings を分類する。**変更行の周辺だけに絞らない** — ファイル全体として規約に反していないかを見る
5. 各 finding が手順 3 で把握した変更行に該当するかで `scope` を決める (`changed` / `pre-existing`)

**finding 分類基準** (subagent 側の system prompt でも解釈済み):

- **Violation**: 現状のコードが rule に既に反している
- **Improvement**: 違反ではないが規約の趣旨に沿った改善余地がある
- **Question**: 規約が曖昧 or 規約に載っていない判断

各 finding には **根拠** を必ず添える (rule id + title / docs 引用)。根拠なしは report しない。

### Agent の返却フォーマット (JSON 構造で返させる)

各 agent には以下の JSON を返すよう prompt 末尾で指示する:

```json
{
  "category": "<担当カテゴリ名>",
  "batch_id": "<割り当てられたバッチID>",
  "reviewed_files": ["<全文の照合を完了したファイル>"],
  "skipped_files": [{ "file": "<未照合の担当ファイル>", "reason": "<カテゴリ非該当・読み取り失敗・未完了などの理由>" }],
  "findings": [
    {
      "severity": "violation" | "improvement" | "question",
      "scope": "changed" | "pre-existing",
      "file": "<repo root からの相対 path>",
      "line": <該当行番号 or null。現状ファイル内の行番号>,
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

**Info レベルは含めない** (Critical / Warning 相当だけを扱う)。findings が 0 件でも空配列で返す。

## Step 4. findings を集約する

全 agent の返却を受け取ったら、メインスレッドで以下を実施:

- **対象の照合状況**: カテゴリ × バッチの担当一覧と `reviewed_files` / `skipped_files` を照合する。関連カテゴリで未照合のファイルや報告から抜けたファイルは再割り当てする。読み切れなかった場合は担当量を減らして続きを確認し、findings が空という理由だけで完了扱いにしない。全カテゴリで非該当としたファイルは理由を明記する。分割をまたぐ呼出し元・実装・型などの整合性も必要な担当へ照合を依頼する。

- **重複マージ**: 同じ file + line で意味が重なる finding は 1 件に統合し、根拠を両方併記する (異なるカテゴリの agent が同じ問題を別観点で拾うことがある)
- **scope 整合**: 同じ箇所を指す finding の `scope` が agent 間で割れていたら `changed` を優先する (変更行に 1 行でも掛かっていれば今回の変更の責任範囲とみなす)
- **優先度整列**: Violation → Improvement → Question の順に並べ、Violation 内は影響範囲が大きいものから
- **注意**: Info レベルは元々含まれない前提だが、agent 出力に混じっていたら破棄する

集約結果の総数と内訳を 1 行で報告してから Step 5 に進む (`changed` / `pre-existing` の件数も併記する)。

## Step 5. 自動修正と要確認に振り分ける

集約後の finding を振り分ける。**`scope` が第一の分岐**:

- **`changed`** (今回の変更に含まれる箇所) → 以下の「自明な修正」なら自動適用、それ以外は要確認
- **`pre-existing`** (今回触っていない既存箇所) → severity を問わず **必ず要確認に回す**。自動修正しない

`pre-existing` を自動修正しないのは、今回の作業と無関係な差分が commit に混入して、レビュアーが「この変更は何のためか」を追えなくなるため。既存箇所の指摘は「別 commit に分ける」「後回しにする」判断がユーザー側にある。

### 自明な修正 (auto-apply、`changed` のみ)

修正方法が一意で設計判断を伴わない finding は、ユーザーに確認せず `Edit` / `Write` で即修正する:

- コメント / 文言 / typo の修正 (規約が指す直し方が一つしかない)
- 既存パターンへの機械的な追従 (隣接コードと同じ流儀に揃えるだけ)
- import 経路や命名の規約違反で、直し先が明白なもの

自動修正を終えたら型 / lint / test を回して green を確認する。修正内容は Step 6 のサマリで「何をどう直したか」を file 単位で必ず一覧報告する (ユーザーが事後確認できるように)。

### 判断が必要なもの (要確認)

以下に該当する finding は `AskUserQuestion` で確認する。**迷ったら確認側に倒す**:

- **`scope` が `pre-existing` のもの全般** (今回の変更と切り離して判断すべきなので、自明に見えても確認する)
- 設計トレードオフがある (複数の修正方針があり得る / 影響範囲が広い / 構造変更を伴う)
- 規約側が現実と乖離している可能性がある (finding の severity=question 全般)
- 修正コストが大きく「後回し」が現実的な選択肢になるもの

選択肢は 4 つ:

1. **修正する** — どう直すかを 1-2 文で提案 (agent が返した `detail` を活用)。承認されたら `Edit` / `Write` で実行
2. **このまま許容する** — 妥当な理由があるとき。理由を今回のローカル成果物（implementation.md / 調査・レビューレポート）に残す (将来の自分が「なぜ違反のままにしたか」を辿れるように)
3. **ルールの方を修正する** — 規約自体が現実と乖離している場合。shinaps-ai MCP server の `record_rule` (新規) or `update_rule` (既存修正) を実行。新規 record_rule のときは scope (user / repo_owner / repo) も選ばせる (横断的なら user、この repo 限定なら repo)
4. **後回し** — 別タスクとして扱う。`TaskCreate` で TODO 化し、後の作業セッションで拾えるようにする

**提示順は `changed` を先、`pre-existing` を後**。それぞれの中では Violation → Improvement → Question の順。各 finding には `pre-existing` かどうかを明示して提示する (ユーザーが「今回の commit に混ぜるか」を判断する材料になるため)。件数が少なければ 1 回の `AskUserQuestion` に複数 question をまとめてよい (各 finding には前提説明を添える)。

## Step 6. 完了サマリ

処理が一巡したら、最後にユーザーへ箇条書きでサマリ報告する。

- 対象ファイル数と、その決め方 (`git diff HEAD` の変更ファイル / PR / commit range / path 指定のどれか) を冒頭に明示
- 走らせたカテゴリ数・バッチ数と各カテゴリの finding 件数、照合済みファイル数、非該当・未完了のファイルと理由
- 検出 / 処理した finding の総数と内訳 (自動修正 X 件 / 確認の上修正 Y 件 / 許容 Z 件 / rule 更新 W 件 / 後回し V 件)
- **`changed` と `pre-existing` の内訳** (既存箇所の指摘が何件あり、そのうち何件を今回直したか。今回の変更に無関係な修正がどれだけ混ざったかをユーザーが把握できるように)
- **自動修正した内容の一覧** (file + 1 行の何をどう直したか。ユーザーが事後確認する唯一の接点なので省略しない)
- 新しく `record_rule` / `update_rule` した内容があれば「次セッション以降に効きます」と明示
- まだ未処理の Question / 後回しの TaskCreate id を列挙

この後 user は通常 `git add` / commit に進む想定なので、refine 自体は commit しない (ユーザー操作の自然な境界を奪わない)。

## 注意点

- **Info レベルは report しない**。Critical / Warning 相当だけを扱う。ノイズが多いと「規約照合は手間」というネガティブ印象が定着するため
- **並列数は利用環境に合わせる**。同時実行枠が少なくても、残りのバッチを順次実行して対象全体を確認する
- **Agent への rule 受け渡しは full text**。id + title だけを渡して agent 側に search_rules を再取得させると shinaps MCP を N 回叩くことになるため無駄。メインスレッドが 1 度取得したものを prompt に貼る
- **各 agent の scope 逸脱を防ぐ**: prompt 内で「担当カテゴリ以外の観点で finding を上げない」と明示する。violation と思っても他カテゴリ担当ならスキップする (別 agent が拾う想定)
- finding 同士が重複していたら Step 4 の集約で統合する (「同じファイルで console.log 3 件、まとめて削除しますか?」等)
- 規約が 0 件 (= `search_rules` の userRules / officialRules が空) のとき: 「rule が登録されていません。今日の作業で rule 化したい習慣はありますか?」と逆に質問して、`record_rule` を引き出すきっかけにする (この場合 Step 2-4 はスキップ)
