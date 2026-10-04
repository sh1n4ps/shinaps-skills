#!/usr/bin/env node
import { run } from '../lib/install.ts';
import { autoUpdate } from '../lib/auto-update.ts';
import { errorMessage } from '../lib/fs.ts';

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'auto-update') await autoUpdate(rest);
  else await run(process.argv.slice(2));
} catch (error) {
  console.error(`Shinaps: ${errorMessage(error)}`);
  process.exitCode = 1;
}
