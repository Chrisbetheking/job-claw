import assert from 'node:assert/strict';
import {
  normalizeConversationIdentity,
  deriveConversationReservationKey,
  sameRecruiterReservation
} from '../../src/lib/conversation-identity.js';

assert.equal(normalizeConversationIdentity(' 张女士 · HR 在线 '), '张女士');
assert.equal(
  deriveConversationReservationKey({ recruiterName: '王先生', companyName: '字节跳动有限公司' }),
  'hr:王先生|company:字节跳动'
);
assert.equal(sameRecruiterReservation({ recruiterName: '王先生', company: '字节跳动' }, '王先生', '字节跳动有限公司'), true);
assert.equal(sameRecruiterReservation({ recruiterName: '王先生', company: '字节跳动' }, '王先生', '腾讯'), false);
console.log('UNIT_CONVERSATION_IDENTITY_OK');
