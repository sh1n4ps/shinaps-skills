# Claude Managed Agents の設定

作業先リポジトリの `.shinaps/managed.json` に置く。`config_version: 1` のJSONで、[JSON Schema](configuration.schema.json)を契約の正本とする。

設定が持つのは、共通定義のコピーの置き場所・対象リポジトリ・GitHub MCP の資格情報を登録した vault だけである。許可・予算・Issueの範囲・base と head・終了条件は呼び出しのたびに利用者と合意して決め、設定には書かない。lead・役割・環境のリソース ID は lock から読み、設定には書かない。vault は lock に記録されないため、`vault_id` だけを設定に持つ。秘密値は書かない。schema は未知のキーを拒否するので、許可や予算などのキーを書いた設定は検証で失敗し、許可や予算として扱われることはない。

認証は `ant` の既存のログイン（利用者本人が `ant auth login` を行う）と環境変数、GitHub MCP は vault の資格情報を使う。

## 配置

| パス | 内容 |
| --- | --- |
| `.shinaps/managed.json` | この設定 |
| `<definitions>/agents/`・`environments/`・`skills/` | plugin の `managed-agents/` からコピーした共通定義。テンプレートの所有で、更新時は丸ごと置き換える |
| `<definitions>/claude-lock.json` | `ant apply` が記録するクラウド上のリソースの ID と版 |

いずれも Git 対象外にする。`.shinaps/.gitignore` が `*` で始まる場合は追加の設定なしで除外される。書き込む前に `git check-ignore --no-index -v <パス>` で除外を確認する。除外されていなければ、[導入の手順](setup.md#1-設定を読む)に従って既存の規則と共有例外を保ったまま `.shinaps/.gitignore` に必要な行だけを加えてから書き込む（新規作成の内容は[作業記録の共通手順](../work-records.md)と同じ）。`<definitions>` をリポジトリの外に置く場合は Git の対象にならないので、この確認は `.shinaps/managed.json` だけに行う。

## 項目

全項目が必須で、`$schema` だけは省略できる。

| キー | 内容 |
| --- | --- |
| `$schema` | 任意のエディタ補助。CLI はこの URL を取得しない |
| `config_version` | `1` |
| `definitions` | 共通定義のコピーと lock を置くディレクトリ。リポジトリのルートからの相対パス、または絶対パス。clone のやり直し・worktree・`git clean` の影響を避けたい場合は、リポジトリの外の絶対パスにする。同じマシンの同じ組織で複数のリポジトリから使う場合は、全リポジトリの `definitions` に同じ絶対パスを指定し、lock を 1 つにする。別のマシンでは[lock の扱い](#lock-の扱い)に従う |
| `repository.url` | セッションにマウントする GitHub リポジトリの URL |
| `repository.mount_path` | セッション内のマウント先（例 `/workspace/widgets`） |
| `vault_id` | GitHub MCP の資格情報を登録した vault の ID。未登録なら `null` |

## 検証

利用中の skill と同じ版の `@shinaps/skills` を導入し、`shinaps-skills validate-managed-config <明示ファイル>` で検証する。ローカル開発では `node bin/skills.ts validate-managed-config <file>` を使える。CLI は指定された一つのJSONを同梱 schema で検証し、ネットワーク取得・設定の探索・Git 操作・入力の変更はしない。成功は構造が正しいことだけを表し、lock や vault がクラウドに存在することは保証しない。

`config_version` が欠落または旧版なら setup で作り直し、未来版なら skill と CLI を更新する。

## 設定例

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@shinaps/skills@0.34.0/plugins/shinaps-claude/references/managed/configuration.schema.json",
  "config_version": 1,
  "definitions": ".shinaps/managed",
  "repository": {
    "url": "https://github.com/acme/widgets",
    "mount_path": "/workspace/widgets"
  },
  "vault_id": null
}
```

## lock の扱い

- `<definitions>/claude-lock.json` がクラウド上の lead・役割・skill・環境の ID の正本である。`ant apply` が作成・更新するので手で編集しない。
- lock のキーは lock のあるディレクトリからの相対パス（例 `./agents/shinaps-dev-managed-cc.md`）である。共通定義を同じ構造で `<definitions>` 直下に置くので、そこで適用すると既存のリソースに対応づく。
- lead の ID は `./agents/shinaps-dev-managed-cc.md`、環境の ID は `./environments/shinaps-dev.yaml` の `id` から読む。
- lock が無いと適用は既存のリソースと対応づかず、同じ名前のリソースを重複して作る。lock の `hash` は既存のリソースから作り直せないため、バックアップや以前の置き場所から戻す。見つからなければ適用せず、利用者に相談する。
- 適用の前後に lock を作業記録（`.shinaps/work/`）へ複製し、適用後の差分を比べる。
