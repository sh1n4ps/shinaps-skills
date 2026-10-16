# プロジェクト設定

設定は、運用上の決定と既存資料への参照を持つ。手順の全文は書かない。秘密値を保存しない。設定はAIが読む文書であり、専用のプログラムで検査しない。

## 配置と保存方式

```text
.shinaps/
  .gitignore            # 保存方式に応じた除外と共有対象の例外
  linear.yaml           # 対象・工程・許可・終了地点・参照先・報告
  linear/
    instructions.md     # 採用する場合だけ置くプロジェクト固有の指示
    references/         # 必要な場合だけ分ける詳細資料
  work/                 # 現在の作業先だけに保存する記録（Git対象外）
```

設定を置いたリポジトリが対象になる。複数のリポジトリが、それぞれの設定で同じworkspace・team・projectを指してよい。`config_storage` で保存方式を選ぶ。

- `shared`: 設定と運用に必要な補足をGitで共有し、現在のcheckoutの設定を正本とする。
- `local`: メインの作業ツリーに設定と補足を保存し、Gitの対象外とする。
- 既存設定にキーがない場合だけ、従来どおり `local` として扱う。自動追記や既存の許可の再合意は不要。新規設定は明記する。空値・`null`・その他の値は不正として止め、他の必須項目の欠落も補完しない。

保存方式は共有範囲の選択であり、対象・操作許可・担当・終了地点・レビュー条件を変えない。必須でない空ファイルを作らない。補足にSKILL.mdや独立した呼び出し名を置かず、READMEなどが正本の内容は参照する。

## 設定の読み方

開始時と再開時に次の順で正本を一つ決め、設定と補足を読み直す。「現在」は作業対象のcheckout、「メイン」は同じリポジトリの `git worktree list` の先頭を指す。同じcheckoutなら一つだけ読む。

1. 現在の `.shinaps/linear.yaml` を確認する。読取不能・不正値なら止める。`shared` なら現在だけを採用し、メインの設定は調べない。
2. 現在が `local` 相当（明示 `local` または既存キー欠落）、または設定が真に不在の場合だけ、メインを確認する。不在の場合は、そのcheckoutのindexとHEADに設定がないことも確かめる。どちらかにあれば削除・未展開による不備として止める。Git状態を確定できないときも、未設定とは扱わない。
3. メインが `local` 相当ならメインだけを採用する。現在のコピーで上書き・統合しない。メインが `shared` なら現在との不整合または現在の共有設定不足として止める。メインが不正・読取不能なら止める。メインが不在の場合もindexとHEADを確認し、両方にないときだけ真の不在とする。現在が `local` 相当なのにメインが不在なら正本不備で止める。両方が真に不在の場合だけ初期設定へ進む。

不在の確認には、そのcheckoutで `git ls-files -- .shinaps/linear.yaml`（index）と `git ls-tree HEAD -- .shinaps/linear.yaml`（HEAD）を使う。HEAD未作成なら、その状態が確定した場合に限りHEADに設定なしと扱う。追跡状態だけで保存方式を推測しない。未追跡の `shared` は準備中の設定として読めるが、共有済みとは報告しない。追跡済みの `local` は不整合として報告し、自動で追跡解除しない。

設定・`instructions.md`・必要な `references` は同じ正本から読む。補足の相対パスは正本のリポジトリルートを基準とし、コード・検証・配備などの操作対象の相対パスは現在の作業先を基準とする。共有設定の不足を別checkout・別端末のlocal設定や補足で補わない。`.shinaps/work/` の記録は証拠であり、設定を上書きしない。

