#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot } from '../lib/layout.ts';
import { LINEAR_CONFIG_VERSION, validateLinearConfig } from '../lib/linear-config.ts';
import { validateManagedConfig } from '../lib/managed-config.ts';
import { managed } from '../lib/managed.ts';
import { INSTALL_COMMAND, run } from '../lib/install.ts';
import { autoUpdate } from '../lib/auto-update.ts';
import { lint } from '../lib/lint.ts';
import { RULE_COVERAGE_COMMAND, ruleCoverage } from '../lib/rule-coverage.ts';
import { RULE_SNAPSHOT_COMMAND, ruleSnapshot } from '../lib/rule-snapshot.ts';
import { errorMessage } from '../lib/fs.ts';

const usage = [
  `Usage: ${INSTALL_COMMAND}`,
  '       shinaps-skills validate-linear-config <file>',
  '       shinaps-skills validate-managed-config <file>',
  '       shinaps-skills managed <setup|run|status|reply|collect> (see managed --help)',
  '       shinaps-skills auto-update <enable|disable|status|check> codex',
  '       shinaps-skills lint --checks <checks.json> --root <project> --out <result.json> -- <files...>',
  `       ${RULE_SNAPSHOT_COMMAND}`,
  `       ${RULE_COVERAGE_COMMAND}`,
  'Claude Code: /plugin marketplace add sh1n4ps/shinaps-skills',
  '             /plugin install shinaps@shinaps-skills',
].join('\n');

const [command, ...rest] = process.argv.slice(2);
try {
  if (!command || command === 'help' || command === '--help') {
    console.log(usage);
  } else if (command === '--version') {
    console.log(JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).version);
  } else if (command === 'validate-linear-config') {
    if (rest.length !== 1) throw new Error('Usage: shinaps-skills validate-linear-config <file>');
    await validateLinearConfig(rest[0]);
    console.log(`Linear configuration is valid (config_version: ${LINEAR_CONFIG_VERSION}).`);
  } else if (command === 'validate-managed-config') {
    if (rest.length !== 1) throw new Error('Usage: shinaps-skills validate-managed-config <file>');
    await validateManagedConfig(rest[0]);
    console.log('Managed configuration is valid (config_version: 2).');
  } else if (command === 'managed') await managed(rest);
  else if (command === 'auto-update') await autoUpdate(rest);
  else if (command === 'lint') await lint(rest);
  else if (command === 'rule-snapshot') await ruleSnapshot(rest);
  else if (command === 'rule-coverage') await ruleCoverage(rest);
  else await run(process.argv.slice(2));
} catch (error) {
  console.error(`Shinaps: ${errorMessage(error)}`);
  process.exitCode = 1;
}
