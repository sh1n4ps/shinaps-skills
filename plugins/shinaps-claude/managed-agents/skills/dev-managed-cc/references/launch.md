# 担当の起動（Claude Managed Agents）

[工程](workflow.md)の体制で選んだ担当を、この skill を使う lead のサブエージェントとして起動・継続し、作業先と出力を扱う手順。

## 委任と継続

1. 担当は lead に登録された定義済みエージェント（役割定義名。例 `shinaps-architect`）へ委任して起動する。model・effort・ツールは定義のまま使う。委任は1段だけで、担当は自分で委任しない。
2. 委任は `create_agent` に役割定義名（`agent_name`）と依頼（`task`）を渡して行う。担当番号は委任の前に固定し、返された `thread_id` と対応づけて保持する。同じ役割の複数担当は、同じ定義済みエージェントへ別々に委任する。スレッドごとに会話は共有されない。
3. 同じ担当の継続は、`send_to_agent` にその担当の `thread_id` と依頼（`message`）を渡して行う。
4. 並行する担当はまとめて委任し、全担当から空でない報告を受け取ったら完了とする。
5. 子スレッドは待機中を含めて同時に25本まで。上限で委任できなければ、完了した担当の結果を記録してから順番に委任し、人数を黙って減らさない。
6. 起動・再開できない、または完了しない担当は未完了として記録し、同じ役割へ既存の成果・最新の差分・未解決点を引き継いで交代し、記録する。交代もできなければ `状態: 未完了` で必要な判断を返す。他の手段やモデルへ切り替えず、lead がその独立確認を代わりに行わない。

## 委任の固定文言

役割定義は Claude Code 向けの記述を含むので、全ての依頼の冒頭に次を入れる。

> このセッションでは Shinaps AI の rule を取得しないので、役割定義にある rule の検索結果は渡されない。規約の全文はリポジトリの `AGENTS.md`・`CLAUDE.md` とその参照先である。役割定義の `~/.claude/CLAUDE.md` は `/mnt/session/uploads/CLAUDE.md` を指す（添付されていなければ無い）。役割定義の「メイン」は lead を指す。担当は commit・push・PR 作成・GitHub の操作をしない。

## 書き込みの制限と比較

- write・edit を持つのは lead だけ。担当も bash を持ち、全担当が同じファイルシステムを共有するので、次の比較で確かめる。
- 担当への依頼（`create_agent` と `send_to_agent` の両方）を出す前と、その依頼先の全員の報告を受け取った後に、lead は作業先のルートで次の出力を作業記録に保存して比べる。
  - `git rev-parse HEAD`
  - `git diff HEAD`
  - `git ls-files -o --exclude-standard -z | xargs -0 -r sha256sum`
- 違いがあれば、違ったファイル（HEAD が変わった場合はそのこと）と依頼先の担当を最終報告に含める。どの担当が変えたかは各スレッドの tool 呼び出しで確かめる。

## 作業先と作業記録

- 作業先は、セッション作成時に `github_repository` でマウントされた初回メッセージのマウント先（例 `/workspace/<repo>`）とする。マウントされていなければ `状態: 未完了` で返し、`github_repository` を付けたセッションを作り直す必要があると書く。マウントするリポジトリはセッションの間は変えられず、質問では解決しないため。
- 初回の準備（このセッションで最初に作業先を使うとき）だけ: 比較元は初回メッセージの base の SHA とする。作業先の `HEAD` がその SHA でなければ `状態: 未完了` で返し、`checkout: {type: commit, sha: <base の SHA>}` でセッションを作り直す必要があると書く。head ブランチが origin にあれば取得して切り替え、無ければ比較元から作る。比較元・checkout・head ブランチを作業記録に残す。
- 継続のターン（同じセッションで再開するとき）: 作業記録に残した比較元と head を使い、現在のブランチ・`HEAD`・作業ツリーの差分を確認してそこから続ける。再 clone・reset・比較元との再照合・head の作り直しはしない。存在確認やブランチ比較のための事前検証も足さない。
- コミットの前に、作業先のリポジトリ単位で `git config user.name`・`user.email` を設定する。値は初回メッセージの author、無ければ GitHub MCP の `get_me` の login と `<id>+<login>@users.noreply.github.com` を使う。設定できなければコミットせず、出力の patch を置いて `状態: 未完了` で返す。
- 依存は作業先の規約に従い、追跡ファイルを変えない方法で入れる（例 `npm ci`）。
- 作業記録は作業先の外の `/tmp/shinaps-work/<記録名>/` に置く。対象リポジトリの `.gitignore` は範囲に含まれない限り変えない。

## 出力

終了時（未完了で返す場合も含む）に、lead は次を置く。

- `/mnt/session/outputs/<記録名>.tar.gz`: 作業記録のディレクトリをまとめたもの
- `/mnt/session/outputs/changes.patch`: 作業先のルートで `cp .git/index /tmp/patch-index && GIT_INDEX_FILE=/tmp/patch-index git add -A && GIT_INDEX_FILE=/tmp/patch-index git diff --cached --binary <比較元> > /mnt/session/outputs/changes.patch` を実行したもの。作業先の index は変えない。常に比較元からの差分の全体とし、再開したターンでも置き換える

作業先が無い場合（マウントが無い、または初回の準備で `HEAD` が比較元と違うために未完了で返す場合）は `changes.patch` を作れないので、作業記録の tar だけを置き、`出力:` 行にはそのファイルだけを書く。

## 質問と状態行

質問は、実行中の担当が無い時点で書いてターンを終え、次の利用者メッセージで回答を受けて再開する。ターンを終える最後のメッセージは、1行目を `状態: 完了`・`状態: 質問`・`状態: 未完了` のいずれかにする。完了・未完了では続けて次の3行を書き、その後に SKILL.md の最終報告を書く。

```text
出力: <そのターンに置いたファイル名をカンマ区切り>
コミット: <作ったコミットの SHA をカンマ区切り。無ければ なし>
PR: <draft PR の URL。無ければ なし>
```

## GitHub の認証

- push に使えるのはマウント時の `github_repository.authorization_token` だけで、GitHub MCP に使えるのはセッション作成時に渡された vault の資格情報だけとする。
- token をサンドボックスのファイル・環境変数・git の設定に書かない。作業記録と報告にも値を残さない。
- push や PR 作成が拒否されたら、別の資格情報や経路を試さず、patch を置いて `状態: 未完了` で返す。
- PR は `create_pull_request` に `draft: true` を付けて作り、`pull_request_read` で draft であることを確かめる。

## Claude Code 固有の手段の置き換え

| Claude Code | Managed Agents |
|---|---|
| `AskUserQuestion` | `状態: 質問` でターンを終える |
| `TaskCreate`・`TaskUpdate` | 応答本文と作業記録で示す |
| `Skill` による `commit`・`create-pr` | git と GitHub MCP の `create_pull_request`（draft）で行う |
| hooks | 未対応 |
| permission mode | 定義の `permission_policy` で固定 |
| セッション予算 | セッション作成時の `max_list_cost` で付ける |
