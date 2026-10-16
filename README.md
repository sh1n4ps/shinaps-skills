# shinaps-skills

Shinaps AIの利用者向け開発ワークフロー。Claude CodeとCodexそれぞれに適したplugin・カスタムエージェントとして配布する。スキルのダウンロードと導入にShinaps AIのアカウントは不要。サービスのrule検索・登録を使うときにアカウント作成と認証を行う。

## プロジェクトごとの条件

共通スキルが持つのは判断手順。対象環境・必須検証・公開条件は、対象プロジェクトの `AGENTS.md` / `CLAUDE.md` と参照先、README、CI、既存スクリプトから読み取る。専用設定ファイルは必須にしない。

例外として `linear-execute` の開発進行とチーム設定の変更には、対象リポジトリの `.shinaps/linear.yaml` を必須にする。操作の継続的な許可と終了地点を会話から推測せず、合意した範囲だけを続けて進めるためである。設定は `config_storage: shared` でGit共有、`local` でメインの作業ツリーだけに保存する。既存設定でキーがない場合だけ従来のlocal扱いを維持し、自動追記・許可の再合意は求めない。sharedは現在のcheckout、localはメインの設定と補足を正本とする。共有設定が欠けていても端末別のlocal設定では補わない。[共通設定](plugins/shinaps-claude/references/linear/configuration.md)の読取・保存手順に従う。設定がなくてもIssueの読み取り・整理はできる。設定が必要な実行で共通の読取手順により真に未設定と確認できた場合だけ、同じセッションで `linear-plan` の初期設定ヒアリングへ進み、合意した設定の保存・確認後に元の依頼を再開する。

sharedで採用する `instructions.md` は共有YAMLの `references.specifications` に明記して開始・再開時に読み、他の必要補足は内容に対応する `references` に記載する。必要補足の欠落・読取不能は依存工程を止め、未採用とは扱わない。設定・採用補足・ignoreの個別例外を一緒に共有するか、共有済み資料への参照に置き換える。端末の絶対パスやsession/thread ID、進捗・QA結果は `.shinaps/work/` に分け、秘密値はどちらにも保存しない。保存方式の合意だけでstage・commit・push・追跡解除を許可しない。

例えばPCブラウザのみのプロジェクトには対応ブラウザと確認コマンドを書く。iOSプロジェクトにはSimulatorと実機の使い分けを記す。スキルは一律の端末数やOS数を追加しない。既存の情報で決まらず結果を左右する条件だけ確認し、保存を了承された方針をプロジェクト側に残す。

## スキル

| 名前 | 用途 |
|---|---|
| `explore` | 対話しながら既存挙動と変更影響を調べる |
| `spec` | 目的・仕様・実現方法を詰める |
| `dev-claude-ultra` (Claudeのみ) / `dev-codex-ultra` (Codexのみ) | 計画・実装・簡素化・検証・レビューを進める。設計・計画レビュー・計画簡素化を同じ役割の2体で独立に確認する。実装依頼の既定 |
| `dev-claude` (Claudeのみ) / `dev-codex` (Codexのみ) | 同じ工程を、設計・計画レビュー・計画簡素化の担当をそれぞれ1体にして進める |
| `debug` | 不具合の原因を検証する |
| `review` | 差分や既存コードをレビューする |
| `refine` | Shinaps AIのruleと実ファイルを照合する |
| `extract-rules` | PRレビューからruleを抽出する |
| `simplify` | 目的から見直して不要な構造や手順を削る |
| `commit` | 進め方（通常・自律）を各単位の実効方針か確認で決め、検証できる単位でコミットする |
| `create-pr` | リポジトリの規約に合わせてPRを作成する |
| `release` | 公開条件を確定し、対象バージョンの利用可能性を確認する |
| `linear-plan` | 相談・必要なspec/explore・Issue作成と整理・プロジェクト設定を行い、実装前で止める |
| `linear-execute` | Issue単体・Cycle全体・バックログ消化を選び、設定に従って実装・QA・許可された公開を進める |

コミット・PR・リリースは、利用者の依頼またはLinear進行で合意済みの継続許可に従う。[共通設定](plugins/shinaps-claude/references/linear/configuration.md)・[担当と工程](plugins/shinaps-claude/references/linear/workflow.md)・[終了と待機](plugins/shinaps-claude/references/linear/execution.md)を参照し、必要な前工程が揃えば再確認せずに進む。単独スキル利用にはLinear進行や新しいゴールを必須にしない。`autonomous-commit-review` の役割は `commit` に統合した。個人用の別AI呼び出し・ブラウザ管理・ゴール管理・動画制作はこのpluginに含めない。

