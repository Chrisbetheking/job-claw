import assert from 'node:assert/strict';
import { heuristicCompanyVerification, normalizeCompanyName } from '../../src/lib/company-verifier.js';

assert.equal(normalizeCompanyName('某某科技有限公司'), '某某科技');
const safe = heuristicCompanyVerification({ company: '某某科技有限公司', title: '前端开发', description: '负责产品研发' });
assert.equal(safe.riskLevel, 'low');
const risky = heuristicCompanyVerification({ company: '某某公司', title: '轻松日结', description: '入职前先交培训费并私下转账' });
assert.equal(risky.riskLevel, 'high');
console.log('UNIT_COMPANY_VERIFIER_OK');
