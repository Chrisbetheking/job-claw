import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, '1.3.0');
assert.equal(manifest.background?.type, 'module');
assert.equal(manifest.side_panel?.default_path, 'sidepanel.html');
assert.ok(manifest.content_scripts?.some(item => item.js?.includes('content-v37.js')));
assert.equal(manifest.content_security_policy?.extension_pages, "script-src 'self'; object-src 'self'; worker-src 'self'");
assert.ok(!/blob:/i.test(manifest.content_security_policy?.extension_pages || ''));
assert.ok(manifest.permissions.includes('debugger'), '可信输入链路需要 debugger 权限');
console.log('MANIFEST_OK');
