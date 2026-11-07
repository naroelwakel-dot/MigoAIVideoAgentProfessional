/* js/video-analyzer.js
   محلل الفيديو. الجزء النقي هنا: التحقق من الحدود، تخطيط الإطارات، تقرير التحليل،
   ومقارنة الفيديو بالخطة. استخراج الإطارات وفهمها مفصولان عمداً:
   استخراج الإطارات تقني، وفهم محتواها لا يتم إلا بوصف يدوي أو نموذج رؤية.
   لا ندّعي فهماً دلالياً كاملاً من مجرد قراءة بيانات الملف.
*/
import { nowIso } from './store.js';

export const DEFAULT_LIMITS = { MAX_ANALYZE_MB: 60, MAX_ANALYZE_FRAMES: 24, MIN_FRAMES: 3 };

export function checkLimits(file, limits = DEFAULT_LIMITS) {
  if (!file) return { ok: false, reason: 'لم يتم اختيار ملف.' };
  const mb = (file.size || 0) / 1024 / 1024;
  if (mb > limits.MAX_ANALYZE_MB) {
    return { ok: false, reason: `الملف ${mb.toFixed(1)}MB وأكبر من حد التحليل ${limits.MAX_ANALYZE_MB}MB. اختر ملفاً أصغر لتجنّب انهيار المتصفح.` };
  }
  return { ok: true, mb };
}

export function parseMetadata(input = {}) {
  const duration = Number(input.duration_seconds);
  return {
    file_name: input.file_name || null,
    file_size_bytes: input.file_size_bytes ?? null,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    width: input.width || null,
    height: input.height || null,
    frame_rate: input.frame_rate || null
  };
}

/* تخطيط الإطارات: توزيع منتظم على طول المقطع مع سقف صريح. */
export function planFrames(durationSeconds, maxFrames = DEFAULT_LIMITS.MAX_ANALYZE_FRAMES) {
  const cap = Math.max(1, Math.min(maxFrames, DEFAULT_LIMITS.MAX_ANALYZE_FRAMES));
  const d = Number(durationSeconds);
  if (!Number.isFinite(d) || d <= 0) return { timestamps: [0], note: 'المدة غير معروفة؛ سنستخدم الإطار الأول فقط.' };
  if (d <= 3) return { timestamps: Array.from({ length: Math.max(1, Math.ceil(d * 2)) }, (_, i) => Number((i * 0.5).toFixed(2))), note: '' };
  const n = Math.min(cap, Math.max(DEFAULT_LIMITS.MIN_FRAMES, Math.round(d / 5)));
  const step = d / (n - 1 || 1);
  const timestamps = Array.from({ length: n }, (_, i) => Number((i * step).toFixed(2)));
  return { timestamps: timestamps.filter((t) => t <= d), note: '' };
}

/* مقارنة مدة الفيديو بالخطة. */
export function compareToPlan(plan = {}, analysis = {}) {
  const out = { duration_match: null, delta_seconds: null, notes: [] };
  const expected = Number(plan.duration_seconds ?? plan.duration);
  const actual = Number(analysis.duration_seconds);
  if (Number.isFinite(expected) && Number.isFinite(actual)) {
    out.delta_seconds = Number((actual - expected).toFixed(2));
    out.duration_match = Math.abs(out.delta_seconds) <= 1;
    if (!out.duration_match) out.notes.push(`المدة الفعلية ${actual}ث تختلف عن الخطة ${expected}ث بفارق ${out.delta_seconds}ث.`);
  } else {
    out.notes.push('لا يمكن مقارنة المدة: بيانات ناقصة.');
  }
  if (plan.aspect_ratio && analysis.width && analysis.height) {
    const [aw, ah] = String(plan.aspect_ratio).split(':').map(Number);
    const planRatio = aw / ah, actualRatio = analysis.width / analysis.height;
    if (Math.abs(planRatio - actualRatio) > 0.05) out.notes.push(`الأبعاد الفعلية ${analysis.width}×${analysis.height} لا تطابق الخطة ${plan.aspect_ratio}.`);
  }
  return out;
}

/* تقرير نصي. يوضّح بصراحة أن أي وصف جاء من إدخال يدوي أو نموذج رؤية، لا من التحليل الآلي. */
export function buildAnalysisReport({ analysis = {}, timeline = [], notes = '', plan = null } = {}) {
  const L = [];
  L.push(`تقرير تحليل: ${analysis.file_name || 'ملف بلا اسم'}`);
  L.push(`الحجم: ${analysis.file_size_bytes ? (analysis.file_size_bytes / 1024 / 1024).toFixed(1) + 'MB' : 'غير معروف'} • المدة: ${analysis.duration_seconds ?? 'غير معروفة'}ث • الأبعاد: ${analysis.width && analysis.height ? analysis.width + '×' + analysis.height : 'غير معروفة'}`);
  if (plan) {
    const cmp = compareToPlan(plan, analysis);
    L.push(`مطابقة المدة للخطة: ${cmp.duration_match === null ? 'غير قابلة للتقييم' : cmp.duration_match ? 'مطابقة' : 'غير مطابقة'}`);
    for (const n of cmp.notes) L.push(`- ${n}`);
  }
  L.push(`عدد الإطارات المُستخرجة: ${timeline.length}`);
  const described = timeline.filter((f) => f.description && f.description.trim());
  L.push(`إطارات موصوفة يدوياً/بنموذج رؤية: ${described.length} من ${timeline.length}`);
  L.push('ملاحظة: استخراج الإطارات تقني؛ الوصف الدلالي لم يأتِ تلقائياً من الملف.');
  if (notes) L.push(`ملاحظات: ${notes}`);
  L.push(`تاريخ التقرير: ${nowIso()}`);
  return L.join('\n');
}
