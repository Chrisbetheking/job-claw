import { HIGH_RISK_EXPRESSIONS } from './constants.js';
import { includesLoose, normalizeText, uniqueStrings } from './utils.js';
function projectEvidence(profile, job) {
    const text = `${job.title} ${job.description} ${job.tags.join(' ')}`;
    let best = null;
    for (const project of profile.projects) {
        const score = project.keywords.filter((keyword) => includesLoose(text, keyword)).length;
        const fact = project.facts[0];
        if (fact && (!best || score > best.score))
            best = { name: project.name, fact, score };
    }
    return best ? { name: best.name, fact: best.fact } : null;
}
export function validateGreeting(text, profile) {
    const checks = [];
    const sourceFacts = uniqueStrings([
        profile.headline,
        ...profile.education,
        ...profile.skills,
        ...profile.projects.flatMap((project) => [project.name, ...project.facts, ...project.keywords])
    ]);
    for (const expression of HIGH_RISK_EXPRESSIONS) {
        if (text.includes(expression)) {
            checks.push({
                text: expression,
                status: 'unsupported',
                evidence: [],
                reason: '属于容易夸大能力或经历的高风险表达'
            });
        }
    }
    const yearClaims = [...text.matchAll(/(\d+)\s*年(?:以上)?(?:工作|项目|开发|行业)?经验/g)];
    for (const match of yearClaims) {
        checks.push({
            text: match[0],
            status: 'unsupported',
            evidence: [],
            reason: '当前事实库没有结构化年限证据，禁止自动声明工作年限'
        });
    }
    const mentionedSkills = profile.skills.filter((skill) => includesLoose(text, skill));
    for (const skill of mentionedSkills) {
        checks.push({
            text: skill,
            status: 'supported',
            evidence: sourceFacts.filter((fact) => includesLoose(fact, skill)).slice(0, 3),
            reason: '简历事实库中存在对应技能'
        });
    }
    if (checks.length === 0) {
        checks.push({
            text: '整体表达',
            status: 'warning',
            evidence: sourceFacts.slice(0, 3),
            reason: '未发现高风险表达，但建议发送前人工确认'
        });
    }
    return {
        text: normalizeText(text),
        safe: checks.every((check) => check.status !== 'unsupported'),
        checks
    };
}
export function generateGreeting(job, profile, match) {
    const recruiter = job.recruiter ? `${job.recruiter}您好` : '您好';
    const skills = match.matchedSkills.slice(0, 3);
    const project = projectEvidence(profile, job);
    const role = job.title || '该岗位';
    let body = `${recruiter}，我目前${profile.headline || '正在关注合适的工作机会'}，看到贵司的${role}岗位。`;
    if (profile.greetingStyle === '项目' && project) {
        body += `我在“${project.name}”项目中${project.fact.replace(/[。！]$/u, '')}，与岗位方向有一定关联。`;
    }
    else if (skills.length > 0) {
        body += `我的简历中有${skills.join('、')}相关项目实践，与岗位提到的部分要求较为匹配。`;
    }
    else if (project) {
        body += `我在“${project.name}”项目中${project.fact.replace(/[。！]$/u, '')}。`;
    }
    body += '方便的话，希望进一步了解岗位和团队情况，谢谢。';
    return validateGreeting(body, profile);
}
