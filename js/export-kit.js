/* js/export-kit.js
   حزمة التصدير (منطق نقي، بلا DOM أو شبكة).
   ---------------------------------------------------------------------------
   بدل المونتاج داخل المتصفح (FFmpeg.wasm ثقيل على هواتف أندرويد وقد يفشل مع
   الملفات الكبيرة)، نُسلّم المستخدم ملفات جاهزة يستوردها في أي تطبيق مونتاج:
   - shot-list.md : قائمة اللقطات بالتوقيتات والأدوار والبرومبت المختصر.
   - prompts.md   : البرومبتات الكاملة، نسخة محسّنة بالثيم والقالب لكل مشهد.
   - subtitles.srt: ملف ترجمات/تعليق بالتوقيتات، جاهز للاستيراد مباشرة.

   لا يرفع أي شيء ولا يتصل بأي خدمة. كل الدوال نقية وقابلة للاختبار.
*/

/* تنسيق SRT: HH:MM:SS,mmm */
export function formatSrtTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const whole = Math.floor(total);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

/* نص التعليق للمشهد: الحوار إن وُجد، وإلا وصف الحدث. */
export function cueTextFor(scene = {}) {
  const d = String(scene.dialogue || '').trim();
  if (d) return d;
  return String(scene.beat || '').trim();
}

/* ملف ترجمات جاهز للاستيراد. يستخدم ثواني المشهد نفسها في الخطة. */
export function buildSrt(scenes = []) {
  const cues = [];
  let i = 0;
  for (const s of scenes) {
    const text = cueTextFor(s);
    if (!text) continue;
    i++;
    cues.push([
      String(i),
      `${formatSrtTime(s.startSeconds)} --> ${formatSrtTime(s.endSeconds)}`,
      text
    ].join('\n'));
  }
  return cues.join('\n\n') + (cues.length ? '\n' : '');
}

export function srtCueCount(scenes = []) {
  return scenes.filter((s) => cueTextFor(s)).length;
}

/* قائمة اللقطات: جدول مقروء يُفتح في أي محرر أو يُطبع. */
export function buildShotListMarkdown(plan = {}, scenes = []) {
  const L = [];
  L.push(`# قائمة لقطات — ${plan.title || 'مشروع بلا عنوان'}`);
  L.push('');
  L.push(`- المدة الكلية: ${plan.duration || '—'} ثانية على ${scenes.length} مشهد`);
  L.push(`- الأبعاد: ${plan.aspect || '—'}`);
  L.push(`- الأسلوب: ${plan.style || '—'}`);
  if (plan.objective) L.push(`- الهدف: ${plan.objective}`);
  if (plan.audience) L.push(`- الجمهور: ${plan.audience}`);
  L.push('');
  L.push('| # | التوقيت | الدور | نوع اللقطة | حركة الكاميرا | الإضاءة | القالب |');
  L.push('|---|---|---|---|---|---|---|');
  for (const s of scenes) {
    L.push(`| ${s.number} | ${s.startSeconds}–${s.endSeconds}ث | ${s.role || '—'} | ${s.shotType || '—'} | ${s.cameraMovement || '—'} | ${s.lighting || '—'} | ${s.recipeName || '—'} |`);
  }
  L.push('');
  L.push('## الحدث في كل لقطة');
  for (const s of scenes) {
    L.push(`${s.number}. **${s.role || ''}** (${s.startSeconds}–${s.endSeconds}ث): ${s.beat || ''}`);
  }
  return L.join('\n') + '\n';
}

/* البرومبتات الكاملة: الرئيسي ثم نسخة محسّنة لكل مشهد. */
export function buildPromptsMarkdown(plan = {}, scenes = []) {
  const L = [];
  L.push(`# البرومبتات — ${plan.title || 'مشروع بلا عنوان'}`);
  L.push('');
  L.push('## البرومبت الرئيسي');
  L.push('');
  L.push('```text');
  L.push(String(plan.masterPrompt || '').trim() || '(لا يوجد برومبت رئيسي)');
  L.push('```');
  L.push('');
  L.push('## برومبت كل مشهد (محسّن بالثيم والقالب)');
  for (const s of scenes) {
    L.push('');
    L.push(`### مشهد ${s.number} — ${s.role || ''} (${s.startSeconds}–${s.endSeconds}ث)`);
    if (s.recipeName) L.push(`> القالب: ${s.recipeName}`);
    L.push('');
    L.push('```text');
    L.push(String(s.promptEnriched || s.prompt || '').trim());
    L.push('```');
  }
  return L.join('\n') + '\n';
}

/* اسم ملف آمن من عنوان المشروع: نستبدل الرموز الممنوعة بمسافة ثم نحوّلها لشرطة،
   ونمنع تكرار الشرطات حتى لا يخرج اسم مثل «إعلان---متجر». */
export function safeFileName(title, fallback = 'migo-project') {
  const base = String(title || '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/\s/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || fallback;
}

/* الحزمة الكاملة: خريطة «اسم الملف ← محتواه». لا كتابة على القرص هنا. */
export function buildExportFiles(plan = {}, scenes = []) {
  return {
    'shot-list.md': buildShotListMarkdown(plan, scenes),
    'prompts.md': buildPromptsMarkdown(plan, scenes),
    'subtitles.srt': buildSrt(scenes)
  };
}

export function exportSummaryLines(plan = {}, scenes = []) {
  return [
    ['عدد المشاهد', String(scenes.length)],
    ['عدد أسطر الترجمة', String(srtCueCount(scenes))],
    ['البرومبتات', 'نسخة محسّنة لكل مشهد + البرومبت الرئيسي'],
    ['ملفات جاهزة', Object.keys(buildExportFiles(plan, scenes)).join('، ')]
  ];
}
