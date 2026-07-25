import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (/\.(?:js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const targets = [
  ...await walk('src'),
  ...await walk('tests'),
  ...await walk('scripts'),
  '../desktop-bridge/server.js',
  '../desktop-bridge/cli.js'
];

for (const target of targets) {
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || `Syntax error: ${target}`);
    process.exit(result.status || 1);
  }
}
console.log(`SYNTAX_OK (${targets.length} files)`);
