---
name: dev-mixed
description: 比較実行用。shinaps:dev の工程を Claude（Opus / medium）と Codex（gpt-6-astra / medium）の混成の担当で実行する（P1）。この入口と比較条件ファイルを明示した依頼（利用者本人、または利用者が委託した依頼元からの AI Terminal Bridge の依頼）でだけ使う。通常の開発には shinaps:dev を使う。
argument-hint: <比較条件ファイル>
---

# 比較用 dev（混成）

比較実行のための入口。工程は既存の `dev` ではなく、比較用の共通資料に従う。

## 引数

| 呼び出し | 構成 |
|---|---|
| `/shinaps:dev-mixed <比較条件ファイルの絶対パス>` | P1（担当数は 2体で固定） |

依頼に明示された引数だけを使い、条件ファイルを探したり推定したりしない。

比較条件ファイルは必須。無ければ「`/shinaps:dev-mixed <比較条件ファイル>` で指定してください」と返して終了する。

## 読む資料

開始前に次をすべて読み、P1 の構成で工程を進める。

- [工程](../../references/dev-comparison/workflow.md)
- [構成表](../../references/dev-comparison/configurations.md)
- [起動手順](../../references/dev-comparison/launch.md)
- [実行記録](../../references/dev-comparison/record.md)

担当指示は工程の役割表から辿る `roles/` の各ファイルを使う。

## 守ること

- 構成表の P1 の行にある担当だけを、構成表の起動手段で起動する。構成表に無い AI への依頼（個人用のセカンドオピニオン、AI Terminal Bridge、他の AI を起動するスキルを含む）をしない。AI Terminal Bridge で起動を依頼された場合の、依頼元への終了・停止の報告は、これに当たらない（[工程](../../references/dev-comparison/workflow.md)の「実行の制約」）。
- 既存の `dev`・`review`・`refine`・`simplify` スキルと、登録済みの Shinaps エージェントを使わない。

## 完了報告

- 工程の結果（工程の Phase 9 の報告項目）
- `run-record.md` の判定（[実行記録](../../references/dev-comparison/record.md) の区分。当たるものをすべて）と、指定のみの項目、パス
- 未検証の項目と、その理由
