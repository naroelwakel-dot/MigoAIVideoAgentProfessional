/* tests/run-tests-chat.mjs
   اختبارات محادثة التخطيط (منطق نقي، بلا شبكة وبلا مفاتيح).
   لا يلمس هذا الاختبار أي مفتاح API ولا يتصل بأي خدمة.
*/
import {
  DEFAULT_MODEL, endpointFor,
  DURATION_OPTIONS, ASPECT_OPTIONS, STYLE_OPTIONS,
  SYSTEM_PROMPT, buildContents, buildRequestBody, extractText, extractError,
  findTrailingJson, parseAssistantMessage, snapDuration, normalizeAspect,
  normalizeStyle, normalizeBrief, briefToStudioFields, newChatState,
  pushMessage, historyForModel, briefSummaryLines
} from '../js/chat-engine.js';

let pass = 0, fail = 0; const results = [];
function check(name, fn) {
  try { fn(); pass++; results.push(`PASS  ${name}`); }
  catch (e) { fail++; results.push(`FAIL  ${name}\n      ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }
function eq(a, b, m) { if (a !== b) throw new Error(`${m} (المتوقع ${JSON.stringify(b)} والفعلي ${JSON.stringify(a)})`); }
function ok(a, m) { if (!a) throw new Error(m); }

/* ---------- العنوان والنموذج ---------- */
check('endpointFor يبني عنوان Gemini للنموذج الافتراضي', () => {
  const u = endpointFor();
  ok(u.includes(DEFAULT_MODEL), 'يجب أن يحوي اسم النموذج');
  ok(u.startsWith('https://generativelanguage.googleapis.com/v1beta/models/'), 'نطاق Google الصحيح');
  ok(u.endsWith(':generateContent'), 'نهاية العنوان');
});

check('endpointFor يستخدم النموذج المطلوب ويهرّب الرموز', () => {
  ok(endpointFor('gemini-2.5-pro').includes('gemini-2.5-pro'), 'النموذج المطلوب');
  ok(endpointFor('a b').includes('a%20b'), 'يجب ترميز المسافة');
  ok(endpointFor('').includes(DEFAULT_MODEL), 'الفارغ يرجع للافتراضي');
});

/* ---------- بناء الطلب ---------- */
check('buildContents يحوّل assistant إلى model ويستبعد الفارغ', () => {
  const c = buildContents([
    { role: 'user', text: 'مرحباً' },
    { role: 'assistant', text: 'أهلاً' },
    { role: 'user', text: '   ' },
    { role: 'system', text: 'لا يُرسل' }
  ]);
  eq(c.length, 2, 'رسالتان صالحتان');
  eq(c[0].role, 'user', 'الدور الأول');
  eq(c[1].role, 'model', 'assistant يصبح model');
  eq(c[1].parts[0].text, 'أهلاً', 'النص محفوظ');
});

check('buildRequestBody يضع تعليمة النظام والتهيئة', () => {
  const b = buildRequestBody([{ role: 'user', text: 'فكرة' }], { temperature: 0.3, maxOutputTokens: 256 });
  eq(b.contents.length, 1, 'رسالة واحدة');
  eq(b.systemInstruction.parts[0].text, SYSTEM_PROMPT, 'تعليمة النظام');
  eq(b.generationConfig.temperature, 0.3, 'الحرارة');
  eq(b.generationConfig.maxOutputTokens, 256, 'حد الرموز');
});

check('SYSTEM_PROMPT يذكر صيغة الملخص ويمنع التخمين', () => {
  ok(SYSTEM_PROMPT.includes('"ready":true'), 'يجب أن توضح صيغة الملخص');
  ok(SYSTEM_PROMPT.includes('لا تفترض'), 'يجب أن تمنع الافتراض');
  for (const s of STYLE_OPTIONS) ok(SYSTEM_PROMPT.includes(s), `يجب أن تذكر الأسلوب: ${s}`);
});

/* ---------- قراءة الرد ---------- */
check('extractText يجمع الأجزاء ويتحمّل الرد الناقص', () => {
  eq(extractText({
    candidates: [{ content: { parts: [{ text: 'أ' }, { text: 'ب' }] } }]
  }), 'أب', 'يجمع الأجزاء');
  eq(extractText({}), '', 'رد فارغ');
  eq(extractText(null), '', 'لا يرمي على null');
  eq(extractText({ candidates: [{}] }), '', 'مرشح بلا محتوى');
});

check('extractError يقرأ رسالة الخطأ وسبب الحجب', () => {
  eq(extractError({ error: { message: 'مفتاح غير صالح' } }), 'مفتاح غير صالح', 'رسالة الخطأ');
  ok(extractError({ candidates: [{ blockReason: 'SAFETY' }] }).includes('SAFETY'), 'سبب الحجب');
  eq(extractError({}), '', 'بلا خطأ');
});

/* ---------- استخراج الملخص ---------- */
check('findTrailingJson يجد كتلة الملخص في نهاية النص', () => {
  const hit = findTrailingJson('كلام عادي.\n{"ready":true,"brief":{"title":"ن"}}');
  ok(hit, 'يجب أن يجدها');
  eq(hit.json.ready, true, 'الحقل ready');
  eq(hit.json.brief.title, 'ن', 'العنوان');
});

check('findTrailingJson يتجاهل JSON غير صالحة أو بلا علامتنا', () => {
  eq(findTrailingJson('نص بلا JSON'), null, 'بلا JSON');
  eq(findTrailingJson('{"a":1}'), null, 'JSON بلا حقولنا');
  eq(findTrailingJson('{"ready":'), null, 'JSON مقطوعة');
});

check('findTrailingJson يقبل النص العربي داخل القيم مع أقواس مزدوجة', () => {
  const hit = findTrailingJson('...\n{"ready":true,"brief":{"idea":"قال: «اهرب» ثم {توقف}"}}');
  ok(hit, 'يجب أن يتعامل مع الأقواس داخل النص');
  eq(hit.json.brief.idea, 'قال: «اهرب» ثم {توقف}', 'النص كما هو');
});

check('parseAssistantMessage يفصل النص عن الملخص', () => {
  const raw = 'تمام، الفكرة واضحة الآن.\n{"ready":true,"brief":{"title":"أسطورة","idea":"تنين يبحث عن ابنه","duration":30,"aspect":"9:16","style":"فانتازيا ملحمية"}}';
  const r = parseAssistantMessage(raw);
  eq(r.text, 'تمام، الفكرة واضحة الآن.', 'النص بلا كتلة JSON');
  eq(r.ready, true, 'جاهز');
  eq(r.brief.duration, 30, 'المدة');
  eq(r.brief.aspect, '9:16', 'الأبعاد');
  eq(r.brief.style, 'فانتازيا ملحمية', 'الأسلوب');
});

check('parseAssistantMessage لا يعرض الملخص إن لم يكتمل', () => {
  const r = parseAssistantMessage('ما المدة التي تريدها؟ 15 أم 60 ثانية؟');
  eq(r.brief, null, 'لا ملخص');
  eq(r.ready, false, 'غير جاهز');
  eq(r.text, 'ما المدة التي تريدها؟ 15 أم 60 ثانية؟', 'النص كما هو');
});

check('parseAssistantMessage: ready=false لا يعرض بطاقة حتى لو وُجد brief', () => {
  const r = parseAssistantMessage('لسه محتاج أعرف الجمهور.\n{"ready":false,"brief":{"title":"x","idea":"y"}}');
  eq(r.ready, false, 'غير جاهز');
  eq(r.text, 'لسه محتاج أعرف الجمهور.', 'الكتلة أُزيلت من العرض');
});

/* ---------- التطبيع ---------- */
check('snapDuration يضبط المدة على أقرب قيمة مسموحة', () => {
  eq(snapDuration(58), 60, 'أقرب لـ60');
  eq(snapDuration(20), 15, 'أقرب لـ15');
  eq(snapDuration('45'), 45, 'نص رقمي');
  eq(snapDuration(9999), 120, 'أقصى قيمة');
  eq(snapDuration('abc'), null, 'نص غير رقمي');
});

check('normalizeAspect يقبل الصيغ الشائعة', () => {
  eq(normalizeAspect('9:16'), '9:16', 'كما هي');
  eq(normalizeAspect('16×9'), '16:9', 'علامة الضرب');
  eq(normalizeAspect('عمودي'), '9:16', 'بالعربي');
  eq(normalizeAspect('vertical'), '9:16', 'بالإنجليزية');
  eq(normalizeAspect('مربع'), '1:1', 'مربع');
  eq(normalizeAspect('مائل'), null, 'غير معروف');
});

check('normalizeStyle يطابق الأسلوب أو يستنتج من الوصف', () => {
  eq(normalizeStyle('وثائقي واقعي'), 'وثائقي واقعي', 'مطابقة مباشرة');
  eq(normalizeStyle('عايزه إعلان فاخر لمنتج'), 'إعلان تجاري فاخر', 'استنتاج');
  eq(normalizeStyle('anime 3d'), 'أنيميشن ثلاثي الأبعاد', 'استنتاج لاتيني');
  eq(normalizeStyle(''), null, 'فارغ');
});

check('normalizeBrief يرمي الملخص الفارغ ويضع قيماً افتراضية', () => {
  eq(normalizeBrief({}), null, 'بلا عنوان ولا فكرة');
  eq(normalizeBrief(null), null, 'null');
  const b = normalizeBrief({ idea: 'قط يعزف البيانو' });
  eq(b.duration, 60, 'المدة الافتراضية');
  eq(b.aspect, '9:16', 'الأبعاد الافتراضية');
  ok(b.title.length > 0, 'يُشتق عنوان من الفكرة');
});

check('normalizeBrief يقصر النصوص الطويلة', () => {
  const b = normalizeBrief({ title: 'ط'.repeat(200), idea: 'ف'.repeat(5000) });
  ok(b.title.length <= 90, 'عنوان مقصوص');
  ok(b.idea.length <= 2000, 'فكرة مقصوصة');
});

check('briefToStudioFields ينتج قيماً مطابقة لحقول النموذج', () => {
  const f = briefToStudioFields({ title: 'إعلان', idea: 'متجر', duration: 32, aspect: 'عمودي', style: 'إعلان تجاري فاخر' });
  eq(f.pTitle, 'إعلان', 'العنوان');
  eq(f.pDuration, '30', 'المدة كنص للحقل');
  eq(f.pAspect, '9:16', 'الأبعاد');
  eq(f.pStyle, 'إعلان تجاري فاخر', 'الأسلوب');
  ok(DURATION_OPTIONS.includes(Number(f.pDuration)), 'المدة من القائمة المسموحة');
  ok(ASPECT_OPTIONS.includes(f.pAspect), 'الأبعاد من القائمة المسموحة');
  ok(STYLE_OPTIONS.includes(f.pStyle), 'الأسلوب من القائمة المسموحة');
  eq(briefToStudioFields({}), null, 'ملخص فارغ يعطي null');
});

/* ---------- حالة المحادثة ---------- */
check('pushMessage لا يعدّل الحالة الأصلية', () => {
  const s0 = newChatState();
  const s1 = pushMessage(s0, 'user', 'أهلاً');
  eq(s0.messages.length, 0, 'الأصل سليم');
  eq(s1.messages.length, 1, 'الجديدة فيها رسالة');
  eq(s1.messages[0].role, 'user', 'الدور');
});

check('historyForModel يحوّل الأدوار ويستبعد الفارغ', () => {
  const s = pushMessage(pushMessage(newChatState(), 'user', 'فكرة'), 'assistant', 'وضّح أكثر');
  const h = historyForModel(s);
  eq(h.length, 2, 'رسالتان');
  eq(h[0].role, 'user', 'المستخدم');
  eq(h[1].role, 'model', 'المساعد');
  eq(historyForModel(newChatState()).length, 0, 'محادثة فارغة');
});

check('briefSummaryLines تعرض الصفوف غير الفارغة فقط', () => {
  const rows = briefSummaryLines({ title: 'فيلم', idea: 'قصة', duration: 15, aspect: '16:9', style: 'وثائقي واقعي' });
  ok(rows.length >= 5, 'صفوف كافية');
  ok(rows.every(([, v]) => v), 'لا صفوف فارغة');
  eq(briefSummaryLines({}), null, 'ملخص فارغ');
});

/* ---------- النتيجة ---------- */
console.log(results.join('\n'));
console.log(`\n${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
