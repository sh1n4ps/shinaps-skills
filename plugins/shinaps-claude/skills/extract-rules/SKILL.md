---
name: extract-rules
description: 過去 PR のレビューコメントから shinaps-ai の rules を bulk 生成する skill。新規リポジトリ着手時、または search_rules の userRules が空 / 少ない (5 件未満) ときに提案・起動。owner / repo / since を確認し、bot 除外 + gh api pulls で 100 PR ブロック単位に fetch → LLM で規約抽出 → record_rules で投入 → 続行確認 → 完了 report まで実行する。shinaps-ai server 未登録時は search_rules 呼び出しが自動で失敗して abort する。
argument-hint: (引数なし、対話で owner-repo / since を確認)
---

## 作業記録の保存先

作業記録は現在の作業先の `.shinaps/work/` 以下へ保存する。初期化と保全は [作業記録の共通手順](../../references/work-records.md) に従う。

## 実行環境とプロジェクト条件

この節は以下の工程全体に適用する。適用される `AGENTS.md`・`CLAUDE.md` と参照先、CI、既存スクリプトから今回の条件を読み、明示された依頼・許可を引き継ぐ。仕様に影響する不足だけ一問ずつ確認する。新しい恒久方針の保存はユーザーの了承を得てプロジェクト側へ行う。

Claude Codeの `Skill`・`Agent`・`AskUserQuestion`・`TaskCreate` を利用できる場合は対応するツールを使う。現在のセッションで提供されていないツールは仮定しない。質問は一問ずつ確認して回答を待つ。

別セッションへの委託・新しいworktreeは明示された許可がある場合だけ行う。委託不可なら現在のセッションで調査・計画・レビューの観点を順に確認し、独立レビューとは報告しない。独立レビューがプロジェクトの必須条件なら未完了として扱う。Shinapsのエージェント名はClaudeのpluginで公開された名前を使う。サービスのrule照合が必要な工程でMCPを利用できなければ、その工程を未確認として報告し、照合済みとしない。

# shinaps:extract-rules — 過去 PR review から rules を bulk 生成

新規リポジトリ着手時、または既存 userRules が少ないときに、過去 PR のレビューコメントから規約を bulk import する skill。shinaps-ai サーバは GitHub API も LLM も呼ばず、すべて Claude Code 側のあなた (= AI) が `gh` / 既存 MCP tools 経由で実行する (token / repo 内容をサーバ境界に置かない)。

## Step 0. 対象 repo を環境から決定する (MUST)

引数は受け取らない。以下の順で対象 `<owner>/<repo>` を解決:

1. `gh repo view --json owner,name` を実行 → `owner.login` と `name` を組み合わせる
2. 失敗したら `git remote get-url origin` を parse (`github.com/<owner>/<repo>(.git)?` 形式)
3. それでも決まらないなら **ユーザーにチャットで確認** (「対象は `<owner>/<repo>` でいいですか?」)

解決した `<owner>/<repo>` をユーザーに **必ず提示** し、誤りなら別の repo を入力してもらう。

## Step 1. since (期間) をチャットで確認

デフォルトは **直近 6 ヶ月**。「直近 6 ヶ月の merged PR を対象にしますか? それとも別の期間 (例: 3 ヶ月 / 1 年 / 特定日付以降) を指定しますか?」とユーザーに聞く。回答に応じて以下のように扱う:

- 「6 ヶ月で OK」「お任せ」 → 直近 6 ヶ月 (= 現在日から 6 ヶ月遡る)
- ISO 8601 (例: `2026-01-01`) → そのまま使用
- 相対 (例: `3 months ago`) → 現在日から相対計算

## Step 2. ignore_logins (除外する commenter) のポリシー

- GitHub API が返す `user.type === "Bot"` のコメントは **自動で除外**
- それ以外の Bot 疑い User (CodeRabbit / SonarCloud / login に "bot" / "ai" / "review" を含むアカウント) は、PR を眺める中で発見次第ユーザーに **「これも Bot 扱いしますか?」** と確認 → 確定したら以降の処理で除外

