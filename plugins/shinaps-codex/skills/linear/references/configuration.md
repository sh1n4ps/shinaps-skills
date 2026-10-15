# プロジェクト設定

設定は、運用上の決定と既存資料への参照を持つ。手順の全文は書かない。秘密値を保存しない。設定はAIが読む文書であり、専用のプログラムで検査しない。

## 配置

```text
.shinaps/
  .gitignore            # *
  linear.yaml           # 対象・工程・許可・終了地点・参照先・報告
  linear/
    instructions.md     # プロジェクト固有の指示（任意）
    references/         # 必要な場合だけ分ける詳細資料（任意）
```

- 設定を置いたリポジトリが対象のリポジトリになる。複数のリポジトリが、それぞれの設定で同じworkspace・team・projectを指してよい。設定はメインの作業ツリーに置く。
- 保存の前に `.shinaps/.gitignore` を確認する。なければ内容 `*` と改行で作成する。既存なら内容を保持し、不足するときだけ `*` を追記する。`git check-ignore .shinaps/linear.yaml` でGitの対象外であることを確認する。追跡済みのファイルは追跡を解除せず、保存の前に扱いを利用者と決める。
- 必須でない空ファイルを作らない。補足にSKILL.mdや独立した呼び出し名を置かない。READMEなどが正本の内容はリンクで参照し、コピーしない。

## 設定の読み方

- 実行開始時と再開時に、作業先リポジトリの `.shinaps/linear.yaml` と、あれば `.shinaps/linear/instructions.md` を読む。`.shinaps/linear/references/` は、担当する工程に必要なものだけ読む。
- 設定はGitの対象外なのでworktreeには存在しない。作業がworktreeで行われる場合も、メインの作業ツリー（`git worktree list` の先頭）から読む。
- 補足ファイルは追加の条件と手順を表す。設定の決定（対象・許可・終了地点・工程の対応）と、人の完了・QAの証拠の要件は変えない。補足と設定が矛盾したら、設定に従って止め、どちらを直すか確認する。
- 不足や矛盾があれば、影響する工程の開始前に止めて一問ずつ確認する。影響しない工程は続ける。許可の追加やステータスの新設を推測で補わない。
- 終了地点は操作の許可を兼ねない。設定は、利用中のツールの権限や利用者の明示的な停止・撤回を上書きしない。
- 利用者と合意して保存した設定の許可は、その対象・操作・条件の範囲で、作業先リポジトリの規約がいう合意・許可に当たる。設定ファイルが存在することや、AIが合意なしに加えた許可は、その根拠にしない。

## 項目

| キー | 内容 | 未記載のとき |
| --- | --- | --- |
| `target.workspace` | Linearのworkspace | 開発進行を始めない |
| `target.team` | チームのキー（例 `SHINAPS`） | 開発進行を始めない |
| `target.project` | 使うprojectのURL。projectを使わない運用では `null` | 未決として扱い、project未使用とは推測しない。projectに依存する操作の前で止める |
| `team_settings` | `existing_only`（既存の定義に合わせ、変更しない）または `manage_on_setup`（初期設定・設定変更のときだけ変更案を示し、合意後に整備できる） | `existing_only` |
| `statuses` | 工程キーと待ち状態の `human_input` から、実在するステータス名への対応。複数のキーに同じステータスを指定できる | そのキーの状態更新の前で止める |
| `stop_after` | 終了地点（下の「終了地点」） | 開発進行を始めない |
| `permissions` | 継続的に許可した操作の一覧（下の「許可」） | 何も許可していない |
| `references` | `specifications`・`validation`・`environments`・`deployment`・`publication` ごとに、既存資料のパスまたはURLの一覧 | 各リポジトリのAGENTS.md・README・CIから読む |
| `cycle_report` | Cycle報告の設定（下の「Cycle報告」） | Cycle報告を書き込まない |
| `commit_mode` | `shinaps:commit` でコミットするときの進め方。`normal`（単位ごとに承認を得る）または `autonomous`（個別の承認なしで単位ごとに検証してコミットする） | `shinaps:commit` が開始時に一問確認する。値が2つ以外のときも同じ |
| `human_code_review` | 人のコードレビューの要否。`required`（人がレビューする）または `skip`（人のレビューを行わない） | `required`。値が2つ以外のときも同じ |
| `document_only_changes` | 文書だけの変更（下の説明）の扱い。`ai_commit`: 対象差分が文書だけの変更のとき、人のコードレビューを行わず、Local Agent QAの合格後にCodexの依頼でClaudeが `shinaps:commit` でコミットする | 例外を使わない。値が `ai_commit` 以外のときも同じ |

