#!/usr/bin/env node
import { run } from '../lib/install.ts';

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(`Shinaps: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
