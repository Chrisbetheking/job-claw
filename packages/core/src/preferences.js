import { MAINLAND_CITIES, ROLE_KEYWORDS } from './constants.js';
import { uniqueStrings } from './utils.js';
const NEGATIVE_PATTERNS = [
    /不要([^，。；\s]+)/g,
    /排除([^，。；\s]+)/g,
    /屏蔽([^，。；\s]+)/g,
    /不看([^，。；\s]+)/g
];
export function parsePreferencePrompt(prompt) {
    const targetLocations = MAINLAND_CITIES.filter((city) => prompt.includes(city));
    const targetRoles = ROLE_KEYWORDS.filter((role) => prompt.toLocaleLowerCase().includes(role.toLocaleLowerCase()));
    const excludedKeywords = [];
    for (const pattern of NEGATIVE_PATTERNS) {
        for (const match of prompt.matchAll(pattern)) {
            const value = match[1]?.trim();
            if (value)
                excludedKeywords.push(value);
        }
    }
    for (const known of ['外包', '驻场', '销售', '实施', '劳务派遣', '培训机构']) {
        if (prompt.includes(`不要${known}`) || prompt.includes(`排除${known}`) || prompt.includes(`屏蔽${known}`)) {
            excludedKeywords.push(known);
        }
    }
    return {
        targetRoles: uniqueStrings(targetRoles),
        targetLocations: uniqueStrings(targetLocations),
        excludedKeywords: uniqueStrings(excludedKeywords)
    };
}
