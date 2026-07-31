export const BOSS_CITY_CODE_FALLBACK = Object.freeze({
  全国: '100010000',
  北京: '101010100',
  上海: '101020100',
  天津: '101030100',
  重庆: '101040100',
  西安: '101110100',
  青岛: '101120200',
  郑州: '101180100',
  南京: '101190100',
  苏州: '101190400',
  武汉: '101200100',
  杭州: '101210100',
  厦门: '101230200',
  长沙: '101250100',
  成都: '101270100',
  广州: '101280100',
  深圳: '101280600'
});

export function normalizeBossCityName(value = '') {
  return String(value || '').trim().replace(/市$/, '');
}

export function normalizeBossCityCode(value = '') {
  const code = String(value || '').trim();
  return /^\d{9}$/.test(code) ? code : '';
}

export function collectBossCityEntries(payload, output = new Map(), seen = new Set()) {
  if (payload == null || typeof payload !== 'object' || seen.has(payload)) return output;
  seen.add(payload);
  if (!Array.isArray(payload)) {
    const name = normalizeBossCityName(payload.name || payload.cityName || payload.label || '');
    const code = normalizeBossCityCode(payload.code || payload.cityCode || payload.value || '');
    if (name && code) output.set(name, code);
  }
  for (const value of Array.isArray(payload) ? payload : Object.values(payload)) {
    if (value && typeof value === 'object') collectBossCityEntries(value, output, seen);
  }
  return output;
}

export function mergeBossCityMaps(...sources) {
  const output = new Map(Object.entries(BOSS_CITY_CODE_FALLBACK));
  for (const source of sources) {
    if (source instanceof Map) {
      for (const [name, code] of source) {
        const city = normalizeBossCityName(name);
        const cityCode = normalizeBossCityCode(code);
        if (city && cityCode) output.set(city, cityCode);
      }
      continue;
    }
    if (source && typeof source === 'object') {
      for (const [name, code] of Object.entries(source)) {
        const city = normalizeBossCityName(name);
        const cityCode = normalizeBossCityCode(code);
        if (city && cityCode) output.set(city, cityCode);
      }
    }
  }
  return output;
}

export function resolveBossCityCode(city, directory = null) {
  const target = normalizeBossCityName(city);
  if (!target) return '';
  if (directory instanceof Map) return normalizeBossCityCode(directory.get(target) || BOSS_CITY_CODE_FALLBACK[target] || '');
  return normalizeBossCityCode(directory?.[target] || BOSS_CITY_CODE_FALLBACK[target] || '');
}

export function buildBossSearchUrl({ cityCode = '', query = '', baseUrl = 'https://www.zhipin.com/web/geek/jobs' } = {}) {
  const url = new URL(baseUrl, 'https://www.zhipin.com');
  url.protocol = 'https:';
  url.hostname = 'www.zhipin.com';
  if (!/^\/web\/geek\/jobs?$/.test(url.pathname)) url.pathname = '/web/geek/jobs';
  url.search = '';
  const code = normalizeBossCityCode(cityCode);
  if (code) url.searchParams.set('city', code);
  const keyword = String(query || '').trim();
  if (keyword) url.searchParams.set('query', keyword);
  return url.toString();
}

export function bossSearchUrlContext(rawUrl = '') {
  try {
    const url = new URL(String(rawUrl || ''), 'https://www.zhipin.com');
    return {
      cityCode: normalizeBossCityCode(url.searchParams.get('city') || ''),
      query: String(url.searchParams.get('query') || '').trim(),
      path: url.pathname
    };
  } catch {
    return { cityCode: '', query: '', path: '' };
  }
}

export function bossSearchContextMatches(rawUrl, { cityCode = '', query = '' } = {}) {
  const current = bossSearchUrlContext(rawUrl);
  const expectedCode = normalizeBossCityCode(cityCode);
  const expectedQuery = String(query || '').trim();
  if (expectedCode && current.cityCode !== expectedCode) return false;
  if (expectedQuery && current.query !== expectedQuery) return false;
  return Boolean(expectedCode || expectedQuery);
}
