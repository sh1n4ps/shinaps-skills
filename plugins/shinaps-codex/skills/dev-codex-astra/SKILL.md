---
name: dev-codex-astra
description: 比較実行用。shinaps:dev の工程を Codex（gpt-6-astra / medium）の担当だけで実行する（P4: 同じ役割1体、P5: 2体）。比較実行で明示的に指定された場合だけ使う。通常の開発には $shinaps:dev を使う。
---

# 比較用 dev（Codex gpt-6-astra）

比較実行のための入口。工程は既存の `dev` ではなく、比較用の共通資料に従う。親と全担当のモデルは `gpt-6-astra`、推論は medium、tier は default。

## 引数

| 呼び出し | 構成 |
|---|---|
| `$shinaps:dev-codex-astra 1体 <比較条件ファイルの絶対パス>` | P4 |
| `$shinaps:dev-codex-astra 2体 <比較条件ファイルの絶対パス>` | P5 |

担当数（`1体` / `2体`）と比較条件ファイルはどちらも必須。どちらかが無い、または担当数が `1体` / `2体` 以外なら、「`$shinaps:dev-codex-astra <1体|2体> <比較条件ファイル>` で指定してください」と返して終了する。

## 読む資料

開始前に次をすべて読み、決めた構成で工程を進める。

- [工程](../../references/dev-comparison/workflow.md)
- [構成表](../../references/dev-comparison/configurations.md)
- [起動手順](../../references/dev-comparison/launch.md)
- [実行記録](../../references/dev-comparison/record.md)

担当指示は工程の役割表から辿る `roles/` の各ファイルを使う。

## 守ること

- 構成表のこの構成の行にある担当だけを、`codex exec` で起動する。構成表に無い AI への依頼（個人用のセカンドオピニオン、AI Terminal Bridge、他の AI を起動するスキルを含む）をしない。
- 既存の `dev`・`review`・`refine`・`simplify` スキル、登録済みのカスタムエージェント、`spawn_agent` を使わない。

## 完了報告

- 工程の結果（工程の Phase 9 の報告項目）
- `run-record.md` の判定（[実行記録](../../references/dev-comparison/record.md) の区分。当たるものをすべて）と、指定のみの項目、パス
- 未検証の項目と、その理由
