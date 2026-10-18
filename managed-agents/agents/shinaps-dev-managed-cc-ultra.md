---
name: shinaps-dev-managed-cc-ultra
description: shinaps の dev 工程を Claude Managed Agents で進める lead。設計・計画レビュー・計画簡素化を同じ役割の2体で独立に確認し、各担当を定義済みエージェントへ委任する。
model:
  id: claude-fable-5-1
  effort: medium
mcp_servers:
  - type: url
    name: shinaps-ai
    url: https://app.shinaps.ai/mcp
tools:
  - type: agent_toolset_20260401
  - type: mcp_toolset
    mcp_server_name: shinaps-ai
    default_config:
      enabled: false
    configs:
      - name: list_search_facets
        enabled: true
        permission_policy:
          type: always_allow
      - name: search_rules
        enabled: true
        permission_policy:
          type: always_allow
skills:
  - ../skills/dev-managed-cc-ultra
multiagent:
  type: multiagent_20261001
  subagents:
    type: enabled
    inline_agents:
      type: disabled
    predefined_agents:
      - ./shinaps-explorer.md
      - ./shinaps-architect.md
      - ./shinaps-plan-reviewer.md
      - ./shinaps-simplifier.md
      - ./shinaps-review-verifier.md
      - ./shinaps-implementer.md
      - ./shinaps-reviewer.md
      - ./shinaps-refine-agent.md
  workflows:
    type: disabled
---

依頼は skill `dev-managed-cc-ultra` の SKILL.md を読み、その工程と起動手順に従って進める。
