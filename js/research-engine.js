/* js/research-engine.js
   محرك البحث والمصادر. يدوي بالكامل: لا يوجد رصد تلقائي للإنترنت في الخلفية على
   GitHub Pages، ولا نختلق نتائج بحث ولا ننسب معلومة إلى مصدر لم تتم مراجعته.

   قاعدة أمان: أي نص قادم من مصدر خارجي هو *بيانات* لا *تعليمات*. لا يغيّر
   سلوك الوكيل ولا سياساته. نكتشف النصوص التي تحاول ذلك وننبّه المستخدم فقط.
*/
import { uid, nowIso } from './store.js';

export const SOURCE_TYPES = ['web', 'manual', 'file', 'reference_video'];
export const RELIABILITY = ['verified', 'unverified', 'outdated'];
export const SOURCE_TYPE_LABEL = { web: 'رابط ويب', manual: 'إدخال يدوي', file: 'ملف', reference_video: 'فيديو مرجعي' };
export const RELIABILITY_LABEL = { verified: 'مؤكد', unverified: 'غير مؤكد', outdated: 'قديم' };

const todayIso = (d = new Date()) => d.toISOString().slice(0, 10);

export function makeSource(input = {}) {
  if (!input.title || !String(input.title).trim()) throw new Error('عنوان المصدر مطلوب.');
  const source_type = input.source_type || 'manual';
  if (!SOURCE_TYPES.includes(source_type)) throw new Error(`نوع المصدر غير مدعوم: ${source_type}`);
  const reliability = input.reliability || 'unverified';
  if (!RELIABILITY.includes(reliability)) throw new Error(`درجة الاعتمادية غير مدعومة: ${reliability}`);
  const url = input.url ? String(input.url).trim() : null;
  if (url && !/^https?:\/\//i.test(url)) throw new Error('الرابط يجب أن يبدأ بـ http أو https.');
  return {
    id: input.id || uid(),
    title: String(input.title).trim(),
    url,
    source_type,
    reliability,
    summary: String(input.summary || '').trim(),
    accessed_at: input.accessed_at || todayIso(),
    last_reviewed_at: input.last_reviewed_at || null,
    created_at: input.created_at || nowIso(),
    updated_at: nowIso()
  };
}

/* هل المعلومة قديمة؟ (تُعرض للمستخدم، ولا تُحذف تلقائياً) */
export function staleInfo(source, { maxAgeDays = 180, now = new Date() } = {}) {
  const d = source.last_reviewed_at || source.accessed_at;
  if (!d) return { stale: true, days: null, reason: 'لا يوجد تاريخ مراجعة.' };
  const days = Math.floor((now - new Date(d)) / 86400000);
  return days > maxAgeDays
    ? { stale: true, days, reason: `لم تُراجَع منذ ${days} يوماً.` }
    : { stale: false, days, reason: 'حديثة.' };
}

/* كشف النصوص التي تحاول التصرف كتعليمات (تنبيه فقط، لا تنفيذ). */
const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous |prior )?instructions/i,
  /disregard (the )?(system|previous)/i,
  /system prompt/i,
  /you are now/i,
  /تجاهل (كل )?(التعليمات|ما سبق)/,
  /تعليمات النظام/,
  /تصرف (الآن )?ك/,
  /انسَ (كل )?(التعليمات|ما سبق)/
];
export function flagInstructionLike(text) {
  const s = String(text || '');
  const hits = INJECTION_PATTERNS.filter((r) => r.test(s)).length;
  return { flagged: hits > 0, count: hits };
}

/* إنشاء بند معرفة «موثّق» مرتبط بمصدر. يبقى معلّقاً حتى الموافقة. */
export function makeKnowledgeFromSource(source, { title, body, category = '', tags = [] } = {}) {
  if (!source || !source.id) throw new Error('مصدر غير صالح.');
  if (!title || !body) throw new Error('العنوان والمتن مطلوبان.');
  return {
    id: uid(),
    title: String(title).trim(),
    body: String(body).trim(),
    category,
    tags,
    item_type: 'documented',
    status: 'pending',
    source_id: source.id,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

export function filterSources(sources = [], { query = '', reliability = '', staleOnly = false, now = new Date() } = {}) {
  const q = String(query).toLowerCase().trim();
  return sources.filter((s) => {
    if (reliability && s.reliability !== reliability) return false;
    if (staleOnly && !staleInfo(s, { now }).stale) return false;
    if (!q) return true;
    return `${s.title} ${s.summary || ''} ${s.url || ''}`.toLowerCase().includes(q);
  });
}

export function sourceLabel(s) {
  return `${SOURCE_TYPE_LABEL[s.source_type] || s.source_type} • ${RELIABILITY_LABEL[s.reliability] || s.reliability}`;
}
