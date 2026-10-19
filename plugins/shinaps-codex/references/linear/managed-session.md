# Managedセッション

作業先の設定の `implementation_skill` が `dev-managed-cc` のときに、IssueごとのClaude Managed Agentsセッションへ実装・修正を依頼し、結果を受け取る手順。進行役は、linear-executeを実行している会話（ClaudeまたはCodex）である（[担当と工程](workflow.md)の「担当と窓口」）。

## 適用と前提

- 必要な許可は [configuration.md](configuration.md) の「許可」に従う。
- `ant auth login` とvaultの登録は人が行う。AIは認証情報の値を扱わない。
- 人への確認と待ち方は、runtimeごとのlinear-executeの手順に従う。
- `beta:` で始まる `ant` のコマンドには `--beta managed-agents-2026-04-01` を付ける（以下の例では省く）。

## 未完了の扱い

IDの取得から適用・展開までのどこかで、完了の条件（最後のメッセージが `状態: 完了`、`出力:` のファイルが揃い、patchとtarが「確認・適用・展開」の確認を通って適用できる）を満たさなかった場合は、すべて同じ扱いにする（例: IDの取得・アップロード・作成・予算の引き上げなど `ant` の失敗、`budget_reached` などでの停止やセッションの終了、状態行がない・`状態: 未完了`、ファイルが揃わない、範囲外の変更、確認や適用の失敗）。`状態: 質問` は「質問への応答」で扱う。

原因、`stop_reason`（あれば）、累計の費用（セッションがあれば、最新の `session.usage` のlist_cost）、leadの報告（あれば）を作業記録に残す。そのうえで、状況に合う選択肢を示して次の対応を一問だけ利用者に確認する（例: 予算の引き上げ額を示して再開、修正依頼、準備を整えて再開、新しいセッションで再開、中止）。

予算の引き上げに合意を得たら、`ant beta:sessions update --session-id <session> --budget '{type: limit, max_list_cost: {amount: "<セント>", currency: USD}}'` を実行し、user.messageで再開を伝える。ブロッカーを報告しただけでは完了にしない（[execution.md](execution.md) の「継続と待機」）。

## 作業ブランチと持ち込み

1. 進行役が、作業先の規約に従った名前で、合意した土台からブランチを切る。
2. 作業ツリーにHEADとの差（ignoreされていない未追跡ファイルを含む）があれば開始せず、利用者に一問で確認する。
3. `git bundle create <記録先>/<repo>.bundle <branch>` を作る。この時点の `git rev-parse HEAD` が比較元になる。記録先は進行役の作業記録のディレクトリとする。
4. 同じセッションを続けて使う間は、進行役による適用と展開を除き、ローカルのHEADと作業ツリーを変えない。変わった後の扱いは「QAと修正」に従う。

## IDの取得、アップロードと作成

一覧は `--max-items -1 --format jsonl` で全件を取り、jqで名前を照合する。

- lead: `ant beta:agents list` の `name` が `shinaps-<入口名>`（例 `shinaps-dev-managed-cc`）
- environment: `ant beta:environments list` の `name` が `shinaps-dev`
- vault: `ant beta:vaults list` の `display_name` が `shinaps-ai`

leadとenvironmentが一件に定まらなければ「未完了の扱い」に従う。vaultは一件に定まる場合だけ `--vault-id` で渡し、定まらなければ渡さずに「規約照合は未確認」と記録して進める。vaultはセッションの作成時にしか渡せない。

bundleと、`~/.claude/CLAUDE.md` があればそれも、`ant files upload --file <パス> --expires-in-seconds 604800 --transform id --raw-output` でアップロードし、返されたfile_idを記録する。

セッションは次のように作る。予算は許可の値（USD）の100倍を、セント単位の文字列で書く。CLAUDE.mdがなければ、resourcesはbundleの1つだけにする。