- `shared` では、採用した補足を共有YAMLの `references` に明示する。`instructions.md` は `references.specifications` に記載し、開始・再開時に必ず読む。存在するのに記載がなければ採用情報の不備として止め、無視や自動追記で続けない。
- その他の補足は内容に対応する既存の5分類へ記載し、担当する工程に必要なものを読む。参照された補足がない・読めない場合は未採用と解釈せず、依存する工程を止める。採用した `instructions.md` の欠落・読取不能は設定に依存する実行全体の開始・再開を止める。
- `local` 相当では従来どおり、存在する `instructions.md` を開始・再開時に読み、その他の補足は工程に必要なものを読む。既存設定への参照の自動追記はしない。
- 採用していない任意の補足はなくてもよい。必要な補足を未採用扱いにして運用条件を減らさない。
- 補足ファイルは追加の条件と手順を表す。設定の決定（対象・許可・終了地点・工程の対応）と、人の完了・QAの証拠の要件は変えない。補足と設定が矛盾したら、設定に従って止め、どちらを直すか確認する。
- 不足や矛盾があれば、影響する工程の開始前に止めて一問ずつ確認する。影響しない工程は続ける。許可の追加やステータスの新設を推測で補わない。
- 終了地点は操作の許可を兼ねない。設定は、利用中のツールの権限や利用者の明示的な停止・撤回を上書きしない。
- 利用者と合意して保存した設定の許可は、その対象・操作・条件の範囲で、作業先リポジトリの規約がいう合意・許可に当たる。一般的な「明示依頼がある場合だけ」という条件も、この合意済みの範囲では満たすため、同じ操作の許可を改めて求めない。設定ファイルが存在することや、AIが合意なしに加えた許可は、その根拠にしない。利用者による今回の範囲限定・停止・撤回と、ツール固有の明示依頼条件は維持する。

次工程を判断するときは、独立した `commit_mode`・`permissions`・`stop_after`・人レビューの条件を併せて読み、[担当と工程](workflow.md)で定めた担当と前工程の結果を確認する。一つの設定から他の許可や工程の完了を推測しない。終了・待機とゴール状態は [execution.md](execution.md) に従う。

## 項目

以下の項目は明示必須（既存設定の `config_storage` 欠落だけは上記の扱い）。省略・不正値を既定値で補わず、依存する工程を止めて設定を確認する。`null`・`none`・空の一覧は、以下で認めた箇所だけで「使用しない」を表す。

| キー | 内容 |
| --- | --- |
| `config_storage` | `shared`（Git共有）または `local`（メインの作業ツリーだけに保存）。保存・読取規則は上記に従う |
| `target.workspace` | Linearのworkspace |
| `target.team` | チームのキー（例 `SHINAPS`） |
| `target.project` | 使うprojectのURL。projectを使わない運用では `null` |
| `team_settings` | `existing_only`（既存の定義に合わせ、変更しない）または `manage_on_setup`（初期設定・設定変更のときだけ変更案を示し、合意後に整備できる） |
| `statuses` | 工程キーと待ち状態の `human_input` から、実在するステータス名への対応。複数のキーに同じステータスを指定できる |
| `stop_after` | 終了地点（下の「終了地点」） |
| `permissions` | 継続的に許可した操作の一覧（下の「許可」）。許可なしは `[]` |
| `references` | `specifications`・`validation`・`environments`・`deployment`・`publication` の5分類をすべて記載し、既存資料のパスまたはURLの一覧を指定する。該当資料なしは `[]` |
| `cycle_report` | Cycle報告の設定（下の「Cycle報告」）。報告を使わない場合は `null` |
| `implementation_skill` | Issueの実装・修正に使うdevの入口。`dev-claude`・`dev-claude-ultra`（CodexがBridgeでClaudeへ依頼し、Claudeがその入口で実行する）、または `dev-codex`・`dev-codex-ultra`（Issueごとの別Codexタスクがその入口を実行し、会話側は進行・Agent QAを担当する） |
| `commit_mode` | `shinaps:commit` でコミットするときの進め方。`normal`（単位ごとに承認を得る）または `autonomous`（個別の承認なしで単位ごとに検証してコミットする） |
| `human_code_review` | 人のコードレビューの要否。`required`（人がレビューする）または `skip`（人のレビューを行わない） |
| `document_only_changes` | 文書だけの変更（下の説明）の扱い。`none` は例外なし。`ai_commit`: 対象差分が文書だけの変更のとき、人のコードレビューを行わず、Local Agent QAの合格後に実装担当が `shinaps:commit` でコミットする（Claudeの入口ではCodexの依頼でClaudeが行う） |

