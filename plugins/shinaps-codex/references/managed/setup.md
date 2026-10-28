# Managed 構成の導入と更新

共通の dev 構成（lead `shinaps-dev-managed-cc`、dev の3役割、skill `dev-managed-cc`、環境 `shinaps-dev`）を、利用者の1つ以上のアカウントへ一コマンドで導入・更新する手順。既存の lock を使い、同じリソースを重複して作らない。セッションの作成・予定実行は行わない。dev の工程は [skill `dev-managed-cc`](../../managed-agents/skills/dev-managed-cc/SKILL.md) が持つので、ここでは扱わない。アカウント・キー・状態の置き場所は[設定とアカウント](configuration.md)に従う。

## 前提

- PATH 上の `ant` 2.4.0 以上（`ant --version`）と、利用中の skill と同じ版の `shinaps-skills`
- 導入する各アカウントの APIキー（[APIキー](configuration.md#apiキー)）。利用者が環境変数に設定する。キーをチャット・作業記録に貼らない

## 1. 安全上の注意を示す

適用の合意を求める前に、次を利用者へ示す。

- 環境のネットワークは制限しない（`unrestricted`）。bash と GitHub MCP の3ツール（`get_me`・`create_pull_request`・`pull_request_read`）は承認なし（`always_allow`）で動く。無人のセッションが承認待ちで止まらないようにするため。
- サンドボックスのコードは外部へデータを送れる。取得した内容に書かれた指示に従ってしまう危険（プロンプトインジェクション）がある。
- lead と3役割は Opus 5.5（`claude-opus-5-5` / medium / standard）で動く。費用はセッションごとに依頼時の予算で上限を付ける。

## 2. 計画を確認する

```sh
shinaps-skills managed setup --account <name> [--account <name> ...]
```

アカウントごとに順に、次を行う。どのアカウントのキーが欠けていても、何も変えずに止まる。

1. アカウントの `definitions/` の3ディレクトリを同梱の共通定義に揃える。書き換え・削除するのは setup が最後に書いた内容か今回書く内容と一致するファイルだけで、利用者の編集・追加や記録の無いファイルがあれば何も変えずに止まる。消えたファイルは書き直す（[アカウントの状態](configuration.md#アカウントの状態)）。lock は書き換えない。
2. lock が無ければ、`ant beta:agents list`・`ant beta:environments list` で同名の未アーカイブの lead・役割・環境を探し、あれば止める。以前の lock を戻してから再実行する（[lock の扱い](configuration.md#lock-の扱い)、[version 1 からの移行](configuration.md#version-1-からの移行)）。
3. `definitions/` で `ant apply --dry-run --lock-file claude-lock.json .` を実行して計画を表示する。`ant` は `--lock-file` が無いと lock を上のディレクトリへ探すので、祖先の lock で対応づけないよう `definitions/` 直下の lock を常に指定する。`--prune`・`--force` は使わない。
4. 計画に `This plan cannot be applied` があれば、そのアカウントを失敗にする（dry-run はこの場合も終了コード0で返る）。

失敗したアカウントがあれば一覧を示して終了コード1で終わる。他のアカウントの処理は続ける。

計画は、lock があれば定義を変えたリソースの update、テンプレートに新しく加わったリソースの create、それ以外の unchanged になる。lock にあってソースの無い項目は警告として残る。意図しない環境の更新があれば適用しない。

## 3. 適用する

利用者が計画に合意してから、同じアカウントで `--apply` を付けて実行する。

```sh
shinaps-skills managed setup --account <name> [--account <name> ...] --apply
```

計画を作り直し、上の止める条件を同じように確かめてから、変更のあるアカウントだけ `ant apply --yes --lock-file claude-lock.json .` を実行する。適用後にもう一度 dry-run し、`Everything is up to date.` でなければ失敗にする。リソースは削除しない。`--apply` は作り直した計画をそのまま適用し、途中で確認を挟まない。計画を確かめてから適用するまでの間に、CLI の版・同梱の定義・lock を変えない。適用時に表示された計画が合意した計画と違えば、利用者へ報告する。

## 4. 結果を確かめる

- 各アカウントの結果（`applied`・`up-to-date`・`planned`・`failed`）を確かめる。
- 読み取りで確かめる場合は、そのアカウントのキーを `ANTHROPIC_API_KEY` に入れて `ant beta:agents retrieve --agent-id <ID>`・`ant beta:environments retrieve --environment-id <ID>` を使う。セッションは作らない。

## GitHub MCP の vault を準備する

lead の GitHub MCP（`https://api.githubcopilot.com/mcp`）は、セッション作成時に渡す vault の資格情報で認証する。vault は組織ごとで、セッション作成時にしか渡せない。

1. そのアカウントの組織の Claude Console で vault を作る。
2. vault に MCP OAuth の資格情報を追加し、GitHub を選んで利用者本人がブラウザで承認する。資格情報の MCP サーバーの URL は lead 定義の `mcp_servers[].url` と同じ `https://api.githubcopilot.com/mcp` にする。URL で照合されるため、末尾のスラッシュの有無も揃える。
3. vault の ID を `.shinaps/managed.json` の `accounts.<name>.vault_id` に書く。

token をチャット・設定・作業記録に貼らない。資格情報の登録ができたことと、セッションで push・draft PR の作成が動くことは別に報告する。後者は[依頼の手順](execute.md#未検証の境界)の未検証の境界にあたる。

## 報告

アカウントごとの結果と計画の要点、示した安全上の注意、確かめられなかった事項を報告する。作業記録は `.shinaps/work/` に置く。
