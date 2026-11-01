import { validateConfig } from './config-validation.ts';

/** 受け付ける `.shinaps/linear.json` の `config_version`。同梱 schema の `const` と同じ値にする。 */
export const LINEAR_CONFIG_VERSION = 3;

/** `.shinaps/linear.json` を同梱の契約で検証する。 */
export async function validateLinearConfig(path: string): Promise<void> {
  await validateConfig(path, {
    name: 'Linear',
    schema: 'plugins/shinaps-claude/references/linear/configuration.schema.json',
    version: LINEAR_CONFIG_VERSION,
    migration: `Update the skills and CLI to 0.48.0 or later, then migrate with linear-plan to config_version: ${LINEAR_CONFIG_VERSION} (permissions is replaced by constraints; see "旧設定の移行" in references/linear/configuration.md).`,
  });
}
