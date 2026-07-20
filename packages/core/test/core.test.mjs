import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateGreeting,
  matchJob,
  parsePreferencePrompt,
  validateGreeting
} from '../dist/index.js';

const profile = {
  id: 'default',
  name: '测试用户',
  headline: '是计算机相关专业学生，正在寻找前端开发机会',
  education: ['计算机相关专业'],
  targetRoles: ['前端'],
  targetLocations: ['西安'],
  skills: ['Vue', 'TypeScript', 'JavaScript'],
  projects: [{
    id: 'p1',
    name: '学习助手',
    facts: ['使用Vue完成页面与交互开发'],
    keywords: ['Vue', '前端']
  }],
  excludedKeywords: ['外包'],
  maxRequiredExperienceYears: 1,
  greetingStyle: '简洁'
};

const job = {
  platform: 'boss',
  url: 'https://www.zhipin.com/job_detail/test.html',
  title: '前端开发实习生',
  company: '示例科技',
  salary: '200-250元/天',
  location: '西安',
  experience: '经验不限',
  education: '本科',
  description: '负责Vue3与TypeScript前端页面开发，了解Webpack。',
  tags: ['Vue3', 'TypeScript', 'Webpack'],
  recruiter: '王经理',
  capturedAt: new Date().toISOString()
};

test('解析自然语言偏好', () => {
  const patch = parsePreferencePrompt('找西安和北京的前端岗位，不要外包，不要销售');
  assert.deepEqual(patch.targetLocations, ['北京', '西安']);
  assert.ok(patch.targetRoles.includes('前端'));
  assert.ok(patch.excludedKeywords.includes('外包'));
});

test('岗位匹配会给出技能缺口', () => {
  const result = matchJob(job, profile);
  assert.equal(result.blocked, false);
  assert.ok(result.matchedSkills.includes('TypeScript'));
  assert.ok(result.missingSkills.includes('Webpack'));
});

test('招呼语仅使用简历事实', () => {
  const result = generateGreeting(job, profile, matchJob(job, profile));
  assert.equal(result.safe, true);
  assert.match(result.text, /Vue|TypeScript/);
});

test('阻止夸大表达', () => {
  const result = validateGreeting('您好，我精通Vue并有5年开发经验。', profile);
  assert.equal(result.safe, false);
});
