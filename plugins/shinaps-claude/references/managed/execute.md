# Managed Agents への依頼と観測

作業先の設定を読み、Claude Managed Agents の lead `shinaps-dev-managed-cc` へ dev を依頼し、進み具合の観測・質問の取り次ぎ・成果物と draft PR の確認を行う手順。計画・実装・レビューの工程と体制は lead が [skill `dev-managed-cc`](../../managed-agents/skills/dev-managed-cc/SKILL.md) に従って決めるので、ここでは指示しない。

## 呼び出し時に合意する入力

設定からは読まず、依頼のたびに利用者と合意する。

- 必須: base ブランチとその SHA、head ブランチ、範囲と受入条件、許可（commit・head への push・draft PR の作成のうち明示されたもの）、予算（USD のセント単位）
- 任意: 必須検証のコマンド、コミットの author、利用者 CLAUDE.md の添付

設定から読むのは `definitions`（lock の場所）・`repository`・`vault_id` だけで、lead と環境の ID は lock から読む（[設定](configuration.md)）。許可と予算は合意した内容だけで、会話の途中で増やさない。

## 1. 前提を確かめる

- `.shinaps/managed.json` を CLI で検証する。
- `<definitions>/claude-lock.json` が無ければ止める。setup へ自動で進まない。
- `ant auth status` を確かめ、lock の `origin.workspace_id` と一致することを確かめる。複数のワークスペースで使える資格情報では各コマンドに `--workspace-id` を付ける。
- `vault_id` が `null` で、許可に draft PR の作成が含まれる場合は、セッションを作る前に止めて利用者に確認する。draft PR の作成を含まない依頼だけは続けられる。

## 2. セッションを作る

合意済みの依頼があるときだけ作る。この手順を読んだことを理由に作らない。

GitHub の token は対象リポジトリだけに限った fine-grained token にし、Contents と Pull requests の write だけを許可する。merge できるかは GitHub のブランチ保護で決まるので、base を保護しておく。token は `read -rs` で画面に出さずに受け取り、サンドボックス・作業記録・チャットに書かない。

次はひな形で、`<...>` を設定と合意した入力で埋める。`vault_id` が `null` なら `--vault-id` の行を除く。

```sh
LOCK=<definitions>/claude-lock.json
LEAD_ID=$(jq -r '.resources["./agents/shinaps-dev-managed-cc.md"].id' "$LOCK")
ENV_ID=$(jq -r '.resources["./environments/shinaps-dev.yaml"].id' "$LOCK")
read -rs GITHUB_TOKEN   # 画面に表示せずに入力する
ant beta:sessions create --beta managed-agents-2026-04-01 \
  --agent "$LEAD_ID" \
  --environment-id "$ENV_ID" \
  --vault-id <vault_id> \
  --title "<作業名>" <<YAML
budget: {type: limit, max_list_cost: {amount: "<セント単位の金額。4000 は 40 USD>", currency: USD}}
resources:
  - type: github_repository
    url: <repository.url>
    mount_path: <repository.mount_path>
    authorization_token: "$GITHUB_TOKEN"
    checkout: {type: commit, sha: <base の SHA>}
initial_events:
  - type: user.message
    content:
      - type: text
        text: |
          リポジトリ: <repository.url>（マウント先 <repository.mount_path>）
          base: <ブランチ> @ <SHA>
          head: <ブランチ名>
          範囲と受入条件: <内容>
          許可: <commit・headへのpush・draft PRの作成のうち許可するもの>
          予算: <金額>
          必須検証（任意）: <コマンド。省略時はリポジトリの規約に従う>
          author（任意）: <name> <email>
YAML
unset GITHUB_TOKEN
```

- `checkout` は base の SHA にする。比較元が必ずチェックアウトされ、head ブランチが無ければ lead がそこから作る。
- 利用者 CLAUDE.md を渡す場合は `ant files upload --file <パス>` で上げ、`resources` に `{type: file, file_id: <ID>, mount_path: /CLAUDE.md}` を加える（`/mnt/session/uploads/CLAUDE.md` に置かれる）。

