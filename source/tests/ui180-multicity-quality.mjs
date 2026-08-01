import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
const common = await readFile('src/common.js', 'utf8');
const background = await readFile('src/background.js', 'utf8');
const content = await readFile('src/content-v37.js', 'utf8');
const html = await readFile('public/sidepanel.html', 'utf8');
const quality = await readFile('src/lib/job-quality.js', 'utf8');
const filters = await readFile('src/lib/search-filters.js', 'utf8');

if (manifest.version !== '2.2.0') throw new Error('v2.2.0 manifest missing');
for (const id of ['locations', 'expandNationwideToCities', 'cityRotationCities', 'types', 'salary', 'experience', 'degree', 'maxJobsPerTask', 'stagnationLimit', 'dedupeWindowDays', 'lowQualityPolicy', 'clearJobHistory', 'jobHistoryCount']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`v2.0 UI missing ${id}`);
}
for (const token of ['applyHeaderCityFilter', 'submitKeywordSearch', "['求职类型', task.employmentType", "['薪资待遇', task.salary", "['工作经验', task.experience", "['学历要求', task.degree", 'duplicateStreak', 'stagnationTriggered', 'loadMoreCards', '正在继续加载更多岗位']) {
  if (!content.includes(token)) throw new Error(`v2.0 content missing ${token}`);
}
for (const token of ['v180SearchFilterMigration', 'jobSeenHistory', 'normalizeSearchConfig', 'roundRobinSearchTasks', 'findSeenDuplicate', 'evaluateJobQuality', 'CLEAR_JOB_HISTORY']) {
  if (!background.includes(token) && !common.includes(token)) throw new Error(`v2.0 background missing ${token}`);
}
if (!quality.includes('evaluateJobQuality') || !quality.includes('findSeenDuplicate')) throw new Error('job quality module missing');
if (!filters.includes('resolveTaskCities') || !filters.includes('roundRobinSearchTasks')) throw new Error('search filter module missing');
console.log('UI180_MULTICITY_QUALITY_OK');
