/* js/knowledge-base.js
   قاعدة المعرفة: استرجاع المعرفة *المعتمدة فقط*، مع فصل صريح بين
   المعلومة الموثّقة والاقتراح والاستنتاج، ومنع تكرار المعلومة نفسها.
*/
import { uid, nowIso } from './store.js';

export const ITEM_TYPES = ['documented', 'proposal', 'inference'];
export const ITEM_STATUSES = ['pending', 'approved', 'rejected', 'archived'];

export const TYPE_LABEL = { documented: 'موثّق', proposal: 'اقتراح', inference: 'استنتاج' };
export const typeLabel = (t) => TYPE_LABEL[t] || t;

export const normalizeText = (s) => String(s || '')
  .toLowerCase()
  .replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[ً-ٰٟ]/g, '')      // تشكيل
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ').trim();

/* منعالتكرار: نفس العنوان أو نفس المتن بعد التطبيع. */
export function isDuplicate(items = [], candidate = {}) {
  const nt = normalizeText(candidate.body || candidate.title);
  const ntitle = normalizeText(candidate.title);
  return items.some((it) => {
    if (it.id && candidate.id && it.id === candidate.id) return false;
    const itBody = normalizeText(it.body || it.title);
    return itBody === nt || normalizeText(it.title) === ntitle;
  });
}

export function makeItem(input = {}) {
  if (!input.title || !String(input.title).trim()) throw new Error('عنوان المعلومة مطلوب.');
  if (!input.body || !String(input.body).trim()) throw new Error('نص المعلومة مطلوب.');
  const item_type = input.item_type || 'documented';
  if (!ITEM_TYPES.includes(item_type)) throw new Error(`نوع المعلومة غير مدعوم: ${item_type}`);
  const status = input.status || 'pending';
  if (!ITEM_STATUSES.includes(status)) throw new Error(`حالة المعلومة غير مدعومة: ${status}`);
  return {
    id: input.id || uid(),
    title: String(input.title).trim(),
    body: String(input.body).trim(),
    category: input.category || '',
    tags: Array.isArray(input.tags) ? input.tags : [],
    item_type,
    status,
    source_id: input.source_id || null,
    project_id: input.project_id || null,
    created_at: input.created_at || nowIso(),
    updated_at: nowIso()
  };
}

/* المعرفة النشطة = المعتمدة فقط. */
export function activeKnowledge(items = []) {
  return items.filter((i) => i.status === 'approved');
}

/* استرجاع بسيط بالمعنى عبر الكلمات والوسوم والتصنيف، على المعتمد فقط.
   (ليس بحثاً دلالياً؛ مجرد مطابقة نصية مرتّبة بالأهمية.) */
export function retrieve(items = [], { query = '', tags = [], category = '' } = {}) {
  const approved = activeKnowledge(items);
  const terms = normalizeText(query).split(' ').filter(Boolean);
  const wantTags = tags.map(normalizeText).filter(Boolean);

  return approved
    .map((it) => {
      let score = 0;
      const hay = normalizeText(`${it.title} ${it.body} ${(it.tags || []).join(' ')}`);
      for (const t of terms) if (t && hay.includes(t)) score += 2;
      for (const t of wantTags) if ((it.tags || []).map(normalizeText).includes(t)) score += 3;
      if (category && normalizeText(it.category) === normalizeText(category)) score += 2;
      return { item: it, score };
    })
    .filter((r) => (terms.length || wantTags.length || category) ? r.score > 0 : true)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}

/* ملاحظات تُعرض مع أي معلومة مستخدمة: مصدرها ونوعها. */
export function provenance(item, source = null) {
  return {
    id: item.id,
    title: item.title,
    type_label: typeLabel(item.item_type),
    is_documented: item.item_type === 'documented',
    is_inference: item.item_type === 'inference',
    status: item.status,
    source: source ? { title: source.title, url: source.url, accessed_at: source.accessed_at } : null
  };
}
