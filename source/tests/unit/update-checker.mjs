import assert from 'node:assert/strict';
import { compareVersions, normalizeRelease } from '../../src/lib/update-checker.js';

assert.equal(compareVersions('2.2.0', '2.0.0'), 1);
assert.equal(compareVersions('2.2.0', '2.2.0'), 0);
assert.equal(normalizeRelease({ tag_name: 'v2.2.1', html_url: 'https://example.com' }, '2.2.0').available, true);
console.log('UNIT_UPDATE_CHECKER_OK');
