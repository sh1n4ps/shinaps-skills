import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../lib/install.mjs';

async function fixture(t) {
  const home = await mkdtemp(join(tmpdir(), 'shinaps-install-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const calls = [];
  return { home, codexHome: join(home, '.codex'), command: async args => calls.push(args), log() {}, calls };
}

test('install, repeat and uninstall preserve unrelated files', async t => {
  const options = await fixture(t);
  const agents = join(options.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, 'personal.toml'), 'personal');
  await run(['install', 'codex'], options);
  const reviewer = join(agents, 'shinaps-reviewer.toml');
  const content = await readFile(reviewer, 'utf8');
  assert.match(content, /sandbox_mode = "read-only"/);
  await run(['update', 'codex'], options);
  assert.equal(await readFile(reviewer, 'utf8'), content);
  await run(['uninstall', 'codex'], options);
  await assert.rejects(access(reviewer), { code: 'ENOENT' });
  assert.equal(await readFile(join(agents, 'personal.toml'), 'utf8'), 'personal');
  assert.ok(options.calls.some(args => args[0] === 'plugin' && args[1] === 'add'));
  assert.ok(options.calls.every(args => args[0] !== 'mcp'));
});

test('an unmanaged same-name agent is never adopted or overwritten', async t => {
  const options = await fixture(t);
  const agents = join(options.codexHome, 'agents');
  await mkdir(agents, { recursive: true });
  await writeFile(join(agents, 'shinaps-reviewer.toml'), 'mine');
  await assert.rejects(run(['install', 'codex'], options), /Unmanaged agent preserved/);
  assert.equal(options.calls.length, 0);
  assert.equal(await readFile(join(agents, 'shinaps-reviewer.toml'), 'utf8'), 'mine');
});

test('user changes stop update and uninstall before external mutations', async t => {
  const options = await fixture(t);
  await run(['install', 'codex'], options);
  const reviewer = join(options.codexHome, 'agents', 'shinaps-reviewer.toml');
  await writeFile(reviewer, 'my edited agent');
  options.calls.length = 0;
  for (const action of ['update', 'uninstall']) {
    await assert.rejects(run([action, 'codex'], options), /Modified agent preserved/);
  }
  assert.equal(options.calls.length, 0);
  assert.equal(await readFile(reviewer, 'utf8'), 'my edited agent');
});

test('plugin command failure does not report success or install agents', async t => {
  const options = await fixture(t);
  options.command = async () => { throw new Error('offline'); };
  await assert.rejects(run(['install', 'codex'], options), /offline/);
  await assert.rejects(access(join(options.codexHome, 'agents', 'shinaps-reviewer.toml')), { code: 'ENOENT' });
  options.command = async () => {};
  await run(['install', 'codex'], options);
  await access(join(options.codexHome, 'agents', 'shinaps-reviewer.toml'));
});

test('update replaces managed content and retires removed package files', async t => {
  const options = await fixture(t);
  options.source = join(options.home, 'package');
  for (const dir of ['plugins/shinaps-codex', '.agents']) {
    await cp(new URL(`../${dir}`, import.meta.url), join(options.source, dir), { recursive: true });
  }
  const agent = 'shinaps-reviewer.toml';
  await run(['install', 'codex'], options);
  const newContent = (await readFile(join(options.source, 'plugins/shinaps-codex/agents', agent), 'utf8')) + '\n# New release\n';
  await writeFile(join(options.source, 'plugins/shinaps-codex/agents', agent), newContent);
  await rm(join(options.source, 'plugins/shinaps-codex/agents/shinaps-explorer.toml'));
  await rm(join(options.source, 'plugins/shinaps-codex/skills/review'), { recursive: true });
  await run(['update', 'codex'], options);
  assert.equal(await readFile(join(options.codexHome, 'agents', agent), 'utf8'), newContent);
  await assert.rejects(access(join(options.codexHome, 'agents/shinaps-explorer.toml')), { code: 'ENOENT' });
  await assert.rejects(access(join(options.home, '.local/share/shinaps-ai/skills/codex/plugins/shinaps-codex/skills/review')), { code: 'ENOENT' });
});

test('replacing an installed agent with a symlink does not write through it', async t => {
  const options = await fixture(t);
  await run(['install', 'codex'], options);
  const agent = join(options.codexHome, 'agents/shinaps-reviewer.toml');
  const personal = join(options.home, 'personal.toml');
  await cp(agent, personal);
  const content = await readFile(personal, 'utf8');
  await rm(agent);
  await symlink(personal, agent);
  await assert.rejects(run(['update', 'codex'], options), /Symlink preserved/);
  assert.equal(await readFile(personal, 'utf8'), content);
});
