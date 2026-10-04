import { mkdir, readFile, writeFile, readdir, cp, rm, rename, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = 'shinaps@shinaps-skills-codex';
const digest = text => createHash('sha256').update(text).digest('hex');

async function optional(path) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Symlink preserved: ${path}`);
    return await readFile(path, 'utf8');
  }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function run(args, options = {}) {
  const [action, target, ...extra] = args;
  const log = options.log ?? console.log;
  if (!action || action === '--help' || action === 'help') {
    log('Usage: shinaps-skills <install|update|uninstall> codex\nClaude Code: /plugin marketplace add sh1n4ps/shinaps-skills\n             /plugin install shinaps@shinaps-skills');
    return;
  }
  if (!['install', 'update', 'uninstall'].includes(action) || target !== 'codex' || extra.length) {
    throw new Error('Use install, update or uninstall followed by codex. See --help.');
  }
  const home = options.home ?? homedir();
  const codexHome = options.codexHome ?? process.env.CODEX_HOME ?? join(home, '.codex');
  const root = join(home, '.local', 'share', 'shinaps-ai', 'skills');
  const statePath = join(root, 'state.json');
  const payload = join(root, 'codex');
  const agentsDir = join(codexHome, 'agents');
  const stateText = await optional(statePath);
  const state = stateText ? JSON.parse(stateText) : { agents: {}, codexHome };
  // Ownership is bound to the installation target, so a changed CODEX_HOME cannot
  // make an uninstall remove a different account's files.
  if (state.codexHome !== codexHome) throw new Error('CODEX_HOME differs from the existing install. Use the original target first.');
  const command = options.command ?? ((argv) => {
    const result = spawnSync('codex', argv, { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`codex ${argv.join(' ')} failed. Fix the reported error and retry; installed state is retained.`);
  });
  const save = async () => {
    await mkdir(root, { recursive: true });
    await writeFile(statePath + '.tmp', JSON.stringify(state, null, 2) + '\n');
    await rename(statePath + '.tmp', statePath);
  };
  // A prefix does not prove ownership. Only exact recorded content is replaced
  // or deleted; a user's edits require their explicit resolution.
  for (const [name, hash] of Object.entries(state.agents)) {
    if (!/^shinaps-[a-z0-9-]+\.toml$/.test(name)) throw new Error('Invalid managed agent filename.');
    const current = await optional(join(agentsDir, name));
    if (current !== null && digest(current) !== hash && digest(current) !== state.pending?.[name]) throw new Error(`Modified agent preserved: ${join(agentsDir, name)}`);
  }
  if (action === 'uninstall') {
    if (!stateText) { log('No managed Shinaps installation found.'); return; }
    await command(['plugin', 'remove', plugin]);
    await command(['plugin', 'marketplace', 'remove', 'shinaps-skills-codex']);
    for (const name of Object.keys(state.agents)) await rm(join(agentsDir, name), { force: true });
    await rm(payload, { recursive: true, force: true });
    await rm(statePath);
    log('Removed managed Codex plugin and agents. Other skills and MCP credentials were preserved.');
    return;
  }
  const agentSource = join(options.source ?? source, 'codex', 'agents');
  const next = {};
  for (const name of await readdir(agentSource)) {
    if (!/^shinaps-[a-z0-9-]+\.toml$/.test(name)) continue;
    const content = await readFile(join(agentSource, name), 'utf8');
    const current = await optional(join(agentsDir, name));
    if (!(name in state.agents) && current !== null) throw new Error(`Unmanaged agent preserved: ${join(agentsDir, name)}. Remove or relocate the old Shinaps registration first.`);
    next[name] = { content, hash: digest(content) };
  }
  // npx's download cache is temporary. Keep the marketplace payload at a stable
  // location so later Codex sessions and updates do not depend on that cache.
  await rm(payload, { recursive: true, force: true });
  await mkdir(payload, { recursive: true });
  await cp(join(options.source ?? source, 'plugins', 'shinaps-codex'), join(payload, 'plugins', 'shinaps-codex'), { recursive: true });
  await mkdir(join(payload, '.agents', 'plugins'), { recursive: true });
  await cp(join(options.source ?? source, '.agents', 'plugins', 'marketplace.json'), join(payload, '.agents', 'plugins', 'marketplace.json'));
  await save();
  await command(['plugin', 'marketplace', 'add', payload]);
  await command(['plugin', 'add', plugin]);
  await mkdir(agentsDir, { recursive: true });
  for (const [name, { content, hash }] of Object.entries(next)) {
    // Keep both the old and new digest until the atomic replacement completes.
    // Retrying after an interrupted update can then recognize either version.
    state.agents[name] ??= hash;
    state.pending = { [name]: hash };
    await save();
    const temporary = join(agentsDir, `.${name}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, content, { flag: 'wx' });
      await rename(temporary, join(agentsDir, name));
    } finally {
      await rm(temporary, { force: true });
    }
    state.agents[name] = hash;
    delete state.pending;
    await save();
  }
  for (const name of Object.keys(state.agents)) {
    if (!(name in next)) {
      await rm(join(agentsDir, name), { force: true });
      delete state.agents[name];
    }
  }
  await save();
  log('Shinaps installed. Start a new Codex session to load skills and agents.');
  log('No Shinaps AI account is required to install. For MCP features, create an account at https://app.shinaps.ai and use your client’s authentication flow.');
  log('MCP setup (only if not already configured): codex mcp add shinaps-ai --url https://app.shinaps.ai/mcp');
  log('Then: codex mcp login shinaps-ai');
}
