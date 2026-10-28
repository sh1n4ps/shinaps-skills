# Claude Managed Agents の設定とアカウント

Managed Agents は配布CLI `shinaps-skills managed` で導入・依頼・観測・回収する（[導入](setup.md)・[依頼と観測](execute.md)）。CLI は利用中の skill と同じ版の `@shinaps/skills` を使う。クラウドの操作は公式の `ant` CLI（2.4.0 以上）へ委ね、CLI は PATH 上の `ant` を呼ぶ。CLI が使うコマンド・フラグ・stdin の本文・出力の形は、ant 2.4.0 の公式ソースで照合した（実行は未確認。[未検証の境界](execute.md#未検証の境界)）。

## アカウント

アカウントは、APIキー1つが属する組織・workspace に利用者が付ける名前で、英小文字・数字と単独のハイフン（`^[a-z0-9]+(-[a-z0-9]+)*$`）にする。同じマシンでは、同じ名前は常に同じ組織・workspace を表すようにする。lock がアカウント名で引かれるので、別の組織に同じ名前を使うと別の組織の lock で適用しようとする（`ant apply` は lock と違う組織・workspace の資格情報を拒否して止まる）。

### APIキー

コマンドごとに、各アカウントのキーを次のどちらかで渡す。

- 環境変数 `SHINAPS_MANAGED_API_KEY_<NAME>`（`<NAME>` はアカウント名の英大文字で、`-` は `_`。例 `work-us` → `SHINAPS_MANAGED_API_KEY_WORK_US`）。推奨。
- 引数 `--api-key <name>=<key>`（環境変数より優先）。引数は同じマシンの他のプロセスやシェルの履歴から見えるので、共有のマシンでは使わない。

CLI はキーを保存せず、出力とエラー文では伏字にする。`ant` へは子プロセスの環境変数 `ANTHROPIC_API_KEY` だけで渡し、親の `ANTHROPIC_*`（別のキー・`ant auth login` のプロファイル・workspace の指定）と他アカウントのキーは子へ渡さない。workspace をまたげる資格情報（`--workspace-id` が必要なもの）は扱わないので、workspace に属するキーを使う。

### アカウントの状態

各アカウントの状態は、マシン単位の管理ディレクトリ `~/.local/share/shinaps-ai/skills/managed/<account>/` に置く。lock は組織・workspace に属し、リポジトリには属さないため。複数のリポジトリから同じアカウントを使っても lock は1つになり、clone のやり直し・worktree・`git clean` で失われない。

| パス | 内容 |
| --- | --- |
| `definitions/agents/`・`environments/`・`skills/` | 同梱の共通定義の写し。setup が同梱の定義に揃える |
| `definitions/claude-lock.json` | `ant apply` が記録するクラウド上の lead・役割・skill・環境の ID と版。setup は読むだけで書き換えない。手で編集しない |
| `definitions.json` | setup が最後に書いた共通定義の各ファイルのハッシュ。利用者の変更の検出に使う |
| `sessions/<request_id>.json` | このアカウントで作ったセッションの記録（入力と session ID。秘密値は含まない） |
| `sessions/<session_id>/outputs/` | 回収した出力ファイル |
| `update.lock` | 同じアカウントの setup・run を同時に1つにする排他（`ant apply` は lock を排他しないため） |

`definitions/` には同梱の共通定義と lock だけを置き、共通定義を手で編集しない。適用はディレクトリ内の定義をすべて送るため。利用者が加えた定義の変更は導入に取り込まない（クラウドへ持ち越さない）。setup は、自分が最後に書いた内容か今回書く内容と一致するファイルだけを書き換え・削除する。利用者の編集・追加、記録の無い既存のファイル（旧版の定義ごと複写した場合など）、通常のファイル・ディレクトリ以外のもの、ほかの項目が一つでもあれば、何も変えずにそのアカウントを失敗にし、該当するパスを示す。それらを `definitions/` の外へ退避してから（lock は残す）再実行すると、同梱の定義を書き直して進む。消えた共通定義のファイルは書き直す。

## lock の扱い

- `definitions/claude-lock.json` がクラウド上の ID の正本である。lead の ID は `./agents/shinaps-dev-managed-cc.md`、環境の ID は `./environments/shinaps-dev.yaml` の `id` にある。
- lock のキーは lock のあるディレクトリからの相対パスである。共通定義を同じ構造で `definitions/` 直下に置き、そこで適用するので、既存のリソースに対応づく。
- lock が無いと適用は既存のリソースと対応づかず、同じ名前のリソースを重複して作る。lock の `hash` は既存のリソースから作り直せないので、setup は lock が無いアカウントに同名の未アーカイブの lead・役割・環境があれば止まる。バックアップや以前の置き場所から lock を戻して再実行する。見つからなければ適用せず、利用者に相談する。
- 別のマシンでは lock が無い。同じ組織を別のマシンから導入するときは、元のマシンの lock を同じ名前のアカウントへ複写する。

## 作業先の設定（`.shinaps/managed.json`）

`managed run` だけが読む作業先の設定。`config_version: 2` のJSONで、[JSON Schema](configuration.schema.json)を契約の正本とする。持つのは、セッションにマウントするリポジトリと、アカウントごとの GitHub MCP の vault だけである。許可・予算・base と head・範囲・体制は依頼のたびに引数で明示し、設定には書かない。schema は未知のキーを拒否するので、許可や予算のキーを書いた設定は検証で失敗する。lead と環境の ID はアカウントの lock から読む。秘密値は書かない。

| キー | 内容 |
| --- | --- |
| `$schema` | 任意のエディタ補助。CLI はこの URL を取得しない |
| `config_version` | `2` |
| `repository.url` | セッションにマウントする GitHub リポジトリの URL |
| `repository.mount_path` | セッション内のマウント先（例 `/workspace/widgets`） |
| `accounts.<name>.vault_id` | そのアカウントで GitHub MCP の資格情報を登録した vault の ID（vault は組織ごと）。未登録なら `null`。依頼に使うアカウントを全て書く |

設定は Git 対象外にする（`.shinaps/.gitignore` が `*` で始まる場合は追加の設定なしで除外される）。書き込む前に `git check-ignore --no-index -v .shinaps/managed.json` で除外を確認し、除外されていなければ既存の規則と共有例外を保ったまま `.shinaps/.gitignore` の末尾に `/managed.json` を加える（新規作成の内容は[作業記録の共通手順](../work-records.md)と同じ）。

### 検証

`shinaps-skills validate-managed-config <明示ファイル>` で検証する。ローカル開発では `node bin/skills.ts validate-managed-config <file>` を使える。CLI は指定された一つのJSONを同梱 schema で検証し、ネットワーク取得・設定の探索・Git 操作・入力の変更はしない。成功は構造が正しいことだけを表し、vault やアカウントの lock がクラウドに存在することは保証しない。

`config_version` が欠落または旧版なら作り直し、未来版なら skill と CLI を更新する。

### version 1 からの移行

version 1 は lock を作業先の `definitions`（既定 `.shinaps/managed/`）に置いていた。

1. 使っていた組織・workspace にアカウント名を決める。
2. `<definitions>/claude-lock.json` だけを `~/.local/share/shinaps-ai/skills/managed/<account>/definitions/claude-lock.json` へ移す（複数のリポジトリで同じ `definitions` を共有していた場合も1回でよい）。旧版の `agents/` などは移さない。移すと記録の無いファイルとして setup が止まる。
3. 設定を version 2 で作り直す。`definitions` を除き、`vault_id` を `accounts.<account>.vault_id` へ移す。
4. `managed setup --account <account>` で計画を確かめる（[導入](setup.md)）。lock を移し忘れると同名のリソースで止まる。旧版の定義を手で編集していた場合、その変更は持ち越されない。計画に、クラウド上の定義を同梱の定義へ戻す update が含まれることを確かめてから適用する。

### 設定例

```json
{
  "$schema": "https://cdn.jsdelivr.net/npm/@shinaps/skills@0.38.0/plugins/shinaps-claude/references/managed/configuration.schema.json",
  "config_version": 2,
  "repository": {
    "url": "https://github.com/acme/widgets",
    "mount_path": "/workspace/widgets"
  },
  "accounts": {
    "personal": { "vault_id": null },
    "work": { "vault_id": "vlt_011CZkZDLs7fYzm1hXNPeRjv" }
  }
}
```
