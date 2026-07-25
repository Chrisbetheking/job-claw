import assert from 'node:assert/strict';
import { TERMINAL_RUN_STATUSES, taskStageMeta } from '../../src/lib/task-state.js';

assert.equal(TERMINAL_RUN_STATUSES.has('success'), true);
assert.deepEqual(taskStageMeta('verify_message'), { label: '确认文字已发送', progress: 94 });
assert.deepEqual(taskStageMeta('custom', '自定义阶段', 140), { label: '自定义阶段', progress: 100 });
console.log('UNIT_TASK_STATE_OK');
