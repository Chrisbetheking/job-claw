import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(root, '../..');
const dist = path.join(root, 'dist');
const coreDir = path.join(repoRoot, 'packages/core');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

execFileSync('tsc', ['-p', path.join(coreDir, 'tsconfig.json')], { stdio: 'inherit' });
execFileSync('tsc', ['-p', path.join(root, 'tsconfig.build.json')], { stdio: 'inherit' });

await cp(path.join(coreDir, 'dist'), path.join(dist, 'core'), { recursive: true });
for (const file of ['manifest.json', 'sidepanel.html', 'styles.css']) {
  await cp(path.join(root, 'src', file), path.join(dist, file));
}

console.log(`Chrome 插件已构建到：${dist}`);
