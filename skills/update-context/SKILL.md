---
name: update-context
description: shinaps-ai サーバが管理する CLAUDE.md / AGENTS.md 領域 (`<!-- shinaps-ai-instructions: BEGIN --> ... END -->` marker) を最新 snippet で silent sync する skill。session 開始時に AI が自動発火 (user 目視なし)。既存 marker のあるファイルだけ overwrite、marker 無し・ファイル不在は触らない。MCP server (shinaps-ai) 未到達時は silent early return。canonical snippet は shinaps-ai MCP server の get_managed_snippet tool から取得する。
argument-hint: (引数なし)
---

# shinaps:update-context — managed region silent sync

session 開始時に AI が自発的に呼び出す silent sync skill。CLAUDE.md / AGENTS.md の shinaps-ai managed region を最新 snippet で上書きする。

ユーザー確認は不要。すべての作業は黙って実行し、最後に 1 行 report だけ出す。

## Step 1. canonical snippet 取得

shinaps-ai MCP server の `get_managed_snippet` tool を **引数なし** (`{}`) で呼び出し、以下の返却値を保持する:

- `beginMarker`: `<!-- shinaps-ai-instructions: BEGIN -->`
- `endMarker`: `<!-- shinaps-ai-instructions: END -->`
- `snippet`: marker 内側に書く本文
- `fullRegion`: BEGIN + 改行 + snippet + 改行 + END の完全な連結文字列

呼び出しに失敗した場合 (`.mcp.json` に shinaps-ai server 未登録 / 通信エラー / auth 失敗 等) は **silent early return** (何もせず終了、report もしない)。session 開始時に AI が自動発火する silent sync 前提のため、user 目視の案内は出さない。

## Step 2. 対象 4 ファイルを Read

以下 4 ファイルすべてを Read する。ファイル不在はエラーにせず「不在」と認識:

- `~/.claude/CLAUDE.md` (global / Claude Code)
- `~/.codex/AGENTS.md` (global / Codex)
- `<git workspace root>/CLAUDE.md` (project、`git rev-parse --show-toplevel` で解決)
- `<git workspace root>/AGENTS.md` (project)

`git rev-parse --show-toplevel` は Bash tool で実行。

## Step 3. 各ファイルの判定

各ファイルについて、Step 1 で取得した `beginMarker` と `endMarker` のペアを探す:

- **marker 両方あり** → 内側を Step 1 の `snippet` と string-equal 比較
  - 一致 (完全一致) → **unchanged** (何もしない)
  - 不一致 → 内側だけ Edit で overwrite (BEGIN/END の行自体は変更しない) → **updated**
- **marker 片方だけ / marker 両方なし / ファイル不在** → 何もしない (**skipped**)

## Step 4. Report

完走後、user に 1 行で報告:

> `update-context: N updated / M unchanged / K skipped`

差分がゼロ (全 unchanged + skipped) なら `sync 済` と短く伝えるだけで OK。session 開始時の silent sync 用途のため、詳細ログは不要。

## Marker 仕様

- BEGIN: `<!-- shinaps-ai-instructions: BEGIN -->`
- END: `<!-- shinaps-ai-instructions: END -->`
- marker 行は **完全一致** で検出。BEGIN/END の行自体は決して変更しない
- 単一行 marker (改行を含まない)、互いに substring 包含しない
