#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from '../lib/layout.ts';
import { validateLinearConfig } from '../lib/linear-config.ts';
import { validateManagedConfig } from '../lib/managed-config.ts';
import { managed } from '../lib/managed.ts';
import { run } from '../lib/install.ts';
import { autoUpdate } from '../lib/auto-update.ts';
import { lint } from '../lib/lint.ts';
import { errorMessage } from '../lib/fs.ts';

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === '--version') {
    console.log(JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).version);
  } else if (command === 'validate-linear-config') {
    if (rest.length !== 1) throw new Error('Usage: shinaps-skills validate-linear-config <file>');
    await validateLinearConfig(rest[0]);
    console.log('Linear configuration is valid (config_version: 2).');
  } else if (command === 'validate-managed-config') {
    if (rest.length !== 1) throw new Error('Usage: shinaps-skills validate-managed-config <file>');
    await validateManagedConfig(rest[0]);
    console.log('Managed configuration is valid (config_version: 2).');
  } else if (command === 'managed') await managed(rest);
  else if (command === 'auto-update') await autoUpdate(rest);
  else if (command === 'lint') await lint(rest);
  else await run(process.argv.slice(2));
} catch (error) {
  console.error(`Shinaps: ${errorMessage(error)}`);
  process.exitCode = 1;
}
