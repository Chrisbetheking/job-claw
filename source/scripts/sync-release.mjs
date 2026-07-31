import { cp, rm } from 'node:fs/promises';

await rm('../chrome-extension', { recursive: true, force: true });
await cp('dist/chrome-extension', '../chrome-extension', { recursive: true });
console.log('RELEASE_EXTENSION_SYNCED');
