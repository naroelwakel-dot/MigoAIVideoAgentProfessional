/* js/montage-engine.js
   استوديو التجميع: ترتيب المقاطع، التحقق من الحدود، وبناء أوامر FFmpeg.
   الجزء النقي فقط (بلا DOM/شبكة) هنا ليكون قابلاً للاختبار.

   حدود معلنة: التجميع بـ concat demuxer يحتاج مقاطع بنفس الترميز والأبعاد
   ومعدل الإطارات. لا ندّعي دعم كل الترميزات. مع الملفات المختلفة يلزم توحيدها.
*/
export const VIDEO_EXTS = ['mp4', 'webm', 'mov'];
export const DEFAULT_LIMITS = { MAX_FILE_MB: 120, MAX_TOTAL_FILES_MB: 300, MAX_FILES_COUNT: 12 };

export function extOf(name = '') {
  return String(name).split('.').pop().toLowerCase();
}

export function validateSelection(files = [], limits = DEFAULT_LIMITS) {
  const errors = [], warnings = [];
  const list = Array.from(files);
  let totalMB = 0;
  for (const f of list) {
    const mb = (f.size || 0) / 1024 / 1024;
    totalMB += mb;
    if (!VIDEO_EXTS.includes(extOf(f.name))) errors.push(`صيغة غير مدعومة: ${f.name} (المدعوم: ${VIDEO_EXTS.join(', ')})`);
    if (mb > limits.MAX_FILE_MB) errors.push(`الملف ${f.name} أكبر من ${limits.MAX_FILE_MB}MB.`);
  }
  if (list.length < 2) errors.push('اختر مقطعين على الأقل.');
  if (list.length > limits.MAX_FILES_COUNT) errors.push(`الحد الأقصى ${limits.MAX_FILES_COUNT} مقطعاً.`);
  if (totalMB > limits.MAX_TOTAL_FILES_MB) errors.push(`مجموع الأحجام ${totalMB.toFixed(1)}MB وأكبر من ${limits.MAX_TOTAL_FILES_MB}MB.`);

  const exts = new Set(list.map((f) => extOf(f.name)));
  if (exts.size > 1) warnings.push('المقاطع بصيغ مختلفة؛ قد يفشل الدمج أو يخرج مشوّهاً. الأفضل توحيدها إلى MP4/H.264.');
  if (totalMB > limits.MAX_TOTAL_FILES_MB * 0.6) warnings.push('الحجم كبير نسبياً على هاتف؛ قد يكون الدمج ثقيلاً أو يفشل على Android.');
  if (list.length > 6) warnings.push('عدد المقاطع كبير؛ زد احتمال استهلاك ذاكرة مرتفع على الهاتف.');

  return { ok: errors.length === 0, errors, warnings, totalMB: Number(totalMB.toFixed(1)), count: list.length };
}

/* تحريك عنصر لأعلى/أسفل في القائمة (بلا تعديل الأصل). */
export function move(list = [], index, delta) {
  const out = [...list];
  const to = index + delta;
  if (index < 0 || index >= out.length || to < 0 || to >= out.length) return out;
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

export function reorder(list = [], from, to) {
  const out = [...list];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/* أسماء الملفات داخل FFmpeg: clip0.mp4 ... */
export function clipName(index, originalName) {
  const ext = VIDEO_EXTS.includes(extOf(originalName)) ? extOf(originalName) : 'mp4';
  return `clip${index}.${ext}`;
}

export function buildConcatList(names) {
  return names.map((n) => `file '${n}'`).join('\n');
}

/* أمر الدمج. concat demuxer سريع لكنه صارم في تجانس المدخلات. */
export function buildMergeArgs({ output = 'output.mp4' } = {}) {
  return ['-f', 'concat', '-safe', '0', '-i', 'list.txt',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-movflags', '+faststart', output];
}

/* تقدير مخاطر الهاتف قبل التشغيل. */
export function estimateRisk(files = [], limits = DEFAULT_LIMITS) {
  const v = validateSelection(files, limits);
  return { level: v.errors.length ? 'blocked' : v.warnings.length ? 'caution' : 'ok', errors: v.errors, warnings: v.warnings };
}
