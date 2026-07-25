import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const files = (await readdir('tests'))
  .filter(name => /^ui\d+.*\.mjs$/.test(name))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

const concurrency = Math.max(1, Math.min(4, Number(process.env.JOBCLAW_TEST_CONCURRENCY || 4)));
let cursor = 0;
let failed = false;

function runFile(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [`tests/${file}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      stderr += `\nTest timed out after 90 seconds: ${file}\n`;
    }, 90_000);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ file, code: Number(code ?? 1), stdout, stderr });
    });
  });
}

async function worker() {
  while (!failed) {
    const index = cursor++;
    if (index >= files.length) return;
    const result = await runFile(files[index]);
    process.stdout.write(`\n[regression] ${result.file}\n${result.stdout}`);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.code !== 0) {
      failed = true;
      process.exitCode = result.code || 1;
      return;
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, () => worker()));
if (failed) process.exit(process.exitCode || 1);
console.log(`\nREGRESSION_OK (${files.length} files, concurrency ${concurrency})`);
