import assert from 'node:assert/strict';
import { classifyIncident, recoveryDelayMs } from '../../src/lib/incident-recovery.js';

let incident = classifyIncident({ reason: '等待消息输入区超时', failureClass: 'chat_entry', stage: 'open_chat' });
assert.equal(incident.action, 'skip-job');
assert.equal(incident.requiresUser, false);

incident = classifyIncident({ reason: '网络连接失败', failureClass: 'delivery' }, { autoRecoveryCooldownSeconds: 40 });
assert.equal(incident.action, 'cooldown');
assert.equal(incident.autoRecoverable, true);
assert.ok(recoveryDelayMs(incident, 2) >= incident.cooldownMs);

incident = classifyIncident({ reason: '检测到安全验证码' });
assert.equal(incident.requiresUser, true);
assert.equal(incident.hardStop, true);

incident = classifyIncident({ reason: '已点击发送但无法确认发送', sendUncertain: true });
assert.equal(incident.category, 'send_uncertain');
assert.equal(incident.requiresUser, true);

incident = classifyIncident({ reason: 'DeepSeek 模型暂不可用' });
assert.equal(incident.action, 'degrade-ai');

console.log('UNIT_INCIDENT_RECOVERY_OK');
