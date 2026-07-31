import assert from 'node:assert/strict';
import { compareVersions, normalizeRelease } from '../../src/lib/update-checker.js';

assert.equal(compareVersions('1.7.0', '1.6.9'), 1);
assert.equal(compareVersions('1.7.0', '1.7.0'), 0);
assert.equal(normalizeRelease({ tag_name: 'v1.8.0', html_url: 'https://example.com' }, '1.7.0').available, true);
console.log('UNIT_UPDATE_CHECKER_OK');
