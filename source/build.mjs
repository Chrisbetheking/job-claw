import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const out = 'dist/chrome-extension';
await rm('dist', { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const file of ['background.js', 'common.js', 'content-v37.js', 'sidepanel.js', 'pdf-extractor.js', 'offscreen.js']) {
  await cp(`src/${file}`, `${out}/${file}`);
}
await cp('src/lib', `${out}/lib`, { recursive: true });

for (const file of ['manifest.json', 'sidepanel.html', 'styles.css', 'offscreen.html', 'icon128.png']) {
  await cp(`public/${file}`, `${out}/${file}`);
}

const manifest = JSON.parse(await readFile(`${out}/manifest.json`, 'utf8'));
await writeFile('dist/build-info.json', JSON.stringify({
  version: manifest.version,
  versionName: manifest.version_name,
  baseline: 'JobClaw v2.0.0',
  builtAt: new Date().toISOString(),
  runtimeModules: ['lib/conversation-identity.js', 'lib/task-state.js', 'lib/job-priority.js', 'lib/safety-control.js', 'lib/company-verifier.js', 'lib/deduplication.js', 'lib/update-checker.js', 'lib/platform-adapter.js', 'lib/search-filters.js', 'lib/job-quality.js']
}, null, 2));
console.log('BUILD_OK');
