# Managed Agents への依頼と観測

Claude Managed Agents の lead `shinaps-dev-managed-cc` へ dev を依頼し、進み具合の観測・質問の取り次ぎ・出力の回収と draft PR の確認を行う手順。体制は合意する入力として渡す。計画・実装・レビューの工程と追加の担当は lead が [skill `dev-managed-cc`](../../managed-agents/skills/dev-managed-cc/SKILL.md) に従って決めるので、ここでは指示しない。アカウント・キー・状態の置き場所は[設定とアカウント](configuration.md)に従う。

## 呼び出し時に合意する入力

設定・記録・過去の作業からは推定せず、依頼のたびに利用者と合意して引数で明示する。

- 必須: アカウント、base ブランチとその SHA、head ブランチ、範囲と受入条件（ファイル）、体制（LITE・BASIC・ULTRA。[体制の選択](../dev/staffing.md)に従い推奨を添えて確認する）、許可（`none`、または `commit`・`push`・`draft_pr` のうち明示されたもの）、予算（USD のセント単位）
- 任意: 必須検証のコマンド、コミットの author、セッションの題名、利用者 CLAUDE.md の添付

設定（`.shinaps/managed.json`）から読むのは `repository` とそのアカウントの `vault_id` だけで、lead と環境の ID はアカウントの lock から読む。許可と予算は合意した内容だけで、会話の途中で増やさない。

## 1. 設定を用意する

