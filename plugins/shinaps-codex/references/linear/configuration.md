# プロジェクト設定

設定は、運用上の決定と既存資料への参照を持つ。手順の全文は書かない。秘密値を保存しない。設定は `config_version: 2` のJSONで、[JSON Schema](configuration.schema.json)を契約の正本とする。利用前に同梱CLIで構造を検証し、合意・参照先・工程の実在確認は各手順で行う。

## 検証CLIと契約版

利用中のskillとCLIの版を確認し、0.39.0のskillには同じ版のnpm CLIを導入する（`npm install -g @shinaps/skills@0.39.0`）。pluginだけにはCLIは含まれない。導入・更新が必要ならその権限を確認し、検証のたびに `npx latest` を取得しない。

0.35.0から通常設定の `review_flow.mode` に `ask` を受理する。`config_version` は2のままで、既存のauto・manualの設定は変更不要。0.33.0〜0.34.xのCLIと `$schema` のURLは `ask` を拒否するため、`ask` を使う設定では `$schema` も0.35.0以降のURLにする。

0.39.0から許可 `claude_cli_bypass_permissions` を受理する。`config_version` は2のままで、0.33.0〜0.38.xのCLIと `$schema` のURLはこの許可を拒否するため、使う設定では `$schema` も0.39.0以降のURLにする。

```sh
shinaps-skills --version
shinaps-skills validate-linear-config /absolute/repository/.shinaps/linear.json
```

ローカル開発では `node bin/skills.ts validate-linear-config <file>` を使える。CLIは指定された一つのJSONを読み、同梱schemaで検証する。ネットワーク取得、正本探索、Git操作、入力変更、型変換、既定値の補完、未知キーの除去はしない。未知キーはroot・下位とも拒否する。成功は構造が有効なことだけを表し、許可の合意やLinearの状態・参照ファイルの存在は保証しない。

`config_version` が欠落または旧版なら移行、未来版ならskillとCLIの更新、不正型なら設定修正を案内する。JSONコメントは使わず、運用条件は補足へ書く。`$schema` は公開npmパッケージの固定バージョンURLでエディタを補助する。CLIは外部のschemaを取得しない。

## 配置と保存方式

```text
.shinaps/
  .gitignore            # 保存方式に応じた除外と共有対象の例外
  linear.json           # 対象・工程・許可・終了地点・参照先・報告
  linear/
    instructions.md     # 採用する場合だけ置くプロジェクト固有の指示
    references/         # 必要な場合だけ分ける詳細資料
  work/                 # 現在の作業先だけに保存する記録（Git対象外）
```

設定を置いたリポジトリが対象になる。複数のリポジトリが、それぞれの設定で同じworkspace・team・projectを指してよい。`config_storage` で保存方式を選ぶ。

- `shared`: 設定と運用に必要な補足をGitで共有し、現在のcheckoutの設定を正本とする。
- `local`: メインの作業ツリーに設定と補足を保存し、Gitの対象外とする。
- `config_storage` と `path_policy_overrides` を含む必須項目の欠落は不正。旧設定は下の移行手順で明示的に移行する。

保存方式は共有範囲の選択であり、対象・操作許可・担当・終了地点・レビュー条件を変えない。必須でない空ファイルを作らない。補足にSKILL.mdや独立した呼び出し名を置かず、READMEなどが正本の内容は参照する。

## 設定の読み方

開始時と再開時に次の順で正本を一つ決め、設定と補足を読み直す。「現在」は作業対象のcheckout、「メイン」は同じリポジトリの `git worktree list` の先頭を指す。同じcheckoutなら一つだけ読む。

