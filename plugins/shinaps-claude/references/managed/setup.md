# Managed 構成の導入と更新

共通の dev 構成（lead `shinaps-dev-managed-cc`、dev の7役割、skill `dev-managed-cc`、環境 `shinaps-dev`）を利用者の組織へ導入・更新する手順。既存の lock を使い、同じリソースを重複して作らない。セッションの作成・予定実行は行わない。dev の工程は [skill `dev-managed-cc`](../../managed-agents/skills/dev-managed-cc/SKILL.md) が持つので、ここでは扱わない。

## 前提

- `ant` 1.30 以上（`ant --version` で確認する。確認済みの版は 1.42.0）
- 利用者本人が `ant auth login` を済ませている。ログインは代行しない。`ant auth status` で組織とワークスペースを確認する。複数のワークスペースで使える資格情報では各コマンドに `--workspace-id` が必要になる。lock があれば `origin.workspace_id` と一致することを確かめる
- 作業先の `.shinaps/managed.json`（[設定](configuration.md)）

## 1. 設定を読む

`.shinaps/managed.json` を読み、CLI で検証する。無ければ、決まっていない項目を利用者に一問ずつ確認して作る。書き込む前に Git 対象外であることを確かめる（[設定](configuration.md#配置)）。`.shinaps/.gitignore` が無ければ[作業記録の共通手順](../work-records.md)のとおり `*` だけの内容で作る。既存の ignore が設定や `<definitions>` を除外していない場合は、既存の規則と共有例外を保ったまま、末尾に `/managed.json` と `<definitions>` の相対パス（既定は `/managed/`）の2行だけを加える。この追記は導入の依頼に含まれる操作として行い、別の承認を求めない。

## 2. 共通定義を配置する

このスキルを含む plugin の `managed-agents/`（SKILL.md から `../../managed-agents/`）にある `agents/`・`environments/`・`skills/` で、`<definitions>` の同名の3ディレクトリを丸ごと置き換える。この3ディレクトリはテンプレートの所有で、手で編集した内容は上書きされる。`<definitions>` には `claude-lock.json` 以外のファイルを置かない。適用はディレクトリ内の定義をすべて送信するため。

置き換える前に、既存の3ディレクトリとテンプレートを `diff -r` で比べる。テンプレートに無い変更（利用者が手で直した定義や追加したファイル）があれば、その一覧を示して残すか捨てるかを確かめてから置き換える。黙って失わせない。

以前の置き場所に lock があれば、`<definitions>/claude-lock.json` へ移してから進む。lock の扱いは[設定](configuration.md#lock-の扱い)に従う。

## 3. 安全上の注意を示す

適用の合意を求める前に、次を利用者へ示す。

- 環境のネットワークは制限しない（`unrestricted`）。bash と GitHub MCP の3ツール（`get_me`・`create_pull_request`・`pull_request_read`）は承認なし（`always_allow`）で動く。無人のセッションが承認待ちで止まらないようにするため。
- サンドボックスのコードは外部へデータを送れる。取得した内容に書かれた指示に従ってしまう危険（プロンプトインジェクション）がある。

## 4. 計画を確認する

```sh
(cd <definitions> && ant apply --dry-run .)
```

サブシェルで `<definitions>` に移動してから実行する。lock は実行した場所から上へ探され、キーは lock のディレクトリからの相対パスになるため。

- 出力の `Preview` 行が `./claude-lock.json`（`<definitions>` 直下）であることを確かめる。違えば止める。別の場所の lock を `--lock-file` で指定しない。キーの基準がずれて重複作成につながる。
- lock があれば、計画は定義を変えたリソースの update、テンプレートに新しく加わったリソースの create、それ以外の unchanged になる。lock にあってソースの無い項目は警告として残る。`--prune` は付けない。
- 次の場合は適用せずに止めて報告する: `This plan cannot be applied` が出る、意図しない環境の更新がある。
- create があれば、`ant beta:agents list --beta managed-agents-2026-04-01` と `ant beta:environments list --beta managed-agents-2026-04-01` で、アーカイブされていない同じ名前の lead・役割・環境が既にあるかを確かめる。あれば止める。アーカイブの状態を判定できなければ止める。
  - lock がある場合は、lock を変えずに状況を報告して利用者と相談する。
  - lock が無い場合は、lock を戻す方法を利用者と相談する。同じマシンで同じ組織に導入済みなら、その `<definitions>` を指すよう設定を直してやり直す。別のマシンでは[lock の扱い](configuration.md#lock-の扱い)に従い、バックアップや以前の置き場所から lock を戻し、無ければ相談する。

## 5. 適用する

利用者が dry-run の計画に合意してから実行する。

```sh
(cd <definitions> && ant apply .)
```

`ant apply` は計画を表示して承認を求める。確認した計画と同じ内容の適用を利用者が明示的に許可している場合は `--yes` を付けて、同じ範囲の承認を繰り返さない。計画が変わっていれば `--yes` を付けずに止める。`--prune`・`--force` は使わない。リソースを削除しない。

## 6. 結果を確かめる

- もう一度 dry-run を実行し、`Everything is up to date.` を確かめる。
- lock を適用前の複製と比べ、更新したリソースの `version`・`hash`・`remote_hash` 以外が変わっていないことを確かめる。変わっていれば報告する。
- 読み取りで確かめる場合は `ant beta:agents retrieve --agent-id <ID> --beta managed-agents-2026-04-01` と `ant beta:environments retrieve --environment-id <ID>` を使う。セッションは作らない。

## GitHub MCP の vault を準備する

lead の GitHub MCP（`https://api.githubcopilot.com/mcp`）は、セッション作成時に渡す vault の資格情報で認証する。vault はセッション作成時にしか渡せない。

1. Claude Console で vault を作る。
2. vault に MCP OAuth の資格情報を追加し、GitHub を選んで利用者本人がブラウザで承認する。資格情報の MCP サーバーの URL は lead 定義の `mcp_servers[].url` と同じ `https://api.githubcopilot.com/mcp` にする。URL で照合されるため、末尾のスラッシュの有無も揃える。
3. `ant beta:vaults list --beta managed-agents-2026-04-01` と `ant beta:vaults:credentials list --vault-id <vault の ID> --beta managed-agents-2026-04-01` で vault と資格情報を確かめる。
4. vault の ID を `.shinaps/managed.json` の `vault_id` に書く。

token をチャット・設定・作業記録に貼らない。資格情報の登録ができたことと、セッションで push・draft PR の作成が動くことは別に報告する。後者は[依頼の手順](execute.md#未検証の境界)の未検証の境界にあたる。

## 報告

作成・更新・変更なしのリソース、lock の差分、示した安全上の注意、確かめられなかった事項を報告する。作業記録は `.shinaps/work/` に置く。
