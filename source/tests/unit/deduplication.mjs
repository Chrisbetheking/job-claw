import assert from 'node:assert/strict';
import { findDuplicate, jobFingerprint } from '../../src/lib/deduplication.js';

const job = { title: '前端开发', company: '某某科技有限公司', url: 'https://www.zhipin.com/job_detail/abc.html?x=1' };
assert.equal(jobFingerprint(job), 'id:abc');
const duplicate = findDuplicate(job, { history: [{ fingerprint: 'id:abc', status: 'sent', date: '2026-07-31' }], date: '2026-07-31' });
assert.equal(duplicate.duplicate, true);
console.log('UNIT_DEDUPLICATION_OK');