1. 現在の `.shinaps/linear.json` を確認し、上記CLIで検証する。探索候補に旧 `.shinaps/linear.yaml` があれば移行対象として止める。JSON/YAMLの共存も移行未完了であり、一方を選んで続けない。読取不能・不正値なら止める。`shared` なら現在だけを採用し、メインの設定は調べない。
2. 現在が `local`、または設定が真に不在の場合だけ、メインを同じ検証と旧YAML確認で確認する。不在の場合は、そのcheckoutのindexとHEADに設定がないことも確かめる。どちらかにあれば削除・未展開による不備として止める。Git状態を確定できないときも、未設定とは扱わない。
3. メインが `local`ならメインだけを採用する。現在のコピーで上書き・統合しない。メインが `shared` なら現在との不整合または現在の共有設定不足として止める。メインが不正・読取不能なら止める。メインが不在の場合もindexとHEADを確認し、両方にないときだけ真の不在とする。現在が `local`なのにメインが不在なら正本不備で止める。両方が真に不在の場合だけ初期設定へ進む。

不在の確認には、そのcheckoutで `git ls-files -- .shinaps/linear.json .shinaps/linear.yaml`（index）と `git ls-tree HEAD -- .shinaps/linear.json .shinaps/linear.yaml`（HEAD）を使う。HEAD未作成なら、その状態が確定した場合に限りHEADに設定なしと扱う。追跡状態だけで保存方式を推測しない。未追跡の `shared` は準備中の設定として読めるが、共有済みとは報告しない。追跡済みの `local` は不整合として報告し、自動で追跡解除しない。

設定・`instructions.md`・必要な `references` は同じ正本から読む。補足の相対パスは正本のリポジトリルートを基準とし、コード・検証・配備などの操作対象の相対パスは現在の作業先を基準とする。共有設定の不足を別checkout・別端末のlocal設定や補足で補わない。`.shinaps/work/` の記録は証拠であり、設定を上書きしない。

- `shared` では、採用した補足を共有JSONの `references` に明示する。`instructions.md` は `references.specifications` に記載し、開始・再開時に必ず読む。存在するのに記載がなければ採用情報の不備として止め、無視や自動追記で続けない。
- その他の補足は内容に対応する既存の5分類へ記載し、担当する工程に必要なものを読む。参照された補足がない・読めない場合は未採用と解釈せず、依存する工程を止める。採用した `instructions.md` の欠落・読取不能は設定に依存する実行全体の開始・再開を止める。
- `local`では従来どおり、存在する `instructions.md` を開始・再開時に読み、その他の補足は工程に必要なものを読む。既存設定への参照の自動追記はしない。
- 採用していない任意の補足はなくてもよい。必要な補足を未採用扱いにして運用条件を減らさない。
- 補足ファイルは追加の条件と手順を表す。設定の決定（対象・許可・終了地点・工程の対応）と、人の完了・QAの証拠の要件は変えない。補足と設定が矛盾したら、設定に従って止め、どちらを直すか確認する。
- 不足や矛盾があれば、影響する工程の開始前に止めて一問ずつ確認する。影響しない工程は続ける。許可の追加やステータスの新設を推測で補わない。
- 終了地点は操作の許可を兼ねない。設定は、利用中のツールの権限や利用者の明示的な停止・撤回を上書きしない。
- 利用者と合意して保存した設定の許可は、その対象・操作・条件の範囲で、作業先リポジトリの規約がいう合意・許可に当たる。一般的な「明示依頼がある場合だけ」という条件も、この合意済みの範囲では満たすため、同じ操作の許可を改めて求めない。設定ファイルが存在することや、AIが合意なしに加えた許可は、その根拠にしない。利用者による今回の範囲限定・停止・撤回と、ツール固有の明示依頼条件は維持する。

次工程を判断するときは、`review_flow`・`permissions`・`stop_after` の条件を併せて読み、[担当と工程](workflow.md)で定めた担当と前工程の結果を確認する。一つの設定から他の許可や工程の完了を推測しない。終了・待機とゴール状態は [execution.md](execution.md) に従う。

## 項目

以下の項目は明示必須。`$schema` だけはエディタ補助として省略できる。省略・不正値を既定値で補わず、依存する工程を止めて設定を確認する。`null`・`none`・空の一覧は、以下で認めた箇所だけで「使用しない」を表す。

