# shinaps-skills

Claude Code と Codex で使う、開発ワークフローのスキル集です。調査・仕様の整理・実装・レビュー・コミット・PR・リリースの手順を、それぞれのクライアント向けの plugin として配布します。

- 実装は Claude Code が行います。Codex は調査・レビュー・Linear での進行管理と QA を担当します。
- 導入に Shinaps AI のアカウントは不要です。コーディング規約（rule）の照合・抽出を使うときだけ、[Shinaps AI](https://app.shinaps.ai) でアカウントを作成して MCP を接続します。

## 必要なもの

- Claude Code または Codex CLI
- Node.js 22 以上（Codex への導入と、設定の検証・Managed Agents の操作に使う[配布 CLI](docs/install.md#配布-cli)に必要）
- 機能によって追加で必要なもの（Linear・Claude Managed Agents など）は、下の「機能別の資料」の各資料に書いています。

## インストール

Claude Code:

```text
/plugin marketplace add sh1n4ps/shinaps-skills
/plugin install shinaps@shinaps-skills
```

Codex:

```sh
npx @shinaps/skills@latest install codex
```

どちらも、新しいセッションから使えます。更新・削除と、Codex の自動更新は [導入と更新](docs/install.md) を参照してください。

## 使い方

Claude Code では `/shinaps:<スキル名>`（例 `/shinaps:review`）で呼び出します。Codex では、新しいセッションで `shinaps:review` などのスキルが読み込まれます。

よく使う流れ:

1. `explore` で今の挙動と変更の影響を調べる。要件が曖昧なら `spec` で仕様を詰める。
2. Claude Code の `dev-claude` で実装する。体制（LITE・BASIC・ULTRA）を選ぶと、実装とは別の担当が計画や実装をレビューします。
3. `simplify` で不要な構造を削り、`review` で差分を確かめる。
4. `commit`・`create-pr`・`release` で、コミット・PR・公開を行う。これらは依頼されたとき、または合意した許可の範囲でだけ実行します。

スキルは、対象プロジェクトの `AGENTS.md`・`CLAUDE.md`・README・CI・既存のスクリプトから、対象の環境・必要な検証・公開の条件を読み取ります。書かれていない条件は、結果を左右するものだけを確認します。Linear と Claude Managed Agents 以外のスキルは、専用の設定ファイル無しで使えます。`linear-execute` での開発の進行には `.shinaps/linear.json`、Managed Agents への依頼には `.shinaps/managed.json` が必要です（下の「機能別の資料」）。

## スキル

| 名前 | 用途 |
|---|---|
| `explore` | 対話しながら今の挙動と変更の影響を調べる |
| `spec` | 目的・仕様・実現方法を詰める |
| `dev-claude`（Claude のみ） | 選んだ体制で実装し、別の担当が独立にレビューする |
| `debug` | 不具合の原因を調べて確かめる |
| `review` | 差分や既存のコードをレビューする |
| `refine` | Shinaps AI の rule と実際のファイルを照合する |
| `extract-rules` | PR のレビューから rule を抽出する |
| `simplify` | 目的から見直して、不要な構造や手順を削る |
| `commit` | 変更を単位に分けてコミットする |
| `create-pr` | リポジトリの規約に合わせて PR を作る |
| `release` | 公開条件を確かめて公開し、対象の版を使えることを確かめる |
| `linear-plan` | 相談・Issue の作成と整理・プロジェクト設定を行う（実装はしない） |
| `linear-execute` | Linear の Issue を、設定に従って実装・QA・許可された公開まで進める |
| `managed-setup` | Claude Managed Agents の共通構成をアカウントへ導入・更新する |
| `managed-execute` | Claude Managed Agents へ実装を依頼し、結果を回収する |

## 機能別の資料

| 知りたいこと | 資料 |
|---|---|
| 更新・削除・macOS での Codex の自動更新 | [導入と更新](docs/install.md) |
| `dev-claude` の体制と工程 | [実装体制の判断](plugins/shinaps-claude/references/dev/staffing.md)・[dev の工程](plugins/shinaps-claude/references/dev/workflow.md) |
| Linear での開発進行（`.shinaps/linear.json` の書き方・許可・auto と manual） | [プロジェクト設定](plugins/shinaps-claude/references/linear/configuration.md)・[担当と工程](plugins/shinaps-claude/references/linear/workflow.md) |
| Claude Managed Agents（必要なもの・導入・依頼） | [設定とアカウント](plugins/shinaps-claude/references/managed/configuration.md)・[導入と更新](plugins/shinaps-claude/references/managed/setup.md)・[依頼と観測](plugins/shinaps-claude/references/managed/execute.md) |
| スキルが使う担当（サブエージェント）の一覧 | [サブエージェント](docs/agents.md) |
| 作業記録の保存先 | [作業記録](plugins/shinaps-claude/references/work-records.md) |
| このリポジトリの開発と npm への公開 | [開発と配布](docs/development.md) |

旧版の設定は自動では変換しません。Linear は [config_version 1 からの移行](plugins/shinaps-claude/references/linear/configuration.md#config_version-1-からの移行)、Managed Agents は [version 1 からの移行](plugins/shinaps-claude/references/managed/configuration.md#version-1-からの移行)に従ってください。

## Shinaps AI との接続

`refine`・`extract-rules` など rule を使う工程に必要です。導入とは別に設定し、既存の登録があれば再利用します。同じサーバーを plugin とグローバル設定の両方に登録しないでください。認証情報は各クライアントの認証で管理し、このリポジトリの CLI では扱いません。

```sh
# Claude Code（登録後、Claude Code 内の /mcp から認証）
claude mcp add --transport http shinaps-ai https://app.shinaps.ai/mcp --scope user

# Codex
codex mcp add shinaps-ai --url https://app.shinaps.ai/mcp
codex mcp login shinaps-ai
```

接続していなくても、他のスキルは使えます。接続できないときに、rule を照合したとは報告しません。

## 対応範囲

各クライアント向けの手順を提供します。`linear-execute` は利用者本人の環境（ローカルの CLI や WebStorm）で使う前提です。CLI・MCP・ブラウザ・端末の有無に依存する工程は実行時に確かめ、環境ごとの網羅的な動作保証はしません。

## License

MIT
