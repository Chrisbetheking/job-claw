import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = (await readdir('tests/unit')).filter(name => name.endsWith('.mjs')).sort();
for (const file of files) {
  process.stdout.write(`\n[unit] ${file}\n`);
  const result = spawnSync(process.execPath, [`tests/unit/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`\nUNIT_OK (${files.length} files)`);
