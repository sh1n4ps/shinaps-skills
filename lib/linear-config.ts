import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import { packageRoot } from './layout.ts';

/** 明示されたファイルを同梱の契約で検証する。設定の探索・変更や外部取得は行わない。 */
export async function validateLinearConfig(path: string): Promise<void> {
  const input: unknown = JSON.parse(await readFile(path, 'utf8'));
  // 版の不一致は設定修正とskill更新で対処が異なるため、schema検証より先に案内する。
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const version = 'config_version' in input ? input.config_version : undefined;
    if (version === undefined || (Number.isInteger(version) && Number(version) < 1)) {
      throw new Error(
        'config_version is missing or old. Migrate with linear-plan to config_version: 1.',
      );
    }
    if (Number.isInteger(version) && Number(version) > 1) {
      throw new Error(
        'Future config_version. Update the skill and matching CLI before continuing.',
      );
    }
  }
  const schema = JSON.parse(
    await readFile(
      join(packageRoot, 'plugins/shinaps-claude/references/linear/configuration.schema.json'),
      'utf8',
    ),
  );
  const validator = new Ajv({
    allErrors: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });
  const validate = validator.compile(schema);
  if (!validate(input)) {
    const errors = validate.errors
      ?.map(
        (error) => `${error.instancePath || '/'} ${error.message} ${JSON.stringify(error.params)}`,
      )
      .join('\n');
    throw new Error(
      `Invalid Linear configuration. Correct the JSON to match configuration.schema.json:\n${errors}`,
    );
  }
}
