import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

async function files(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(full, base));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}
async function digest(file) {
  return crypto.createHash('sha256').update(await readFile(file)).digest('hex');
}

const built = 'dist/chrome-extension';
const release = '../chrome-extension';
const [builtFiles, releaseFiles] = await Promise.all([files(built), files(release)]);
if (JSON.stringify(builtFiles) !== JSON.stringify(releaseFiles)) {
  console.error('RELEASE_SYNC_FILE_LIST_MISMATCH');
  console.error({ builtOnly: builtFiles.filter(x => !releaseFiles.includes(x)), releaseOnly: releaseFiles.filter(x => !builtFiles.includes(x)) });
  process.exit(1);
}
for (const file of builtFiles) {
  const [a, b] = await Promise.all([digest(path.join(built, file)), digest(path.join(release, file))]);
  if (a !== b) {
    console.error(`RELEASE_SYNC_HASH_MISMATCH: ${file}`);
    process.exit(1);
  }
}
console.log(`RELEASE_SYNC_OK (${builtFiles.length} files)`);
