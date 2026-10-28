# 開発と配布

このリポジトリを開発・公開する人向けの資料です。利用方法は [README](../README.md) を参照してください。

## 構成と複製の方針

- Claude 版: `plugins/shinaps-claude/`、marketplace は `.claude-plugin/marketplace.json`
- Codex 版: `plugins/shinaps-codex/`、marketplace は `.agents/plugins/marketplace.json`。サブエージェントは `plugins/shinaps-codex/agents/`
- Claude Managed Agents 版: 両 plugin の `managed-agents/`。plugin と一緒に配布され、npm パッケージの `plugins/` にも含まれる
- 配布 CLI: ソースは `bin/skills.ts` と `lib/*.ts`。`npm run build`（`tsc`）で `dist/` に JS を出力し、npm にはそれを配布する。Node.js は `node_modules` 配下の `.ts` に型除去を適用しないため、ソースのままは配布できない。checkout では型除去で直接実行するので、`enum` など型除去で消せない構文は使わない（`tsconfig.json` の `erasableSyntaxOnly`）

品質基準とプロジェクト設定の方針は両版で揃え、クライアント固有の実行手順とエージェントの形式は別々に管理する。スキルを追加・変更したら各版への適用可否を判断する。

- `references/`（`dev/launch.md` を除く）は Claude 版を編集元として Codex 版へ同じ内容を複製し、テストで一致を確認する。`SKILL.md` と役割の本文は版ごとに書き分け、Claude 向けの呼び出しを Codex に読み替えさせる方式は使わない。
- Managed の共通定義は `plugins/shinaps-claude/managed-agents/` を編集元として Codex 版へ複製し、テストで一致を確認する。Managed の skill の `staffing.md`・`workflow.md`・`launch.md` は Claude 版を写した適応版で一致はテストしないため、Claude 版の工程・体制の基準を変えたら Managed への適用可否を判断する。
- テスト方針は各版の `references/testing.md` を正本とし、その段落を役割定義と Managed の lead の定義に複製する。設計の観点は `references/dev/design.md` を正本とし、本文を独立設計担当（`shinaps-architect`）の定義と Managed の skill の `references/design.md` に複製する。どちらもテストで一致を確認する。
- 役割の定義は Claude 版が Markdown、Codex 版が TOML、Managed 版が `ant apply` 用の frontmatter を付けた Markdown。サブエージェント内では shinaps MCP を直接呼ばず、rule の全文はスキル側から渡す（MCP の利用量が重複しないようにするため）。この原則を全ての役割定義に書く。
- `autonomous-commit-review` の役割は `commit` に統合した。旧 `linear` の入口は廃止し、`linear-plan`・`linear-execute` に分けた。個人用の別 AI 呼び出し・ブラウザ管理・ゴール管理・動画制作はこの plugin に含めない。Bridge 本体は同梱せず、導入済みの MCP と WebStorm プラグインを使う。

## ローカル開発

- Claude Code: marketplace にこの checkout の絶対パスを登録し、変更後に plugin を更新する。plugin のキャッシュは直接編集しない。更新後は新しいセッションで確認する。checkout を登録した場合はソースの git pull まで自動では行わない。
- Codex: checkout から `node bin/skills.ts install codex` のように同じ操作を実行できる。Node.js 22.18 以上なら型除去で TypeScript をそのまま実行する（ビルド不要）。開発中の同じ版も `update codex` で再配置できる。

```sh
npm ci
npm test
npm run check
npm pack --dry-run
npm run verify:package
```

`npm run format` で Biome による整形を行う。`npm run check` は整形と型（`tsc --noEmit`）を検証する。`npm pack` と `npm publish` は `prepack` で `npm run build` を実行する。`npm run verify:package` は配布物の一覧を比較したうえで、tarball を一時ディレクトリに install して起動できることを確かめる。`RELEASE_TAG=v<version>` を付けると tag との整合も確かめる。Biome は整形だけに使い、lint と import の自動整理は無効にしている。Markdown・TOML のエージェント定義は整形の対象外。

## Managed Agents の定義の適用

定義を変えたら `shinaps-skills managed setup` で計画を確かめてから `--apply` で適用する。`--prune`・`--force` は使わず、リソースを削除しない。lock はアカウントごとの管理ディレクトリ（`definitions/claude-lock.json`）に置き、リポジトリには置かない。古い置き場所からの移行は [version 1 からの移行](../plugins/shinaps-claude/references/managed/configuration.md#version-1-からの移行)に従う。

## CI と npm への公開

`.github/workflows/publish.yml` は main への push・PR・手動実行でテストと配布内容を検証する。通常の GitHub Release を公開すると、検証の成功後に同じ tag のパッケージを npm へ公開する。prerelease と手動実行では公開しない。

- リリース時は `package.json` と両 plugin の manifest のバージョンを揃えてコミットし、`v<version>` の tag で GitHub Release を公開する。tag とバージョンが一致しなければ止まる。既存の npm の版は再公開できないため、次の変更には新しいバージョンを使う。`docs/install.md` の配布 CLI の導入コマンドと、`references/linear/configuration.md`（両版）の CLI の版も新しい版に揃える。設定例の `$schema` と同梱 schema の `$id`（Linear・Managed、両版）は、schema の契約を変えた版でだけ上げる。公開前に npm スコープ `@shinaps` の権限と tarball の内容を確認する。
- npm の `@shinaps/skills` には GitHub Actions の Trusted Publisher（owner `sh1n4ps`、repository `shinaps-skills`、workflow `publish.yml`、direct publish を許可）を登録している。publish job だけに `id-token: write` を付け、`NPM_TOKEN` secret は使わない。CI は GitHub-hosted の Ubuntu と Node.js 24 を使う。初回の信頼設定には本人認証が必要だが、その後の公開に毎回のセキュリティキー操作は不要。
- npm の provenance は公開リポジトリからの Trusted Publishing で生成される。

## 公開物に書かない情報

このリポジトリと npm パッケージは公開される。個人の連絡先（plugin の manifest の author・owner には名前だけを書く）、秘密値、実在の Linear の project や Issue の URL、Managed Agents の組織・workspace・リソースの ID、端末の絶対パスを、配布物・資料・テストの例に書かない。例には架空の値を使う。運用に使う `.shinaps/linear.json` は対象の Linear project を記す必要があるため例外とする。

