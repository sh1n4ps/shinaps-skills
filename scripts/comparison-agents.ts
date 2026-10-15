import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const COMPARISON_ROLES = 'plugins/shinaps-claude/references/dev-comparison/roles';
export const COMPARISON_AGENT_PREFIX = 'shinaps-comparison-';
export const CODEX_AGENTS = 'plugins/shinaps-codex/agents';

// 比較用入口の Codex の担当は、roles/*.md を正本として生成した役割定義で起動する。
// model・推論を書かないのは、同じ役割を構成ごとに spawn_agent の指定で Astra / Sol にするため
// （定義ファイルの model は spawn_agent の指定より優先される）。sandbox も書かない。
// 定義ファイルでは上書きできず、親から引き継ぐため。
// `JSON.stringify` の出力は、TOML の基本文字列として読める（担当指示に制御文字を含めない前提）。
export async function renderComparisonAgents(): Promise<Record<string, string>> {
  const agents: Record<string, string> = {};
  for (const file of (await readdir(COMPARISON_ROLES)).filter((f) => f.endsWith('.md')).sort()) {
    const text = await readFile(join(COMPARISON_ROLES, file), 'utf8');
    const name = `${COMPARISON_AGENT_PREFIX}${file.slice(0, -'.md'.length)}`;
    const title = text.match(/^# (.+)$/m)?.[1];
    if (!title) throw new Error(`${join(COMPARISON_ROLES, file)} に「# 」の見出しが無い`);
    agents[`${name}.toml`] = [
      `name = ${JSON.stringify(name)}`,
      `description = ${JSON.stringify(`比較用 dev 入口（dev-codex-astra・dev-codex-sol）専用の${title}。通常の開発では使わない。`)}`,
      `developer_instructions = ${JSON.stringify(text)}`,
      '',
    ].join('\n');
  }
  return agents;
}
