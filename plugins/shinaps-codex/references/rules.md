# Shinaps規約の取得

Shinaps AIのMCPから規約を取得する手順。取得は呼出し元（メイン）だけが行い、担当へは全文を渡す。保存できる規約は必ず1応答に収まり、1応答は100件かつ32,000 bytes（MCPのcontent textのUTF-8）までに分かれるので、下の手順で全件を辿る。

## 一覧を取る

`list_search_facets` で語彙と `versionTargets` を確認し、`search_rules` を `fields: "summary"` で呼ぶ。

- `repoOwner`・`repoName` は現在のGit workspaceから渡す。facetを1つも渡さないと公式ルールは返らない。
- `projectVersions` にはmanifest・lockfile・compiler config・deployment targetから確認できた版だけを渡す。確認できないときは省き、条件付きの公式ルールが除外されて共通ルールだけの照合になったことを結果に書く。
- `nextCursor` がnullになるまで、他の入力を変えず `cursor` に渡して続きを取得する。途中で止めた範囲は未取得として扱う。

## 個人規約を対象ファイルの技術で絞る

対象ファイルが確定した照合（`refine`・`review`）では、`search_rules` に `filterUserRulesByLabels: true` を渡し、対象の技術と明確に異なる個人規約を一覧から除く。それ以外（devの入口・`spec`・`explore`・`debug`、既存規約との重複の確認）では指定しない。対象ファイルの技術が増えたら取り直す。

```json
{ "fields": "summary", "repoOwner": "...", "repoName": "...", "languages": ["typescript"], "platforms": ["cloudflare-workers"], "frameworks": ["hono"], "filterUserRulesByLabels": true }
```

サーバーは同じ軸をOR、指定した軸の間をANDで判定する。未指定の軸、規約にlabelが無い軸、topic、未知・別軸・無効なslugを含む軸、無効なlabelしかない軸では除外しない。除外の判定に使う語彙は `list_search_facets` が返すものだけ。

- 渡すのは、対象が使う技術そのものか、その別名か、実際の依存・基盤として使うことを確認できたslugだけにする。確認には対象ファイルの内容・パスと、そのファイルが属するパッケージの設定（manifest・`wrangler.jsonc` など）を使う。manifestにあるだけの依存は、そのファイルで使うと確認できなければ渡さない。リポジトリ全体の技術を一つのファイルに流用しない。同じ役割や類似の技術のslugに置き換えない。
- 複数のファイルは全ファイルの技術の和を渡す。1ファイルでも不明な技術や語彙外の技術があり、確認できたslugでは表しきれない軸は省略する。8件を超える軸も省略する。Markdownや一般の設定ファイルのように技術を持たないファイルは不明に数えない。
- facetは公式ルールの検索と共有する。軸を省略すると、その軸で絞られなくなるので公式ルールの件数も増える。全ての軸を省略して `topics` も無ければ公式ルールは空なので、公式ルールは未照合と報告するか、`topics` を渡す。
- 件数で規約の登録の有無を判断するときは、この指定なしの結果を使う。
- サーバーが除外した規約のidは返らないので、照合結果には指定したfacetと `filterUserRulesByLabels: true` を書く。

## 全文を取る規約を選ぶ

一覧は全文を選ぶためのものであり、一覧だけで規約を満たした、または非該当と判断しない。

- 除外できるのは、labelの language・platform・framework が対象と明確に異なる規約だけ。その軸のlabelが無い規約は軸に依存しない規約として残す。slugの種類は `list_search_facets` で確かめる。
- titleとtopicでは除外しない。判断できない規約は全文を取得する。
- 除外した規約はidと理由を記録する。

## 全文を取る

選んだidを100件までに分けて `get_rules` へ渡す。

- `remainingIds` が空になるまで、そのまま `ids` に渡して続きを取得する。
- `notFoundIds` は削除済みまたは参照できない規約なので、idを記録して照合の対象から外す。
- 全件が必要と分かっているときは、`search_rules` の `fields: "full"` を `nextCursor` がnullになるまで辿ってもよい。
- `RATE_LIMITED` は短い時間を置いて、同じ `cursor` または `remainingIds` から再開する。

## 担当へ渡す

全文は取得した応答の単位で、続きのバッチとして渡す。1回の依頼に全件をまとめない。担当には読み終えた規約のidを報告させ、報告の無い範囲は同じ担当へ戻す。

取得・受渡し・読了のいずれかが終わらなかった規約は、idまたは条件を挙げて未照合と報告し、照合済みにしない。