`linear-execute` は初版では利用者本人の環境向けで、Codexが進行とAgent QAを担当する。運用項目は明示必須で、既存設定の `config_storage`・`path_policy_overrides` 欠落は共通設定の説明に従い、それ以外は未記載を既定値で補わない。実装の担当は作業先の `.shinaps/linear.yaml` の `implementation_skill` で選ぶ。`dev-claude`・`dev-claude-ultra` を選ぶと、ClaudeがAI Terminal Bridge経由の依頼で実装する。`dev-codex`・`dev-codex-ultra` を選ぶと、会話側はゴール・進行・Agent QAを担当し、Issueごとの別Codexタスクが実装・QA指摘の修正・許可されたコミットを行う。タスク作成・連絡には `codex_task` とツールが要求する明示依頼が必要。どちらでも既存の許可は増えない。Bridge本体は同梱せず、導入済みのMCPとWebStormプラグインを使う。`SKILL.md` は担当ごとに両版で書き分け、共通の手順と書式は `references/linear/` に置く。`references/linear/` はClaude版を編集元としてCodex版へ同じ内容を複製し、テストで一致を確認する。

`path_policy_overrides` で、合意したパスの範囲に限り人レビュー・AIコミット許可・コミットモードを個別に上書きできる。たとえば `paths: ["docs/**", "README.md"]` と `human_code_review: skip` を指定すると、予定コミットの全変更がその範囲に収まる場合だけ人レビューを省く。同じコミットに対象外が混ざれば、そのコミット全体を通常方針とし、改名・移動は旧新両パスを判定する。同じ依頼でも自然な責務分割で独立した範囲内コミットには例外を適用できる。stage・push・公開の許可や必要なQAは変わらない。設定例と競合・照合の手順は[パス別の方針](plugins/shinaps-claude/references/linear/configuration.md#パス別の方針)を参照する。

0.29.0では旧 `document_only_changes: ai_commit` を廃止した。利用先では依存工程を止め、具体的なパス例外への移行または例外廃止を合意する。説明だけの変更の許可とは同値でないため自動変換しない。旧 `none` は例外なしとして維持でき、新規設定は `path_policy_overrides: []` にする。

`permissions` の `development_operations` を明示すると、既存アカウントのログイン・環境準備・依存導入・起動・テスト・QAを継続的に許可できる。コミット・公開・破壊的操作の許可や人レビューは別に扱う。

旧 `linear` の入口は廃止した。相談・Issue整理・設定変更は `linear-plan`、実行は `linear-execute` を使う。YAMLの名前・運用項目は変わらない。実行範囲は毎回の依頼で確定し、バックログではブロッカー到達と報告を終了条件にできる。人レビュー・Human QA待ちは予定工程として待機する。

### dev の入口

| 入口 | 配布 | 担当のモデル | 同じ役割の独立担当数 |
|---|---|---|---|
| `dev-claude` | Claude | Opus / medium（登録エージェントの定義） | 1体 |
| `dev-claude-ultra` | Claude | Opus / medium（登録エージェントの定義） | 2体 |
| `dev-codex` | Codex | `gpt-6-astra` / medium（起動時に指定） | 1体 |
| `dev-codex-ultra` | Codex | `gpt-6-astra` / medium（起動時に指定） | 2体 |

- `ultra` は同じ役割の独立担当数が2体という意味で、推論・速度・権限は変えない。担当数が変えるのは、独立設計・計画レビュー・計画簡素化の担当2の有無だけである。実装は常に1体で、実装後の設計適合性・独立コードレビュー・refine・実装の簡素化・指摘の検証は1体の入口でも行う。
- 工程は両版で同じ[dev の工程](plugins/shinaps-claude/references/dev/workflow.md)を使い、担当の起動手順だけを各版の `references/dev/launch.md` に分ける。工程はClaude版を編集元としてCodex版の同じパスへ複製し、テストで一致を確認する。
- Claude版は登録エージェントを直接起動し、Codex CLIを使わない。Codex版は名前付きのカスタムエージェントをサブエージェントとして起動し、CLIで起動しない。どちらも親セッションの設定を変更しない。
- 実装依頼と他スキル（explore・spec・review・debug）からの引き継ぎは、同じ runtime の `*-ultra` を既定にする。利用者が1体を指定した場合は1体の入口を使う。以前の dev 入口の別名は残さない。
- Claude版の入口は、利用者が委託したCodexがAI Terminal Bridgeで依頼してSkillツールから起動できるよう、モデルからの呼び出しを許可している（`disable-model-invocation: true` を付けない）。
- テスト方針の正本は両版の `references/testing.md`（同じ内容）で、dev の各役割の定義に同じ段落を写し、テストで一致を確認する。
- 4つの入口は、SHINAPS-98・SHINAPS-108 の比較（同じ工程で担当のモデルと担当数を変えた比較）の結果から採用した。比較用の入口・資料・役割は v0.23.0 まで同梱していた（Git 履歴で参照できる）。

## Claude Code

```text
/plugin marketplace add sh1n4ps/shinaps-skills
/plugin install shinaps@shinaps-skills
```

ユーザースコープで利用する。呼び出しは `/shinaps:dev-claude-ultra`、`/shinaps:create-pr` など。ローカル開発中はmarketplaceにこのcheckoutの絶対パスを登録し、変更後にpluginを更新する。pluginキャッシュへ直接編集しない。更新後は新しいセッションで確認する。

## Codex

Node.js 22以上と、`plugin marketplace add` / `plugin add` に対応したCodex CLIを使う。Claude Codeのインストールは不要。ただし `linear-execute` の開発進行をClaudeの入口で行う場合は、Claude CodeとAI Terminal Bridgeが必要になる。

導入・更新・削除:

```sh
npx @shinaps/skills@latest install codex
npx @shinaps/skills@latest update codex
npx @shinaps/skills@latest uninstall codex
npx @shinaps/skills@latest recover codex
```

`recover codex`は、中断した更新の記録が残っている場合に復元だけを行う。記録が無ければ何もしない。

ローカル開発では、このcheckoutから `node bin/skills.ts install codex` のように同じ操作を実行できる。Node.js 22.18以上なら型除去でTypeScriptをそのまま実行する (ビルド不要)。

CLIはスキルをCodex pluginとして登録し、16個のカスタムエージェントを`${CODEX_HOME:-~/.codex}/agents/`へ配置する。新しいセッションで`shinaps:dev-codex-ultra`、`shinaps:review`等が読み込まれる。dev の入口から起動した担当は入口が指定するモデルと推論（`gpt-6-astra` / medium）で動き、それ以外のスキルからの利用ではモデルと推論設定を親セッションから継承する。実装担当以外の調査・レビュー担当は読み取り専用を既定にする。0.23.0 まで配置していた比較専用の役割は、更新時に管理済みエージェントとして削除される。親セッションの実行時設定が優先される場合もあるため、権限の強制境界とは扱わない。

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

## 開発と配布

- Claude版: `plugins/shinaps-claude/`、marketplaceは`.claude-plugin/marketplace.json`
- Codex版: `plugins/shinaps-codex/`、marketplaceは`.agents/plugins/marketplace.json`
- Codexカスタムエージェント: `plugins/shinaps-codex/agents/`
- 配布CLI: ソースは `bin/skills.ts` と `lib/*.ts`。`npm run build` (`tsc`) で `dist/` にJSを出力し、npmにはそれを配布する。Node.jsは`node_modules`配下の`.ts`に型除去を適用しないため、ソースのままは配布できない。checkoutでは型除去で直接実行するので、`enum`など型除去で消せない構文は使わない (`tsconfig.json` の `erasableSyntaxOnly`)

品質基準とプロジェクト設定の方針は揃えつつ、クライアント固有の実行手順・エージェント形式は別々に管理する。Claude向けのエージェント呼び出しをCodexに読み替えさせる方式は使わない。スキルを追加・変更した場合は両版への適用可否を判断する。

```sh
npm test
npm run check
npm pack --dry-run
```

公開前にはnpmスコープ`@shinaps`の利用権限とtarball内容を確認する。CLIのバージョンと両pluginのバージョンを揃える。開発中の同一バージョンも`update codex`で再配置できる。

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

## Subagents (Claude: 16 / Codex: 16)

| Subagent | 役割 |
|---|---|
| `shinaps-explorer` | コードベース探索、必読ファイル抽出 |
| `shinaps-investigator` | `shinaps:explore` の現在の質問をコード・テスト・設定・履歴から調べ、確実性を分けて回答 |
| `shinaps-architect` | 設計。dev では設計担当1 が設計・設計案統合・設計適合性・プランと全指摘の最終判断を行い、2体の入口では設計担当2 も独立設計を行う |
| `shinaps-plan-reviewer` | 計画レビュー (confidence 閾値 70)。2体の入口では2体が独立に指摘と修正案を返す |
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
| `shinaps-split-reviewer` | `shinaps:commit` の通常モードの分割案を「単位の diff だけで妥当性を判断できるか」で批判 + 修正版最終分割計画 (worktree は read-only) |

Claude版はMarkdown、Codex版はTOMLで役割を定義する。

Claude版は全16エージェントが `opus / medium`。Codex版の役割定義はモデルを書かず、dev の入口が起動時にモデルと推論を指定する。dev での担当の割り当ては[dev の工程](plugins/shinaps-claude/references/dev/workflow.md)にある。

**subagent 内では shinaps MCP を直接呼び出さず、rule 全文は Skill 側から prompt 経由で渡す** 原則を全 system prompt に明記する。MCP呼び出しの利用量が重複しないようにするため。


## 作業成果物

作業記録は現在の作業先の `.shinaps/work/` に保存する。[作業記録の共通手順](plugins/shinaps-claude/references/work-records.md)に従い、既存の共有例外を保持し、workの除外が不足する場合だけ `/work/` を追加する。設定の共有方式は記録作成では変更しない。共通手順はClaude版を編集元としてCodex版へ複製し、テストで一致を確認する。

```text
.shinaps/
├── .gitignore             # 保存方式に応じた除外・共有対象の例外
├── linear.yaml            # linear のプロジェクト設定（任意）
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
