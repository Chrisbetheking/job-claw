import { spawnSync } from 'node:child_process';

const files = [
  'profile-fallback.mjs',
  'receiver-recovery.mjs',
  'receiver-failure.mjs'
];

for (const file of files) {
  process.stdout.write(`\n[integration] ${file}\n`);
  const result = spawnSync(process.execPath, [`tests/${file}`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('\nINTEGRATION_OK');