## Step 3. merged PR の fetch

`gh api 'repos/<owner>/<repo>/pulls?state=closed&sort=updated&direction=desc&per_page=100'` で closed PR を最新順に取得する。`merged_at IS NOT NULL` でフィルタして **merged 済の PR だけ** に絞り込む (closed-without-merge は対象外)。`Link` ヘッダの `rel="next"` を follow して pagination する。`merged_at` が Step 1 で確定した since を下回った時点で fetch 停止。

## Step 4. コメント収集

各 PR について、以下の 3 source を **すべて** 取得して flatten する:

- `gh api 'repos/<owner>/<repo>/pulls/{n}/reviews'` — PR Review 本文
- `gh api 'repos/<owner>/<repo>/pulls/{n}/comments'` — Files Changed タブの inline review comment
- `gh api 'repos/<owner>/<repo>/issues/{n}/comments'` — PR 本文下の Conversation スレッド一般コメント

PR description (本文) は対象外。あくまで「レビュー観点」を抽出するため。

## Step 5. Bot 除外

`user.type === "Bot"` のコメントは自動で除外。Step 2 で確定済の suspicious User もここで除外。新規の Bot 疑い login が出てきたら Step 2 のルールで都度ユーザー確認。

## Step 6. 既存 rules 把握

100 PR を 1 ブロックとして処理する。ブロックの開始時に必ず shinaps-ai MCP server の `search_rules({ fields: "summary", repoOwner, repoName })` を `nextCursor` が null になるまで呼んで、既存 userRules の一覧を取得する (facet を渡さないので officialRules は空、userRules は継承マージで scope=user / repo_owner / repo の全件)。全文は Step 7 で候補ごとに確かめる。これを「新規 (= `record_rules` の投入対象に含める) か、既存 rule を更新する `update_rule` か」を判断する材料にする。

## Step 7. rules 生成と投入

各 PR ブロックから rules 候補を抽出する基準:

- 複数 PR / 複数 reviewer で繰り返し言及されている指摘 (1 回限りの軽い指摘は採用しない)
- DO/DON'T が明確で、再現可能な規約として書き下せる粒度のもの
- WHY (なぜそうするか) を 1-3 文で要約できる材料があるもの
- 本文は [Shinaps規約の書き方](../../references/rule-writing.md) に従って書く

Good/Bad サンプルコード (examples) の付け方:

- レビューコメントや diff から Good/Bad ペアを構成できる rule にのみ `examples: { good, bad, language }` を付ける。**素材が無い rule に捏造しない** (プロジェクト固有の識別子を一般名に置換する・最小化する程度の編集は可)
- good / bad の大きさは [Shinaps規約の書き方](../../references/rule-writing.md) の目安に従う。language は shiki の言語 id 小文字 (`typescript` / `tsx` / `python` / `go` 等)
- good / bad / language は 3 つセットでしか登録できない (揃っていないと入力の schema 検証で拒否される)

出典 URL (sourceUrls) の付け方:

- 根拠になったレビューコメントの HTML URL (`#discussion_r...` / `#issuecomment-...`) を優先し、特定できなければ PR URL にフォールバック。http(s) のみ。上限は MCP ツールの入力の説明に従う
- **出典素材が無い rule に URL を捏造しない** (省略可 = 出典なしで保存される)

投入手順:

