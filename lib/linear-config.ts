import { validateConfig } from './config-validation.ts';

/** `.shinaps/linear.json` を同梱の契約で検証する。 */
export function validateLinearConfig(path: string): Promise<void> {
  return validateConfig(path, {
    name: 'Linear',
    schema: 'plugins/shinaps-claude/references/linear/configuration.schema.json',
    version: 2,
    migration: 'Migrate with linear-plan to config_version: 2.',
  });
}
