import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../src/background.js', import.meta.url), 'utf8');
const start = source.indexOf('function compactEvidenceText(');
const end = source.indexOf('\nfunction fastMassAnalysis(', start);
assert.ok(start >= 0 && end > start, 'greeting helper block missing');
const block = source.slice(start, end);
const factory = new Function('uniq', 'normalizeStringList', `${block}\nreturn { humanGreetingTemplate, cleanGreetingJobTitle, splitProjectEvidence };`);
const uniq = items => [...new Set(items.filter(Boolean))];
const normalizeStringList = (value, limit = 20) => {
  const sourceList = Array.isArray(value) ? value : [value];
  return sourceList.map(item => typeof item === 'string' ? item : (item?.name || item?.title || '')).filter(Boolean).slice(0, limit);
};
const { humanGreetingTemplate, cleanGreetingJobTitle, splitProjectEvidence } = factory(uniq, normalizeStringList);

const profile = {
  facts: {
    skills: ['React', 'TypeScript', 'RAG', 'Supabase'],
    projects: [
      'AI留学咨询工作台：负责React页面开发、RAG问答接入和接口联调',
      '医疗问答系统：负责检索结果展示和状态管理'
    ],
    experiences: ['AI智能体开发实习生']
  }
};
const job = {
  title: '前端开发实习生-泛抖音',
  company: '字节跳动',
  description: '负责前端页面开发，熟悉React、TypeScript，有接口联调经验'
};
const greeting = humanGreetingTemplate(job, profile, 'human-project');
assert.equal(cleanGreetingJobTitle(job.title), '前端开发实习生');
assert.ok(greeting.includes('AI留学咨询工作台'), greeting);
assert.ok(greeting.includes('前端开发实习生'), greeting);
assert.ok(!greeting.includes('泛抖音'), greeting);
assert.ok(!greeting.includes('做过AI智能体开发实习生'), greeting);
assert.ok(!greeting.includes('贵公司'), greeting);
assert.ok(greeting.length >= 45 && greeting.length <= 128, greeting.length);
assert.equal(splitProjectEvidence('AI智能体开发实习生'), null);
console.log('UNIT_GREETING_V2_OK', greeting);
