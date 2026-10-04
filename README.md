# shinaps-skills

Shinaps AIの利用者向け開発ワークフロー。Claude CodeとCodexそれぞれに適したplugin・カスタムエージェントとして配布する。スキルのダウンロードと導入にShinaps AIのアカウントは不要。サービスのrule検索・登録を使うときにアカウント作成と認証を行う。

## プロジェクトごとの条件

共通スキルが持つのは判断手順。対象環境・必須検証・公開条件は、対象プロジェクトの `AGENTS.md` / `CLAUDE.md` と参照先、README、CI、既存スクリプトから読み取る。専用設定ファイルは必須にしない。

例えばPCブラウザのみのプロジェクトには対応ブラウザと確認コマンドを書く。iOSプロジェクトにはSimulatorと実機の使い分けを記す。スキルは一律の端末数やOS数を追加しない。既存の情報で決まらず結果を左右する条件だけ確認し、保存を了承された方針をプロジェクト側に残す。

## スキル

| 名前 | 用途 |
|---|---|
| `explore` | 対話しながら既存挙動と変更影響を調べる |
| `spec` | 目的・仕様・実現方法を詰める |
| `dev` | 計画・実装・簡素化・検証・レビューを進める |
| `debug` | 不具合の原因を検証する |
| `review` | 差分や既存コードをレビューする |
| `refine` | Shinaps AIのruleと実ファイルを照合する |
| `extract-rules` | PRレビューからruleを抽出する |
| `simplify` | 目的から見直して不要な構造や手順を削る |
| `verify-ui` | 対象環境の実画面で見た目・操作を確かめる |
| `commit` | 検証できる単位へ分けてコミットする。自律モードは明示依頼時のみ |
| `create-pr` | リポジトリの規約に合わせてPRを作成する |
| `release` | 公開条件を確定し、対象バージョンの利用可能性を確認する |

`dev` は簡素化を適用した後の差分をレビューする。コミット・PR・リリースは依頼された場合だけ進む。`autonomous-commit-review` の役割は `commit` に統合した。個人用の別AI呼び出し・ブラウザ管理・ゴール管理・動画制作はこのpluginに含めない。

## Claude Code

```text
/plugin marketplace add sh1n4ps/shinaps-skills
/plugin install shinaps@shinaps-skills
```

ユーザースコープで利用する。呼び出しは `/shinaps:dev`、`/shinaps:create-pr` など。ローカル開発中はmarketplaceにこのcheckoutの絶対パスを登録し、変更後にpluginを更新する。pluginキャッシュへ直接編集しない。更新後は新しいセッションで確認する。

## Codex

Node.js 22以上と、`plugin marketplace add` / `plugin add` に対応したCodex CLIを使う。Claude Codeのインストールは不要。

導入・更新・削除:

```sh
npx @shinaps/skills@latest install codex
npx @shinaps/skills@latest update codex
npx @shinaps/skills@latest uninstall codex
```

ローカル開発では、このcheckoutから `node bin/skills.mjs install codex` のように同じ操作を実行できる。

CLIはスキルをCodex pluginとして登録し、13個のカスタムエージェントを`${CODEX_HOME:-~/.codex}/agents/`へ配置する。新しいセッションで`shinaps:dev`、`shinaps:review`等が読み込まれる。エージェントのモデルと推論設定は親セッションから継承し、調査・レビュー担当は読み取り専用を既定にする。親セッションの実行時設定が優先される場合もあるため、権限の強制境界とは扱わない。

配布物は`~/.local/share/shinaps-ai/skills/codex/`へ保持し、一時的なnpxキャッシュに依存しない。同じ親ディレクトリの`state.json`に配置したエージェントと内容のハッシュを記録する。管理対象外の同名ファイルや、導入後に編集されたエージェントは上書き・削除せず停止する。必要な変更を退避・整理してから再実行する。`CODEX_HOME`を変更する場合は元の配置先で先にuninstallする。

uninstallはこのCLIのplugin・marketplace・管理済みエージェントを取り除く。個人用スキルと、別途登録したMCP接続・認証情報は保持する。

## 開発と配布

- Claude版: `plugins/shinaps-claude/`、marketplaceは`.claude-plugin/marketplace.json`
- Codex版: `plugins/shinaps-codex/`、marketplaceは`.agents/plugins/marketplace.json`
- Codexカスタムエージェント: `plugins/shinaps-codex/agents/`
- 配布CLI: `bin/skills.mjs` / `lib/install.mjs`

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

未登録の利用者は[Shinaps AI](https://app.shinaps.ai)でアカウントを作成する。未認証でもスキルの導入は完了できる。MCPが使えないときに照合済みと報告しない。`simplify`・`verify-ui`・`commit`・`create-pr`・`release` の基本手順はMCP接続を必須としない。

## Subagents (13)

| Subagent | 役割 |
|---|---|
| `shinaps-explorer` | コードベース探索、必読ファイル抽出 |
| `shinaps-investigator` | `shinaps:explore` の現在の質問をコード・テスト・設定・履歴から調べ、確実性を分けて回答 |
| `shinaps-architect` | 実装ブループリント策定 (複数観点 → 単一案収束) |
| `shinaps-plan-reviewer` | architect 案の批判 + 修正版最終 plan (confidence 閾値 70) |
| `shinaps-reviewer` | logic / design / security / performance / maintainability / rule 統合レビュー (confidence 閾値 80) |
| `shinaps-review-validator` | reviewer 指摘の実コード検証 (confirmed / false positive / partial / out-of-scope 分類) |
| `shinaps-refine-agent` | rule 照合の並列 dispatch (ファイル現状全文と照合、Violation / Improvement / Question 分類 + changed / pre-existing 切り分け) |
| `shinaps-spec-writer` | ヒアリング + 調査結果を spec.md 構造化 |
| `shinaps-tech-surveyor` | 外部技術調査 (WebSearch + WebFetch で 3-5 候補比較) |
| `shinaps-survey-validator` | tech-surveyor の出典を WebFetch で再確認 |
| `shinaps-debugger` | 症状から根本原因の仮説立案 (コードトレース + WebSearch + GitHub Issue) |
| `shinaps-debug-validator` | 仮説の実コード検証 (root-cause / contributing-factor / red-herring / needs-reproduction 分類) |
| `shinaps-split-reviewer` | `shinaps:commit` の分割案を「単位の diff だけで妥当性を判断できるか」で批判 + 修正版最終分割計画 (worktree は read-only) |

Claude版はMarkdown、Codex版はTOMLで役割を定義する。**subagent 内では shinaps MCP を直接叩かず、rule 全文は Skill 側から prompt 経由で渡す** 原則を全 system prompt に明記 (credit 最適化)。


## 作業成果物

作業記録はプロジェクトルートの `.shinaps/work/` に保存する。初回作成時に `.shinaps/.gitignore` を内容 `*` と改行で作成する。既存のignoreは保持し、必要な場合だけ `*` を追記する。これによりignore自身を含む配下の未追跡ファイルが除外され、ユーザーによるグローバルignoreやプロジェクトルートのignore設定は不要になる。追跡済みファイルには効かないため、無断で追跡解除せず報告する。

```text
.shinaps/
├── .gitignore             # *
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
