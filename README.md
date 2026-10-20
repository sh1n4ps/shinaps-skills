# shinaps-skills

Shinaps AIの利用者向け開発ワークフロー。Claude CodeとCodexにはそれぞれに適したplugin・カスタムエージェントとして配布する。実装はClaude Codeが行い、Codexは進行・QA・レビュー等を担当する。Claude Managed Agents向けには、draft PRまで進むdev工程の共通定義を両pluginの `managed-agents/` に置き、`managed-setup` で利用者の組織へ導入し、`managed-execute` で依頼する。スキルのダウンロードと導入にShinaps AIのアカウントは不要。サービスのrule検索・登録を使うときにアカウント作成と認証を行う。

## プロジェクトごとの条件

共通スキルが持つのは判断手順。対象環境・必須検証・公開条件は、対象プロジェクトの `AGENTS.md` / `CLAUDE.md` と参照先、README、CI、既存スクリプトから読み取る。専用設定ファイルは必須にしない。

例外として `linear-execute` の開発進行とチーム設定の変更には、対象リポジトリの `.shinaps/linear.json` を必須にする。操作の継続的な許可と終了地点を会話から推測せず、合意した範囲だけを続けて進めるためである。設定は `config_storage: shared` でGit共有、`local` でメインの作業ツリーだけに保存する。必須キーの欠落は設定不備として止め、旧設定は明示移行する。sharedは現在のcheckout、localはメインの設定と補足を正本とする。共有設定が欠けていても端末別のlocal設定では補わない。[共通設定](plugins/shinaps-claude/references/linear/configuration.md)の読取・保存手順に従う。設定がなくてもIssueの読み取り・整理はできる。設定が必要な実行で共通の読取手順により真に未設定と確認できた場合だけ、同じセッションで `linear-plan` の初期設定ヒアリングへ進み、合意した設定の保存・確認後に元の依頼を再開する。

sharedで採用する `instructions.md` は共有JSONの `references.specifications` に明記して開始・再開時に読み、他の必要補足は内容に対応する `references` に記載する。必要補足の欠落・読取不能は依存工程を止め、未採用とは扱わない。設定・採用補足・ignoreの個別例外を一緒に共有するか、共有済み資料への参照に置き換える。端末の絶対パスやsession/thread ID、進捗・QA結果は `.shinaps/work/` に分け、秘密値はどちらにも保存しない。保存方式の合意だけでstage・commit・push・追跡解除を許可しない。

例えばPCブラウザのみのプロジェクトには対応ブラウザと確認コマンドを書く。iOSプロジェクトにはSimulatorと実機の使い分けを記す。スキルは一律の端末数やOS数を追加しない。既存の情報で決まらず結果を左右する条件だけ確認し、保存を了承された方針をプロジェクト側に残す。

## JSON設定の検証