- 候補ごとに、title か label が重なる既存 rule の全文を `get_rules` で確かめて照合する (重複確認のための絞り込みで、照合対象の除外ではない)。判断できなければ全文を取得する。同じ判断の既存 rule があれば下の差分確認へ回し、それ以外の**新規**候補だけを集めて `record_rules({ scope: 'repo', repoOwner, repoName, rules: [{ title, why, recommend?, avoid?, kind?, labels?, examples?, sourceUrls? }, ...] })` で **1 call bulk 投入** する。本文の書き方は [Shinaps規約の書き方](../../references/rule-writing.md)、上限は MCP ツールの入力の説明に従う。`labels` は language / platform / framework / topic の slug 配列 (`list_search_facets` が返す公式カタログの slug のみ、language/platform/framework は 1 rule に各 1 つまで) (1 call 最大 100 件、超えたら分割。同一 title の重複は入力の schema 検証で拒否される)。
- extract-rules は対象 repo の PR レビューから抽出する性質上 scope=repo (当該 repo 限定) がデフォルト。横断ルールとして残したい場合だけユーザー判断で `scope: 'user'` に格上げ。**格上げするときは why / recommend / avoid / examples を当該 repo の固有文脈 (内部 API 名・モジュール構成・ドメイン固有の識別子) から切り離し、他プロジェクトでも適用場面を想定できる汎用的な表現・汎用サンプルに解釈し直してから登録する** (scope=repo のままなら repo 固有の具体的な記述・コード片で良い)
- `RULE_TOO_LARGE` が返ったら、その呼出し分は全体として保存されていない。details の limit・actual・title を確かめ、該当候補の本文・例・出典を短くしてから同じ呼出しをやり直す。`update_rule` の `RULE_UPDATE_CONFLICT` は全文を読み直してから再試行する。
- `RULE_LIMIT_REACHED` が返ったら投入を止める。個人ルールの保存数には上限があり、残りの枠が足りない `record_rules` はその呼出し分が全体として失敗し、一部も保存されない (件数を減らして一部だけ登録する手順へ自動では切り替えない)。それより前の呼出しで投入した分は保存されている。details の `limit` と `actual` から残りの枠を示し、投入する件数を絞るか既存ルールを整理するかのどちらにするかを利用者に確認する。以降のブロックの抽出・投入にも進まず、利用者の選択を待つ。
- `RATE_LIMITED` (再試行可能) が返ったら、制限の時間枠が切り替わるまで待ってから、同じ呼出しを1回だけ再試行する。再び拒否されたら、連続して再試行せずに中断し、その状況を利用者に報告する。
- 戻り値は入力の `rules` の位置と id だけ (`inserted: { index, ruleId }[]`、`skipped: { index, existingRuleId }[]`)。`skipped` は「既存と title 重複して投入されなかった候補」で、title は入力の `rules[index]` から分かる。`get_rules` で既存の全文を取得する。
- 事前の照合で一致した候補と `skipped` の両方について、why/recommend/avoid/examples が既存と異なるなら **ユーザーに diff を提示して同意を取る**:

> 既存 rule "no-unused-vars" が見つかりました。why/recommend/avoid/examples の差分:
> ```
> - 旧 why: ...
> + 新 why: ...
> ```
> 上書きしますか? (yes / no / skip-all)

- 同意なら `update_rule({ id: <既存 rule の id>, why?, recommend?, avoid?, examples?, sourceUrls? })` を実行。sourceUrls は配列ごと置き換わるので、既存と新しい出典をまとめて渡す (上限を超えるなら切り詰めずに利用者へ確認する)。`skip-all` を選ばれたら以降の差分確認をスキップする

## Step 8. 100 PR ブロック確認

100 PR ブロックの処理が終わるたびに、ユーザーに **「次の 100 PR ブロックに進むか」を確認** する (LLM のコンテキスト窓保護と判断点の挿入)。「続ける」なら次ブロックの fetch + コメント収集 + 既存 rules 再取得 + 抽出 + 投入を繰り返す。「やめる」なら現時点までの結果でレポートに進む。

## Step 9. 完了レポート

since 期間内の merged PR を消化し終えたら、以下を user に報告:

- 処理した PR 件数 / コメント件数
- 自動 Bot 除外 + ユーザー確認で除外した login 一覧
- `record_rules` で新規投入した rule 件数 (inserted 合計) + タイトル一覧
- `update_rule` で更新した rule 件数 + タイトル一覧
- `no` または skip-all で残した候補件数 (あれば)
- 保存上限 (`RULE_LIMIT_REACHED`)・回数制限 (`RATE_LIMITED`) によって投入できなかった候補の件数 (あれば)
