# shinaps-skills

Claude Code と Codex で使う、開発ワークフローのスキル集です。調査・仕様の整理・実装・レビュー・コミット・PR・リリースの手順を、それぞれのクライアント向けの plugin として配布します。

- 実装は Claude Code が行います。Codex は調査・レビュー・Linear での進行管理と QA を担当します。
- 導入に Shinaps AI のアカウントは不要です。コーディング規約（rule）の照合・登録を使うときだけ、[Shinaps AI](https://app.shinaps.ai) でアカウントを作成して MCP を接続します。

## 必要なもの

- Claude Code または Codex CLI
- Node.js 22.13 以上の 22 系、または 24 以上（Codex への導入と、設定の検証・Managed Agents の操作・規約の機械検査に使う[配布 CLI](docs/install.md#配布-cli)に必要。機械検査の ESLint の要件に合わせている）。配布 CLI は機械検査のために ESLint・typescript-eslint・TypeScript などを依存に持ち、導入に約 65MB を使います。
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
3. `review` で差分を確かめる。体制（LITE・BASIC・ULTRA）を選べ、規約照合や簡素化だけの依頼もできます。追加修正の後や、実装時と違う体制で確かめたいときにも単独で使えます。指摘の検証と報告までを行い、修正は依頼されたときだけ開発の担当へ引き継ぎます。
4. `commit`・`create-pr`・`release` で、コミット・PR・公開を行う。これらは依頼されたとき、または Linear で合意した終了地点までの進行を依頼されたときに実行します。操作ごとの許可の一覧は持たず、依頼の範囲とプロジェクトの制約で判断します（[依頼範囲と操作](plugins/shinaps-claude/references/request-scope.md)）。

スキルは、対象プロジェクトの `AGENTS.md`・`CLAUDE.md`・README・CI・既存のスクリプトから、対象の環境・必要な検証・公開の条件を読み取ります。書かれていない条件は、結果を左右するものだけを確認します。Linear と Claude Managed Agents 以外のスキルは、専用の設定ファイル無しで使えます。`linear-execute` での開発の進行には `.shinaps/linear.json`、Managed Agents への依頼には `.shinaps/managed.json` が必要です（下の「機能別の資料」）。

## スキル

| 名前 | 用途 |
|---|---|
| `explore` | 対話しながら今の挙動と変更の影響を調べる |
| `spec` | 目的・仕様・実現方法を詰める |
| `dev-claude`（Claude のみ） | 選んだ体制で実装し、別の担当が独立にレビューする |
| `debug` | 不具合の原因を調べて確かめる |
| `review` | 差分や既存のコードを、選んだ体制でレビューする（規約照合・可読性・慣習・簡素化を含む） |
| `commit` | 変更を単位に分けてコミットする |
| `create-pr` | リポジトリの規約に合わせて PR を作る |
| `release` | 公開条件を確かめて公開し、対象の版を使えることを確かめる |
| `linear-plan` | 相談・Issue の作成と整理・プロジェクト設定を行う（実装はしない） |
| `linear-execute` | Linear の Issue を、実装・QA を経て設定した終了地点（マージ・公開も設定できる）まで進める |
| `managed-setup` | Claude Managed Agents の共通構成をアカウントへ導入・更新する |
| `managed-execute` | Claude Managed Agents へ実装を依頼し、結果を回収する |

## 機能別の資料

| 知りたいこと | 資料 |
|---|---|
| 更新・削除・macOS での Codex の自動更新 | [導入と更新](docs/install.md) |
| `dev-claude` の体制と工程 | [実装体制の判断](plugins/shinaps-claude/references/dev/staffing.md)・[dev の工程](plugins/shinaps-claude/references/dev/workflow.md) |
| レビューの担当の構成と指摘の採否・単独起動の手順 | [レビューの共通契約](plugins/shinaps-claude/references/review.md)・[単独レビューの手順](plugins/shinaps-claude/references/review-standalone.md) |
| Linear での開発進行（`.shinaps/linear.json` の書き方・終了地点と制約・auto と manual） | [プロジェクト設定](plugins/shinaps-claude/references/linear/configuration.md)・[担当と工程](plugins/shinaps-claude/references/linear/workflow.md) |
| Claude Managed Agents（必要なもの・導入・依頼） | [設定とアカウント](plugins/shinaps-claude/references/managed/configuration.md)・[導入と更新](plugins/shinaps-claude/references/managed/setup.md)・[依頼と観測](plugins/shinaps-claude/references/managed/execute.md) |
| スキルが使う担当（サブエージェント）の一覧 | [サブエージェント](docs/agents.md) |
| 作業記録の保存先 | [作業記録](plugins/shinaps-claude/references/work-records.md) |
| このリポジトリの開発と npm への公開 | [開発と配布](docs/development.md) |

旧版の設定は自動では変換しません。Linear は [旧設定の移行](plugins/shinaps-claude/references/linear/configuration.md#旧設定の移行)（0.48.0 から `config_version: 3`。操作ごとの許可の一覧を廃止し `constraints` に置き換え）、Managed Agents は [version 1 からの移行](plugins/shinaps-claude/references/managed/configuration.md#version-1-からの移行)に従ってください。

### 0.49.0 の変更

`refine`・`simplify`・`extract-rules` のスキルを廃止しました。規約照合と簡素化は `review` に依頼します（「規約照合だけ」「簡素化だけ」と限定できます）。規約の登録はその場で AI に依頼します。PR からの一括抽出の代わりになるスキルはありません。計画の簡素化だけを単独で起動する手段も無くなり、dev の計画レビューに含まれます。

`review` の名前は同じですが、次の動作が変わります。

- 既定では指摘の検証と報告で終わり、修正や次の操作の質問をしません。修正まで依頼すると、開発の担当が修正と再レビューを行い、未コミットの差分を返します。Codex の `review` は Linear 進行でなくてもローカルの Claude CLI を権限確認を省くモード（`bypassPermissions`）で起動して修正を渡します。操作は依頼の範囲に限り、CLI が無いときは止まります。
- 指摘の独立検証と外部調査は、毎回ではなく、依頼されたときや判断を左右するときに行います。
- 変更を対象にしたレビューでは、変更と無関係な既存箇所の規約違反を Critical にせず、別の一覧で報告します。ファイル・ディレクトリを指定した場合は、指定した全体を対象に重要度を下げません。
- 引数なしの対象は、ベースブランチからのコミット済みの差分と作業ツリーの変更です。

dev の実装後レビューでは、規約に機械検査があるときに配布 CLI の `lint` を使います（使えないときは AI が照合します）。

## Shinaps AI との接続

`review` や `dev-claude` の規約照合など rule を使う工程に必要です。規約の登録・更新はその場で AI に依頼します（[規約の書き方](plugins/shinaps-claude/references/rule-writing.md)）。導入とは別に設定し、既存の登録があれば再利用します。同じサーバーを plugin とグローバル設定の両方に登録しないでください。認証情報は各クライアントの認証で管理し、このリポジトリの CLI では扱いません。

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
