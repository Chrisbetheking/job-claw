import { TECH_KEYWORDS } from './constants.js';
import { clamp, includesLoose, uniqueStrings } from './utils.js';
function parseRequiredExperienceYears(text) {
    const normalized = text.replace(/经验/g, '');
    const range = normalized.match(/(\d+)\s*[-~—至]\s*(\d+)\s*年/);
    if (range?.[1])
        return Number(range[1]);
    const min = normalized.match(/(\d+)\s*年以上/);
    if (min?.[1])
        return Number(min[1]);
    const single = normalized.match(/(\d+)\s*年/);
    if (single?.[1])
        return Number(single[1]);
    return 0;
}
function extractJobSkills(job, profile) {
    const source = `${job.title}\n${job.description}\n${job.tags.join(' ')}`;
    const candidates = uniqueStrings([...TECH_KEYWORDS, ...profile.skills]);
    return candidates.filter((keyword) => includesLoose(source, keyword));
}
function dimension(key, label, score, maxScore, reasons) {
    return { key, label, score: clamp(Math.round(score), 0, maxScore), maxScore, reasons };
}
export function matchJob(job, profile) {
    const fullText = `${job.title}\n${job.company}\n${job.location}\n${job.description}\n${job.tags.join(' ')}`;
    const blockReasons = [];
    for (const keyword of profile.excludedKeywords) {
        if (includesLoose(fullText, keyword))
            blockReasons.push(`命中排除关键词：${keyword}`);
    }
    const requiredYears = parseRequiredExperienceYears(`${job.experience} ${job.description.slice(0, 500)}`);
    if (requiredYears > profile.maxRequiredExperienceYears) {
        blockReasons.push(`岗位最低经验约 ${requiredYears} 年，超过当前允许上限 ${profile.maxRequiredExperienceYears} 年`);
    }
    const roleMatches = profile.targetRoles.filter((role) => includesLoose(job.title, role));
    const roleScore = profile.targetRoles.length === 0 ? 12 : roleMatches.length > 0 ? 20 : 4;
    const roleReasons = roleMatches.length > 0
        ? [`职位名称命中：${roleMatches.join('、')}`]
        : ['职位名称未直接命中目标方向'];
    const jobSkills = extractJobSkills(job, profile);
    const matchedSkills = jobSkills.filter((skill) => profile.skills.some((own) => includesLoose(own, skill) || includesLoose(skill, own)));
    const missingSkills = jobSkills.filter((skill) => !matchedSkills.includes(skill));
    const skillRatio = jobSkills.length === 0 ? 0.45 : matchedSkills.length / jobSkills.length;
    const skillScore = 45 * skillRatio;
    const skillReasons = [
        matchedSkills.length ? `已匹配：${matchedSkills.slice(0, 8).join('、')}` : '暂未识别到直接匹配的技能',
        missingSkills.length ? `JD提及但简历未体现：${missingSkills.slice(0, 6).join('、')}` : '未发现明显技能缺口'
    ];
    const locationMatches = profile.targetLocations.filter((location) => includesLoose(job.location, location));
    const locationScore = profile.targetLocations.length === 0 ? 10 : locationMatches.length > 0 ? 15 : 2;
    const locationReasons = locationMatches.length > 0
        ? [`工作地点符合：${locationMatches.join('、')}`]
        : ['工作地点未命中目标地区'];
    const experienceScore = requiredYears === 0 ? 10 : requiredYears <= profile.maxRequiredExperienceYears ? 10 : 0;
    const experienceReasons = requiredYears === 0
        ? ['未识别到明确的最低年限限制']
        : [`识别到最低经验要求约 ${requiredYears} 年`];
    const riskScore = blockReasons.length === 0 ? 10 : 0;
    const riskReasons = blockReasons.length === 0 ? ['未命中排除规则'] : blockReasons;
    const dimensions = [
        dimension('role', '方向匹配', roleScore, 20, roleReasons),
        dimension('skill', '技能匹配', skillScore, 45, skillReasons),
        dimension('location', '地区匹配', locationScore, 15, locationReasons),
        dimension('experience', '经验要求', experienceScore, 10, experienceReasons),
        dimension('risk', '风险规则', riskScore, 10, riskReasons)
    ];
    return {
        score: clamp(dimensions.reduce((sum, item) => sum + item.score, 0), 0, 100),
        blocked: blockReasons.length > 0,
        blockReasons,
        matchedSkills,
        missingSkills,
        dimensions
    };
}