- `commit_mode` は進め方の既定値であり、コミットの許可ではない。コミットは利用者の明示的な依頼、`permissions` の `commit`（条件は下の「許可」）、または `document_only_changes: ai_commit` による文書だけの変更のコミットのときだけ行う。`commit_mode` があるだけではコミット・pushを始めず、人のレビュー済みと推測しない。その場の明示的な指定は設定に優先する。`normal` は人が自分でgit操作をする工程（`code_review`）とは別のもの。
- `human_code_review: skip` は人のレビューの工程だけを省く。`shinaps:dev` 内のレビュー、Agent QA、必要なHuman QAは省かない。省略は、人のレビュー済みとして記録しない。`human_code_review`・`commit`・`stage`・`commit_mode`・`document_only_changes` は互いに独立しており、一つから他を推測しない。
- `document_only_changes: ai_commit` は、文書だけの変更について、`human_code_review: required` でも人のレビューを省き、`commit` の許可がなくてもAIのコミットを認める。`stage` の許可は通常のコミットと同じく必要で、ほかのキーの意味と許可は変えず、push以降の操作、利用中のツールの権限、利用者の停止・撤回（「設定の読み方」）を上書きしない。
- 対象差分の全体（追加・削除・改名・移動・ファイルの実行権限の変更を含む、そのコミットに入るすべての変更）が、説明だけを変え、人またはAIを含む実行主体の動作・権限・必須の工程を変える内容を一つも含まないとき、文書だけの変更とする。動作・権限・必須の工程を変える内容には、実行コード、テスト、スクリプト、ビルド・CI・配備・フック・依存・環境・Linterの設定、生成物とその元、データやmigration、AIツールの権限やスキルの入口に加え、文書の中で実行主体の権限・担当・必須の工程や検証・コミットとレビューの条件を定める記述を含む。判定は各ファイルの役割と変更内容で行い、拡張子・ディレクトリ名・ファイル名のパターンだけを根拠にしない。判定できない差分は文書だけの変更として扱わない。例外を適用するために対象差分を分割しない。
- 工程キーは [workflow.md](workflow.md) の工程表と同じ。`statuses` の値はチームに実在する正確な名前にする。操作時はLinearから取得した状態のIDを使う。対応が曖昧・欠落・実物と不一致なら、その対応に依存する更新を止める。ステータスを自動で新設しない。
- `team_settings: manage_on_setup` の場合も、通常実行ではチーム設定を変更しない。

## 終了地点

初期設定ではこの一覧を示して選んでもらう。

| `stop_after` | 止まる地点 |
| --- | --- |
| `pre_push_qa` | `code_review` の工程を終えた後、push前の最終Agent QAが合格し、記録した時点 |
| `pr_created` | 必須の検証と許可されたpush・PR作成を終え、IssueとPRの相互リンクを確認した時点。Staging QAが未実施なら残項目として記録する |
| `issue_done` | Issueの必須受入条件をすべて満たし、Doneにした時点 |

- 終了地点の工程がそのIssueにない場合（Git変更がない作業など）の扱いは、[workflow.md](workflow.md) の「工程とステータス」に従う。
- 終了地点は到達点だけを決める。途中の操作は `permissions` が決める。許可のない操作（例 `merge`）がある場合は、その操作の前で許可を確認する。これは許可待ちであり、終了地点への到達ではない。Cycle全体を任された場合も、許可待ちのIssueは終了地点に達したものとして扱わない。

## 許可

| 値 | 許可する操作 |
| --- | --- |
| `issue_update` | 対象のteam・projectの中で、利用者が任せたIssue・Cycleの範囲に対する運用上の更新（本文・コメント・状態・依存・Linearへの添付、整理で必要になったIssueの作成・分割）。チーム設定の変更、未合意の範囲・期限の変更、Cycle外への進行、Issueの削除、外部への送信を含めない |
| `bridge_request` | BridgeによるCodexからClaudeへの実装・修正の依頼と、ClaudeからCodexへの開発進行の引き渡し |
| `stage` | レビュー・コミットの対象差分だけをステージする |
| `commit` | 対象Issueの差分を、Local Agent QAの合格と `human_code_review` に従った工程の後に、`shinaps:commit` でローカルにコミットする。AIのコミットには `stage` の許可も併せて必要。push・PR・履歴の書き換え、人のレビューの省略を含めない。`document_only_changes: ai_commit` による文書だけの変更のコミットは、`commit` がなくても行える（`stage` は必要） |
| `push` | 対象Issueの作業ブランチの通常のpush |
| `pr_create` | 対象IssueのPRの作成と更新 |
| `merge` | 必要なQA・承認が揃った対象PRのマージと、元のブランチへ戻る操作 |
| `deploy:<環境>` | 指定した環境への配備・配布（例 `deploy:staging`） |
| `publish:<操作>` | 一般公開やストアへの提出など、指定した公開操作（例 `publish:app_store_submit`） |
| `dev_delegation` | Claudeが `shinaps:dev` の中で委託（サブエージェント・別のCLI）を使う。worktreeの作成は含まない |
| `evidence:<保存先>` | Linear以外の指定した保存先へQA素材を保存する（LinearのIssueへの添付は `issue_update` に含む） |