| キー | 内容 |
| --- | --- |
| `config_version` | 整数 `2`。パッケージ版とは独立した契約版 |
| `$schema` | 任意のエディタ補助。固定URLは下記。CLIはこのURLを取得しない |
| `config_storage` | `shared`（Git共有）または `local`（メインの作業ツリーだけに保存）。保存・読取規則は上記に従う |
| `target.workspace` | Linearのworkspace |
| `target.team` | チームのキー（例 `ENG`） |
| `target.project` | 使うprojectのURL。projectを使わない運用では `null` |
| `team_settings` | `existing_only`（既存の定義に合わせ、変更しない）または `manage_on_setup`（初期設定・設定変更のときだけ変更案を示し、合意後に整備できる） |
| `statuses` | 状態キーと待ち状態の `human_input` から、実在するステータス名への対応。複数のキーに同じステータスを指定できる |
| `stop_after` | 終了地点（下の「終了地点」） |
| `permissions` | 継続的に許可した操作の一覧（下の「許可」）。経路の許可（auto: `claude_cli` と `claude_cli_bypass_permissions`、manual: `bridge_request`）も含む。許可なしは `[]` |
| `references` | `specifications`・`validation`・`environments`・`deployment`・`publication` の5分類をすべて記載し、既存資料のパスまたはURLの一覧を指定する。該当資料なしは `[]` |
| `cycle_report` | Cycle報告の設定（下の「Cycle報告」）。報告を使わない場合は `null` |
| `review_flow` | `{ "mode": "auto" }`（AIが自然な単位を決め、独立レビュー・QA後にstage・commit）または `{ "mode": "manual" }`（AIがレビュー待ちを明示し、人がWebStormで差分を確認する。人のコミット開始依頼でAIが分割案を示し、人が単位ごとに依頼したらAIがstage・commit）、または `{ "mode": "ask" }`（着手時に進行役が人へautoかmanualかを一問で確認し、回答を同じIssueの通常flowとして使う）。開始時の値（askでは回答）で経路も決まる（下の「経路」） |
| `path_policy_overrides` | パス別に `review_flow` を上書きするルールの一覧。例外なしは `[]`（下の「パス別の方針」） |

- 利用者と合意した `review_flow` はいずれも対象のstageとAIのcommitを許可する（askは解決後のmodeに従う）。`auto` は独立レビュー後、`manual` は人がその単位のコミットを依頼した後にcommitする。未合意の設定ファイルから許可を得ない。その場の明示指示が優先し、push・公開・履歴変更は別の許可に従う。
- どちらのflowもdev内の確認、必須検証、Agent QA、必要なHuman QAを維持する。`auto` は独立レビューを必須とし、利用できなければ自己確認で代用せず止める。人レビュー省略を人のレビュー済みと記録しない。
- 状態キーは [workflow.md](workflow.md) の「工程とステータス」の表と同じ。`statuses` の値はチームに実在する正確な名前にする。操作時はLinearから取得した状態のIDを使う。対応が曖昧・欠落・実物と不一致なら、その対応に依存する更新を止める。ステータスを自動で新設しない。
- `team_settings: manage_on_setup` の場合も、通常実行ではチーム設定を変更しない。

## 経路