## 3. 観測する

- `ant beta:sessions:events stream --session-id <ID> --beta managed-agents-2026-04-01` で進行を追う。途中から見る場合は `ant beta:sessions:events list --session-id <ID> --beta managed-agents-2026-04-01` を使う。
- セッションの状態は `ant beta:sessions retrieve --session-id <ID> --beta managed-agents-2026-04-01` で確かめる。
- lead のターンの最後の `agent.message` の1行目が `状態: 完了`・`状態: 質問`・`状態: 未完了` のどれかを読む。

## 4. 質問を取り次ぐ

- `状態: 質問` なら、質問を一問ずつ利用者へ伝える。
- 回答は `ant beta:sessions:events send` に、API の本文と同じ形の JSON を標準入力で渡して返す。`events` 配列に `user.message` を1件入れ、本文は `text` ブロックにする（[Send Events](https://platform.claude.com/docs/en/api/beta/sessions/events/send) の本文と同じ構造）。

  ```sh
  ant beta:sessions:events send --session-id <ID> --beta managed-agents-2026-04-01 <<'JSON'
  {
    "events": [
      {
        "type": "user.message",
        "content": [
          { "type": "text", "text": "<質問への回答>" }
        ]
      }
    ]
  }
  JSON
  ```

  同じ内容は `--event.type user.message --event.content '<content の JSON 配列>'` のフラグでも渡せる。回答の送信は、依頼が進行中のセッションに対してだけ行う。
- 回答で新しい許可・予算を加えない。必要なら新しい依頼として合意し直す。
- `user.tool_confirmation` は利用者の明示の指示なしに送らない。

## 5. 成果物を確かめる

確かめる対象は、lead の最終報告の `出力:`・`コミット:`・`PR:` の行にある成果物だけにする。許可に push や draft PR の作成を含めない依頼では、remote の head ブランチや PR は存在しないので、出力ファイルだけを確かめる。

- 出力ファイル（`changes.patch` と作業記録の tar）は、セッションに紐づく Files から取得する。`ant beta:files list --scope-id <セッションの ID> --beta managed-agents-2026-04-01` で一覧を取り、`ant beta:files download --file-id <ID> --beta managed-agents-2026-04-01 --output <保存先>` で保存する。保存したサイズを一覧の metadata と比べる。複数のワークスペースで使える資格情報では `--workspace-id` を付ける。
- `changes.patch` は作業先で `git apply --check` するか、合意した base の SHA に対して適用して、範囲と受入条件に対する差分を確かめる。
- `コミット:` と push 先がある場合は `git fetch origin <head>` で head ブランチを取得し、base の SHA からのコミットと差分を確かめる。
- `PR:` がある場合は `gh pr view <PR の URL> --json isDraft,baseRefName,headRefName` または GitHub MCP の読み取りで、draft であること・base と head が合意どおりであることを確かめる。
- `ant beta:sessions connect <セッションの ID> --web --no-browser` でも内容を閲覧できるが、この画面からはメッセージ送信やツールの承認もできるので、観測目的では操作しない。

## 6. 終了する

状態行、取得した出力ファイル、コミット、push 先、PR の URL、未検証の事項を報告する。merge・deploy・release・Issue の更新・セッションのアーカイブは行わない。QA は呼び出し元が別に行う。

## 未検証の境界

- マウントしたリポジトリの remote へ `git push` できるか（`authorization_token` が push に使われるか）。最初のセッションで最優先に確かめ、できなければ GitHub MCP の push 用ツール（`create_branch`・`push_files`）を有効にするかを利用者と相談する。
- commit をチェックアウトしてマウントした作業先から、origin の head ブランチを取得できるか（clone の深さと fetch の資格情報）。
- GitHub MCP で draft PR を作れるか。`draft: true` は lead への指示でしか担保されない。
- vault に資格情報を登録できたことは、上の3点の確認にならない。
- `events send` による回答の送信は、本文の構造を API 仕様で確かめただけで、実際のセッションではまだ送っていない。出力ファイルの一覧と取得は既存のセッションで確かめた。
