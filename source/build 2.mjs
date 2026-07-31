import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const out = 'dist/chrome-extension';
await rm('dist', { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ['background.js', 'common.js', 'content-v37.js', 'sidepanel.js', 'pdf-extractor.js', 'offscreen.js']) {
  await cp(`src/${file}`, `${out}/${file}`);
}
for (const file of ['manifest.json', 'sidepanel.html', 'styles.css', 'offscreen.html']) {
  await cp(`public/${file}`, `${out}/${file}`);
}
const manifest = JSON.parse(await readFile(`${out}/manifest.json`, 'utf8'));
await writeFile('dist/build-info.json', JSON.stringify({
  version: manifest.version,
  versionName: manifest.version_name,
  baseline: 'JobClaw-Internal-v1.2.1-rc12.zip',
  baselineSha256: '10fef2a1c0fba966ee05e70fb80fd557e89361c8742207eef67daad39c86c77b',
  builtAt: new Date().toISOString()
}, null, 2));
console.log('BUILD_OK');
