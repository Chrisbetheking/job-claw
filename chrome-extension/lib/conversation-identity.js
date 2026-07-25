export function normalizeConversationIdentity(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/有限责任公司|股份有限公司|有限公司|招聘者|招聘方|人事行政|人事|hr|在线|刚刚活跃|活跃/gi, '')
    .replace(/[()（）【】\[\]<>《》,，。.:：;；_\-—·•｜|]/g, '')
    .trim()
    .toLowerCase();
}

export function deriveConversationReservationKey(context = {}, expected = {}, pendingId = '') {
  const recruiterName = String(context.recruiterName || expected.recruiterName || '').trim();
  const company = String(context.companyName || expected.company || '').trim();
  const recruiterKey = normalizeConversationIdentity(recruiterName).slice(0, 80);
  const companyKey = normalizeConversationIdentity(company).slice(0, 100);
  if (recruiterKey) return `hr:${recruiterKey}${companyKey ? `|company:${companyKey}` : ''}`;

  const token = String(context.urlToken || '').trim();
  if (/conversationid=|chatid=|relationid=|bossid=|uid=/i.test(token)) return `chat:${token}`;
  const observed = normalizeConversationIdentity(`${context.headerText || ''} ${context.selectedText || ''}`).slice(0, 160);
  if (observed) return `observed:${observed}`;
  return pendingId ? `task:${String(pendingId)}` : '';
}

export function sameRecruiterReservation(entry = {}, recruiterName = '', company = '') {
  const leftRecruiter = normalizeConversationIdentity(entry.recruiterName);
  const rightRecruiter = normalizeConversationIdentity(recruiterName);
  if (!leftRecruiter || !rightRecruiter || leftRecruiter !== rightRecruiter) return false;
  const leftCompany = normalizeConversationIdentity(entry.company);
  const rightCompany = normalizeConversationIdentity(company);
  // 两边公司都明确且不一致时，允许同名 HR；任一侧公司缺失时按安全策略视为同一会话。
  return !(leftCompany && rightCompany && leftCompany !== rightCompany);
}
