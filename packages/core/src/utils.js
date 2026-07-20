export function normalizeText(input) {
    return input
        .replace(/\u00a0/g, ' ')
        .replace(/[\t\r]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\s{2,}/g, ' ')
        .trim();
}
export function uniqueStrings(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
export function includesLoose(haystack, needle) {
    return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}
export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
