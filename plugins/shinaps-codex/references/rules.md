# Shinaps規約の取得

Shinaps AIのMCPから規約を取得する手順。取得は呼出し元（メイン）だけが行い、担当はMCPを呼ばない。対象ファイルが確定した規約照合の担当には、[照合のために取得する](#照合のために取得する)で保存した同じ snapshot を読ませる。保存できる規約は必ず1応答に収まり、1応答は100件かつ32,000 bytes（MCPのcontent textのUTF-8）までに分かれるので、下の順に全件を辿る。

## 語彙を確認する

`list_search_facets` を呼び、`languages`・`platforms`・`frameworks`・`topics` の語彙と `versionTargets` を確かめる。以降で渡すslugと版のtargetは、この応答にあるものだけにする。語彙に無いfacetのslugはエラーにならず、結果が黙って変わる。

件数の確認でfacetを渡さないときは、この節と次の節を省く。

## 対象の技術を選ぶ

対象ファイルが確定した照合（`review`）は、対象全体を規約と広く照らすので `kind` で絞らない（絞ると見落としが増える）。ファイルごとに `languages`・`platforms`・`frameworks` の各軸を「確定（slugの集合。空でもよい）」か「不明」に判定する。

**確定と言えるのは、そのファイルに当てはまる規約のその軸のlabelが、必ずその集合に入るときだけ。** サーバーは指定した軸のどれか1つでも不一致の規約を除くので、この条件が満たせない軸は不明にする。

- **framework**: 対象が動くパッケージのコードが実行時に使う技術の和にする（対象がライブラリなら利用側のパッケージも含める）。対象は呼出元の文脈でも動くので、直接importしない技術の規約も当てはまる。workspaceパッケージは公開入口まで辿り（再公開に注意する）、書かれないimportやフレームワークが内包する技術（JSX、Nextのreactなど）も含める。型だけのimportは辿らず、manifestにあるだけの依存は入れない。実行時の利用側を確認できないパッケージ（型だけのパッケージ、外部へ公開するライブラリ）は不明にする。
- **language**: TypeScriptとJavaScriptのコードは `typescript` と `javascript` の両方にする（片方のlabelの規約がもう片方にも当てはまる）。
- **platform**: 使うAPIではなく実行環境で判定する。配備先のentryから読み込まれるコードはそのslugにする。ブラウザだけで動くコードは空にする。
- **設定・生成物・スタイル**（`wrangler.jsonc`、`tsconfig.json`、migration、CSSなど）: 対象のパッケージのコードと同じ値にする。配備設定のplatformは配備先のslugにする。**文書**は全軸を空にする。
- **語彙外の技術**: 語彙のslugと同じ役割なら不明にする（Prisma、Kotlin、Android、Nodeのサーバー、フレームワークなしのサーバー実装、生SQLなど。類似のslugで置き換えない）。役割が重ならない補助ライブラリは数えない。
- 辿っていない・確かめられない軸は不明にする。

**領域**: 技術や実装慣習が違う領域（Web・APIなど）が複数あるときは、領域ごとにこの判定と合成を行い、取得も領域ごとに行う。共通の規約は、label の無い軸が不一致にならないので全領域に入る。

**合成**: 全ファイルが確定で、和が1〜8件の軸だけを検索に渡す。不明なファイルがある軸と9件以上の軸は省略する。和が空の軸は検索で表せないので、全文の選択で使う。

対象が確定していない工程（devの入口・`spec`・`explore`・`debug`）は、論点の技術を語彙から推定してよい。`filterUserRulesByLabels` は指定しない。

## リポジトリを特定する

`scope: repo` の規約はGitHubのrepositoryの`id`で識別し、owner・名前は表示にだけ使う。名前は改名で変わり、旧名は別のrepositoryやforkが使えるので、名前の一致を同じrepositoryの根拠にしない。

1. 対象のownerと名前を決める。既定は現在のGit workspaceの `git remote get-url origin`（`github.com/<owner>/<repo>(.git)?` の形）。登録先が別のrepositoryなら、その値にする。この形に当たらなければ（GitHub以外のremoteなど）、`repoOwner`・`repoName`・`repoId` のどれも渡さない。
2. `gh api repos/<owner>/<repo> --jq '{id, full_name}'` を1回呼ぶ。改名前の名前でもGitHubは改名後のrepositoryを返すので、`id` を `repoId`、`full_name` の `/` の前後を `repoOwner`・`repoName` にする。
3. 呼出しが失敗したら（`gh` が無い、認証が無い、404など。理由は区別しない）、`repoId`・`repoName` は渡さない。1で決めたownerだけを `repoOwner` にする。

- **取得**: `search_rules` には `repoOwner` と `repoId` を渡し、`repoName` は渡さない（入力エラーになる）。`repoId` が無いときは `scope: repo` の規約が返らないので、「リポジトリを特定できず、このrepositoryの規約は取得していない」と1文で報告する。
- **新規の書込み**: `scope: repo` の `record_rule`・`record_rules` には `repoOwner`・`repoName`・`repoId` をそろえて渡す。
- **更新**: `update_rule` で `scope: "repo"` と3つをそろえて渡すのは、適用先を repo にするとき、別のrepositoryに変えるとき、表示名を現在の名前にするとき（2の `full_name` が規約の `repoOwner`・`repoName` と違うとき）だけ。内容だけの更新では適用先の項目を渡さない（`scope` なしで渡すと入力エラーになる）。
- **`repoId` が得られないとき**: `scope: repo` では書き込まず、`scope: user`・`scope: repo_owner` に変えるか中止するかを利用者に確認する。範囲を変えるときは、[Shinaps規約の書き方](rule-writing.md)の比較をやり直す。

## 照合のために取得する

対象ファイルが確定した照合の手順。応答をモデルが書き写すと本文や `checks` が欠けうるので、plugin の hook（PostToolUse）が応答をそのまま `<Gitのルート>/.shinaps/work/rule-captures/` へ保存し、そこから `shinaps-skills rule-snapshot` が担当と機械検査の読むファイルを作る。保存先はGit管理の外のローカルで、サーバーへは送らない。

1. 取得の前の時刻を `date +%s000` で記録する。
2. 領域ごとに入力を作業記録の下（例: `rules/<領域>/input.json`）へ書く。「一覧を取る」と同じ条件で、`fields` だけ `"full"` にする。
3. その入力のまま `search_rules` を呼び、`nextCursor` がnullになるまで `cursor` だけ足して続ける。モデルに見える応答は切り詰められることがあるが、続きの `nextCursor` だけ読めばよい。`RATE_LIMITED` は短い時間を置いて同じ `cursor` から再開する。
4. 領域ごとに実行する。版の違いで入力を分けたときは `--input` を並べ、idの和にする。

   ```sh
   shinaps-skills rule-snapshot --since <時刻> --input <input.json> [--exclude-label <slug>] --out <作業記録>/rules/<領域>
   ```

   取得と同じGitのルートで実行する（別の場所なら `--captures <dir>` で保存先を渡す）。`rule-snapshot` が無いときは、利用中のスキルと同じ版のCLIを導入する。`--exclude-label` には、「全文を取る規約を選ぶ」の除外の条件に当たる軸のlabelだけを渡す（CLIはこの条件を判定しない）。除外した規約はidと理由が `manifest.json` に残る。

出力は `manifest.json`（`contentHash`、入力、`ruleIds`、除外、partのhash）、`parts/part-NNN.json`（全文）、`lint-checks.json`（全文の `checks` そのまま）。

**失敗したとき**: 欠けたcursorや「捕捉が無い」というエラーで非0終了し、snapshotを作らない。`--since` より前の捕捉は使わない。hookの未信頼・無効、途中で止まった取得がこの形で現れる。Codexでは更新のたびに `/hooks` で信頼し直す必要があり、未信頼でも `exec` は何も表示しない。原因を直して取り直す。直せなければ、その領域の規約照合を未完了として報告し、全文の書き写しで代えない。

## 一覧を取る

対象が確定していない工程と書込みの前の比較では、この節から「全文を取る」までの手順で取得する。照合の条件の決め方もこの節の規則を使う。

`search_rules` を `fields: "summary"` で呼ぶ。`repoOwner`・`repoId` は「リポジトリを特定する」で決めた値を渡す。対象が確定した照合では `filterUserRulesByLabels: true` を渡す。

```json
{ "fields": "summary", "repoOwner": "...", "repoId": 123456789, "languages": ["typescript", "javascript"], "platforms": ["cloudflare-workers"], "frameworks": ["hono"], "filterUserRulesByLabels": true }
```

- サーバーは同じ軸をOR、指定した軸の間をANDで判定する。
- `nextCursor` がnullになるまで、他の入力を変えず `cursor` に渡す。途中で止めた範囲は未取得として扱う。
- **渡せる軸が無いと公式ルールは0件で返り、照合したことにならない。** 不明なファイルを除いて選び直し、`filterUserRulesByLabels` なしで取得する（個人規約は全件返る）。除いたファイルの公式ルールは未照合になる。それでも渡せる軸が無ければ、全ての公式ルールが未照合になる。`topics` は一致必須なので、渡すと部分的な照合になる。
- **版**: 対象が使う技術のうち `versionTargets` にあるものは、lockfile・compiler config・deployment target、または完全固定のmanifestで確定した版を `projectVersions` に渡す（`^19` のような範囲は渡さない）。渡していないtargetの条件付き公式ルールは全て除外される。同じtargetで対象ごとに版が違うなら、対象を分けて取得してidの和を取る。`VERSION_TARGET_NOT_FOUND` は全体の失敗なので、targetを直して先頭から取り直す。
- 対象ファイルの技術が増えたら取り直す。件数で規約の登録の有無を判断するときは、`filterUserRulesByLabels` なしの結果を使う。既存規約との重複は「書き込む前に取得する」で確かめる。

## 全文を取る規約を選ぶ

一覧は全文を選ぶためのものであり、一覧だけで規約を満たした、または非該当と判断しない。

- 除外できるのは、全ファイルが確定で和が空の軸にlabelを持つ規約だけ（ブラウザだけで動くコードと `cloudflare-workers` など）。labelの軸は `list_search_facets` で確かめる。
- titleとtopicでは除外しない。
- 除外した規約はidと理由を記録する。

## 全文を取る

選んだidを100件までに分けて `get_rules` へ渡す。

- `remainingIds` が空になるまで、そのまま `ids` に渡して続きを取得してから、次のidへ進む。1応答の大きさの上限があるので、100件より少なく返ることが多い。
- `notFoundIds` は削除済みまたは参照できない規約なので、idを記録して照合の対象から外す。
- 全件が必要と分かっているときは、`search_rules` の `fields: "full"` を `nextCursor` がnullになるまで辿ってもよい。
- `RATE_LIMITED` は短い時間を置いて、同じ `cursor` または `remainingIds` から再開する。

## 書き込む前に取得する

[Shinaps規約の書き方](rule-writing.md)の比較に使う規約は、次の条件で取得する。

- `search_rules` は `fields: "summary"` で全ページ取得し、`filterUserRulesByLabels` と `kind` を渡さない。`repoOwner`・`repoId` は「リポジトリを特定する」で決めた値にする。
- 公式規約も一覧に載るよう、`list_search_facets` の語彙が8件以内の技術軸（`languages` など）を一つ選び、その全slugを渡す。技術軸はその軸のlabelが無い公式規約にも一致する。`topics` は一致必須で別のtopicの公式規約が返らなくなるので渡さない。渡せる軸が無ければ公式規約の取得は未完了とする。
- `projectVersions` には確定した版だけを渡す。渡しても渡さなくても、条件に合わない条件付きの公式規約は返らない。
- 一覧のtitleとlabelから同じ場面を扱う可能性を否定できない規約を選び、「全文を取る」で全文を取得する。文字列の一致で選ばない（公式規約のtitleは英語）。「全文を取る規約を選ぶ」は対象ファイルとの照合の基準で、ここには適用しない。
- 同じ条件の結果は、規約を書き込むまでの間、候補の間で再利用してよい。他の工程で `filterUserRulesByLabels`・`kind`・`topics` を使って絞った結果は使わない。

選んだ条件の一覧と選んだ全文を読み終えていなければ未完了とする。他のリポジトリ・ownerの個人規約と版の条件で除かれた公式規約は検索で返らない範囲で、未完了に数えずに報告する。どちらの場合も「全体に重複が無い」とは言わない。

## 担当へ渡す

対象ファイルが確定した照合の担当へは、全文を依頼文に書き写さず、snapshot のファイルを読ませる。渡す前に[規約の機械検査](lint.md)の「照合で使う」を行う。依頼文には次を書く（全領域を見る担当には領域ごとに）。

> 規約は `<manifest.json>` の `parts` の全ファイルを読む（MCPは呼ばない）。切り詰めの表示が出たら行範囲を指定して読み直す。対象の版は `<版>`、対象ファイルは `<対象ファイルの一覧>`。機械検査の結果は `<lint-result.json>` にある。報告の末尾に次のJSONを付ける。`completedFiles` には全文の照合を終えたファイルだけを書く（`path` は対象ファイルと同じ基準のパス）。読めなかった規約は `unchecked` に、途中までのファイルは `incompleteFiles` に理由を付けて入れる。
>
> ```json
> [{ "contentHash": "<manifestの値>", "targetVersion": "<版>", "completedFiles": ["..."], "unchecked": [{ "id": "...", "reason": "..." }], "incompleteFiles": [{ "path": "...", "reason": "..." }] }]
> ```

担当の報告を受けたら、末尾のJSONをファイルに保存し、manifest ごとに、領域の全担当の報告を `--report` に並べて実行する。

```sh
shinaps-skills rule-coverage --manifest <manifest.json> --target-version <版> [--lint <lint-result.json>] [--report <report.json> ...] --out <coverage.json> -- <対象ファイル...>
```

組は `machine`（機械検査で確定）・`reported`（この snapshot と版の報告がそのファイルを `completedFiles` に挙げ、その規約を未照合としていない担当の申告）・`unconfirmed`（それ以外。報告に書かれていないファイルを含む）のどれか一つに入る。機械が保証するのは同じ snapshot と、id・保存データ・対象の版の整合までで、読了と理解は担当の申告である。snapshot が変わったときは `rule-snapshot` から、lint の結果が別の snapshot のもの、lint の後にファイルが変わった、対象が lint の対象に無いときは lint からやり直す。領域内のファイルを担当に分けて渡すときも、対象ファイル全体と全担当の報告で実行する（誰も照合しなかったファイルは `unconfirmed` に残る）。

修正の後は固定版を更新し、機械検査を対象全体でやり直す。規約を取り直して `contentHash` が変わった領域は、AIの照合もやり直す。AIの照合の範囲は呼び出す入口の手順に従う。

独立設計・計画レビューの担当へは、これまでどおり全文を応答の単位で渡す（照合の完了の判定には使わない）。

## 適用結果を記録する

全指摘の採否が確定したら、規約の改善の材料として確定した結果を `report_rule_outcomes` で既定で記録する。記録は照合の結果を変えない。

- **OFF**: 依頼に「規約の適用結果を記録しない」があれば、依頼を受けた時点で `rule-outcomes.json` に `"off": true` を書く。送信の前に必ずこのファイルを読み、`off` が true なら送らない（後の修正サイクルの依頼にOFFの語が無くても同じ）。
- **作業記録**: 作業記録の下の `rule-outcomes.json` に `{ "reportKey": "...", "off": false }` を書く。key は最初の送信の前に `node -p "Date.now() + '-' + crypto.randomUUID()"` で作る。同じ作業の修正サイクルと再送は同じ値を使う。単独の `review` から開発の担当へ修正を渡すときは、この2つも渡す。
- **送るもの**: 規約のidを根拠に持つ指摘だけを、`violation`（採用した規約違反）・`improvement`（採用した改善）・`false_positive`（事実で反証して退けた）・`accepted_as_is`（妥当だが現状を許容した）へ対応づけ、100件ずつ送る。機械検査の `covered` と、指摘の無かった規約は送らない。コード・差分・会話・ファイル名・repositoryは送らない（入力に項目が無い）。
- **失敗**: `RATE_LIMITED` は短い時間を置いて同じ内容で最大2回まで送り直す。それ以外は送り直さない。`RULE_OUTCOME_LIMIT_REACHED` は同じ呼出しの新規を1件も記録しない。`REPORT_KEY_EXPIRED` では新しいkeyを作らない（同じ作業を二重に数える）。読取り専用のsandboxなどで承認が得られないときも失敗として扱う。どの場合も作業は止めず、未記録の規約のidと理由を報告する。
- **報告**: 記録した件数・重複の件数・`notFoundIds`・未記録の範囲を書く。OFFならOFFと書く。集計は `get_rule` の `outcomes` で本人の分だけを見られ、直近90日で削除される。

## 照合結果に書くこと

- `manifest.json` のパスと `contentHash`。渡した全てのfacet・`projectVersions`・`filterUserRulesByLabels`。サーバーが除外した規約のidは返らないので、除外の条件として残す。
- 除外した規約のidと理由。`get_rules` を使ったときは `notFoundIds`。
- `rule-coverage` の状態ごとの組の数と、`unconfirmed` の規約・ファイルと理由。`reported` を照合の証明として書かない。
- 省略した軸・版と理由、未照合になった公式ルールの範囲。
- 取得・受渡し・読了のいずれかが終わらなかった規約のidまたは条件。これらは照合済みにしない。

この手順は判定の基準を示すが、規約の漏れが無いことの証明にはならない。「漏れなし」と報告しない。
