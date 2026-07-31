import assert from 'node:assert/strict';
import { createSeenJobEntry, evaluateJobQuality, findSeenDuplicate, jobFamilyKey } from '../../src/lib/job-quality.js';

const good = { title: '前端开发实习生', company: '示例科技有限公司', location: '成都', salary: '4-6K', recruiterName: 'HR', description: '岗位职责 负责Vue和TypeScript页面开发 任职要求 熟悉HTML CSS JavaScript 参与真实业务项目并完成代码评审'.repeat(3) };
const quality = evaluateJobQuality(good);
assert.ok(quality.score >= 60);
assert.equal(quality.familyKey, jobFamilyKey(good));
const seen = createSeenJobEntry(good, quality, Date.now());
assert.equal(findSeenDuplicate(good, [seen], { windowDays: 30 })?.duplicate, true);
const bad = evaluateJobQuality({ title: '急招', company: '', description: '日结 零经验高薪 先交押金' });
assert.ok(bad.score < 25);
assert.ok(bad.hardSignals.length > 0);
console.log('UNIT_JOB_QUALITY_OK');