- `commit_mode` は進め方の設定であり、コミットの許可ではない。コミットは利用者の明示的な依頼、`permissions` の `commit`（条件は下の「許可」）、または `document_only_changes: ai_commit` による文書だけの変更のコミットのときだけ行う。`commit_mode` があるだけではコミット・pushを始めず、人のレビュー済みと推測しない。その場の明示的な指定は設定に優先する。`normal` は人が自分でgit操作をする工程（`code_review`）とは別のもの。
- `implementation_skill` が決めるのは、実装・修正の担当と実行方式だけである。`permissions`・`stop_after`・`human_code_review`・`commit_mode`・`document_only_changes` の意味と、`dev_delegation`・worktreeの作成・別セッションの作成の許可を変えない。その場の明示的な指定は設定に優先する。既存の設定にキーがなくても、自動で書き加えない。担当と工程の対応は [workflow.md](workflow.md) の「担当と窓口」にある。
- `human_code_review: skip` は人のレビューの工程だけを省く。devの入口内のレビュー、Agent QA、必要なHuman QAは省かない。省略は、人のレビュー済みとして記録しない。`human_code_review`・`commit`・`stage`・`commit_mode`・`document_only_changes` は互いに独立しており、一つから他を推測しない。
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
| `issue_update` | 対象のteam・projectの中で、利用者が任せたIssue・Cycleの範囲に対する運用上の更新（本文・コメント・状態・依存・Linearへの添付、整理で必要になったIssueの作成・分割）と、利用者から任された目的の作業を着手前にIssueへ紐づけるための作成（[issue.md](issue.md) の「着手前に作業をIssueへ紐づける」）。チーム設定の変更、未合意の範囲・期限の変更、Cycle外への進行、Issueの削除、外部への送信を含めない |
| `development_operations` | 任された対象の開発に必要な、既存アカウントへの通常のログイン、ローカル環境準備、プロジェクトの依存導入、開発サーバー・Simulatorの起動停止、ビルド・テスト・QA操作を継続的に許可する。下の範囲に従う |
| `codex_task` | 対象IssueごとのCodex実装タスクの新規作成・状態確認・実装や修正や許可済みコミットの依頼。worktree作成、操作許可の追加、タスク側でのゴールや実装タスクの再作成は含めない。ツールの明示依頼要件も満たす（[codex-task.md](codex-task.md)） |
| `bridge_request` | BridgeによるCodexからClaudeへの実装・修正の依頼と、ClaudeからCodexへの開発進行の引き渡し |
| `stage` | レビュー・コミットの対象差分だけをステージする |
| `commit` | 対象Issueの差分を、Local Agent QAの合格と `human_code_review` に従った工程の後に、`shinaps:commit` でローカルにコミットする。AIのコミットには `stage` の許可も併せて必要。push・PR・履歴の書き換え、人のレビューの省略を含めない。`document_only_changes: ai_commit` による文書だけの変更のコミットは、`commit` がなくても行える（`stage` は必要） |
| `push` | 対象Issueの作業ブランチの通常のpush |
| `pr_create` | 対象IssueのPRの作成と更新 |
| `merge` | 必要なQA・承認が揃った対象PRのマージと、元のブランチへ戻る操作 |
| `deploy:<環境>` | 指定した環境への配備・配布（例 `deploy:staging`） |
| `publish:<操作>` | 一般公開やストアへの提出など、指定した公開操作（例 `publish:app_store_submit`） |
| `dev_delegation` | `implementation_skill` で選んだdevの入口の中で、サブエージェントへ委託する。許可がない場合は、入口のメインが同じ観点を自分で確認し、独立確認とは報告しない。worktreeの作成は含まない |
| `evidence:<保存先>` | Linear以外の指定した保存先へQA素材を保存する（LinearのIssueへの添付は `issue_update` に含む） |

