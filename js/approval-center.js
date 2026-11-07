/* js/approval-center.js
   مركز الموافقات: آلة حالات صريحة للاقتراحات. السياسة الوحيدة المسموحة هي
   الموافقة اليدوية. لا شيء يصير «قاعدة نشطة» إلا بانتقال صريح إلى approved،
   ولا تُعدَّل قاعدة معتمدة بصمت أبداً (التحديث = اقتراح جديد يشير للقديم).
*/
import { uid, nowIso } from './store.js';

/* انتقالات مسموحة: من الحالة -> الحالات الممكنة */
export const TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['archived', 'rolled_back'],
  rejected: [],
  archived: ['approved'],   // إعادة تنشيط قاعدة مؤرشفة (قرار صريح جديد)
  rolled_back: ['approved', 'rejected']
};

export function canDecide(proposal = {}, decision) {
  const from = proposal.status || 'pending';
  return (TRANSITIONS[from] || []).includes(decision);
}

/* يطبّق قراراً ويعيد { proposal, record } بلا تعديل الأصل. */
export function applyDecision(proposal, decision, { notes = '', now = nowIso(), recordId = uid() } = {}) {
  if (!canDecide(proposal, decision)) {
    throw new Error(`انتقال غير مسموح: من «${proposal.status}» إلى «${decision}».`);
  }
  const updated = { ...proposal, status: decision, updated_at: now };
  const record = {
    id: recordId,
    proposal_id: proposal.id,
    decision,
    notes,
    decided_at: now,
    previous_status: proposal.status
  };
  return { proposal: updated, record };
}

/* القواعد النشطة وحدها: المعتمدة فقط، بلا المؤرشفة أو المرفوضة أو المعلّقة. */
export function activeRules(proposals = []) {
  return proposals.filter((p) => p.status === 'approved');
}

/* هل يُسمح باستخدام هذا الاقتراح في مشروع جديد؟ */
export function isUsable(proposal = {}) {
  return proposal.status === 'approved';
}

/* فرق مبسّط بين قاعدة قديمة وجديدة (يُعرض للمستخدم قبل الاعتماد). */
export function rulesDiff(before = '', after = '') {
  const a = String(before).trim(), b = String(after).trim();
  if (a === b) return { changed: false, summary: 'لا تغيير.' };
  return {
    changed: true,
    before: a,
    after: b,
    summary: `قديمة: «${a}»\nجديدة: «${b}»`
  };
}

/* إنشاء اقتراح تحديث لقاعدة معتمدة. لا يلمس القديمة، وينتظر موافقة جديدة. */
export function proposeRuleUpdate(approvedProposal, newRuleText, { reason = '', expected_impact = '' } = {}) {
  if ((approvedProposal.status || '') !== 'approved') {
    throw new Error('يمكن تحديث قاعدة معتمدة فقط.');
  }
  const diff = rulesDiff(approvedProposal.rule_text, newRuleText);
  return {
    id: uid(),
    status: 'pending',
    source: 'تحديث قاعدة معتمدة',
    rule_text: String(newRuleText).trim(),
    reason: reason || 'اقتراح تحديث لقاعدة معتمدة.',
    expected_impact,
    previous_rule_id: approvedProposal.id,
    diff,
    created_at: nowIso()
  };
}

/* سجل تاريخي مرتّب (الأحدث أولاً). */
export function decisionHistory(decisions = []) {
  return [...decisions].sort((a, b) => String(b.decided_at || '').localeCompare(String(a.decided_at || '')));
}
