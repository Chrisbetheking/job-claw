import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = '..';
const excludedDirs = new Set(['.git', 'node_modules', 'dist', 'docs', 'images']);
const allowedExtensions = new Set(['.js', '.mjs', '.json', '.html', '.css', '.md', '.yml', '.yaml', '.command', '.swift']);
const findings = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excludedDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (allowedExtensions.has(path.extname(entry.name))) {
      const text = await readFile(full, 'utf8').catch(() => '');
      const checks = [
        ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
        ['api-key', /\bsk-[A-Za-z0-9_-]{20,}\b/],
        ['bearer-token', /Authorization\s*[:=]\s*["'`]Bearer\s+[A-Za-z0-9._-]{20,}/i],
        ['personal-email', /chriswangjob@163\.com/i],
        ['personal-phone', /(?<![0-9A-Fa-f])(?:\+?86[\s-]?)?1[3-9]\d{9}(?![0-9A-Fa-f])/]
      ];
      for (const [name, pattern] of checks) {
        if (pattern.test(text)) findings.push(`${name}: ${path.relative(root, full)}`);
      }
    }
  }
}

await walk(root);
if (findings.length) {
  console.error('SECRET_SCAN_FAILED');
  for (const item of findings) console.error(`- ${item}`);
  process.exit(1);
}
console.log('SECRET_SCAN_OK');
