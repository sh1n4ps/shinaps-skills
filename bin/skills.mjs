#!/usr/bin/env node
import { run } from '../lib/install.mjs';

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(`Shinaps: ${error.message}`);
  process.exitCode = 1;
}
