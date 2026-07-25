import assert from 'node:assert/strict';
import { computeJobPriority, rerankPending } from '../../src/lib/job-priority.js';

const strong = {
  id: 'strong', status: 'approved_queue', createdAt: 2,
  analysis: { score: 92, decision: 'recommend', hardBlocks: [], risks: [], gaps: [] },
  job: { salary: '15-20K', publishTime: '刚刚' }
};
const weak = {
  id: 'weak', status: 'approved_queue', createdAt: 1,
  analysis: { score: 75, decision: 'cautious', hardBlocks: [], risks: ['经验不足'], gaps: ['小程序'] },
  job: { salary: '5-7K', publishTime: '15天前' }
};
const external = {
  id: 'external', status: 'approved_queue', createdAt: 0,
  analysis: { score: 99, decision: 'recommend', hardBlocks: [], risks: [], gaps: [] },
  job: { salary: '30-40K', applicationMode: '外部网申' }
};

assert.ok(computeJobPriority(strong) > computeJobPriority(weak));
assert.ok(computeJobPriority(external) < computeJobPriority(strong));
const ranked = rerankPending([weak, strong]);
assert.equal(ranked[0].id, 'strong');
assert.equal(ranked[0].priorityRank, 1);
console.log('UNIT_JOB_PRIORITY_OK');
