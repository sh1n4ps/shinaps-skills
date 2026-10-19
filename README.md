# shinaps-skills

Shinaps AIの利用者向け開発ワークフロー。Claude CodeとCodexにはそれぞれに適したplugin・カスタムエージェントとして配布し、Claude Managed Agentsには `ant apply` で作るエージェント・skill・環境の定義として提供する。スキルのダウンロードと導入にShinaps AIのアカウントは不要。サービスのrule検索・登録を使うときにアカウント作成と認証を行う。

## プロジェクトごとの条件

共通スキルが持つのは判断手順。対象環境・必須検証・公開条件は、対象プロジェクトの `AGENTS.md` / `CLAUDE.md` と参照先、README、CI、既存スクリプトから読み取る。専用設定ファイルは必須にしない。

例外として `linear-execute` の開発進行とチーム設定の変更には、対象リポジトリの `.shinaps/linear.json` を必須にする。操作の継続的な許可と終了地点を会話から推測せず、合意した範囲だけを続けて進めるためである。設定は `config_storage: shared` でGit共有、`local` でメインの作業ツリーだけに保存する。必須キーの欠落は設定不備として止め、旧設定は明示移行する。sharedは現在のcheckout、localはメインの設定と補足を正本とする。共有設定が欠けていても端末別のlocal設定では補わない。[共通設定](plugins/shinaps-claude/references/linear/configuration.md)の読取・保存手順に従う。設定がなくてもIssueの読み取り・整理はできる。設定が必要な実行で共通の読取手順により真に未設定と確認できた場合だけ、同じセッションで `linear-plan` の初期設定ヒアリングへ進み、合意した設定の保存・確認後に元の依頼を再開する。

sharedで採用する `instructions.md` は共有JSONの `references.specifications` に明記して開始・再開時に読み、他の必要補足は内容に対応する `references` に記載する。必要補足の欠落・読取不能は依存工程を止め、未採用とは扱わない。設定・採用補足・ignoreの個別例外を一緒に共有するか、共有済み資料への参照に置き換える。端末の絶対パスやsession/thread ID、進捗・QA結果は `.shinaps/work/` に分け、秘密値はどちらにも保存しない。保存方式の合意だけでstage・commit・push・追跡解除を許可しない。

例えばPCブラウザのみのプロジェクトには対応ブラウザと確認コマンドを書く。iOSプロジェクトにはSimulatorと実機の使い分けを記す。スキルは一律の端末数やOS数を追加しない。既存の情報で決まらず結果を左右する条件だけ確認し、保存を了承された方針をプロジェクト側に残す。

## JSON設定の検証

