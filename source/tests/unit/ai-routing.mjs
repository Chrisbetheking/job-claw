import assert from 'node:assert/strict';
import { chooseAiRoute, normalizeAiProviderMode, publicAiStatus } from '../../src/lib/ai-routing.js';

assert.equal(normalizeAiProviderMode('invalid'), 'auto');
assert.equal(chooseAiRoute({ model: { apiKey: 'sk-x', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' } }).route, 'cloud');
assert.equal(chooseAiRoute({ aiProviderMode: 'local', localModel: { enabled: true, baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3:1.7b' } }).route, 'local');
assert.equal(chooseAiRoute({ aiProviderMode: 'cloud', model: { apiKey: '' } }).route, 'rules');
const status = publicAiStatus({ aiProviderMode: 'auto', localModel: { enabled: false } });
assert.equal(status.route, 'rules');
assert.equal(status.ready, false);
console.log('AI_ROUTING_OK');
