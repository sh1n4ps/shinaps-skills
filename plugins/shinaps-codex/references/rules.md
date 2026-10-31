# Shinaps規約の取得

Shinaps AIのMCPから規約を取得する手順。取得は呼出し元（メイン）だけが行い、担当へは全文を渡す。保存できる規約は必ず1応答に収まり、1応答は100件かつ32,000 bytes（MCPのcontent textのUTF-8）までに分かれるので、下の順に全件を辿る。

## 語彙を確認する

`list_search_facets` を呼び、`languages`・`platforms`・`frameworks`・`topics` の語彙と `versionTargets` を確かめる。以降で渡すslugと版のtargetは、この応答にあるものだけにする。語彙に無いfacetのslugはエラーにならず、結果が黙って変わる。

件数の確認でfacetを渡さないときは、この節と次の節を省く。

## 対象の技術を選ぶ

対象ファイルが確定した照合（`refine`・`review`）は、ファイルごとに `languages`・`platforms`・`frameworks` の各軸を「確定（slugの集合。空でもよい）」か「不明」に判定する。

**確定と言えるのは、そのファイルに当てはまる規約のその軸のlabelが、必ずその集合に入るときだけ。** サーバーは指定した軸のどれか1つでも不一致の規約を除くので、この条件が満たせない軸は不明にする。

- **framework**: 対象が動くパッケージのコードが実行時に使う技術の和にする（対象がライブラリなら利用側のパッケージも含める）。対象は呼出元の文脈でも動くので、直接importしない技術の規約も当てはまる。workspaceパッケージは公開入口まで辿り（再公開に注意する）、書かれないimportやフレームワークが内包する技術（JSX、Nextのreactなど）も含める。型だけのimportは辿らず、manifestにあるだけの依存は入れない。実行時の利用側を確認できないパッケージ（型だけのパッケージ、外部へ公開するライブラリ）は不明にする。
- **language**: TypeScriptとJavaScriptのコードは `typescript` と `javascript` の両方にする（片方のlabelの規約がもう片方にも当てはまる）。
- **platform**: 使うAPIではなく実行環境で判定する。配備先のentryから読み込まれるコードはそのslugにする。ブラウザだけで動くコードは空にする。
- **設定・生成物・スタイル**（`wrangler.jsonc`、`tsconfig.json`、migration、CSSなど）: 対象のパッケージのコードと同じ値にする。配備設定のplatformは配備先のslugにする。**文書**は全軸を空にする。
- **語彙外の技術**: 語彙のslugと同じ役割なら不明にする（Prisma、Kotlin、Android、Nodeのサーバー、フレームワークなしのサーバー実装、生SQLなど。類似のslugで置き換えない）。役割が重ならない補助ライブラリは数えない。
- 辿っていない・確かめられない軸は不明にする。

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

## 一覧を取る

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

`checks` を持つ規約がある照合では、渡す前に[規約の機械検査](lint.md)の「照合で使う」を行い、照合から外す組を決める。全文は取得した応答の単位で、続きのバッチとして渡す。1回の依頼に全件をまとめない。担当には読み終えた規約のidを報告させ、報告の無い範囲は同じ担当へ戻す。

## 照合結果に書くこと

- 渡した全てのfacet・`projectVersions`・`filterUserRulesByLabels`。サーバーが除外した規約のidは返らないので、除外の条件として残す。
- 全文の選択で除外した規約のidと理由、`notFoundIds`。
- 省略した軸・版と理由、未照合になった公式ルールの範囲。
- 取得・受渡し・読了のいずれかが終わらなかった規約のidまたは条件。これらは照合済みにしない。

この手順は判定の基準を示すが、規約の漏れが無いことの証明にはならない。「漏れなし」と報告しない。
