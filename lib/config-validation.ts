import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import { packageRoot } from './layout.ts';

/** 設定ファイルの契約。schema は同梱のものだけを使い、`$schema` の URL は取得しない。 */
export type ConfigContract = {
  /** エラー文頭の設定名。例: `Linear` */
  name: string;
  /** パッケージ直下からの schema の相対パス */
  schema: string;
  /** 受け付ける `config_version` */
  version: number;
  /** 欠落・旧版のときに案内する移行手順 */
  migration: string;
};

/** 明示されたファイルを同梱の契約で検証し、検証した内容を返す。設定の探索・変更や外部取得は行わない。 */
export async function validateConfig(path: string, contract: ConfigContract): Promise<unknown> {
  const input: unknown = JSON.parse(await readFile(path, 'utf8'));
  // 版の不一致は設定修正とskill更新で対処が異なるため、schema検証より先に案内する。
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const version = 'config_version' in input ? input.config_version : undefined;
    if (
      version === undefined ||
      (Number.isInteger(version) && Number(version) < contract.version)
    ) {
      throw new Error(`config_version is missing or old. ${contract.migration}`);
    }
    if (Number.isInteger(version) && Number(version) > contract.version) {
      throw new Error(
        'Future config_version. Update the skill and matching CLI before continuing.',
      );
    }
  }
  const schema = JSON.parse(await readFile(join(packageRoot, contract.schema), 'utf8'));
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
      `Invalid ${contract.name} configuration. Correct the JSON to match configuration.schema.json:\n${errors}`,
    );
  }
  return input;
}
