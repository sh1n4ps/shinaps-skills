# shinaps-skills

shinaps-ai の agent 向け workflow skill 集。Claude Code plugin として配布。

**Overview**: plugin 名は `shinaps` (skill レジストリでの namespace prefix)、shinaps-ai MCP server 名は `shinaps-ai`。同じ ecosystem 内で 2 表記が並ぶが、レイヤーが違う (plugin/skill と MCP server) のでプレフィックスの意味論も別と割り切って良い。

## Prerequisites

事前に **shinaps-ai MCP server** を Claude Code / Codex CLI の `.mcp.json` に登録すること。skill 群は shinaps-ai server の tool を呼び出す前提で書かれており、未登録だと呼び出しが失敗する。

`.mcp.json` の例:

```json
{
  "mcpServers": {
    "shinaps-ai": {
      "type": "http",
      "url": "https://app.shinaps.ai/mcp"
    },
    "shinaps-ai-local": {
      "type": "http",
      "url": "http://localhost:5173/mcp"
    }
  }
}
```

認証は shinaps-ai 側の OAuth 2.1 (memory:read / memory:write scope)。初回接続時にブラウザで認可を求められる。

## Install (Claude Code, 主線)

```
/plugin marketplace add sh1n4ps/shinaps-skills
/plugin install shinaps@shinaps-skills
```

`marketplace add` は repo 内の `.claude-plugin/marketplace.json` を読み、そこに列挙された plugin 一覧をレジストリに登録する。`install shinaps@shinaps-skills` は「marketplace `shinaps-skills` から plugin `shinaps` を入れる」の意味。Install 後、Skill レジストリに以下 4 skill が登録される:

- `/shinaps:update-context`
- `/shinaps:init`
- `/shinaps:extract-rules`
- `/shinaps:refine`

user が直接叩くことも、AI が description matching で自動発火することもできる。

## Install (Codex CLI, best-effort)

```bash
npx skills add sh1n4ps/shinaps-skills -a codex -g
```

**注意 (Codex CLI の非対称性)**:

- Codex CLI では `shinaps:` namespace prefix は付与されず、`update-context` / `init` / `extract-rules` / `refine` の平名で登録される可能性が高い (Codex 側の namespace 概念は非公式)
- 既存の同名 skill と衝突する可能性がある — 衝突時は user 側で個別 skill を rename すること
- skills.sh CLI は Codex global を `~/.codex/skills/` に書き込むが、Codex 公式 docs は `~/.agents/skills/` を示している (path 不整合の実測は環境依存)
- SKILL.md 本文の `${CLAUDE_SKILL_DIR}` などの Claude Code 固有 syntax は使わず portable に書いてあるので、Codex 側でも読み進められる想定

## Skills

| Skill | 用途 |
|---|---|
| `shinaps:update-context` | session 開始時に AI が自動発火 (silent sync)。CLAUDE.md / AGENTS.md の shinaps-ai managed region を最新 snippet で overwrite |
| `shinaps:init` | 新規 scope (別 repo / global) に managed region の marker を明示配置。user 意思決定 (scope 選択) を伴う明示発火 |
| `shinaps:extract-rules` | 過去 PR のレビューコメントから userRules を bulk 生成。新規リポジトリ着手時や userRules が空 / 少ないとき (5 件未満) に提案・起動 |
| `shinaps:refine` | セルフレビュー直前に diff を並列 subagent で rule 照合。Violation / Improvement / Question に分類し、自明な修正は自動適用、判断が必要なものだけ 4 択 AskUserQuestion で処理 |

## License

MIT
