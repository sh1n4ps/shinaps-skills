# shinaps-skills

Shinaps AIの利用者向け開発ワークフロー。Claude CodeとCodexにはそれぞれに適したplugin・カスタムエージェントとして配布する。実装はClaude Codeが行い（Linear進行では、境界内のUIの微調整をCodexが行える。[担当と工程](plugins/shinaps-claude/references/linear/workflow.md#codexによるuiの微調整)）、Codexは進行・QA・レビュー等を担当する。Claude Managed Agents向けには、draft PRまで進むdev工程の共通定義を両pluginの `managed-agents/` に置き、`managed-setup` で利用者の組織へ導入し、`managed-execute` で依頼する。スキルのダウンロードと導入にShinaps AIのアカウントは不要。サービスのrule検索・登録を使うときにアカウント作成と認証を行う。

## プロジェクトごとの条件

共通スキルが持つのは判断手順。対象環境・必須検証・公開条件は、対象プロジェクトの `AGENTS.md` / `CLAUDE.md` と参照先、README、CI、既存スクリプトから読み取る。専用設定ファイルは必須にしない。

例外として `linear-execute` の開発進行とチーム設定の変更には、対象リポジトリの `.shinaps/linear.json` を必須にする。操作の継続的な許可と終了地点を会話から推測せず、合意した範囲だけを続けて進めるためである。設定は `config_storage: shared` でGit共有、`local` でメインの作業ツリーだけに保存する。必須キーの欠落は設定不備として止め、旧設定は明示移行する。sharedは現在のcheckout、localはメインの設定と補足を正本とする。共有設定が欠けていても端末別のlocal設定では補わない。[共通設定](plugins/shinaps-claude/references/linear/configuration.md)の読取・保存手順に従う。設定がなくてもIssueの読み取り・整理はできる。設定が必要な実行で共通の読取手順により真に未設定と確認できた場合だけ、同じセッションで `linear-plan` の初期設定ヒアリングへ進み、合意した設定の保存・確認後に元の依頼を再開する。

sharedで採用する `instructions.md` は共有JSONの `references.specifications` に明記して開始・再開時に読み、他の必要補足は内容に対応する `references` に記載する。必要補足の欠落・読取不能は依存工程を止め、未採用とは扱わない。設定・採用補足・ignoreの個別例外を一緒に共有するか、共有済み資料への参照に置き換える。端末の絶対パスやsession/thread ID、進捗・QA結果は `.shinaps/work/` に分け、秘密値はどちらにも保存しない。保存方式の合意だけでstage・commit・push・追跡解除を許可しない。

例えばPCブラウザのみのプロジェクトには対応ブラウザと確認コマンドを書く。iOSプロジェクトにはSimulatorと実機の使い分けを記す。スキルは一律の端末数やOS数を追加しない。既存の情報で決まらず結果を左右する条件だけ確認し、保存を了承された方針をプロジェクト側に残す。

## JSON設定の検証

0.33.0から `.shinaps/linear.json`（`config_version: 2`）を使います。`config_version: 1`・`implementation_skill`・`review_flow.tool`・許可の `codex_task`/`managed_session:*`、旧YAML・scalar review_flowは受け付けず、[移行手順](plugins/shinaps-claude/references/linear/configuration.md#config_version-1-からの移行)に従います。

0.35.0から通常設定の `review_flow.mode` に `ask` を追加しました（パス別ルールは `auto`・`manual` だけ）。既存の設定は変更不要です。

0.39.0からauto経路のClaude CLIは、起動とresumeの両方を `--permission-mode bypassPermissions` で行います。bypassへの継続的な同意は許可 `claude_cli_bypass_permissions` で表し、`claude_cli` だけの既存設定では、Codexが起動前に人へ確認します（[Claude CLIの操作権限](plugins/shinaps-claude/references/linear/claude-cli.md#操作権限)）。この許可を使う設定では `$schema` も0.39.0以降のURLにします。

CLIはpluginに含まれないため、利用中のskillと同じ `@shinaps/skills@0.39.0` を導入し、`shinaps-skills --version` で確認します。`shinaps-skills validate-linear-config <明示ファイル>` は同梱schemaだけで検証し、ネットワーク取得・正本探索・Git操作・入力変更は行いません。`$schema` は固定URLによるエディタ補助で、契約の正本は[同梱schema](plugins/shinaps-claude/references/linear/configuration.schema.json)です。Managed Agentsの `.shinaps/managed.json` も `shinaps-skills validate-managed-config <明示ファイル>` で同じ方式で検証します。0.38.0から `config_version: 2`（リポジトリとアカウント別のvault）になり、lockはアカウントごとの管理ディレクトリへ移ります（[Managedの設定と移行](plugins/shinaps-claude/references/managed/configuration.md)）。

```sh
npm install -g @shinaps/skills@0.39.0
shinaps-skills --version
shinaps-skills validate-linear-config /absolute/repository/.shinaps/linear.json
shinaps-skills validate-managed-config /absolute/repository/.shinaps/managed.json
```

## スキル

| 名前 | 用途 |
|---|---|
| `explore` | 対話しながら既存挙動と変更影響を調べる |
| `spec` | 目的・仕様・実現方法を詰める |
| `dev-claude` (Claudeのみ) | メインが計画・実装・検証・採否を行い、選んだ体制（LITE・BASIC・ULTRA）の担当が独立した別案と独立レビューを行う |
| `debug` | 不具合の原因を検証する |
| `review` | 差分や既存コードをレビューする |
| `refine` | Shinaps AIのruleと実ファイルを照合する |
| `extract-rules` | PRレビューからruleを抽出する |
| `simplify` | 目的から見直して不要な構造や手順を削る |
| `commit` | 各単位のreview_flowに従い、autoはAIがレビュー・コミット、manualは人の開始依頼で分割案を示し、人が単位ごとに依頼したコミットを行う |
| `create-pr` | リポジトリの規約に合わせてPRを作成する |
| `release` | 公開条件を確定し、対象バージョンの利用可能性を確認する |
| `linear-plan` | 相談・必要なspec/explore・Issue作成と整理・プロジェクト設定を行い、実装前で止める |
| `linear-execute` | Issue単体・Cycle全体・バックログ消化を選び、設定に従って実装・QA・許可された公開を進める |
| `managed-setup` | Claude Managed Agentsの共通dev構成を1つ以上のアカウントへ一コマンドで導入・更新する。アカウントごとのlockを使い、重複して作らない |
| `managed-execute` | Managed Agentsのleadへdevを依頼し、観測・質問の取り次ぎ・出力のローカル回収とdraft PRの確認を行う |

コミット・PR・リリースは、利用者の依頼またはLinear進行で合意済みの継続許可に従う。[共通設定](plugins/shinaps-claude/references/linear/configuration.md)・[担当と工程](plugins/shinaps-claude/references/linear/workflow.md)・[終了と待機](plugins/shinaps-claude/references/linear/execution.md)を参照し、必要な前工程が揃えば再確認せずに進む。単独スキル利用にはLinear進行や新しいゴールを必須にしない。`autonomous-commit-review` の役割は `commit` に統合した。個人用の別AI呼び出し・ブラウザ管理・ゴール管理・動画制作はこのpluginに含めない。

`linear-execute` は初版では利用者本人の環境向けで、Codexが進行役として進行・Agent QA・Issueの記録・人への窓口を担当し、Claude Codeが実装・修正・コミットを行う。主フローは着手・実装・差分確定・公開確認・結果報告の5工程。運用項目は明示必須で、未記載を既定値で補わない。経路は着手時に通常の `review_flow.mode` で決まり、`ask` ではIssueごとに着手時の人の回答で決まる。autoはCodexがローカル `claude -p` を起動して同じsessionをresumeし（許可 `claude_cli`・`claude_cli_bypass_permissions`、[CLI手順](plugins/shinaps-claude/references/linear/claude-cli.md)）、起動とresumeの両方で `--permission-mode bypassPermissions` を指定し、effort・pluginsは保持する。メインのモデルは経路で分ける（[経路](plugins/shinaps-claude/references/linear/configuration.md#経路)）。manualはWebStorm内の対話Claude CodeセッションへBridgeで依頼する（許可 `bridge_request`、[Bridge](plugins/shinaps-claude/references/linear/bridge.md)）。manualではQA後もCodexはcommitを依頼せず、人の依頼でClaudeがcommitする。体制はCodexが確認して依頼に書き、BASIC・ULTRAでは追加の担当をClaudeのメインが判断の材料と現物から決めて報告する。Bridge本体は同梱せず、導入済みのMCPとWebStormプラグインを使う。`SKILL.md` は担当ごとに両版で書き分け、共通の手順と書式は `references/linear/` に置く。`references/linear/` はClaude版を編集元としてCodex版へ同じ内容を複製し、テストで一致を確認する。

`review_flow: { "mode": "auto" }` はAIが自然な単位を決め、独立レビュー・QA後にstage・commitする。`review_flow: { "mode": "manual" }` はAIがレビュー待ちを明示し、人がWebStormで差分を確認する。人のコミット開始依頼でAIが分割案を示し、人がその単位のコミットを依頼したらAIが単位外を安全に退避して単位をstage・検証・commitする。`review_flow: { "mode": "ask" }` は着手時に進行役が作業内容と推奨理由を添えてautoかmanualかを一問で確認し、回答を同じIssueの通常flowとして使う。パス別ルールには書けない。各modeのstage・AI commit権限は利用者との明示合意に含まれ、未合意ファイルからは得ない。`path_policy_overrides` は `paths` と `review_flow` だけを持つ。全変更が一つのルールで覆われる単位だけ適用し、改名は旧新両パスを判定する。競合時は止める。旧 `human_code_review`・`commit_mode`・permissionsのstage/commit・パス別ai_commitは明示移行が必要。[共通設定](plugins/shinaps-claude/references/linear/configuration.md#パス別の方針)を参照する。

0.29.0では旧 `document_only_changes: ai_commit` を廃止した。利用先では依存工程を止め、具体的なパス例外への移行または例外廃止を合意する。説明だけの変更の許可とは同値でないため自動変換しない。旧 `none` もJSONへ明示移行し、新規設定は `path_policy_overrides: []` にする。

`permissions` の `development_operations` を明示すると、既存アカウントのログイン・環境準備・依存導入・起動・テスト・QAを継続的に許可できる。コミット・公開・破壊的操作の許可や人レビューは別に扱う。

旧 `linear` の入口は廃止した。相談・Issue整理・設定変更は `linear-plan`、実行は `linear-execute` を使う。設定は0.32.0からJSONへ移行する。実行範囲は毎回の依頼で確定し、バックログではブロッカー到達と報告を終了条件にできる。人レビュー・Human QA待ちは予定工程として待機する。

### dev の入口と体制

ローカルの実装の入口は Claude Code の `dev-claude` だけで、Codexに実装の入口はない。Claude Managed Agentsは別runtimeで、`managed-setup`・`managed-execute` から使う。「[Claude Managed Agents](#claude-managed-agents)」節で扱う。メインのモデルは[経路](plugins/shinaps-claude/references/linear/configuration.md#経路)で決まる（単独devは利用者のセッション設定のまま）。メインは調査・設計・実装・指摘の採否を自分で行うので、メインのモデルと effort がそのまま設計・実装のモデルになる。担当は登録エージェントの定義（Opus / medium）で動く。

devの体制は、実装後の独立コードレビューの担当1名だけのLITE、計画レビュー担当1名と独立コードレビューの担当1名を置くBASIC、メインの案を見ない独立設計担当1名・計画レビュー担当2名・実装後の独立レビュー（A: 独立コードレビューの担当1名、B: 技術領域ごとの規約照合・可読性・慣習の担当1名）を置くULTRAの3段階で、BASIC・ULTRAは必須担当を下限にメインが追加できる（[実装体制の判断](plugins/shinaps-claude/references/dev/staffing.md)）。3体制の違いは独立確認の対象・人数・深さだけで、共有する文脈が必要な作業はどの体制でもメインが行う。同じ対象を読む確認の観点（計画の簡素化、規約照合、実装の簡素化など）は少数の担当にまとめて依頼する。体制・経路（auto・manual）・メインのモデルは別の軸である。体制は各Issueの着手時と人の指摘の一括修正の開始時に、推奨を添えて人に確認する。人数を増やすだけで許可・予算・品質条件は変えない。

- 工程と体制基準はClaude版を編集元としてCodexへ複製する。起動手順だけはruntimeごとに異なる。
- Managedの `staffing.md`・`workflow.md`・`launch.md` はClaude版を編集元に写した適応版で、一致はテストしない。Claude版の工程・体制基準を変えたらManagedへの適用可否を判断する。
- Claudeは登録エージェント、Codexは名前付きサブエージェントを使う。担当のモデル・推論の設定は人数判断で変更しない。
- Claudeのexplore・spec・review・debugからは `dev-claude` へ引き継ぐ。ClaudeのdevはSkillツールからの起動も許可する。Codexのスキルは実装へ引き継がず、Linear進行では `linear-execute` でClaudeへ依頼する。
- テスト方針は各版の `references/testing.md` を正本とし、役割定義に同じ段落を複製して検証する。設計の観点は `references/dev/design.md` を正本とし、独立設計担当（`shinaps-architect`）の定義とManagedのskillの `references/design.md` に本文を複製して検証する。

## Claude Code

```text
/plugin marketplace add sh1n4ps/shinaps-skills
/plugin install shinaps@shinaps-skills
```

ユーザースコープで利用する。呼び出しは `/shinaps:dev-claude`、`/shinaps:create-pr` など。ローカル開発中はmarketplaceにこのcheckoutの絶対パスを登録し、変更後にpluginを更新する。pluginキャッシュへ直接編集しない。更新後は新しいセッションで確認する。

## Codex

Node.js 22以上と、`plugin marketplace add` / `plugin add` に対応したCodex CLIを使う。Codexのスキルだけを使う場合、Claude Codeのインストールは不要。`linear-execute` の開発進行には、autoではローカルClaude Code CLI、manualではWebStorm内のClaude CodeとBridgeが必要になる。

導入・更新・削除:

```sh
npx @shinaps/skills@latest install codex
npx @shinaps/skills@latest update codex
npx @shinaps/skills@latest uninstall codex
npx @shinaps/skills@latest recover codex
```

`recover codex`は、中断した更新の記録が残っている場合に復元だけを行う。記録が無ければ何もしない。

ローカル開発では、このcheckoutから `node bin/skills.ts install codex` のように同じ操作を実行できる。Node.js 22.18以上なら型除去でTypeScriptをそのまま実行する (ビルド不要)。

CLIはスキルをCodex pluginとして登録し、10個のカスタムエージェントを`${CODEX_HOME:-~/.codex}/agents/`へ配置する。新しいセッションで`shinaps:review`、`shinaps:linear-execute`等が読み込まれる。Codexに実装の入口はなく、review・debug・spec等のスキルが担当を使う。担当のモデルと推論設定は親セッションから継承する。調査・レビュー担当は読み取り専用を既定にする。0.33.1 まで配置していた dev 専用の役割（設計・実装・計画レビュー・指摘検証・簡素化・分割レビュー）は、更新時に管理済みエージェントとして削除される。親セッションの実行時設定が優先される場合もあるため、権限の強制境界とは扱わない。

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

両pluginの `managed-agents/` は、Claude Managed Agentsでdev工程を進めるための共通定義である。lead `shinaps-dev-managed-cc`、devの3役割、skill `dev-managed-cc`、環境 `shinaps-dev` を置く。クラウドのIDを記録する `claude-lock.json` は利用者のアカウント（APIキーの組織・workspace）ごとのものなので、マシン単位の管理ディレクトリに置き、公開する定義には含めない。予定実行はこの構成に含めない。

- leadと3役割はOpus 5.5（`claude-opus-5-5` / medium）で動く。全agent定義に `speed: standard` を明示する（既存リソースに残るfastを戻すため）。leadのモデルは定義で決まり、Linear進行の経路ごとのメインのモデルとは別に扱う。
- 体制はLITE・BASIC・ULTRAを初回メッセージで受け、`dev-claude` と同じ体制の表に従い、BASIC・ULTRAではleadが追加の担当を決める。leadがメインとして調査・設計・実装・採否を行い、独立設計（ULTRAでは必須）・計画レビュー・実装後の独立レビューだけを登録した3役割（architect・plan-reviewer・reviewer）へ委任する。Managedで設計・実装を行うモデルはleadのOpusになる。廃止したdev-ultraなどの入口・explorer・refine専用の役割は置かず、探索はleadと独立設計担当が行う。
- Shinaps AIのMCPとruleを使わない。規約はマウントしたリポジトリの `AGENTS.md`・`CLAUDE.md` と参照先、添付された利用者CLAUDE.mdだけで、最終報告ではShinaps AI ruleを未照合とする。
- 初回メッセージにリポジトリ・base・head・範囲と受入条件・体制・許可・予算が揃わなければ、leadは作業を始めず欠落を質問する。許可はそのメッセージで明示された操作だけで、構成の導入からは生じない。
- 終了地点は範囲を限ったコミット・headブランチへのpush・draft PR。merge・deploy・release・Issueの更新はしない。CodexのQAはセッションの外で、PRの後に行う。push前に最終QAを行うLinear進行とは順序が違う。

### CLI

導入・依頼・観測・回収は配布CLIの `shinaps-skills managed` で行い、クラウドの操作は公式の `ant` CLI（2.4.0以上。コマンド・フラグ・stdin・出力はこの版のソースで照合した）へ委ねる。各アカウントのAPIキーは環境変数 `SHINAPS_MANAGED_API_KEY_<NAME>` か引数 `--api-key <name>=<key>` で渡し、CLIは保存・表示しない。lock・セッション記録・回収した出力は `~/.local/share/shinaps-ai/skills/managed/<account>/` にアカウントごとに分かれる。

```sh
shinaps-skills managed setup --account personal --account work          # 計画の表示だけ
shinaps-skills managed setup --account personal --account work --apply  # 合意後に適用
shinaps-skills managed run .shinaps/managed.json --account work --base main --base-sha <SHA> --head feat/x \
  --staffing BASIC --allow commit,push,draft_pr --budget-cents 4000 --task-file task.md
shinaps-skills managed status --account work --session <ID>
shinaps-skills managed reply --account work --session <ID> --message-file answer.md
shinaps-skills managed collect --account work --session <ID>
```

- setupはアカウントごとのlockで既存のリソースを更新し、lockが無いのに同名のリソースがあれば作らずに止まる。`--apply` を付けない限りクラウドを変更しない。
- runはリポジトリ・base・head・範囲・体制・許可・予算を毎回明示し、同じ入力の再実行では新しいセッションを作らない。
- collectはセッションの出力を保存するだけで、差分を適用しない。CLIはgitを呼ばず、pushしない。

手順・安全上の注意・止める条件は[設定とアカウント](plugins/shinaps-claude/references/managed/configuration.md)・[導入と更新の手順](plugins/shinaps-claude/references/managed/setup.md)・[依頼と観測の手順](plugins/shinaps-claude/references/managed/execute.md)にある。これらはpluginに含まれ、どちらのruntimeからも読める。

### 定義の更新と適用

共通定義は `plugins/shinaps-claude/managed-agents/` を編集元とし、`plugins/shinaps-codex/managed-agents/` へ同じ内容を複製する。一致はテストで確認する。定義を変えたら `managed setup` で計画を確かめてから `--apply` で適用する。`--prune`・`--force` は使わず、リソースを削除しない。

### このリポジトリのlock

shinaps-skills自身のlockは0.34.0から0.37.0まで `.shinaps/managed/claude-lock.json`（Git対象外）に置いていた。0.38.0では[version 1 からの移行](plugins/shinaps-claude/references/managed/configuration.md#version-1-からの移行)に従い、アカウントの `definitions/claude-lock.json` へ移してから適用する。それ以前の内容は `git show 8679d8f:managed-agents/claude-lock.json` で取り出せる。旧CC Ultraのleadと専用skill、旧explorerと旧review-verifierはクラウドでアーカイブ済みで、lockでも追跡しない。

GitHub MCP（`https://api.githubcopilot.com/mcp`）の資格情報はアカウントの組織のvaultに登録し、セッション作成時に渡す。vaultの資格情報はMCPサーバーのURLで照合されるので、lead定義のURLと末尾のスラッシュまで揃える。leadは最後のメッセージの1行目に `状態: 完了`・`状態: 質問`・`状態: 未完了` を書き、`changes.patch` と作業記録のtarを `/mnt/session/outputs/` に置く（[起動手順](plugins/shinaps-claude/managed-agents/skills/dev-managed-cc/references/launch.md)）。CLIの実クラウドでの実行、マウントしたリポジトリへのpushとdraft PRの作成は、実際のセッションで確かめるまで未検証である。

## 開発と配布

- Claude版: `plugins/shinaps-claude/`、marketplaceは`.claude-plugin/marketplace.json`
- Codex版: `plugins/shinaps-codex/`、marketplaceは`.agents/plugins/marketplace.json`
- Codexカスタムエージェント: `plugins/shinaps-codex/agents/`
- Claude Managed Agents版: 両pluginの `managed-agents/`（Claude版が編集元）。pluginと一緒に配布され、npmパッケージの `plugins/` にも含まれる。適用は `shinaps-skills managed setup` がアカウントごとの管理ディレクトリへコピーしてから行い、`--prune`・`--force` を使わない
- 配布CLI: ソースは `bin/skills.ts` と `lib/*.ts`。`npm run build` (`tsc`) で `dist/` にJSを出力し、npmにはそれを配布する。Node.jsは`node_modules`配下の`.ts`に型除去を適用しないため、ソースのままは配布できない。checkoutでは型除去で直接実行するので、`enum`など型除去で消せない構文は使わない (`tsconfig.json` の `erasableSyntaxOnly`)

品質基準とプロジェクト設定の方針は揃えつつ、クライアント固有の実行手順・エージェント形式は別々に管理する。Codex版の工程の資料（`references/` の、`dev/launch.md` を除くもの）はClaude版と一致させ、テストで確認する。Codex版は役割の本文とスキルを書き分け、Claude向けのエージェント呼び出しをCodexに読み替えさせる方式は使わない。スキルを追加・変更した場合は各版への適用可否を判断する。

```sh
npm test
npm run check
npm pack --dry-run
```

公開前にはnpmスコープ`@shinaps`の利用権限とtarball内容を確認する。CLIのバージョンと両pluginのバージョンを揃える。開発中の同一バージョンも`update codex`で再配置できる。

### manualのレビュー待ちとコミットの依頼

manualではWebStorm内の対話Claude Codeセッションで、作業が終わるとClaudeが短く報告して「ユーザーのレビュー待ち」と明示します。人はWebStormの差分表示で全体を確認し、Claudeと修正を相談します。人がコミットの開始を依頼すると、Claudeが自然なコミット分割案を示します。分割案への合意はコミットの承認ではありません。人がその単位のコミットを依頼すると、Claudeが単位外を退避して単位をstage・検証し、stage時のtreeと一致することを確かめてコミットします。stage時のtreeを記録した後に単位の差分が変われば再提示と改めての依頼が必要です。会話には差分本文を貼らず、単位名・目的・検証結果・推奨メッセージなど必要最小限だけを示します。手順は[共通手順](plugins/shinaps-claude/references/human-review.md)に従います。autoには人レビュー待ちを追加しません。

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

## Subagents (Claude: 14 / Codex: 10)

| Subagent | 配布 | 役割 |
|---|---|---|
| `shinaps-explorer` | 両方 | コードベース探索、必読ファイル抽出 |
| `shinaps-investigator` | 両方 | `shinaps:explore` の現在の質問をコード・テスト・設定・履歴から調べ、確実性を分けて回答 |
| `shinaps-architect` | Claudeのみ | dev で独立設計担当を置く場合（ULTRA、または追加した BASIC）の独立設計。メインの案を見ずに、要件・制約・規約・引き継いだ成果物から別案を返す |
| `shinaps-plan-reviewer` | Claudeのみ | 計画レビュー (confidence 閾値 70) と計画の簡素化。体制に応じて1〜2名で独立に指摘・修正案・削減の提案を返す |
| `shinaps-reviewer` | 両方 | logic / design / security / performance / maintainability / rule 統合レビュー (confidence 閾値 80)。Claude の dev では、「可読性・慣習レビュー」「規約照合」「実装の簡素化」も同じ役割の種類として担う |
| `shinaps-review-validator` | 両方 | reviewer 指摘の実コード検証 (confirmed / false positive / partial / out-of-scope 分類) |
| `shinaps-simplifier` | Claudeのみ | `shinaps:simplify` の計画・実装の簡素化の提案。仕様・構造・処理の削減を読み取り専用で提案 |
| `shinaps-refine-agent` | 両方 | rule 照合 (ファイル現状全文と照合、Violation / Improvement / Question 分類 + changed / pre-existing 切り分け) |
| `shinaps-spec-writer` | 両方 | ヒアリング + 調査結果を spec.md 構造化 |
| `shinaps-tech-surveyor` | 両方 | 外部技術調査 (WebSearch + WebFetch で 3-5 候補比較) |
| `shinaps-survey-validator` | 両方 | tech-surveyor の出典を WebFetch で再確認 |
| `shinaps-debugger` | 両方 | 症状から根本原因の仮説立案 (コードトレース + WebSearch + GitHub Issue) |
| `shinaps-debug-validator` | 両方 | 仮説の実コード検証 (root-cause / contributing-factor / red-herring / needs-reproduction 分類) |
| `shinaps-split-reviewer` | Claudeのみ | `shinaps:commit` のmanualの分割案を「単位の diff だけで妥当性を判断できるか」で批判 + 修正版最終分割計画 (worktree は read-only) |

Claude版はMarkdown、Codex版はTOMLで役割を定義する。Managed Agents版（両pluginの `managed-agents/agents/`）はdevの3役割だけを、Claude版の `name`・`description`・本文に `ant apply` 用の frontmatter を付けたMarkdownで定義する。

Claude版は全14エージェントが `opus / medium`。Codex版の役割定義はモデルを書かず、モデルと推論は親セッションから継承する。dev での担当の割り当ては[dev の工程](plugins/shinaps-claude/references/dev/workflow.md)にある。

**subagent 内では shinaps MCP を直接呼び出さず、rule 全文は Skill 側から prompt 経由で渡す** 原則を全 system prompt に明記する。MCP呼び出しの利用量が重複しないようにするため。


## 作業成果物

作業記録は現在の作業先の `.shinaps/work/` に保存する。[作業記録の共通手順](plugins/shinaps-claude/references/work-records.md)に従い、既存の共有例外を保持し、workの除外が不足する場合だけ `/work/` を追加する。設定の共有方式は記録作成では変更しない。共通手順はClaude版を編集元としてCodex版へ複製し、テストで一致を確認する。

```text
.shinaps/
├── .gitignore             # 保存方式に応じた除外・共有対象の例外
├── linear.json            # linear のプロジェクト設定（任意）
├── linear/                # linear の補足（任意）
├── managed.json           # Managed Agents の依頼先リポジトリとアカウント別のvault（任意・Git対象外）
└── work/
    ├── {日時}-{作業名}/
    ├── explorations/
    ├── specs/
    ├── reviews/
    └── debug/
```

Managed Agentsのアカウントごとのlock・セッション記録・回収した出力は、リポジトリではなく `~/.local/share/shinaps-ai/skills/managed/<account>/` に置く（[設定とアカウント](plugins/shinaps-claude/references/managed/configuration.md)）。

旧 `.claude/shinaps/` の成果物はパスを指定して引き継げる。既存記録を自動移動・削除しない。共有する仕様書などの明示された納品先は尊重し、作業記録に秘密情報を含めない。

## 対応範囲

各クライアント向けの実行手順を提供する。形式検証や配置確認と、各CLIで実際にワークフローを完走したことは区別する。CLI・MCP・ブラウザ・デバイスの有無に依存する工程は実行時に確認する。環境別の網羅的な動作保証は行わず、実際の利用で見つかった問題を改善する。

## License

MIT
