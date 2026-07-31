export const BOSS_FILTER_OPTIONS = Object.freeze({
  employmentTypes: ['不限', '全职', '兼职', '实习'],
  salaries: ['不限', '3K以下', '3-5K', '5-10K', '10-20K', '20-50K', '50K以上'],
  experiences: ['不限', '在校生', '应届生', '经验不限', '1年以内', '1-3年', '3-5年', '5-10年', '10年以上'],
  degrees: ['不限', '初中及以下', '中专/中技', '高中', '大专', '本科', '硕士', '博士'],
  rotationCities: ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '西安', '苏州', '重庆', '长沙', '天津', '郑州', '厦门', '青岛']
});


export const BOSS_FILTER_DEFINITIONS = Object.freeze({
  employmentType: Object.freeze({ label: '求职类型', values: BOSS_FILTER_OPTIONS.employmentTypes, metaPattern: 'job[-_ ]?type|position[-_ ]?type|employment|求职类型' }),
  salary: Object.freeze({ label: '薪资待遇', values: BOSS_FILTER_OPTIONS.salaries, metaPattern: 'salary|pay|compensation|薪资' }),
  experience: Object.freeze({ label: '工作经验', values: BOSS_FILTER_OPTIONS.experiences, metaPattern: 'experience|work[-_ ]?exp|经验' }),
  degree: Object.freeze({ label: '学历要求', values: BOSS_FILTER_OPTIONS.degrees, metaPattern: 'degree|education|学历' })
});

export function filterDefinitionByLabel(label = '') {
  const text = String(label || '').trim();
  return Object.values(BOSS_FILTER_DEFINITIONS).find(item => item.label === text) || null;
}

const aliases = new Map([
  ['不限', '不限'], ['无要求', '不限'], ['不限制', '不限'],
  ['在校/应届', '应届生'], ['在校', '在校生'], ['应届', '应届生'],
  ['经验不限', '经验不限'], ['1年以下', '1年以内'], ['一年以内', '1年以内'],
  ['1到3年', '1-3年'], ['3到5年', '3-5年'], ['5到10年', '5-10年'],
  ['中专', '中专/中技'], ['中技', '中专/中技'], ['初中', '初中及以下'],
  ['3k以下', '3K以下'], ['3-5k', '3-5K'], ['5-10k', '5-10K'], ['10-20k', '10-20K'], ['20-50k', '20-50K'], ['50k以上', '50K以上']
]);

function clean(value = '') {
  return String(value || '').trim().replace(/\s+/g, '').replace(/[～~—–]/g, '-');
}

export function normalizeBossFilter(value = '', options = []) {
  const source = clean(value);
  if (!source) return '不限';
  const alias = aliases.get(source) || aliases.get(source.toLowerCase());
  if (alias && options.includes(alias)) return alias;
  const exact = options.find(option => clean(option).toLowerCase() === source.toLowerCase());
  return exact || '不限';
}

export function normalizeCityList(values = [], fallback = []) {
  const source = Array.isArray(values) ? values : String(values || '').split(/[，,\n]/);
  const seen = new Set();
  const output = [];
  for (const raw of source) {
    const city = String(raw || '').trim().replace(/市$/, '');
    if (!city || seen.has(city)) continue;
    seen.add(city);
    output.push(city);
  }
  return output.length ? output : [...fallback];
}

export function resolveTaskCities(config = {}) {
  const requested = normalizeCityList(config.targetLocations || []);
  const rotationPool = normalizeCityList(config.cityRotationCities || [], BOSS_FILTER_OPTIONS.rotationCities);
  const expandNationwide = config.expandNationwideToCities !== false;
  if (!requested.length) return [''];
  const explicit = requested.filter(city => city !== '全国');
  if (requested.includes('全国') && expandNationwide) return normalizeCityList([...explicit, ...rotationPool]);
  return requested;
}

export function normalizeSearchConfig(config = {}) {
  return {
    employmentType: normalizeBossFilter((config.employmentTypes || [])[0] || '不限', BOSS_FILTER_OPTIONS.employmentTypes),
    salary: normalizeBossFilter(config.salary || '不限', BOSS_FILTER_OPTIONS.salaries),
    experience: normalizeBossFilter((config.experiences || [])[0] || '不限', BOSS_FILTER_OPTIONS.experiences),
    degree: normalizeBossFilter((config.degrees || [])[0] || '不限', BOSS_FILTER_OPTIONS.degrees),
    cities: resolveTaskCities(config),
    maxSearchTasks: Math.max(1, Math.min(300, Number(config.maxSearchTasks || 120))),
    maxJobsPerTask: Math.max(1, Math.min(100, Number(config.maxJobsPerTask || 20)))
  };
}

export function roundRobinSearchTasks(taskGroups = [], limit = 120) {
  const groups = taskGroups.map(group => [...group]).filter(group => group.length);
  const output = [];
  while (groups.some(group => group.length) && output.length < limit) {
    for (const group of groups) {
      if (!group.length || output.length >= limit) continue;
      output.push(group.shift());
    }
  }
  return output;
}