```sh
ant beta:sessions create --agent <lead> --environment-id <environment> [--vault-id <vault>] \
  --title "<IssueのID> <題名>" --transform id --raw-output <<'YAML'
budget: {type: limit, max_list_cost: {amount: "<セント>", currency: USD}}
resources:
  - {type: file, file_id: <bundleのfile_id>, mount_path: /<repo>.bundle}
  - {type: file, file_id: <CLAUDE.mdのfile_id>, mount_path: /CLAUDE.md}
initial_events:
  - type: user.message
    content:
      - type: text
        text: |
          <初回メッセージ>
YAML
```

作業記録には、Issue、session_id、入口、ブランチ、比較元、file_id、vaultの有無、予算を残す。

## 観測と判定

判定の境界の時刻tは、最後に送ったuser.messageの `processed_at` とする。

- 送信の結果に送ったeventのIDがあれば、`ant beta:sessions:events list --session-id <session> --type user.message --max-items -1 --format jsonl` からそのIDのeventを探し、`processed_at` が入った時点の値をtとする。
- IDがない場合（作成時を含む）は、送る前に `processed_at` の入ったuser.messageの件数Nを数えておき、送った後に `processed_at` の入ったuser.messageがN+1件になるまで待つ。そのうえで、それらの最新の `processed_at` をtとする（作成時はN=0）。

idle、`agent.message`、出力ファイルは、すべてtより後のものだけで判定する。

- 待ちを終える条件は、tより後の `session.status_idle` または `session.status_terminated` が現れること。`--type session.status_idle --type session.status_terminated --created-at-gt <t> --max-items 1` で取り、なければ待ち続ける。待つ時間の上限は設けない（費用の上限は予算が担う）。`session.status_terminated` なら「未完了の扱い」に従う。
- スレッド単位の `session.thread_status_idle` と、再試行中の `session.error` は判定に使わない。担当のスレッドはleadの作業中にも個別にidleになり、再試行中のerrorの後もセッションは続くため。

idleの `stop_reason.type` が `end_turn` なら、tより後の最新の `agent.message` の1行目で分ける。`end_turn` 以外なら「未完了の扱い」に従う。

- `状態: 完了` なら「取り出し」へ進む。
- `状態: 質問` なら「質問への応答」へ進む。
- それ以外は「未完了の扱い」に従う。

## 質問への応答

既存の合意で答えられる質問には、一問ずつ答えて「観測と判定」に戻る。仕様・権限を変える判断は人に確認してから答える。

```sh
ant beta:sessions:events send --session-id <session> --format json <<'YAML'
events:
  - type: user.message
    content:
      - type: text
        text: |
          <回答>
YAML
```

## 取り出し

1. `ant beta:files list --scope-id <session> --beta managed-agents-2026-04-01 --max-items -1 --format jsonl` から、`出力:` 行の各名前について、tより後に作られた最新の1件を選ぶ。`--beta` がないと `scope_id: unknown field` で拒否される。
2. 進行役の作業記録の、ラウンドごとのディレクトリへ `ant files download --file-id <file_id> -o <保存先>` で保存する。

一覧への表示が数秒遅れることがあるので、名前が揃わなければ最大30秒待って1回だけ読み直す。それでも揃わなければ「未完了の扱い」に従う。

## 確認・適用・展開

作業先のルートで、次の順に行う。

1. `tar -tvzf <作業記録のtar.gz>` の一覧で、全項目が作業記録の名前の形（`{YYYYMMDD-HHMMSS}-{slug}`）の一つのディレクトリの下にある普通のファイルかディレクトリで、`..` と絶対パスを含まないことを確かめる。そのディレクトリが `.shinaps/work/` に既にある場合は、同じセッションで前回展開したleadの記録のときだけ可とする。セッションから取得したtarを展開して、進行役や他の作業記録を上書きしないため。
2. `git apply --numstat <patch>` と `git apply --summary <patch>` で、変更されるパスとmodeをIssueの範囲と照合する。範囲の外があれば「未完了の扱い」に従う。
3. 今回のpatchが比較元に適用できることを、作業ツリーを変えずに確かめてから適用する。前回のpatchを外した後に今回が適用できないと、作業ツリーがどちらの状態でもなくなるため。
   - 確認: `idx=$(mktemp)` を実行し、`GIT_INDEX_FILE="$idx" git read-tree <比較元> && GIT_INDEX_FILE="$idx" git apply --cached --check <今回のpatch>` で確かめ、終わったら `rm -f "$idx"` を実行する。
   - 確認が通ったら、このセッションで前回適用したpatchがあれば `git apply -R <前回のpatch>` を実行し、続けて `git apply <今回のpatch>` を実行する。
   - 確認や適用が失敗したら、作業先をそのままにして「未完了の扱い」に従う。