- 開発進行には `issue_update` が必要である。`implementation_skill` がClaudeの入口のときは `bridge_request` も必要で、Codexの入口のときは代わりに `codex_task` とCodexタスクの作成・読み取り・送信のツールが必要である。初期設定では、`issue_update`・`bridge_request`・`stage`・`dev_delegation` を開発進行の標準の組として提案する（Codexの入口を選ぶ場合は `bridge_request` を `codex_task` に置き換える）。設定があるだけでは、どの許可も得ない。必要な許可がない設定では開発進行を始めず、不足している許可を示す。
- `development_operations` は、既存の認証手段と利用者が許可した既存アカウントを使い、対象の開発・検証環境と専用の検証データで行う操作に限る。本人の二要素認証・セキュリティキー・CAPTCHA等が必要なら具体的に依頼し、回避しない。ログイン成功を新しい権限への同意と扱わず、新規アカウント・OAuth権限の拡大・課金・新規クラウド資源・共有環境への破壊的変更・実利用者データの操作は含めない。秘密値をIssueや証拠へ記載しない。
- この包括許可は `stage`・`commit`・`push`・`pr_create`・`merge`・`deploy:*`・`publish:*`・外部への送信・履歴やデータの破壊的操作を含まない。テストや環境準備がこれらを伴うときも、それぞれの許可が必要。人レビュー・Human QA・ツール側の承認条件を省略しない。`permissions` に明示された場合だけ適用し、既存設定に自動で追加しない。
- 一つの操作が別の操作を伴う場合は、伴う操作の許可も必要とする（マージで本番へ自動配備される場合は `merge` と `deploy:production`）。
- 次の操作は一覧に含めず、常にその場で確認する: force-push、履歴の書き換え、ブランチの削除、チーム設定の変更。
- 設定の許可は、今回の依頼で任されたIssue・Cycleの範囲を広げない。

## Cycle報告

報告を使う場合は次のサブキーをすべて記載する。使わない場合は `cycle_report: null` とする。

| サブキー | 内容 |
| --- | --- |
| `qa_scope` | 全体QAの対象となる環境・端末の一覧 |
| `destination` | 報告本文の保存先（例 `linear_cycle_document`） |
| `index` | 索引のURL、または `null` |
| `audience` | 読み手 |
| `format` | 既存の書式や直近の報告への参照。個別の書式指定なしは `null`（共通テンプレートを使う） |

書き込むのは `destination` と `index` だけ。記載のない報告先や送信先には、補足ファイルに書かれていても書き込まない。

## 設定例

shinaps-skills側の例。shinaps-aiも、自分のリポジトリの設定で同じprojectを指す。

```yaml
# 設定を置いたこのリポジトリを作業先とするIssueに適用する。
config_storage: shared
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
implementation_skill: dev-claude-ultra # CodexがBridgeでClaudeへ依頼する。Codexが実装する場合は dev-codex-ultra など
human_code_review: required
commit_mode: autonomous
document_only_changes: none
cycle_report: null
permissions:
  - development_operations # この範囲を利用者が合意した場合だけ記載
  - issue_update
  - bridge_request
  - stage
  - dev_delegation
references:
  specifications:
    - README.md
    - .shinaps/linear/instructions.md
  environments: []
  deployment: []
  validation:
    - .shinaps/linear/references/qa.md
  publication: []
```

この例では `instructions.md` と `qa.md` を採用して一緒に共有する。実際に必要な補足だけを選び、例に合わせた空ファイルは作らない。

この例は `stop_after: pre_push_qa` なので、`post_commit` より後の工程の対応を書いていない。

## 初期設定

依頼の実行に設定が必要で、「設定の読み方」により両方が真に不在と確認できた場合だけ、同じセッションで `linear-plan` の以下の手順を開始する。共有設定の欠落・不備をlocal設定の新規作成で補わない。初期設定の案内やスキルの再実行依頼だけで止めない。設定なしでできる相談・読み取り・明示依頼されたIssue整理には、初期設定を必須にしない。

Claudeもこの手順で初期設定を行える。合意した設定の保存・確認後は元の依頼へ戻る。設定作成は元の依頼の実行範囲や担当、操作許可を増やさず、開発の進行役も変更しない。

1. アカウント、workspace、team、projectと、チームのステータス一覧・既存の運用をLinearから読む。
2. 作業先リポジトリのAGENTS.md・CLAUDE.md・README・CI・検証や配備のスクリプトを読み、`references` の候補を決める。
3. 設定案を一つ作る。チーム設定を管理できる場合だけ、FamilyStayを基にした工程の分離（[workflow.md](workflow.md) の工程表に対応するステータス）を変更案として示す。利用者のプロジェクトらしいという推測で `manage_on_setup` にしない。
4. 既存の情報で決まらない運用上の決定（`config_storage`、`stop_after`、`permissions`（`commit` を含む）、`human_code_review`、`team_settings`、Cycle報告、`commit_mode`、`implementation_skill`）だけを一問ずつ確認する。終了地点は上の一覧から選んでもらう。作業先リポジトリの既存の規約に文書だけの変更の例外がある場合だけ、その範囲と `document_only_changes` の範囲（「項目」の説明）を示して、`ai_commit` を設定するかを確認する。例外を使わない場合は `none` を記載する。
5. 合意した方式の正本へ、下の保存手順に従って保存する。sharedでは採用する補足の `references` と共有対象を照合し、別checkoutでも同じ条件を読めるようにする。正本と補足を読み直して確認する。
6. Linearのチーム設定の変更は、設定の保存とは別に扱う。対象チームと変更差分（追加・改名するステータスと順序）を示し、合意を得てから反映して読み戻す。反映後に `statuses` を実物に合わせて確定する。