- 開発進行には `issue_update` と `bridge_request` が必要である。初期設定では、この2つと `stage`・`dev_delegation` を開発進行の標準の組として提案する。設定があるだけでは、どの許可も得ない。必要な許可がない設定では開発進行を始めず、不足している許可を示す。
- 一つの操作が別の操作を伴う場合は、伴う操作の許可も必要とする（マージで本番へ自動配備される場合は `merge` と `deploy:production`）。
- 次の操作は一覧に含めず、常にその場で確認する: force-push、履歴の書き換え、ブランチの削除、チーム設定の変更。
- 設定の許可は、今回の依頼で任されたIssue・Cycleの範囲を広げない。

## Cycle報告

| サブキー | 内容 |
| --- | --- |
| `qa_scope` | 全体QAの対象となる環境・端末の一覧 |
| `destination` | 報告本文の保存先（例 `linear_cycle_document`） |
| `index` | 索引のURL、または `null` |
| `audience` | 読み手 |
| `format` | 既存の書式や直近の報告への参照（任意） |

書き込むのは `destination` と `index` だけ。記載のない報告先や送信先には、補足ファイルに書かれていても書き込まない。

## 設定例

shinaps-skills側の例。shinaps-aiも、自分のリポジトリの設定で同じprojectを指す。

```yaml
# 設定を置いたこのリポジトリを作業先とするIssueに適用する。
target:
  workspace: shinaps
  team: SHINAPS
  project: https://linear.app/shinaps/project/shinaps-ai-76ed13db8314 # projectを使わない場合は null
team_settings: existing_only
# ステータス名は形式の例。初期設定でチームの実際の一覧と照合して決める。
statuses:
  todo: Todo
  refinement: In Progress
  ready: Todo
  coding: In Progress
  local_agent_qa: In Progress
  code_review: In Review
  post_commit: In Review
  human_input: In Progress
  done: Done
stop_after: pre_push_qa
permissions:
  - issue_update
  - bridge_request
  - stage
  - dev_delegation
references:
  validation:
    - README.md#開発と配布
    - package.json
  publication:
    - README.md#CIとnpm自動公開
```

この例は `stop_after: pre_push_qa` なので、`post_commit` より後の工程の対応を書いていない。

## 初期設定

Codexが行う。

1. アカウント、workspace、team、projectと、チームのステータス一覧・既存の運用をLinearから読む。
2. 作業先リポジトリのAGENTS.md・CLAUDE.md・README・CI・検証や配備のスクリプトを読み、`references` の候補を決める。
3. 設定案を一つ作る。チーム設定を管理できる場合だけ、FamilyStayを基にした工程の分離（[workflow.md](workflow.md) の工程表に対応するステータス）を変更案として示す。利用者のプロジェクトらしいという推測で `manage_on_setup` にしない。
4. 既存の情報で決まらない運用上の決定（`stop_after`、`permissions`（`commit` を含む）、`human_code_review`、`team_settings`、Cycle報告、`commit_mode`）だけを一問ずつ確認する。終了地点は上の一覧から選んでもらう。作業先リポジトリの既存の規約に文書だけの変更の例外がある場合だけ、その範囲と `document_only_changes` の範囲（「項目」の説明）を示して、設定するかを確認する。
5. 合意した内容を保存し、読み直して確認する。
6. Linearのチーム設定の変更は、ローカル設定の保存とは別に扱う。対象チームと変更差分（追加・改名するステータスと順序）を示し、合意を得てから反映して読み戻す。反映後に `statuses` を実物に合わせて確定する。

## 設定変更

初期設定と同じ手順で、既存の設定との差分を示して合意を得る。許可の追加を推測で補わない。

## 補足ファイルに書くもの

`instructions.md` には、QA固有の注意（端末・ブラウザ・テストアカウントの取得方法への参照）、版の照合に使うコマンド、報告の文体・見せ方、関係者への依頼方法、環境の現状を書く。共通の手順は複製しない。

CodexはClaudeへの依頼に、関係する部分と参照先を添える。
