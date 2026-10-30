# Shinaps規約の取得

Shinaps AIのMCPから規約を取得する手順。取得は呼出し元（メイン）だけが行い、担当へは全文を渡す。保存できる規約は必ず1応答に収まり、1応答は100件かつ32,000 bytes（MCPのcontent textのUTF-8）までに分かれるので、下の手順で全件を辿る。

## 一覧を取る

`list_search_facets` で語彙と `versionTargets` を確認し、`search_rules` を `fields: "summary"` で呼ぶ。

- `repoOwner`・`repoName` は現在のGit workspaceから渡す。facetを1つも渡さないと公式ルールは返らない。
- `projectVersions` にはmanifest・lockfile・compiler config・deployment targetから確認できた版だけを渡す。確認できないときは省き、条件付きの公式ルールが除外されて共通ルールだけの照合になったことを結果に書く。
- `nextCursor` がnullになるまで、他の入力を変えず `cursor` に渡して続きを取得する。途中で止めた範囲は未取得として扱う。

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