4. `tar -xzf <作業記録のtar.gz> -C .shinaps/work` で展開し、leadの記録のディレクトリ名を作業記録に残す。
5. 検証コマンドは、この後に実行する。

## QAと修正

適用した時点を「差分と対象版の固定」とし、[codex-task.md](codex-task.md) の「待機・QA・修正」と同じように扱う。不合格なら修正を依頼する。

- 前回の適用の後に、進行役による適用と展開のほかに作業ツリーが変わっておらず、比較元の後にコミットもしていない場合は、下の修正依頼を同じセッションへ送り、「観測と判定」に戻る。
- コミットの後で、作業ツリーにHEADとの差（進行役が展開した作業記録を除く）がない場合は、同じセッションへ送らない。leadの差分と今の作業ツリーが合わなくなるため。「作業ブランチと持ち込み」の手順2から（ブランチはそのまま使う）、現在のHEADでbundleと比較元を作り直し、新しいセッションを作る。予算は許可の上限まで改めて設定する。初回メッセージの「タスク」には、不具合と前回までの経緯を書く（前回のleadの作業記録はbundleに含まれない）。
- それ以外（コミットされていない人の修正がある）は、新しいセッションを作らず「未完了の扱い」に従う（選択肢の例: 人がコミットしてから新しいセッションで再開、中止）。

## Managed固有の読み替えと記録

- [単位案からコミット完了まで](workflow.md#単位案からコミット完了まで)の手順2は、依頼を送らず、進行役が許可と記録の一致を確かめる手順として読む。手順3は、進行役が `commit` に従って行う。
- 各idleでの累計の費用と最終の費用を、作業記録とIssueの記録に残す。

## 初回メッセージと修正依頼

初回メッセージ:

```text
初期体制: <役割別人数・根拠・専任なしの責任者・必須検証。leadは現物と照合し、必要な増員を予算と許可内で行い報告する>
Linear進行の実装依頼として、skill dev-managed-cc の工程と起動手順に従ってください。
作業先: /mnt/session/uploads/<repo>.bundle をブランチ <branch> で /workspace/<repo> に用意する。比較元 <SHA>。
タスク: <Issueの識別子とリンク>。<範囲・受入条件・範囲外・仕様や調査成果物の本文。leadはLinearを読めない>。必要な検証: <references.validation に従うコマンド>。
設定: 保存方式 <shared|local>。正本 <作業先の .shinaps/linear.yaml。bundleに含まれるか>。読む補足 <references のうち工程に必要なもの>。正本や補足がbundleに含まれない場合（`local` など）は、その本文をこの欄に写す。
前提: <CLAUDE.mdを添付した場合だけ: 利用者共通方針は /mnt/session/uploads/CLAUDE.md>。規約照合: <vaultあり | vaultなし。取得できなければ未確認として進める>。許可範囲: devの入口の中の委託（dev_delegation）。コミット・push・PR作成・Issueの更新・ant apply はしない。仕様・権限の不明点は一問ずつ質問してターンを終える。通常の実装判断は任せる。
報告: 最終報告に、変更範囲、検証結果、dev内レビューの結果と未解決の指摘、起動方法、未解決事項、コミット単位案と単位ごとの予定差分（references/linear/workflow.md「単位案からコミット完了まで」の1）を含める。
```

修正依頼（同じセッションへのuser.message）:

```text
Local Agent QAで不合格。skill <入口> の工程で、修正依頼として Phase 1 から進める。前回の作業記録 .shinaps/work/<dir>/ を引き継ぎ資料とする。比較元 <SHA>。
不具合: <再現手順・期待と実際・対象差分・証拠>
```
