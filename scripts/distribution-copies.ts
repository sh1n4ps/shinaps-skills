// 配布コピーの同期（sync-copies.ts）と一致テスト（test/dev-workflow.test.ts）が共有する場所の定義。
// 片方だけを直すと、テストが比較から外したファイルを同期が上書きする。
export const CLAUDE = 'plugins/shinaps-claude';
export const CODEX = 'plugins/shinaps-codex';
// 起動手順は runtime ごとの機構で書くので、references の中でこれだけは複製しない。
export const RUNTIME_SPECIFIC_REFERENCE = 'dev/launch.md';
// Managed の skill は plugin の外の資料を読めないので、references に正本の写しを持つ。
export const MANAGED_SKILL = `${CLAUDE}/managed-agents/skills/dev-managed-cc`;
