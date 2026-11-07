/* js/learning-engine.js
   محرك التعلم (منطق نقي). يحوّل تقييمات المستخدم ومشاريعه إلى *اقتراحات*
   تنتظر الموافقة اليدوية. لا شيء يصبح قاعدة نشطة هنا.
   المنطق فقط؛ الحفظ والاعتماد في approval-center و store.
*/
import { uid, nowIso } from './store.js';

export const PROPOSAL_STATUS = ['pending', 'approved', 'rejected', 'archived'];

/* اقتراح واحد من تقييم واحد. يعيد null إن لم يكن هناك ما يستحق الاقتراح. */
export function proposeFromFeedback(feedback = {}, project = {}) {
  const rating = Number(feedback.rating);
  if (!(rating >= 1 && rating <= 5)) return null;
  const success = String(feedback.success_notes || '').trim();
  const failure = String(feedback.failure_notes || '').trim();
  const title = project.title || 'مشروع';

  const base = {
    id: uid(),
    status: 'pending',
    source: 'تقييم المستخدم',
    project_id: project.id || null,
    feedback_id: feedback.id || null,
    created_at: nowIso()
  };

  if (rating <= 2 && failure) {
    return { ...base,
      rule_text: `تجنّب في المشاريع القادمة: ${failure}`,
      reason: `تقييم منخفض (${rating}/5) على مشروع «${title}» مع ملاحظة فشل.`,
      expected_impact: 'تقليل تكرار الخطأ نفسه في مشاريع مشابهة.' };
  }
  if (rating >= 4 && success) {
    return { ...base,
      rule_text: `اعتمد كأسلوب ناجح: ${success}`,
      reason: `تقييم مرتفع (${rating}/5) على مشروع «${title}» مع ملاحظة نجاح.`,
      expected_impact: 'تكرار العناصر التي رفعت جودة المخرجات.' };
  }
  if (rating === 3 && (success || failure)) {
    return { ...base,
      rule_text: `راجع نقاط التحسين في «${title}»${failure ? ': ' + failure : '.'}`,
      reason: 'تقييم متوسط: يحتاج مراجعة يدوية قبل أي تعميم.',
      expected_impact: 'لا يُعمَّم شيء حتى تتضح النتيجة في مشروع قادم.' };
  }
  return null;
}

/* اكتشاف نمط متكرر: نفس كلمة/وسم الفشل في أكثر من تقييم منخفض. */
export function proposeFromPattern(feedbacks = [], { minOccurrences = 2 } = {}) {
  const counts = new Map();
  for (const f of feedbacks) {
    if (Number(f.rating) > 3) continue;
    const words = String(f.failure_notes || '').toLowerCase()
      .split(/[\s،,.:؛;!؟?]+/).filter((w) => w.length >= 4);
    for (const w of new Set(words)) counts.set(w, (counts.get(w) || 0) + 1);
  }
  const out = [];
  for (const [word, n] of counts) {
    if (n >= minOccurrences) {
      out.push({
        id: uid(), status: 'pending', source: 'نمط متكرر في التقييمات',
        rule_text: `انتبه لموضوع «${word}» بشكل خاص؛ تكرّر في تقييمات منخفضة.`,
        reason: `ظهر «${word}» في ${n} تقييمات منخفضة.`,
        expected_impact: 'معالجة سبب متكرر للضعف.',
        project_id: null, feedback_id: null, created_at: nowIso()
      });
    }
  }
  return out;
}

/* ملخص تعلم من كل البيانات (للعرض فقط). */
export function learningSummary({ projects = [], feedbacks = [], proposals = [] } = {}) {
  const byStatus = { pending: 0, approved: 0, rejected: 0, archived: 0 };
  for (const p of proposals) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  const rated = feedbacks.filter((f) => Number(f.rating) >= 1);
  const avg = rated.length ? rated.reduce((a, f) => a + Number(f.rating), 0) / rated.length : 0;
  return {
    projects: projects.length,
    feedbacks: feedbacks.length,
    average_rating: Number(avg.toFixed(2)),
    proposals: proposals.length,
    by_status: byStatus
  };
}