実装・修正・コミットはClaude Codeが `shinaps:dev-claude` と `shinaps:commit` で行う（境界内のUIの微調整はCodexが行える。[担当と工程](workflow.md#codexによるuiの微調整)）。Codexとの間の経路は、着手時に通常設定の `review_flow.mode` で一つに決める。

| 通常設定 | 経路 | 必要な許可 | メインのモデル |
| --- | --- | --- | --- |
| `auto` | Codexが起動するローカルClaude CLIの同じsession（[Claude CLI](claude-cli.md)） | `claude_cli`・`claude_cli_bypass_permissions` | Opus。起動とすべてのresumeで `--model opus` を指定する |
| `manual` | WebStorm内の対話Claude CodeセッションへBridgeで依頼する（[Bridge](bridge.md)） | `bridge_request` | Opusを基本とし、Issueの着手時にFableかOpusかを確認する。同じIssueの一括修正・継続・再開では選択を引き継ぐ |
| `ask` | 着手時に人へ一問で確認した回答（auto・manual）の経路 | 回答した経路の許可 | 回答した経路のモデル |

- メインはdevを実行するClaude Codeのセッションを指す。担当（独立レビューを含む）のモデルは役割定義の値で、経路とは独立している。単独のdev（Linear進行を経ないdev）のメインは利用者のセッション設定のまま。メインは調査・設計・実装・指摘の採否を自分で行うので、メインのモデル（manualでFableを選べばFable）がそのまま設計・実装のモデルになる。
- manualの対話セッションのモデルは、人が `/model` で切り替える。Claudeへのプロンプトや Bridge のメッセージでは切り替えられない（[model-config](https://code.claude.com/docs/en/model-config)）。
- manualで基本（Opus）と違う選択なら、Codexが人へ切り替えを依頼する。Codexは人の報告を記録し、実際のモデルを照合できたとは扱わない。

- `ask` では、進行役がClaudeへ依頼する前に、Issueの作業内容と推奨する経路の理由を添えてautoかmanualかを一問で確認し、回答まで着手しない。回答・Issue・作業先・設定・選んだ経路を作業記録に残し、同じIssueの修正・再開・QA・差分確定では再質問せず記録した選択を使う。同じIssueに明示的な既存の選択があれば再質問しない。Cycle全体・バックログ消化でもIssueごとに選ぶ。設定の `ask` は書き換えない。選択は他の許可を増やさず、選んだ経路の許可を確認する。
- 経路はIssueの途中で切り替えない。`permissions`・`stop_after`・`dev_delegation`・worktreeや別セッションの作成の許可は、経路によって変わらない。
- manual経路でパス別の方針によりauto単位が生じた場合は、人のコミット開始依頼の後、対話session内のClaudeがその単位を単位ごとの依頼なしに独立レビュー後にcommitし、人のレビューの省略を記録する。
- auto経路でmanual単位が生じた場合、非対話CLIは人との相談・コミットの依頼を扱えない。CodexはLocal Agent QAで判定記録を照合した時点で検出し、差分確定の依頼前に人へ一問で確認する: 「今回の明示指示でその単位をautoとして進める」か「Issueを中止し、未コミット差分を保全したまま設定（通常設定またはルール）を見直してから、manual経路でやり直す（通常設定がaskなら `ask` は書き換えず、この回答を同じIssueの以前の選択に代わる選択として作業記録へ残す）」か。黙ってautoへ落とさない。`commit` の中で検出した場合は手順を進めず、判定を記録してresultへ返す。

## パス別の方針

`path_policy_overrides` は、各予定コミットに入る全変更を対象に方針を適用する。Linear進行でも単独の `commit` でも同じ規則を使う。新規設定は `path_policy_overrides: []` とし、具体的なパスと上書き項目を利用者と合意した場合だけルールを追加する。

```json
{
  "path_policy_overrides": [
    { "paths": ["docs/**", "README.md"], "review_flow": { "mode": "auto" } }
  ]
}
```

- 上書きは `review_flow` オブジェクト全体を置換する。各ルールは空でない `paths` と `review_flow` オブジェクト だけを必須とする。パス別のmodeは `auto` か `manual` だけで、`ask` は設定不備とする。その他のキー、省略、不正値や構文は設定不備として依存工程を止める。
- 通常設定が `ask` の場合は、着手時に解決したmodeを通常方針として使い、パス例外は同じ規則で適用する。
- パス別のflowもstageとcommit担当を上記のとおり決める。push・公開・終了地点・ツール権限・必要なQAは変更しない。経路はパス例外では切り替えず、単位のmodeと経路が異なる場合は上の「経路」に従う。
- パス設定への合意は対象と工程の許可であり、変更内容に含まれる未合意仕様や権限拡張への承認ではない。内容や拡張子から例外許可を推定しない。

### パターンとコミット全体の照合

パスは作業対象リポジトリのルート相対、`/` 区切りで、大小文字を区別する。完全一致、同じ階層内の0文字以上に一致する `*`、独立したパス要素として0階層以上に一致する `**` だけを扱う（例: `docs/*` は直下、`docs/**` は配下全体、`**/README.md` はルートを含む各階層）。隠しファイルも通常の名前として扱う。リンク先を解決したり、現在存在するファイルへパターンを展開したりしない。絶対パス、`.` / `..` 要素、否定・文字クラス・波括弧展開などの未対応構文は設定不備として止める。

各予定コミットの全変更に現れる旧・新パスが、一つのルールのパターン一覧で覆われる場合だけ、そのルールをそのコミット全体へ適用できる。追加は新パス、削除は旧パス、改名・移動は両方を含め、modeだけの変更も対象にする。新パスだけの一覧や現在残っているファイルだけでは判定しない。

- コミット全体に適用できるルールがなければ、そのコミット全体を通常方針とする。複数ルールをファイル別・項目別に合成しない。
- コミット全体に適用できるルールが複数ある場合、`review_flow` のmodeが同じならその方針を採用し、適用した全ルールを記録する。一つでも結果が異なれば依存工程を止めて競合の解消を求める。並び順やパターンの詳細度では優先しない。
- モードによらず自然な責務単位を先に決め、その予定コミットごとに判定する。同じ依頼に別の変更があっても、独立した範囲内コミットには例外を適用できる。例外取得だけを目的とした恣意的な分割はしない。依頼全体は網羅性と最終照合に使い、方針を固定する単位にはしない。

### 判定記録と変更時の扱い

各予定単位について、設定の正本と内容、適用した全ルール（または適用なしの理由）、単位の比較元と全差分、実効 `review_flow`（通常設定が `ask` でも解決後の `auto` か `manual`）、今回の明示指示とflowの合意根拠、検証・レビューの結果を記録する。manualの単位は依頼記録（コミットの依頼発話の要約・stage時のtree hash・作成したSHA）も残す。差分の同一性はパスだけでなく内容・mode等も含めて確認する。Linear進行での担当間の引き渡しは [workflow.md](workflow.md)、コミット前後の単位照合と完了時の全体照合は `commit` に従う。

予定単位の内容・分割・統合を変更したら、変更した単位を再判定して必要なレビュー・許可確認・検証へ戻す。設定変更時も影響する未実行単位を再判定する。以前の判定や別単位の方針は流用しない。manualで人の修正・依頼を経てcommitした場合は `commit` に従い、commit後に目的・範囲・実効flowと影響する挙動を確認する。正当な修正は元の予定との差と対応を残して確定単位へ反映する。不明・対象外の変更、確定単位との不一致は停止し、履歴を無断で書き換えない。

### config_version 1 からの移行

0.33.0から `config_version: 1`、`implementation_skill`、`review_flow.tool`、許可の `codex_task`・`managed_session:*` は受け付けない。Codex実装タスク・Managedセッションの経路はなくなるため、次の順で展開する。

1. 進行中Issueを棚卸しする（Codex実装タスク・Managedセッション上の未取り込み差分、Coding・QA中のIssue）。
2. 各Issueを、旧版のまま終了地点まで進めるか、差分を作業先へ取り込んで実装工程からClaudeへ引き継ぐかに分ける。
3. 0.33.0を公開し、各端末のpluginとCLIを更新する。
4. リポジトリごとに下の手順で設定と補足を移行し、CLIで検証する。
5. 進行中Issueを再開する。

`linear-plan` は各リポジトリで以下を行い、検証・保存を完了してから再開する。CLIは移行しない。

1. 現在の設定・許可・補足・進行中Issueを確認する。
2. `config_version: 2` にし、`implementation_skill`、`review_flow.tool`、`path_policy_overrides[].review_flow.tool` を削除する。
3. `permissions` から `codex_task`・`managed_session:*` を削除する。経路の許可（通常設定がautoなら `claude_cli` と `claude_cli_bypass_permissions`、manualなら `bridge_request`）は、そのリポジトリの利用者と合意して明示的に追加する。既存の `bridge_request` は、任意の引き渡しに加えてmanual経路の依頼も表すようになるため、残すかを確認する。他の許可は増やさない。
4. `statuses` は変更しない。補足からCodex実装タスク・Managed・tool・人がコミットする条件の記述とそれらの資料へのリンクを除き、合意日付を残す。
5. `$schema` を利用中の公開版のURLへ更新し、CLIで検証して読み戻す。

旧 `.shinaps/linear.yaml` とscalar `review_flow`（0.32.0より前）も同じ手順でv2のJSONへ移す。YAMLコメントの運用条件は `instructions.md` または対応する参照資料へ移す。旧 `human_code_review`・`commit_mode`・permissionsのstage/commit・`document_only_changes`・パス別ai_commitは除去し、旧noneは例外なし、旧ai_commitは具体的パスへの移行または廃止を合意して暗黙変換しない。保存後に旧YAMLを除き、ignore・参照・共有対象も更新する。追跡解除・stage・commitは既存の許可と安全手順に従う。

## 終了地点

初期設定ではこの一覧を示して選んでもらう。

| `stop_after` | 止まる地点 |
| --- | --- |
| `pre_push_qa` | 差分確定を終えた後、公開確認でpush前の最終Agent QAが合格し、記録した時点 |
| `pr_created` | 必須の検証と許可されたpush・PR作成を終え、IssueとPRの相互リンクを確認した時点。Staging QAが未実施なら残項目として記録する |
| `issue_done` | Issueの必須受入条件をすべて満たし、Doneにした時点 |

- 終了地点の工程がそのIssueにない場合（Git変更がない作業など）の扱いは、[workflow.md](workflow.md) の「工程とステータス」に従う。
- 終了地点は到達点だけを決める。stage・commitは合意済み `review_flow`、その他の操作は `permissions` が決める。許可のない操作（例 `merge`）がある場合は、その操作の前で許可を確認する。これは許可待ちであり、終了地点への到達ではない。Cycle全体を任された場合も、許可待ちのIssueは終了地点に達したものとして扱わない。

## 許可

| 値 | 許可する操作 |
| --- | --- |
| `issue_update` | 対象のteam・projectの中で、利用者が任せたIssue・Cycleの範囲に対する運用上の更新（本文・コメント・状態・依存・Linearへの添付、整理で必要になったIssueの作成・分割）と、利用者から任された目的の作業を着手前にIssueへ紐づけるための作成（[issue.md](issue.md) の「着手前に作業をIssueへ紐づける」）。チーム設定の変更、未合意の範囲・期限の変更、Cycle外への進行、Issueの削除、外部への送信を含めない |
| `development_operations` | 任された対象の開発に必要な、既存アカウントへの通常のログイン、ローカル環境準備、プロジェクトの依存導入、開発サーバー・Simulatorの起動停止、ビルド・テスト・QA操作を継続的に許可する。下の範囲に従う |
| `claude_cli` | auto経路で、Codexが行うClaudeのローカルCLI起動、同じsessionの状態・結果取得、質問への回答・修正・許可済みコミットのresume。メインのモデル（[経路](#経路)）と権限モードの指定のほかは既存CLI設定を保持する（[手順](claude-cli.md)）。bypassPermissionsでの起動への同意は含まない |
| `claude_cli_bypass_permissions` | auto経路のClaudeのローカルCLIを、起動と同じsessionのすべてのresumeで `--permission-mode bypassPermissions` にすることへの、利用者の継続的な同意。CLIの権限チェックを省くだけで、操作の許可を追加しない。Claudeの操作は依頼の範囲と他の許可・合意済みの `review_flow` に限る（[手順](claude-cli.md#操作権限)） |
| `bridge_request` | manual経路で、CodexがBridgeで対話Claude Codeセッションへ行う依頼と報告の受け取り、および別会話との任意の進行の引き渡し。報告は照合材料であり、操作許可を変更しない（[手順](bridge.md)） |
| `push` | 対象Issueの作業ブランチの通常のpush |
| `pr_create` | 対象IssueのPRの作成と更新 |
| `merge` | 必要なQA・承認が揃った対象PRのマージと、元のブランチへ戻る操作 |
| `deploy:<環境>` | 指定した環境への配備・配布（例 `deploy:staging`） |
| `publish:<操作>` | 一般公開やストアへの提出など、指定した公開操作（例 `publish:app_store_submit`） |
| `dev_delegation` | `shinaps:dev-claude` の中で、サブエージェントへ委託する。許可がない場合、入口のメインは担当の作業を代わりに行わず、必要な許可を求める。worktreeの作成は含まない |
| `evidence:<保存先>` | Linear以外の指定した保存先へQA素材を保存する（LinearのIssueへの添付は `issue_update` に含む） |

- 開発進行には `issue_update` と、[経路](#経路)の許可が必要（auto: `claude_cli`・`claude_cli_bypass_permissions` とローカルClaude CLI、manual: `bridge_request` と、Bridge MCP・WebStorm内の対話Claude Codeセッション。ask: 着手時に選んだ経路の許可）。今回の明示依頼による同じ経路の許可も引き継ぐ。初期設定は `issue_update`・経路の許可（askでは選択肢にする両経路の許可）・`dev_delegation` と `review_flow` を具体的に提案し、合意を得る。設定の存在だけでは許可を得ない。
- `development_operations` は、既存の認証手段と利用者が許可した既存アカウントを使い、対象の開発・検証環境と専用の検証データで行う操作に限る。本人の二要素認証・セキュリティキー・CAPTCHA等が必要なら具体的に依頼し、回避しない。ログイン成功を新しい権限への同意と扱わず、新規アカウント・OAuth権限の拡大・課金・新規クラウド資源・共有環境への破壊的変更・実利用者データの操作は含めない。秘密値をIssueや証拠へ記載しない。
- この包括許可は `stage`・`commit`・`push`・`pr_create`・`merge`・`deploy:*`・`publish:*`・外部への送信・履歴やデータの破壊的操作を含まない。テストや環境準備がこれらを伴うときも、stage・commitは合意済みflow、その他はそれぞれの許可が必要。人レビュー・Human QA・ツール側の承認条件を省略しない。`permissions` に明示された場合だけ適用し、既存設定に自動で追加しない。
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

manualの設定例。同じprojectを複数のリポジトリがそれぞれの設定で指してよい。

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@shinaps/skills@0.39.0/plugins/shinaps-claude/references/linear/configuration.schema.json",
  "config_version": 2,
  "config_storage": "shared",
  "target": {
    "workspace": "your-workspace",
    "team": "ENG",
    "project": "https://linear.app/your-workspace/project/your-project-0123456789ab"
  },
  "team_settings": "existing_only",
  "statuses": {
    "todo": "Todo",
    "refinement": "In Progress",
    "ready": "Todo",
    "coding": "In Progress",
    "local_agent_qa": "In Progress",
    "code_review": "In Review",
    "post_commit": "In Review",
    "human_input": "In Progress",
    "done": "Done"
  },
  "stop_after": "pre_push_qa",
  "review_flow": {
    "mode": "manual"
  },
  "path_policy_overrides": [],
  "cycle_report": null,
  "permissions": [
    "development_operations",
    "issue_update",
    "bridge_request",
    "dev_delegation"
  ],
  "references": {
    "specifications": [
      "README.md",
      ".shinaps/linear/instructions.md"
    ],
    "environments": [],
    "deployment": [],
    "validation": [
      ".shinaps/linear/references/qa.md"
    ],
    "publication": []
  }
}
```

この例では `instructions.md` と `qa.md` を採用して一緒に共有する。実際に必要な補足だけを選び、例に合わせた空ファイルは作らない。

この例は `stop_after: pre_push_qa` なので、`post_commit` より後の工程の対応を書いていない。

## 初期設定

依頼の実行に設定が必要で、「設定の読み方」により両方が真に不在と確認できた場合だけ、同じセッションで `linear-plan` の以下の手順を開始する。共有設定の欠落・不備をlocal設定の新規作成で補わない。初期設定の案内やスキルの再実行依頼だけで止めない。設定なしでできる相談・読み取り・明示依頼されたIssue整理には、初期設定を必須にしない。

Claudeもこの手順で初期設定を行える。合意した設定の保存・確認後は元の依頼へ戻る。設定作成は元の依頼の実行範囲や担当、操作許可を増やさず、開発の進行役も変更しない。

1. アカウント、workspace、team、projectと、チームのステータス一覧・既存の運用をLinearから読む。
2. 作業先リポジトリのAGENTS.md・CLAUDE.md・README・CI・検証や配備のスクリプトを読み、`references` の候補を決める。
3. 設定案を一つ作る。チーム設定を管理できる場合だけ、FamilyStayを基にした工程の分離（[workflow.md](workflow.md) の工程表に対応するステータス）を変更案として示す。利用者のプロジェクトらしいという推測で `manage_on_setup` にしない。
4. 既存の情報で決まらない運用上の決定（`config_storage`、`stop_after`、`permissions`、`review_flow`、`team_settings`、Cycle報告）だけを一問ずつ確認する。終了地点は上の一覧から選んでもらう。パス別の例外が必要な場合は、具体的な対象パターンと上書き項目、通常設定からの変更を示して合意する。例外を使わない新規設定には `path_policy_overrides: []` を記載する。旧設定の移行は上の手順に従う。
5. 合意した方式の正本へ、下の保存手順に従って保存する。sharedでは採用する補足の `references` と共有対象を照合し、別checkoutでも同じ条件を読めるようにする。同梱CLIでJSONを検証し、正本と補足を読み直して確認する。
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

sharedでは `.shinaps/.gitignore` 自身、`linear.json`、採用した補足だけを共有する。新規の例は次のとおり。`qa.md` は採用した個別資料の例であり、不要なら例外も作らない。

```gitignore
*
!/.gitignore
!/linear.json
!/linear/
!/linear/instructions.md
!/linear/references/
!/linear/references/qa.md
/work/
```

既存のignoreを例で全面置換しない。無関係な規則を保ち、方式と採用資料に必要な差分だけを加える。深い資料には各親ディレクトリの例外も必要だが、`!linear/**` のような補足全体の共有はしない。localへの変更時も、無関係な例外を保ちながら設定・補足の共有例外を対象に見直す。

親の `.shinaps/` が除外されている場合、ルートの `.gitignore` に `!/.shinaps/` など必要な差分を加えてから個別例外を確認する。ユーザーのグローバルignoreや `.git/info/exclude` は編集しない。必要な共有ができなければ原因を報告し、force-addで回避しない。

`git check-ignore --no-index -v <対象パス>` で有効な除外規則と例外を確認し、`git ls-files -- <対象パス>` で追跡状態、`git status --short --untracked-files=all` で実際の変更を確認する。ignoreだけでは追跡済みファイルは対象外にならない。追跡解除は自動で行わず、対象・影響と許可を確認する。

必要補足はJSONと一緒に共有するか、同じ内容を確認できる共有済み資料への参照に置き換える。元のPCだけに必要補足が残る状態は共有未完了。URLとアクセス条件も別PCで同じ運用を確認できるものにする。ignore例外やファイルの存在だけで採用の有無を決めず、共有JSONの `references` と実際の共有対象を揃える。cloneやworktreeでも、参照された補足の欠落を未採用と解釈しない。

作業記録の初期化と保全は [作業記録](../work-records.md) に従う。

## 補足ファイルに書くもの

`instructions.md` には、QA固有の注意（端末・ブラウザ・テストアカウントの取得方法への参照）、版の照合に使うコマンド、報告の文体・見せ方、関係者への依頼方法など、プロジェクト共通の条件・手順・相対パス・URLを書く。共通の手順は複製しない。端末固有の絶対パス、session/thread ID、一時的なログイン状態、進捗、QA結果は現在の `.shinaps/work/` へ記録する。秘密値はshared・localのどちらにも保存しない。

委託時は保存方式、正本の所在、必要な補足・参照資料、合意済みの操作許可を渡す。CodexからClaudeへの依頼にも同じ情報を添える。
