import { validateConfig } from './config-validation.ts';

/** `.shinaps/managed.json` の内容。schema（configuration.schema.json）が正本。 */
export type ManagedConfig = {
  config_version: 2;
  repository: { url: string; mount_path: string };
  accounts: Record<string, { vault_id: string | null }>;
};

/** `.shinaps/managed.json` を同梱の契約で検証し、内容を返す。 */
export async function validateManagedConfig(path: string): Promise<ManagedConfig> {
  return (await validateConfig(path, {
    name: 'Managed',
    schema: 'plugins/shinaps-claude/references/managed/configuration.schema.json',
    version: 2,
    migration:
      'Recreate it as config_version: 2 with managed-execute and move each existing claude-lock.json to its account directory (references/managed/configuration.md, migration from version 1).',
  })) as ManagedConfig;
}
