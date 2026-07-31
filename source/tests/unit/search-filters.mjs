import assert from 'node:assert/strict';
import { BOSS_FILTER_DEFINITIONS, BOSS_FILTER_OPTIONS, normalizeBossFilter, normalizeSearchConfig, resolveTaskCities, roundRobinSearchTasks } from '../../src/lib/search-filters.js';

assert.equal(normalizeBossFilter('在校/应届', BOSS_FILTER_OPTIONS.experiences), '应届生');
assert.equal(normalizeBossFilter('5-10k', BOSS_FILTER_OPTIONS.salaries), '5-10K');
assert.deepEqual(resolveTaskCities({ targetLocations: ['全国'], expandNationwideToCities: true, cityRotationCities: ['成都', '杭州'] }), ['成都', '杭州']);
assert.deepEqual(resolveTaskCities({ targetLocations: ['全国'], expandNationwideToCities: false }), ['全国']);
const normalized = normalizeSearchConfig({ employmentTypes: ['实习'], experiences: ['经验不限'], degrees: ['本科'], salary: '3-5K', targetLocations: ['成都'] });
assert.equal(normalized.employmentType, '实习');
assert.equal(normalized.experience, '经验不限');
assert.equal(normalized.degree, '本科');
assert.equal(normalized.salary, '3-5K');
assert.deepEqual(roundRobinSearchTasks([[{ id: 'a1' }, { id: 'a2' }], [{ id: 'b1' }, { id: 'b2' }]], 4).map(item => item.id), ['a1', 'b1', 'a2', 'b2']);
assert.equal(BOSS_FILTER_DEFINITIONS.degree.label, '学历要求');
assert.ok(BOSS_FILTER_DEFINITIONS.salary.values.includes('10-20K'));
console.log('UNIT_SEARCH_FILTERS_OK');
