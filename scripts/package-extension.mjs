import { mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const releaseDir = path.join(root, 'release');
const sourceDir = path.join(root, 'apps/chrome-extension/dist');
const output = path.join(releaseDir, 'jobclaw-chrome-v0.1.0.zip');

await mkdir(releaseDir, { recursive: true });
await rm(output, { force: true });
execFileSync('zip', ['-qr', output, '.'], { cwd: sourceDir, stdio: 'inherit' });
console.log(`已生成：${output}`);
