---
name: init
description: 新規 scope (別 repo / global) に shinaps-ai managed region の marker を明示配置する skill。update-context と違って user 意思決定あり (AskUserQuestion で global / project / 両方を確認)。marker 未在ファイルには末尾 append、既存 marker は overwrite、ファイル不在は「新規作成しますか?」を再確認。session 開始時の silent sync ではなく user 明示発火用。canonical snippet は shinaps-ai MCP server の get_managed_snippet tool から取得する。
argument-hint: (引数なし、対話で scope を確認)
---

# shinaps:init — managed region 初回配置

新規 scope (別 repo / global の初回 setup、または既存 marker を消してしまった環境の再配置) に shinaps-ai managed region を明示的に書き込む skill。update-context (silent sync 用) と違い、user 意思決定を伴う明示発火。

## Step 1. canonical snippet 取得

shinaps-ai MCP server の `get_managed_snippet` tool を **引数なし** (`{}`) で呼び出し、以下の返却値を保持する:

- `beginMarker` / `endMarker` / `snippet` / `fullRegion`

呼び出しに失敗した場合は user に「`.mcp.json` に `shinaps-ai` server を追加してください: `https://app.shinaps.ai/mcp` (または `shinaps-ai-local`: `http://localhost:5173/mcp`)」と明示エラー表示して abort する。init は user 明示発火なので silent early return はしない。

## Step 2. scope 確認

`AskUserQuestion` で以下の 3 択を提示 (single-select):

1. **global**: `~/.claude/CLAUDE.md` + `~/.codex/AGENTS.md` の 2 ファイルに書き込む (Claude Code / Codex の user global 領域)
2. **project**: `<git workspace root>/CLAUDE.md` + `<git workspace root>/AGENTS.md` の 2 ファイルに書き込む (`git rev-parse --show-toplevel` で解決)
3. **両方**: global 2 + project 2 の 4 ファイルすべてに書き込む

初回起動なら global を推奨として提示。

## Step 3. ファイル別 action

scope に応じた対象ファイルそれぞれについて、以下の分岐で処理:

- **marker あり** → 内側を Step 1 の `snippet` で overwrite (BEGIN/END の行は変更しない)。string-equal で差分無しなら書き込みスキップ、差分ありなら **updated**、marker あり & 差分無しなら **unchanged**
- **marker 無し + ファイル存在** → 末尾に `\n\n${fullRegion}\n` を append → **added**
- **ファイル不在** → `AskUserQuestion` で「新規作成する / スキップ」を確認。新規作成 OK なら `${fullRegion}` のみ書き込み → **created**。スキップ選択なら → **skipped**

`git rev-parse --show-toplevel` と `echo $HOME` (or `printenv HOME`) は Bash tool で実行。

## Step 4. Report

ファイル単位で action (added / created / updated / unchanged / skipped) を列挙する箇条書き report を出す:

例:
```
init report:
- ~/.claude/CLAUDE.md: added
- ~/.codex/AGENTS.md: added
- <repo>/CLAUDE.md: updated
- <repo>/AGENTS.md: skipped (user chose not to create)
```

## Marker 仕様

- BEGIN: `<!-- shinaps-ai-instructions: BEGIN -->`
- END: `<!-- shinaps-ai-instructions: END -->`
- 単一行 marker、互いに substring 包含しない
- append 時は末尾に `\n\n${fullRegion}\n` の形で挿入 (前の内容との区切りを 1 行空ける)
- update-context は marker 有りのみ触るが、init は marker 有無を問わず配置するのが役割の違い
