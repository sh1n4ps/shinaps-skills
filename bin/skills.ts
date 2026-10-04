#!/usr/bin/env node
import { run } from '../lib/install.ts';
import { errorMessage } from '../lib/fs.ts';

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(`Shinaps: ${errorMessage(error)}`);
  process.exitCode = 1;
}