## 設定変更

初期設定と同じ手順で、既存の設定との差分を示して合意を得る。保存方式が未決の場合だけ `shared` / `local` を一問で確認し、すでに合意した方式は再質問しない。許可の追加を推測で補わない。

- localからsharedへ変えるときは、端末固有情報を作業記録へ分け、必要補足の参照と共有対象、ignoreの差分を示す。既存の運用条件は一緒に共有するか共有済みの資料へ移す。補足を不採用にして黙って条件を削らず、条件自体の変更は別途合意する。
- sharedからlocalへ変えるときは、メインにファイルを保全する方法、追跡解除の対象、Git履歴に内容が残ること、他checkoutへの影響を示す。他checkoutを自動編集しない。
- 方式の合意だけではstage・commit・push・追跡解除を許可しない。対象操作を満たす既存の許可があれば再確認せず、その範囲で行う。キーの変更、共有準備、追跡、コミット、他checkoutでの取得を区別して報告する。

## 設定の保存とGit共有

localでは設定と補足をメインへ保存し、Git対象外にする。新規の `.shinaps/.gitignore` は次の内容と改行で作る。

```gitignore
*
```

sharedでは `.shinaps/.gitignore` 自身、`linear.yaml`、採用した補足だけを共有する。新規の例は次のとおり。`qa.md` は採用した個別資料の例であり、不要なら例外も作らない。

```gitignore
*
!/.gitignore
!/linear.yaml
!/linear/
!/linear/instructions.md
!/linear/references/
!/linear/references/qa.md
/work/
```

既存のignoreを例で全面置換しない。無関係な規則を保ち、方式と採用資料に必要な差分だけを加える。深い資料には各親ディレクトリの例外も必要だが、`!linear/**` のような補足全体の共有はしない。localへの変更時も、無関係な例外を保ちながら設定・補足の共有例外を対象に見直す。

親の `.shinaps/` が除外されている場合、ルートの `.gitignore` に `!/.shinaps/` など必要な差分を加えてから個別例外を確認する。ユーザーのグローバルignoreや `.git/info/exclude` は編集しない。必要な共有ができなければ原因を報告し、force-addで回避しない。

`git check-ignore --no-index -v <対象パス>` で有効な除外規則と例外を確認し、`git ls-files -- <対象パス>` で追跡状態、`git status --short --untracked-files=all` で実際の変更を確認する。ignoreだけでは追跡済みファイルは対象外にならない。追跡解除は自動で行わず、対象・影響と許可を確認する。

必要補足はYAMLと一緒に共有するか、同じ内容を確認できる共有済み資料への参照に置き換える。元のPCだけに必要補足が残る状態は共有未完了。URLとアクセス条件も別PCで同じ運用を確認できるものにする。ignore例外やファイルの存在だけで採用の有無を決めず、共有YAMLの `references` と実際の共有対象を揃える。cloneやworktreeでも、参照された補足の欠落を未採用と解釈しない。

作業記録の初期化と保全は [作業記録](../work-records.md) に従う。

## 補足ファイルに書くもの

`instructions.md` には、QA固有の注意（端末・ブラウザ・テストアカウントの取得方法への参照）、版の照合に使うコマンド、報告の文体・見せ方、関係者への依頼方法など、プロジェクト共通の条件・手順・相対パス・URLを書く。共通の手順は複製しない。端末固有の絶対パス、session/thread ID、一時的なログイン状態、進捗、QA結果は現在の `.shinaps/work/` へ記録する。秘密値はshared・localのどちらにも保存しない。

委託時は保存方式、正本の所在、必要な補足・参照資料、合意済みの操作許可を渡す。CodexからClaudeへの依頼にも同じ情報を添える。
