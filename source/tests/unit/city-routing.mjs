import assert from 'node:assert/strict';
import {
  BOSS_CITY_CODE_FALLBACK,
  bossSearchContextMatches,
  bossSearchUrlContext,
  buildBossSearchUrl,
  collectBossCityEntries,
  mergeBossCityMaps,
  resolveBossCityCode
} from '../../src/lib/city-routing.js';

assert.equal(BOSS_CITY_CODE_FALLBACK.北京, '101010100');
assert.equal(BOSS_CITY_CODE_FALLBACK.成都, '101270100');

const payload = {
  zpData: {
    hotCityList: [{ name: '北京', code: '101010100' }],
    cityList: [{ name: '江苏', code: '101190000', subLevelModelList: [{ name: '南京市', code: '101190100' }] }]
  }
};
const entries = collectBossCityEntries(payload);
assert.equal(entries.get('北京'), '101010100');
assert.equal(entries.get('南京'), '101190100');

const merged = mergeBossCityMaps(entries, { 测试城: '101999999' });
assert.equal(resolveBossCityCode('南京市', merged), '101190100');
assert.equal(resolveBossCityCode('测试城', merged), '101999999');

const url = buildBossSearchUrl({ cityCode: '101010100', query: '前端开发实习生' });
const context = bossSearchUrlContext(url);
assert.equal(context.cityCode, '101010100');
assert.equal(context.query, '前端开发实习生');
assert.equal(bossSearchContextMatches(url, { cityCode: '101010100', query: '前端开发实习生' }), true);
assert.equal(bossSearchContextMatches(url, { cityCode: '101270100', query: '前端开发实习生' }), false);

console.log('city-routing unit tests passed');