0.33.0から `.shinaps/linear.json`（`config_version: 2`）を使います。`config_version: 1`・`implementation_skill`・`review_flow.tool`・許可の `codex_task`/`managed_session:*`、旧YAML・scalar review_flowは受け付けず、[移行手順](plugins/shinaps-claude/references/linear/configuration.md#config_version-1-からの移行)に従います。

CLIはpluginに含まれないため、利用中のskillと同じ `@shinaps/skills@0.34.3` を導入し、`shinaps-skills --version` で確認します。`shinaps-skills validate-linear-config <明示ファイル>` は同梱schemaだけで検証し、ネットワーク取得・正本探索・Git操作・入力変更は行いません。`$schema` は固定URLによるエディタ補助で、契約の正本は[同梱schema](plugins/shinaps-claude/references/linear/configuration.schema.json)です。0.34.0から、Managed Agentsの `.shinaps/managed.json`（`config_version: 1`）も `shinaps-skills validate-managed-config <明示ファイル>` で同じ方式で検証します（[Managedの設定](plugins/shinaps-claude/references/managed/configuration.md)）。

```sh
npm install -g @shinaps/skills@0.34.3
shinaps-skills --version
shinaps-skills validate-linear-config /absolute/repository/.shinaps/linear.json
shinaps-skills validate-managed-config /absolute/repository/.shinaps/managed.json
```

## スキル

| 名前 | 用途 |
|---|---|
| `explore` | 対話しながら既存挙動と変更影響を調べる |
| `spec` | 目的・仕様・実現方法を詰める |
| `dev-claude` (Claudeのみ) | メインが作業に応じて担当・人数を判断し、計画・実装・検証・独立レビューを進める |
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
| `managed-setup` | Claude Managed Agentsの共通dev構成を自分の組織へ導入・更新する。既存のlockを使い、重複して作らない |
| `managed-execute` | Managed Agentsのleadへdevを依頼し、観測・質問の取り次ぎ・成果物とdraft PRの確認を行う |

コミット・PR・リリースは、利用者の依頼またはLinear進行で合意済みの継続許可に従う。[共通設定](plugins/shinaps-claude/references/linear/configuration.md)・[担当と工程](plugins/shinaps-claude/references/linear/workflow.md)・[終了と待機](plugins/shinaps-claude/references/linear/execution.md)を参照し、必要な前工程が揃えば再確認せずに進む。単独スキル利用にはLinear進行や新しいゴールを必須にしない。`autonomous-commit-review` の役割は `commit` に統合した。個人用の別AI呼び出し・ブラウザ管理・ゴール管理・動画制作はこのpluginに含めない。

`linear-execute` は初版では利用者本人の環境向けで、Codexが進行役として進行・Agent QA・Issueの記録・人への窓口を担当し、Claude Codeが実装・修正・コミットを行う。主フローは着手・実装・差分確定・公開確認・結果報告の5工程。運用項目は明示必須で、未記載を既定値で補わない。経路は着手時に通常の `review_flow.mode` で決まる。autoはCodexがローカル `claude -p` を起動して同じsessionをresumeし（許可 `claude_cli`、[CLI手順](plugins/shinaps-claude/references/linear/claude-cli.md)）、CLIの既存権限・model・effort・pluginsを保持する。manualはWebStorm内の対話Claude CodeセッションへBridgeで依頼する（許可 `bridge_request`、[Bridge](plugins/shinaps-claude/references/linear/bridge.md)）。manualではQA後もCodexはcommitを依頼せず、人の依頼でClaudeがcommitする。初期体制はClaudeのメインが決めて報告し、Codexは判断の材料を渡す。Bridge本体は同梱せず、導入済みのMCPとWebStormプラグインを使う。`SKILL.md` は担当ごとに両版で書き分け、共通の手順と書式は `references/linear/` に置く。`references/linear/` はClaude版を編集元としてCodex版へ同じ内容を複製し、テストで一致を確認する。

`review_flow: { "mode": "auto" }` はAIが自然な単位を決め、独立レビュー・QA後にstage・commitする。`review_flow: { "mode": "manual" }` はAIがレビュー待ちを明示し、人がWebStormで差分を確認する。人のコミット開始依頼でAIが分割案を示し、人がその単位のコミットを依頼したらAIが単位外を安全に退避して単位をstage・検証・commitする。両方のstage・AI commit権限は利用者との明示合意に含まれ、未合意ファイルからは得ない。`path_policy_overrides` は `paths` と `review_flow` だけを持つ。全変更が一つのルールで覆われる単位だけ適用し、改名は旧新両パスを判定する。競合時は止める。旧 `human_code_review`・`commit_mode`・permissionsのstage/commit・パス別ai_commitは明示移行が必要。[共通設定](plugins/shinaps-claude/references/linear/configuration.md#パス別の方針)を参照する。

0.29.0では旧 `document_only_changes: ai_commit` を廃止した。利用先では依存工程を止め、具体的なパス例外への移行または例外廃止を合意する。説明だけの変更の許可とは同値でないため自動変換しない。旧 `none` もJSONへ明示移行し、新規設定は `path_policy_overrides: []` にする。

`permissions` の `development_operations` を明示すると、既存アカウントのログイン・環境準備・依存導入・起動・テスト・QAを継続的に許可できる。コミット・公開・破壊的操作の許可や人レビューは別に扱う。

旧 `linear` の入口は廃止した。相談・Issue整理・設定変更は `linear-plan`、実行は `linear-execute` を使う。設定は0.32.0からJSONへ移行する。実行範囲は毎回の依頼で確定し、バックログではブロッカー到達と報告を終了条件にできる。人レビュー・Human QA待ちは予定工程として待機する。

### dev の入口と体制

ローカルの実装の入口は Claude Code の `dev-claude` だけで、Codexに実装の入口はない。Claude Managed Agentsは別runtimeで、`managed-setup`・`managed-execute` から使う。「[Claude Managed Agents](#claude-managed-agents)」節で扱う。メインは利用者のClaude CLI・セッションの設定（model・effort）を保持し、起動引数で上書きしない。担当は登録エージェントの定義（Opus / medium）で動く。

[実装体制の判断](plugins/shinaps-claude/references/dev/staffing.md)に従い、devのメインが設計前に役割別の人数・理由・専任なしの責任者・必須検証を決める。linear-executeでは進行役のCodexが判断の材料を渡し、メインが決めて報告する。不確実性・影響範囲・失敗時の影響を基準に、途中でも必要な担当を追加する。人数を増やすだけで許可・予算・品質条件は変えない。

小さく明確な変更はメインが計画し、実装1体と独立コードレビュー1体で進められる。設計の比較や重要な契約の独立確認が必要なら該当する役割だけ増やす。規約照合・簡素化・指摘検証は専任なしでも責任者を決めて行う。

- 工程と体制基準はClaude版を編集元としてCodexへ複製する。起動手順だけはruntimeごとに異なる。
- Managedの `staffing.md`・`workflow.md`・`launch.md` はClaude版を編集元に写した適応版で、一致はテストしない。Claude版の工程・体制基準を変えたらManagedへの適用可否を判断する。
- Claudeは登録エージェント、Codexは名前付きサブエージェントを使う。モデル・推論の設定は今回の人数判断で変更しない。
- Claudeのexplore・spec・review・debugからは `dev-claude` へ引き継ぐ。ClaudeのdevはSkillツールからの起動も許可する。Codexのスキルは実装へ引き継がず、Linear進行では `linear-execute` でClaudeへ依頼する。
- テスト方針は各版の `references/testing.md` を正本とし、役割定義に同じ段落を複製して検証する。

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

両pluginの `managed-agents/` は、Claude Managed Agentsでdev工程を進めるための共通定義である。lead `shinaps-dev-managed-cc`、devの5役割、skill `dev-managed-cc`、環境 `shinaps-dev` を置く。クラウドのIDを記録する `claude-lock.json` と実設定は利用者ごとのものなので、作業先の `.shinaps/` に置き、公開する定義には含めない。予定実行はこの構成に含めない。

- leadはFable 5.1（`claude-fable-5-1` / medium）、役割はOpus 5.5（`claude-opus-5-5` / medium）で動く。全agent定義に `speed: standard` を明示する（既存リソースに残るfastを戻すため）。
- 体制は `dev-claude` と同じ基準でleadが作業ごとに決める。実装者と独立したコードレビューは最低1体で、規約照合もその担当が行う。refine担当とultraの入口は置かない。explorerとreview-verifierも置かず、探索はlead・設計担当・実装担当が、指摘の検証は設計責任者が行う。
- Shinaps AIのMCPとruleを使わない。規約はマウントしたリポジトリの `AGENTS.md`・`CLAUDE.md` と参照先、添付された利用者CLAUDE.mdだけで、最終報告ではShinaps AI ruleを未照合とする。
- 初回メッセージにリポジトリ・base・head・範囲と受入条件・許可・予算が揃わなければ、leadは作業を始めず欠落を質問する。許可はそのメッセージで明示された操作だけで、構成の導入からは生じない。
- 終了地点は範囲を限ったコミット・headブランチへのpush・draft PR。merge・deploy・release・Issueの更新はしない。CodexのQAはセッションの外で、PRの後に行う。

### 定義の更新と適用

1. 共通定義は `plugins/shinaps-claude/managed-agents/` を編集元とし、`plugins/shinaps-codex/managed-agents/` へ同じ内容を複製する。一致はテストで確認する。
2. 作業先では `managed-setup` が、`.shinaps/managed.json`（[設定](plugins/shinaps-claude/references/managed/configuration.md)）の `definitions` が指すディレクトリ（既定は `.shinaps/managed/`、Git対象外）へ共通定義をコピーする。
3. そのディレクトリで `ant apply --dry-run .` を実行し、計画を確認する。
4. 利用者の合意後に `ant apply .` で適用する。`--prune`・`--force` は使わず、リソースを削除しない。
5. 適用前に複製したlock（`.shinaps/work/` に置く）と比べ、更新したリソースの `version`・`hash`・`remote_hash` 以外が変わっていないことを確かめる。

手順・安全上の注意・止める条件は[導入と更新の手順](plugins/shinaps-claude/references/managed/setup.md)にある。セッションの依頼・観測・未検証の境界は[依頼と観測の手順](plugins/shinaps-claude/references/managed/execute.md)にある。これらはpluginに含まれ、どちらのruntimeからも読める。

### このリポジトリのlock

shinaps-skills自身のlockは0.34.0で `.shinaps/managed/claude-lock.json`（Git対象外）へ移した。以前の内容は `git show 8679d8f:managed-agents/claude-lock.json` で取り出せる。

lockには現在のリソース8件（lead・5役割・skill `dev-managed-cc`・環境 `shinaps-dev`）と、過去のrefineの項目がある。定義を変えずにdry-runすると `Everything is up to date.`（8 unchanged）と、`./agents/shinaps-refine-agent.md` のソースが無い警告1件になる。これは想定どおりで、`--prune` を付けない。旧refineの項目は過去のセッションの参照用に残しており、現在のleadからは使われない。旧CC Ultraのleadと専用skill、旧explorerとreview-verifierはクラウドでアーカイブ済みで、lockでも追跡しない。

GitHub MCP（`https://api.githubcopilot.com/mcp`）の資格情報はvaultに登録し、セッション作成時に渡す。vaultの資格情報はMCPサーバーのURLで照合されるので、lead定義のURLと末尾のスラッシュまで揃える。leadは最後のメッセージの1行目に `状態: 完了`・`状態: 質問`・`状態: 未完了` を書き、`changes.patch` と作業記録のtarを `/mnt/session/outputs/` に置く（[起動手順](plugins/shinaps-claude/managed-agents/skills/dev-managed-cc/references/launch.md)）。マウントしたリポジトリへのpushとdraft PRの作成は、実際のセッションで確かめるまで未検証である。

## 開発と配布

- Claude版: `plugins/shinaps-claude/`、marketplaceは`.claude-plugin/marketplace.json`
- Codex版: `plugins/shinaps-codex/`、marketplaceは`.agents/plugins/marketplace.json`
- Codexカスタムエージェント: `plugins/shinaps-codex/agents/`
- Claude Managed Agents版: 両pluginの `managed-agents/`（Claude版が編集元）。pluginと一緒に配布され、npmパッケージの `plugins/` にも含まれる。適用は作業先の `.shinaps/managed/` へコピーしてから「Claude Managed Agents」節の手順で行い、`--prune`・`--force` を使わない
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

## Subagents (Claude: 16 / Codex: 10)

| Subagent | 配布 | 役割 |
|---|---|---|
| `shinaps-explorer` | 両方 | コードベース探索、必読ファイル抽出 |
| `shinaps-investigator` | 両方 | `shinaps:explore` の現在の質問をコード・テスト・設定・履歴から調べ、確実性を分けて回答 |
| `shinaps-architect` | Claudeのみ | 設計。dev では設計担当1 が設計・設計案統合・設計適合性・プランと全指摘の最終判断を行い、必要に応じて追加担当が独立設計を行う |
| `shinaps-plan-reviewer` | Claudeのみ | 計画レビュー (confidence 閾値 70)。必要な人数で独立に指摘と修正案を返す |
| `shinaps-implementer` | Claudeのみ | 確定した計画の実装・簡素化・検証、レビュー後の修正 |
| `shinaps-reviewer` | 両方 | logic / design / security / performance / maintainability / rule 統合レビュー (confidence 閾値 80) |
| `shinaps-review-validator` | 両方 | reviewer 指摘の実コード検証 (confirmed / false positive / partial / out-of-scope 分類) |
| `shinaps-review-verifier` | Claudeのみ | dev の計画段階と実装後の全担当の指摘を検証・重複整理し、出典・反証・対立をarchitectへ渡す |
| `shinaps-simplifier` | Claudeのみ | 計画・実装の簡素化の提案。仕様・構造・処理の削減を読み取り専用で提案 |
| `shinaps-refine-agent` | 両方 | rule 照合 (ファイル現状全文と照合、Violation / Improvement / Question 分類 + changed / pre-existing 切り分け) |
| `shinaps-spec-writer` | 両方 | ヒアリング + 調査結果を spec.md 構造化 |
| `shinaps-tech-surveyor` | 両方 | 外部技術調査 (WebSearch + WebFetch で 3-5 候補比較) |
| `shinaps-survey-validator` | 両方 | tech-surveyor の出典を WebFetch で再確認 |
| `shinaps-debugger` | 両方 | 症状から根本原因の仮説立案 (コードトレース + WebSearch + GitHub Issue) |
| `shinaps-debug-validator` | 両方 | 仮説の実コード検証 (root-cause / contributing-factor / red-herring / needs-reproduction 分類) |
| `shinaps-split-reviewer` | Claudeのみ | `shinaps:commit` のmanualの分割案を「単位の diff だけで妥当性を判断できるか」で批判 + 修正版最終分割計画 (worktree は read-only) |

Claude版はMarkdown、Codex版はTOMLで役割を定義する。Managed Agents版（両pluginの `managed-agents/agents/`）はdevの5役割だけを、Claude版の `name`・`description`・本文に `ant apply` 用の frontmatter を付けたMarkdownで定義する。

Claude版は全16エージェントが `opus / medium`。Codex版の役割定義はモデルを書かず、モデルと推論は親セッションから継承する。dev での担当の割り当ては[dev の工程](plugins/shinaps-claude/references/dev/workflow.md)にある。

**subagent 内では shinaps MCP を直接呼び出さず、rule 全文は Skill 側から prompt 経由で渡す** 原則を全 system prompt に明記する。MCP呼び出しの利用量が重複しないようにするため。


## 作業成果物

作業記録は現在の作業先の `.shinaps/work/` に保存する。[作業記録の共通手順](plugins/shinaps-claude/references/work-records.md)に従い、既存の共有例外を保持し、workの除外が不足する場合だけ `/work/` を追加する。設定の共有方式は記録作成では変更しない。共通手順はClaude版を編集元としてCodex版へ複製し、テストで一致を確認する。

```text
.shinaps/
├── .gitignore             # 保存方式に応じた除外・共有対象の例外
├── linear.json            # linear のプロジェクト設定（任意）
├── linear/                # linear の補足（任意）
├── managed.json           # Managed Agents のローカル設定（任意・Git対象外）
├── managed/               # Managed の共通定義のコピーと claude-lock.json（任意・Git対象外）
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
