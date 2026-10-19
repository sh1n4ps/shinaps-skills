import { validateConfig } from './config-validation.ts';

/** `.shinaps/managed.json` を同梱の契約で検証する。 */
export function validateManagedConfig(path: string): Promise<void> {
  return validateConfig(path, {
    name: 'Managed',
    schema: 'plugins/shinaps-claude/references/managed/configuration.schema.json',
    version: 1,
    migration: 'Create it with managed-setup (config_version: 1).',
  });
}