0.32.0から `.shinaps/linear.json`（`config_version: 1`）を使います。旧YAML・scalar review_flow・旧キーの共存は移行未完了として止め、[移行手順](plugins/shinaps-claude/references/linear/configuration.md#旧設定の移行)に従います。コメントの運用条件も補足へ移します。

CLIはpluginに含まれないため、利用中のskillと同じ `@shinaps/skills@0.32.0` を導入し、`shinaps-skills --version` で確認します。`shinaps-skills validate-linear-config <明示ファイル>` は同梱schemaだけで検証し、ネットワーク取得・正本探索・Git操作・入力変更は行いません。`$schema` は固定URLによるエディタ補助で、契約の正本は[同梱schema](plugins/shinaps-claude/references/linear/configuration.schema.json)です。

```sh
npm install -g @shinaps/skills@0.32.0
shinaps-skills --version
shinaps-skills validate-linear-config /absolute/repository/.shinaps/linear.json
```

## スキル

| 名前 | 用途 |
|---|---|
| `explore` | 対話しながら既存挙動と変更影響を調べる |
| `spec` | 目的・仕様・実現方法を詰める |
| `dev-claude` (Claudeのみ) / `dev-codex` (Codexのみ) / `dev-managed-cc` (Managed Agentsのみ) | メインが作業に応じて担当・人数を判断し、計画・実装・検証・独立レビューを進める |
| `debug` | 不具合の原因を検証する |
| `review` | 差分や既存コードをレビューする |
| `refine` | Shinaps AIのruleと実ファイルを照合する |
| `extract-rules` | PRレビューからruleを抽出する |
| `simplify` | 目的から見直して不要な構造や手順を削る |
| `commit` | 各単位のreview_flowに従い、autoはAIがレビュー・コミット、manualはAIがstash・stage・提示し、人がレビュー・修正・コミットする |
| `create-pr` | リポジトリの規約に合わせてPRを作成する |
| `release` | 公開条件を確定し、対象バージョンの利用可能性を確認する |
| `linear-plan` | 相談・必要なspec/explore・Issue作成と整理・プロジェクト設定を行い、実装前で止める |
| `linear-execute` | Issue単体・Cycle全体・バックログ消化を選び、設定に従って実装・QA・許可された公開を進める |

コミット・PR・リリースは、利用者の依頼またはLinear進行で合意済みの継続許可に従う。[共通設定](plugins/shinaps-claude/references/linear/configuration.md)・[担当と工程](plugins/shinaps-claude/references/linear/workflow.md)・[終了と待機](plugins/shinaps-claude/references/linear/execution.md)を参照し、必要な前工程が揃えば再確認せずに進む。単独スキル利用にはLinear進行や新しいゴールを必須にしない。`autonomous-commit-review` の役割は `commit` に統合した。個人用の別AI呼び出し・ブラウザ管理・ゴール管理・動画制作はこのpluginに含めない。

`linear-execute` は初版では利用者本人の環境向けで、進行とAgent QAは会話側が担当する（Claude・Codexの入口ではCodex、Managedの入口では linear-execute を実行する Claude Code または Codex）。運用項目は明示必須で、未記載を既定値で補わない。実装の担当は作業先の `.shinaps/linear.json` の `implementation_skill` で選ぶ。`dev-claude` はauto/manualともCodexがローカル `claude -p` を起動し、同じsessionをresumeする。manualのレビューUIは `review_flow.tool` で選ぶ。[CLI手順](plugins/shinaps-claude/references/linear/claude-cli.md)に従い、CLIの既存権限・model・effort・pluginsを保持する。`dev-codex` を選ぶと、会話側はゴール・進行・Agent QAを担当し、Issueごとの別Codexタスクが実装・QA指摘の修正・許可されたコミットを行う。タスク作成・連絡には `codex_task` とツールが要求する明示依頼が必要。`dev-managed-cc` を選ぶと、Issueごとの Managed Agents セッションが実装し、進行役が差分を適用してQAとreview_flowに従ったコミット工程を行う。`managed_session:<USD>` と `dev_delegation` が必要で、Bridge は不要。どの入口でも `implementation_skill` は許可を増やさない。Bridge本体は同梱せず、導入済みのMCPとWebStormプラグインを使う。`SKILL.md` は担当ごとに両版で書き分け、共通の手順と書式は `references/linear/` に置く。`references/linear/` はClaude版を編集元としてCodex版とManaged Agents版へ同じ内容を複製し、テストで一致を確認する。

`review_flow: { "mode": "auto" }` はAIが自然な単位を決め、独立レビュー・QA後にstage・commitする。`review_flow: { "mode": "manual", "tool": "plasma" }`（toolは `webstorm` も可） はAIが単位を計画し、単位外を安全にstashしてstage・提示し、人がレビュー・修正・commitする。両方のstage権限とautoのAI commit権限は利用者との明示合意に含まれ、未合意ファイルからは得ない。`path_policy_overrides` は `paths` と `review_flow` だけを持つ。全変更が一つのルールで覆われる単位だけ適用し、改名は旧新両パスを判定する。競合時は止める。旧 `human_code_review`・`commit_mode`・permissionsのstage/commit・パス別ai_commitは明示移行が必要。[共通設定](plugins/shinaps-claude/references/linear/configuration.md#パス別の方針)を参照する。

0.29.0では旧 `document_only_changes: ai_commit` を廃止した。利用先では依存工程を止め、具体的なパス例外への移行または例外廃止を合意する。説明だけの変更の許可とは同値でないため自動変換しない。旧 `none` もJSONへ明示移行し、新規設定は `path_policy_overrides: []` にする。

`permissions` の `development_operations` を明示すると、既存アカウントのログイン・環境準備・依存導入・起動・テスト・QAを継続的に許可できる。コミット・公開・破壊的操作の許可や人レビューは別に扱う。

旧 `linear` の入口は廃止した。相談・Issue整理・設定変更は `linear-plan`、実行は `linear-execute` を使う。設定は0.32.0からJSONへ移行する。実行範囲は毎回の依頼で確定し、バックログではブロッカー到達と報告を終了条件にできる。人レビュー・Human QA待ちは予定工程として待機する。

### dev の入口と体制

| 入口 | 実行環境 | 担当のモデル |
| --- | --- | --- |
| `dev-claude` | Claude Code | Opus / medium（登録エージェントの定義） |
| `dev-codex` | Codex | `gpt-6-astra` / medium（起動時に指定） |
| `dev-managed-cc` | Managed Agents | leadはFable 5.1 / medium、担当はOpus / medium・fast |

人数による通常／ultraの区別は廃止した。`implementation_skill` は実行環境だけを選ぶ。旧名は対応する通常名へ設定・呼び出しを移行し、互換の入口は残さない。

[実装体制の判断](plugins/shinaps-claude/references/dev/staffing.md)に従い、executeの進行役が各Issue開始時に関連コードを確認し、設計前に役割別の人数・理由・専任なしの責任者・必須検証を決めて渡す。単独devではメインが判断する。不確実性・影響範囲・失敗時の影響を基準に、途中でも必要な担当を追加する。人数を増やすだけで許可・予算・品質条件は変えない。

小さく明確な変更はメインが計画し、実装1体と独立コードレビュー1体で進められる。設計の比較や重要な契約の独立確認が必要なら該当する役割だけ増やす。規約照合・簡素化・指摘検証は専任なしでも責任者を決めて行う。

- 工程と体制基準はClaude版を編集元としてCodex・Managedへ複製する。起動手順だけはruntimeごとに異なる。
- Claudeは登録エージェント、Codexは名前付きサブエージェント、Managedは定義済みエージェントを使う。モデル・推論の設定は今回の人数判断で変更しない。
- explore・spec・review・debugからは同じruntimeのdevへ引き継ぐ。ClaudeのdevはSkillツールからの起動も許可する。
- テスト方針は各版の `references/testing.md` を正本とし、役割定義に同じ段落を複製して検証する。

## Claude Code

```text
/plugin marketplace add sh1n4ps/shinaps-skills
/plugin install shinaps@shinaps-skills
```

ユーザースコープで利用する。呼び出しは `/shinaps:dev-claude`、`/shinaps:create-pr` など。ローカル開発中はmarketplaceにこのcheckoutの絶対パスを登録し、変更後にpluginを更新する。pluginキャッシュへ直接編集しない。更新後は新しいセッションで確認する。

## Codex

Node.js 22以上と、`plugin marketplace add` / `plugin add` に対応したCodex CLIを使う。Claude Codeのインストールは不要。ただし `linear-execute` の開発進行をClaudeの入口で行う場合は、両modeともローカルClaude Codeが必要になる。Managedの入口で進める場合は `ant` CLI が必要になる。

導入・更新・削除:

```sh
npx @shinaps/skills@latest install codex
npx @shinaps/skills@latest update codex
npx @shinaps/skills@latest uninstall codex
npx @shinaps/skills@latest recover codex
```

`recover codex`は、中断した更新の記録が残っている場合に復元だけを行う。記録が無ければ何もしない。

ローカル開発では、このcheckoutから `node bin/skills.ts install codex` のように同じ操作を実行できる。Node.js 22.18以上なら型除去でTypeScriptをそのまま実行する (ビルド不要)。

CLIはスキルをCodex pluginとして登録し、16個のカスタムエージェントを`${CODEX_HOME:-~/.codex}/agents/`へ配置する。新しいセッションで`shinaps:dev-codex`、`shinaps:review`等が読み込まれる。dev の入口から起動した担当は入口が指定するモデルと推論（`gpt-6-astra` / medium）で動き、それ以外のスキルからの利用ではモデルと推論設定を親セッションから継承する。実装担当以外の調査・レビュー担当は読み取り専用を既定にする。0.23.0 まで配置していた比較専用の役割は、更新時に管理済みエージェントとして削除される。親セッションの実行時設定が優先される場合もあるため、権限の強制境界とは扱わない。

配布物は`~/.local/share/shinaps-ai/skills/codex/`へ保持し、一時的なnpxキャッシュに依存しない。同じ親ディレクトリの`state.json`に配置したエージェントと内容のハッシュを記録する。管理対象外の同名ファイルや、導入後に編集されたエージェントは上書き・削除せず停止する。必要な変更を退避・整理してから再実行する。`CODEX_HOME`を変更する場合は元の配置先で先にuninstallする。

uninstallはこのCLIのplugin・marketplace・管理済みエージェントを取り除く。個人用スキルと、別途登録したMCP接続・認証情報は保持する。

### 自動更新（Codex / macOS）

```sh
npx @shinaps/skills@latest auto-update enable codex
npx @shinaps/skills@latest auto-update status codex
npx @shinaps/skills@latest auto-update check codex
npx @shinaps/skills@latest auto-update disable codex
```

初期状態は無効。導入済みの利用者が`enable`するとmacOSのユーザーLaunchAgentを登録し、ログイン中に1日1回（12:00）確認する。スリープ中に12:00を過ぎた場合は起床時に1回だけ実行する。電源が切れていた回は実行しない。確認のたびにnpmから`latest`のパッケージを取得して実行し、導入版より新しい安定版の場合だけ更新する。古い版への自動ダウングレードはしない。更新内容は新しいCodexセッションから反映される。

`enable`は通常のログインシェルから実行する。CodexやClaude Codeのセッション内からは実行しない。登録時のPATH、npmの場所、`CODEX_HOME`が記録され、以後の確認でもそのまま使われる。ツールの場所を変えた場合は再度`enable`する。npmの設定は`~/.npmrc`のものが使われる。

登録直後に次の手順で動作を確認できる。`kickstart`はすぐに戻るので、npmの取得が終わるまで待ってから残りを実行する。

```sh
launchctl kickstart -k gui/$(id -u)/io.shinaps.skills.update
launchctl print gui/$(id -u)/io.shinaps.skills.update | grep 'last exit code'
npx @shinaps/skills@latest auto-update status codex
```

更新前に新版を準備し、旧スキル・エージェント・管理情報を退避する。更新中のエラー時は旧内容とCodexのプラグイン登録を復元する。強制終了などで復元できなかった場合は、次の更新確認時または`recover codex`の実行時に、`~/.local/share/shinaps-ai/skills/transaction/`に残った記録から復元する。復元にも失敗した場合は同じ場所にバックアップを保持して停止するので、エラーの原因を直してから`recover codex`を実行する。導入後のユーザー編集や同時更新は上書きせず停止する。

`status`は設定と最終確認結果を表示する。失敗の詳細は`~/.local/share/shinaps-ai/skills/auto-update-error.log`、通常ログは同じ場所の`auto-update.log`に記録する。npmがパッケージを取得できなかった場合は最終確認結果は更新されず、エラーログだけに記録される。通知ポップアップは出さない。`disable`は予定実行を停止し、導入したスキルは保持する。`uninstall codex`は予定実行も停止する。

macOS以外では予定実行の登録に対応していないため手動更新を使う。

Claude Codeは標準のmarketplace自動更新機能を使う。`/plugin` のMarketplacesから対象marketplaceのauto-updateを有効にする。GitHubから自動取得するにはリモートmarketplaceを登録する必要があり、ローカルcheckout登録ではソースのgit pullまで自動実行しない。

## Claude Managed Agents

`managed-agents/` に、lead `shinaps-dev-managed-cc`、devの8役割、skill `dev-managed-cc`、環境 `shinaps-dev` の定義を置く。leadが体制を引き継いで必要な担当へ委任する。

lead は Fable 5.1（`claude-fable-5-1` / medium）、役割は Opus 5.5 の fast（`speed: fast`）で動く。人数と再確認によって費用は変わるため、固定体制時の費用を現在の見積りに使わない。セッションの合意済み予算内で体制を決め、増員のために予算を自動で増やさない。計画の再確認はManagedの起動手順に従い最大2ラウンドとする。QA修正も同じセッションの予算に含める。

前提は `ant` CLI 1.42.0 以上と `ant auth login` 済みであること。定義の作成・更新は次の npm script だけで行う。

```sh
npm run managed:plan          # 送信内容の確認。全項目は npm run managed:plan -- -v
npm run managed:apply         # 作成・更新。確認に対話で答えられない実行では、先に managed:plan の出力を確認してから -- --yes を付ける
```

`ant apply` を直接実行しない。`ant apply` は指定したディレクトリを再帰的に走査し、`agents/` の下のファイルと `SKILL.md` を持つディレクトリを送信対象にするので、リポジトリ直下を対象にすると `plugins/` の下にある Claude 版・Codex 版の定義も送信対象に含まれる。また lockfile は実行した場所から上へ探し、キーは lockfile のディレクトリからの相対パスになる。別の場所から実行すると、既存の lockfile と対応づかずに同じリソースが重複して作られる。npm script は `managed-agents/` に移動してから実行するので、対象と lockfile の位置が常に同じになる。

`managed-agents/claude-lock.json` は apply が書き出す。リソースの ID を記録しているので commit する。lockfile は shinaps 組織のリソースの記録である。別の組織で使う場合は、lockfile を消してから実行するか、`npm run managed:apply -- --lock-file claude-lock.<組織名>.json` のように別の lockfile を指定する。パスは `managed-agents/` から見た位置で、lockfile は `managed-agents/` の中に置く（外に置くとキーの形が変わり、下の jq の例と合わなくなる）。ID は次のように引ける。

```sh
jq -r '.resources["./agents/shinaps-dev-managed-cc.md"].id' managed-agents/claude-lock.json
jq -r '.resources["./environments/shinaps-dev.yaml"].id' managed-agents/claude-lock.json
```

旧ultraのクラウドリソースとlockの対応は過去セッションの参照用に保持する。新規実行には使わず、通常の更新で `--prune` による削除を行わない。

定義を変えたら `npm run managed:apply` を実行する。lead が参照する役割と skill の版も同じ実行で更新される。

### セッション

linear-execute の Managed の入口では、セッションの作成・観測・取り出し・差分の適用を、進行役が [Managedセッション](plugins/shinaps-claude/references/linear/managed-session.md) の手順で行う。以下は手動で作る場合の例である。

lead は shinaps-ai MCP の `list_search_facets`・`search_rules` を使う。規約を取得するには、shinaps-ai の API トークンが使えるようになってから、利用者が vault を作って資格情報を登録する。vault はセッションの作成時にしか渡せない。vault を渡さないセッションでも作業は進むが、規約照合は未確認になる。

```sh
ant beta:vaults create --display-name shinaps-ai --transform id --raw-output   # 返された ID を VAULT_ID にする
read -rs SHINAPS_AI_TOKEN                                                     # 画面に表示せずに入力する
ant beta:vaults:credentials create --vault-id "$VAULT_ID" --display-name shinaps-ai <<YAML
auth:
  type: static_bearer
  mcp_server_url: https://app.shinaps.ai/mcp
  token: "$SHINAPS_AI_TOKEN"
YAML
unset SHINAPS_AI_TOKEN
```

token は stdin の YAML で渡す。`--auth.token` の引数で渡すと、シェルの履歴とプロセスの一覧に見える（`ant` 自身も、引数で資格情報を渡すことを非推奨にしている）。YAML の値を二重引用符で囲むので、token に `"` や `\` が含まれる場合は、その文字の前に `\` を付けてから入力する。

作業先を git bundle にして添付する。利用者共通方針（`~/.claude/CLAUDE.md`）も同じようにアップロードして添付する。どちらもリポジトリには入れない。

```sh
git bundle create /tmp/<repo>.bundle <branch>
BUNDLE_ID=$(ant files upload --file /tmp/<repo>.bundle --expires-in-seconds 604800 --transform id --raw-output)
CLAUDE_MD_ID=$(ant files upload --file ~/.claude/CLAUDE.md --expires-in-seconds 604800 --transform id --raw-output)
ant beta:sessions create \
  --agent "$LEAD_ID" \
  --environment-id "$ENV_ID" \
  --vault-id "$VAULT_ID" \
  --budget '{type: limit, max_list_cost: {amount: "4000", currency: USD}}' <<YAML
resources:
  - {type: file, file_id: $BUNDLE_ID, mount_path: /<repo>.bundle}
  - {type: file, file_id: $CLAUDE_MD_ID, mount_path: /CLAUDE.md}
YAML
ant beta:sessions connect --web "$SESSION_ID"
```

- 最初のメッセージで、作業先の bundle（`/mnt/session/uploads/<repo>.bundle`）、ブランチ、比較元の SHA を伝える。lead は起動手順に従って `/workspace/<repo>` に clone してから工程を始める。
- bundle の代わりに GitHub のリポジトリをマウントすることもできる。その場合は resources の bundle を次に置き換える。token は Contents: Read だけを許可した fine-grained token にする。

  ```yaml
  - type: github_repository
    url: https://github.com/<owner>/<repo>
    authorization_token: <Contents: Read だけを許可した fine-grained token>
    checkout: {type: branch, name: <branch>}
  ```

- 予算はセッション作成時にしか付けられない（後から変更・削除はできる）。金額はセント単位の文字列で、`"4000"` は 40 USD である。
- lead の model を上書きするときは、`--agent` を外し、stdin の YAML に次を加える。上書きすると定義の effort は引き継がれないので、effort も指定する。

  ```yaml
  agent:
    type: agent_with_overrides
    id: <LEAD_ID>
    model: {id: <model>, effort: <effort>}
  ```

- `ant beta:sessions connect --web` は全スレッドを見られるビューアを開く。lead の質問には、次のメッセージで答える。

作業記録は、lead が終了時に `/mnt/session/outputs/` へ tar.gz でまとめる。正本はサンドボックス内の `.shinaps/work/` である。あわせて、比較元からの差分の全体を `changes.patch` として同じ場所に置く。

```sh
ant beta:files list --scope-id "$SESSION_ID" --beta managed-agents-2026-04-01
ant files download --file-id <file ID> -o <保存先>
```

ファイルはセッションが待機状態になってから数秒遅れて一覧に現れることがある。予算に達して止まったセッションでは、予算を引き上げて lead が終了処理を行うまで tar は作られない。

担当の委任・継続の方法と、Claude Code 固有の手段の置き換え・未対応のものは、[起動手順](managed-agents/skills/dev-managed-cc/references/dev/launch.md)にある。

### ネットワークと危険

環境 `shinaps-dev` のネットワークは制限しない（`unrestricted`）。

- bash の実行は承認なし（`always_allow`）なので、サンドボックスにあるもの（マウントしたコード、添付した CLAUDE.md）は外へ送ることができる。
- 取得した Web ページやリポジトリの内容に書かれた指示に従ってしまう危険（プロンプトインジェクション）がある。
- bash を `always_ask` か `auto` にすれば軽減できるが、担当ごとの承認待ちで工程が止まるので採らない。
- 秘密情報はサンドボックスに置かない。マウントするリポジトリの token は読み取りだけに限る。
- bundle で送るのはコミット済みの内容だけで、ignore 済みのファイルや作業記録は送らない。

## 開発と配布

- Claude版: `plugins/shinaps-claude/`、marketplaceは`.claude-plugin/marketplace.json`
- Codex版: `plugins/shinaps-codex/`、marketplaceは`.agents/plugins/marketplace.json`
- Codexカスタムエージェント: `plugins/shinaps-codex/agents/`
- Managed Agents版: `managed-agents/`。npmパッケージには含めない
- 配布CLI: ソースは `bin/skills.ts` と `lib/*.ts`。`npm run build` (`tsc`) で `dist/` にJSを出力し、npmにはそれを配布する。Node.jsは`node_modules`配下の`.ts`に型除去を適用しないため、ソースのままは配布できない。checkoutでは型除去で直接実行するので、`enum`など型除去で消せない構文は使わない (`tsconfig.json` の `erasableSyntaxOnly`)

品質基準とプロジェクト設定の方針は揃えつつ、クライアント固有の実行手順・エージェント形式は別々に管理する。Managed Agents版は、役割の本文・`name`・`description` と工程の資料（`references/` の、`dev/launch.md` を除くもの）をClaude版と一致させ、テストで確認する。版ごとに内容を変えるのは役割の frontmatter（model・tools）と `references/dev/launch.md` で、Managed Agents版はこのほかに lead の定義、skill の `SKILL.md`、環境の定義を持つ。Codex版は役割の本文とスキルを書き分け、Claude向けのエージェント呼び出しをCodexに読み替えさせる方式は使わない。スキルを追加・変更した場合は各版への適用可否を判断する。

```sh
npm test
npm run check
npm pack --dry-run
```

公開前にはnpmスコープ`@shinaps`の利用権限とtarball内容を確認する。CLIのバージョンと両pluginのバージョンを揃える。開発中の同一バージョンも`update codex`で再配置できる。

### Codexでの人レビュー

manualでは対象checkoutと単位の差分を提示し、人のレビュー・修正・コミット完了を待ちます。実装runtimeによらず、実効 `review_flow.tool` でPlasmaまたはWebStormを選びます。Plasmaは別途導入するツールで、未導入時も人レビューを省略しません。変更の目的と確認点は会話に示し、人の完了通知後の実コミット照合と修正の検証は[共通手順](plugins/shinaps-codex/references/human-review.md)に従います。autoには人レビュー待ちを追加しません。

### CIとnpm自動公開

`.github/workflows/publish.yml` はmainへのpush・PR・手動実行でテストと配布内容を検証する。通常のGitHub Releaseを公開すると、検証成功後に同じtagのパッケージをnpmへpublic公開する。prereleaseは公開しない。手動実行は検証専用で、npmへの公開は行わない。

リリース時は`package.json`と両plugin manifestのバージョンを揃えてコミットし、`v<version>` tagを対象にGitHub Releaseを公開する。tagとバージョンが不一致なら停止する。既存のnpmバージョンは再公開できないため、次の変更には新しいバージョンを使う。

npmの`@shinaps/skills`にGitHub ActionsのTrusted Publisherを登録する。GitHub ownerは`sh1n4ps`、repositoryは`shinaps-skills`、workflow filenameは`publish.yml`、direct publishを許可する。CIはGitHub-hosted Ubuntu・Node.js 24を使い、publish jobだけに`id-token: write`を付与する。`NPM_TOKEN` secretは不要。初回の信頼設定には本人認証が必要だが、その後のCI公開に毎回のセキュリティキー操作は不要。

ローカルで同じ配布検証を行うには`npm run verify:package`を使う。`RELEASE_TAG=v<version>`を付ければtag整合性も確認できる。npmのprovenanceは公開リポジトリからのTrusted Publishingが対象で、privateリポジトリでは生成されない。

### コード整形

`npm ci` で開発依存を導入し、`npm run format` でBiomeによる整形を行う。`npm run check` は整形と型 (`tsc --noEmit`) を検証する。`npm pack` と `npm publish` は `prepack` で自動的に `npm run build` を実行する。`npm run verify:package` は配布物の一覧を比較したうえで、tarballを一時ディレクトリにinstallして起動できることを確認する。Biomeは整形用途で使用し、lintとimportの自動整理は無効。Markdown・TOMLのエージェント定義は整形対象外。

## Shinaps AIとの接続

rule照合・抽出が必要な工程には `shinaps-ai` MCPを登録する。サービスURLは `https://app.shinaps.ai/mcp`。ClaudeとCodexそれぞれのMCP設定形式・ログイン手順に従う。開発用localhostはローカルサーバーを利用する場合だけ追加する。

MCP設定・認証はインストールと独立して行う。既存登録があれば再利用し、同じサーバーをpluginとグローバル設定の両方に登録しない。認証情報はCLIで独自に管理しない。

Claude Code:

```sh
claude mcp add --transport http shinaps-ai https://app.shinaps.ai/mcp --scope user
```

Claude Code内の`/mcp`から認証する。

Codex:

```sh
codex mcp add shinaps-ai --url https://app.shinaps.ai/mcp
codex mcp login shinaps-ai
```

未登録の利用者は[Shinaps AI](https://app.shinaps.ai)でアカウントを作成する。未認証でもスキルの導入は完了できる。MCPが使えないときに照合済みと報告しない。`simplify`・`commit`・`create-pr`・`release`・`linear-plan`・`linear-execute` の基本手順はMCP接続を必須としない。

## Subagents (Claude: 16 / Codex: 16 / Managed: 8)

| Subagent | 役割 |
|---|---|
| `shinaps-explorer` | コードベース探索、必読ファイル抽出 |
| `shinaps-investigator` | `shinaps:explore` の現在の質問をコード・テスト・設定・履歴から調べ、確実性を分けて回答 |
| `shinaps-architect` | 設計。dev では設計担当1 が設計・設計案統合・設計適合性・プランと全指摘の最終判断を行い、必要に応じて追加担当が独立設計を行う |
| `shinaps-plan-reviewer` | 計画レビュー (confidence 閾値 70)。必要な人数で独立に指摘と修正案を返す |
| `shinaps-implementer` | 確定した計画の実装・簡素化・検証、レビュー後の修正 |
| `shinaps-reviewer` | logic / design / security / performance / maintainability / rule 統合レビュー (confidence 閾値 80) |
| `shinaps-review-validator` | reviewer 指摘の実コード検証 (confirmed / false positive / partial / out-of-scope 分類) |
| `shinaps-review-verifier` | dev の計画段階と実装後の全担当の指摘を検証・重複整理し、出典・反証・対立をarchitectへ渡す |
| `shinaps-simplifier` | 計画・実装の簡素化の提案。仕様・構造・処理の削減を読み取り専用で提案 |
| `shinaps-refine-agent` | rule 照合 (ファイル現状全文と照合、Violation / Improvement / Question 分類 + changed / pre-existing 切り分け) |
| `shinaps-spec-writer` | ヒアリング + 調査結果を spec.md 構造化 |
| `shinaps-tech-surveyor` | 外部技術調査 (WebSearch + WebFetch で 3-5 候補比較) |
| `shinaps-survey-validator` | tech-surveyor の出典を WebFetch で再確認 |
| `shinaps-debugger` | 症状から根本原因の仮説立案 (コードトレース + WebSearch + GitHub Issue) |
| `shinaps-debug-validator` | 仮説の実コード検証 (root-cause / contributing-factor / red-herring / needs-reproduction 分類) |
| `shinaps-split-reviewer` | `shinaps:commit` のmanualの分割案を「単位の diff だけで妥当性を判断できるか」で批判 + 修正版最終分割計画 (worktree は read-only) |

Claude版はMarkdown、Codex版はTOMLで役割を定義する。Managed Agents版は dev で使う8役割だけを、Claude版の本文に `ant apply` 用の frontmatter を付けたMarkdownで定義する。

Claude版は全16エージェントが `opus / medium`。Codex版の役割定義はモデルを書かず、dev の入口が起動時にモデルと推論を指定する。dev での担当の割り当ては[dev の工程](plugins/shinaps-claude/references/dev/workflow.md)にある。

**subagent 内では shinaps MCP を直接呼び出さず、rule 全文は Skill 側から prompt 経由で渡す** 原則を全 system prompt に明記する。MCP呼び出しの利用量が重複しないようにするため。


## 作業成果物

作業記録は現在の作業先の `.shinaps/work/` に保存する。[作業記録の共通手順](plugins/shinaps-claude/references/work-records.md)に従い、既存の共有例外を保持し、workの除外が不足する場合だけ `/work/` を追加する。設定の共有方式は記録作成では変更しない。共通手順はClaude版を編集元としてCodex版とManaged Agents版へ複製し、テストで一致を確認する。

```text
.shinaps/
├── .gitignore             # 保存方式に応じた除外・共有対象の例外
├── linear.json            # linear のプロジェクト設定（任意）
├── linear/                # linear の補足（任意）
└── work/
    ├── {日時}-{作業名}/
    ├── explorations/
    ├── specs/
    ├── reviews/
    └── debug/
```

旧 `.claude/shinaps/` の成果物はパスを指定して引き継げる。既存記録を自動移動・削除しない。共有する仕様書などの明示された納品先は尊重し、作業記録に秘密情報を含めない。

## 対応範囲

各クライアント向けの実行手順を提供する。形式検証や配置確認と、各CLIで実際にワークフローを完走したことは区別する。CLI・MCP・ブラウザ・デバイスの有無に依存する工程は実行時に確認する。環境別の網羅的な動作保証は行わず、実際の利用で見つかった問題を改善する。

## License

MIT