`.shinaps/managed.json` が無い、または version 1 なら、`repository`（URL とマウント先）と、使うアカウントの `vault_id` を利用者に一問ずつ確認して version 2 で作る（[作業先の設定](configuration.md#作業先の設定shinapsmanagedjson)。version 1 は[移行](configuration.md#version-1-からの移行)のとおり lock も移す）。書き込む前に Git 対象外であることを確かめる。作った設定は `shinaps-skills validate-managed-config` で検証する。

## 2. 依頼する

合意済みの依頼があるときだけ作る。この手順を読んだことを理由に作らない。

GitHub の token は対象リポジトリだけに限った fine-grained token にし、Contents と Pull requests の write だけを許可する。merge できるかは GitHub のブランチ保護で決まるので、base を保護しておく。token は利用者が環境変数 `SHINAPS_MANAGED_GITHUB_TOKEN` に設定する（例 `read -rs SHINAPS_MANAGED_GITHUB_TOKEN && export SHINAPS_MANAGED_GITHUB_TOKEN`）。CLI はリクエスト本文（stdin）にだけ入れ、保存・表示しない。

```sh
shinaps-skills managed run .shinaps/managed.json --account <name> \
  --base <branch> --base-sha <SHA> --head <branch> \
  --staffing <LITE|BASIC|ULTRA> --allow <none|commit,push,draft_pr> \
  --budget-cents <セント。4000 は 40 USD> --task-file <範囲と受入条件のファイル> \
  [--verify "<コマンド>"] [--author "<name> <email>"] [--title "<作業名>"] [--claude-md <パス>]
```

- 設定と引数を検証し、セッションを作る前に次で止まる: `draft_pr` を許可したのにそのアカウントの `vault_id` が `null`、`push` か `draft_pr` を許可したのに token が無い。どちらもセッションを作ってから lead が気づくと予算を消費した後になるため。
- セッションは lock の lead と環境、そのアカウントの vault、`max_list_cost` の予算、base の SHA をチェックアウトしたリポジトリで作る。head ブランチが無ければ lead が base から作る。初回メッセージにはリポジトリ・base と SHA・head・範囲と受入条件・体制・許可・予算・任意の入力を全て書く。
- `--claude-md` は `ant beta:files upload` で上げ、`/mnt/session/uploads/CLAUDE.md` に置く。
- 同じ入力（設定のリポジトリと vault、引数、範囲と CLAUDE.md の本文）の再実行は新しいセッションを作らず、記録したセッションの ID を返す。完了後に同じ範囲で新しく依頼するときは、題名など入力を変える。作成の途中で止まった記録が残っていれば作らずに止まる。表示された metadata `shinaps_request` のセッションがコンソールに無いことを確かめてから、表示された記録を消して再実行する。

## 3. 観測する

```sh
shinaps-skills managed status --account <name> --session <ID>
```

セッションの `status`・`usage`（`list_cost` を含む）・`budget` と、lead の最後の `agent.message` の本文と1行目の状態（`完了`・`質問`・`未完了`）を JSON で表示する。扱うのは、そのアカウントで `managed run` が作った記録のあるセッションだけである。

## 4. 質問を取り次ぐ

- 状態が `質問` なら、質問を一問ずつ利用者へ伝える。
- 回答はファイルに書き、`user.message` として送る。

  ```sh
  shinaps-skills managed reply --account <name> --session <ID> --message-file <回答のファイル>
  ```

- 回答の送信は、依頼が進行中のセッションに対してだけ行う。回答で新しい許可・予算を加えない。必要なら新しい依頼として合意し直す。
- `user.tool_confirmation` は送らない。

## 5. 出力を回収して確かめる

確かめる対象は、lead の最終報告の `出力:`・`コミット:`・`PR:` の行にある成果物だけにする。許可に push や draft PR の作成を含めない依頼では、remote の head ブランチや PR は存在しないので、出力ファイルだけを確かめる。

```sh
shinaps-skills managed collect --account <name> --session <ID>
```

- セッションに紐づく Files（`changes.patch` と作業記録の tar）を、そのアカウントの `sessions/<ID>/outputs/` へ保存し、保存したパスを表示する。同じ名前のファイルは最新のものだけを保存する（lead は毎ターン `changes.patch` を比較元からの全体の差分で置き換える）。名前がファイル名だけでないものは保存せずに止まる。保存したサイズは一覧の値と比べる。
- CLI は差分を適用しない。ローカルの CLI は git を呼ばず、自分では push しない。push と draft PR の作成は、許可した場合にセッション内の lead が行う。`changes.patch` は合意した base の SHA のチェックアウトで `git apply --check` してから、範囲と受入条件に対する差分を確かめる。適用するかは利用者と決める。
- `コミット:` と push 先がある場合は `git fetch origin <head>` で head ブランチを取得し、base の SHA からのコミットと差分を確かめる。
- `PR:` がある場合は `gh pr view <PR の URL> --json isDraft,baseRefName,headRefName` または GitHub MCP の読み取りで、draft であること・base と head が合意どおりであることを確かめる。

## 6. 終了する

状態行、回収した出力ファイル、コミット、push 先、PR の URL、未検証の事項を報告する。merge・deploy・release・Issue の更新・セッションのアーカイブは行わない。QA は呼び出し元が別に行う。完了後に修正する場合は、新しい依頼として、体制を含めて合意し直す。

## 未検証の境界

- `managed setup`・`run`・`status`・`reply`・`collect` のコマンド・フラグ・stdin の本文・出力の形は ant 2.4.0 の公式ソースで照合し、偽の `ant` を使うテストで確かめた。実際の `ant` とクラウドではまだ実行していない。
- API の側で決まり、ant のソースでは確かめられないこと: 予算 `max_list_cost.amount` がセント単位か、`mount_path: /CLAUDE.md` が `/mnt/session/uploads/CLAUDE.md` に置かれるか、Files の upload・一覧・取得に `files-api-2025-04-14` と `managed-agents-2026-04-01` の両方の beta を付ければよいか（ant の `--beta` は既定の beta を置き換えるので、全ての呼び出しで明示している）、Files の応答の `filename`・`size_bytes`・`created_at`、events の一覧に役割のスレッドの `agent.message` が混ざるか。lock が無い状態での skill の重複は、同じ setup で作る lead の同名確認で止まる。
- マウントしたリポジトリの remote へ `git push` できるか（`authorization_token` が push に使われるか）。最初のセッションで最優先に確かめ、できなければ GitHub MCP の push 用ツール（`create_branch`・`push_files`）を有効にするかを利用者と相談する。
- commit をチェックアウトしてマウントした作業先から、origin の head ブランチを取得できるか（clone の深さと fetch の資格情報）。
- GitHub MCP で draft PR を作れるか。`draft: true` は lead への指示でしか担保されない。
- vault に資格情報を登録できたことは、上の3点の確認にならない。
- 完了したスレッドが同時実行の枠（25本）を空けるか。ULTRAでは、ラウンドごとに新しく起動する担当を含めて、同時に保つスレッドが多い。
