/* js/chat-engine.js
   منطق محادثة التخطيط (منطق نقي، بلا DOM وبلا شبكة).
   قابل للاستيراد في Node للاختبارات الآلية.
   ---------------------------------------------------------------------------
   الفكرة: المستخدم يتكلم مع الوكيل قبل كتابة أي برومبت. الوكيل يسأل ويوضّح،
   وعندما تصبح الفكرة واضحة يقترح "ملخص مشروع" (brief). الملخص لا يصبح
   مشروعاً فعلياً إلا عندما يضغط المستخدم زر «افتحه في الاستوديو».
   ---------------------------------------------------------------------------
   المفتاح: هذا الملف لا يعرف شيئاً عن مفاتيح الـ API ولا عن مكان تخزينها.
   مفتاح Gemini يُحفظ على جهاز المستخدم فقط (localStorage) كما اختار المستخدم.
*/

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export function endpointFor(model = DEFAULT_MODEL) {
  const m = String(model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;
}

/* القيم المسموح بها في نموذج الاستوديو، حتى لا يتولّد ملخص لا يقبله النموذج. */
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
export const ASPECT_OPTIONS = ['9:16', '16:9', '1:1'];
export const STYLE_OPTIONS = [
  'سينمائي واقعي للغاية',
  'فانتازيا ملحمية',
  'إعلان تجاري فاخر',
  'أنيميشن ثلاثي الأبعاد',
  'وثائقي واقعي'
];

/* تعليمة النظام: تتكلم عربي، تسأل قبل أن تفترض، وتخرج ملخصاً بصيغة محددة. */
export const SYSTEM_PROMPT = [
  'أنت "ميجو"، مساعد تخطيط إنتاج فيديو داخل استوديو عربي خاص.',
  'مهمتك: تناقش المستخدم في فكرة الفيديو قبل أن يكتب أي برومبت أو تصميم.',
  '',
  'قواعد الحوار:',
  '- اكتب بالعربية الفصحى المبسطة، بجُمل قصيرة وواضحة.',
  '- اسأل سؤالاً أو سؤالين في الرسالة الواحدة، لا أكثر، عن أهم ما ينقص:',
  '  الفكرة والحدث، الهدف، الجمهور، المدة، الأبعاد (عمودي/أفقي/مربع)، الأسلوب البصري.',
  '- لا تفترض تفاصيل لم يذكرها المستخدم وتقدّمها كأنها طلبه.',
  '- إن كان في الرسالة غموض، اسأل عنه بدلاً من التخمين.',
  '- كن مختصراً؛ لا تكتب خططاً طويلة قبل أن تكتمل الصورة.',
  '',
  'عندما تصبح الصورة واضحة بما يكفي لبناء خطة مشاهد، أضف في نهاية رسالتك سطراً واحداً',
  'بهذا الشكل بالضبط، دون أي شرح حوله:',
  '{"ready":true,"brief":{"title":"...","idea":"...","objective":"...","audience":"...","duration":60,"aspect":"16:9","style":"سينمائي واقعي للغاية"}}',
  '',
  'شروط هذا السطر:',
  '- duration رقم من: 15 أو 30 أو 45 أو 60 أو 90 أو 120.',
  '- aspect واحد من: "9:16" أو "16:9" أو "1:1".',
  `- style واحد من: ${STYLE_OPTIONS.map((s) => `"${s}"`).join(' أو ')}.`,
  '- لا تُخرج هذا السطر إلا مرة واحدة، وفقط عندما تكون جاهزاً للانتقال إلى الخطة.',
  '- قبل ذلك، لا تُخرجه إطلاقاً.'
].join('\n');

/* ---------- بناء الطلب ---------- */

/* history: [{role:'user'|'model'|'assistant', text:string}] */
export function buildContents(history = []) {
  return history
    .filter((m) => m && typeof m.text === 'string' && m.text.trim()
      && (m.role === 'user' || m.role === 'model' || m.role === 'assistant'))
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
}

export function buildRequestBody(history = [], opts = {}) {
  const contents = buildContents(history);
  const body = {
    contents,
    generationConfig: {
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
      maxOutputTokens: typeof opts.maxOutputTokens === 'number' ? opts.maxOutputTokens : 1024
    }
  };
  const sys = opts.systemPrompt === undefined ? SYSTEM_PROMPT : opts.systemPrompt;
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  return body;
}

/* ---------- قراءة الرد ---------- */

/* يستخرج النص من رد Gemini، ويتحمّل شكل الرد الناقص بدل أن يرمي. */
export function extractText(data) {
  const cands = data && Array.isArray(data.candidates) ? data.candidates : [];
  const first = cands[0];
  const parts = first && first.content && Array.isArray(first.content.parts) ? first.content.parts : [];
  return parts.filter((p) => p && typeof p.text === 'string').map((p) => p.text).join('').trim();
}

export function extractError(data) {
  if (!data) return '';
  if (data.error && data.error.message) return String(data.error.message);
  const cands = data && Array.isArray(data.candidates) ? data.candidates : [];
  const b = cands[0] && cands[0].blockReason;
  if (b) return `الرد محجوب من النموذج (${b}).`;
  return '';
}

/* ---------- استخراج الملخص ---------- */

/* يبحث عن آخر كتلة JSON متوازنة في النص، ويقبلها فقط إن تحوي الحقل ready. */
export function findTrailingJson(text) {
  const s = String(text || '');
  for (let end = s.lastIndexOf('}'); end !== -1; end = s.lastIndexOf('}', end - 1)) {
    let depth = 0;
    for (let i = end; i >= 0; i--) {
      const ch = s[i];
      if (ch === '}') depth++;
      else if (ch === '{') {
        depth--;
        if (depth === 0) {
          const chunk = s.slice(i, end + 1);
          try {
            const parsed = JSON.parse(chunk);
            if (parsed && typeof parsed === 'object' && ('ready' in parsed || 'brief' in parsed)) {
              return { json: parsed, start: i, end: end + 1 };
            }
          } catch { /* ليست JSON صحيحة، نكمل البحث */ }
          break;
        }
      }
    }
  }
  return null;
}

/* يفصل نص المحادثة المعروض عن كتلة الملخص. */
export function parseAssistantMessage(raw) {
  const full = String(raw || '').trim();
  const hit = findTrailingJson(full);
  if (!hit) return { text: full, brief: null, ready: false };
  const cleaned = (full.slice(0, hit.start) + full.slice(hit.end)).replace(/\n{3,}/g, '\n\n').trim();
  const brief = normalizeBrief(hit.json.brief || hit.json || {});
  const ready = hit.json.ready === true && brief !== null;
  return { text: cleaned, brief: ready ? brief : brief, ready };
}

/* ---------- تطبيع الملخص ---------- */

function cleanStr(v, max = 600) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function snapDuration(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  let best = DURATION_OPTIONS[0], bestD = Math.abs(DURATION_OPTIONS[0] - n);
  for (const d of DURATION_OPTIONS) {
    const diff = Math.abs(d - n);
    if (diff < bestD) { best = d; bestD = diff; }
  }
  return best;
}

export function normalizeAspect(v) {
  const s = cleanStr(v, 12).replace('×', ':');
  if (ASPECT_OPTIONS.includes(s)) return s;
  if (/^9\s*:\s*16$/.test(s) || /vertical|عمودي/i.test(s)) return '9:16';
  if (/^16\s*:\s*9$/.test(s) || /horizontal|أفقي|افقي/i.test(s)) return '16:9';
  if (/^1\s*:\s*1$/.test(s) || /square|مربع/i.test(s)) return '1:1';
  return null;
}

export function normalizeStyle(v) {
  const s = cleanStr(v, 80);
  if (!s) return null;
  if (STYLE_OPTIONS.includes(s)) return s;
  for (const opt of STYLE_OPTIONS) {
    if (s.includes(opt) || opt.includes(s)) return opt;
  }
  const hints = [
    [/واقع|سينمائي|photoreal|cinematic/i, 'سينمائي واقعي للغاية'],
    [/فانتاز|ملحمي|fantasy|epic/i, 'فانتازيا ملحمية'],
    [/إعلان|اعلان|تجاري|فاخر|commercial|luxury/i, 'إعلان تجاري فاخر'],
    [/أنيميشن|انيميشن|ثلاثي|3d|animation|anime/i, 'أنيميشن ثلاثي الأبعاد'],
    [/وثائقي|documentary/i, 'وثائقي واقعي']
  ];
  for (const [re, name] of hints) if (re.test(s)) return name;
  return null;
}

/* يبني ملخصاً نظيفاً، أو null إن لم يبقَ ما يكفي. */
export function normalizeBrief(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const brief = {
    title: cleanStr(raw.title || raw.name, 90),
    idea: cleanStr(raw.idea || raw.concept || raw.story, 2000),
    objective: cleanStr(raw.objective || raw.goal, 300),
    audience: cleanStr(raw.audience, 300),
    duration: snapDuration(raw.duration ?? raw.durationSeconds ?? raw.seconds) || 60,
    aspect: normalizeAspect(raw.aspect ?? raw.ratio ?? raw.orientation) || '9:16',
    style: normalizeStyle(raw.style ?? raw.visual_style) || STYLE_OPTIONS[0]
  };
  if (!brief.idea && !brief.title) return null;
  if (!brief.title) brief.title = brief.idea.slice(0, 60);
  return brief;
}

/* ---------- ربط الملخص بحقول الاستوديو ---------- */
/* ينتج قيماً جاهزة لِتُكتب في النموذج، بعد موافقة المستخدم الصريحة. */
export function briefToStudioFields(brief) {
  const b = normalizeBrief(brief);
  if (!b) return null;
  return {
    pTitle: b.title,
    pIdea: b.idea || b.title,
    pObjective: b.objective,
    pAudience: b.audience,
    pDuration: String(b.duration),
    pAspect: b.aspect,
    pStyle: b.style
  };
}

/* ---------- حالة المحادثة ---------- */

export function newChatState() {
  return { messages: [], pendingBrief: null };
}

/* يضيف رسالة، ويرجع الحالة الجديدة (بلا تعديل الأصل). */
export function pushMessage(state, role, text) {
  const base = state && Array.isArray(state.messages) ? state : newChatState();
  const msg = { role, text: String(text || '') };
  return { ...base, messages: [...base.messages, msg] };
}

/* يحوّل المحادثة إلى مصفوفة تُرسل للنموذج (بلا الرسائل الفارغة). */
export function historyForModel(state) {
  const msgs = state && Array.isArray(state.messages) ? state.messages : [];
  return msgs
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', text: m.text.trim() }));
}

/* ملخص نصّي مختصر لعرضه في بطاقة القرار. */
export function briefSummaryLines(brief) {
  const b = normalizeBrief(brief);
  if (!b) return null;
  const rows = [
    ['المشروع', b.title],
    ['الفكرة', b.idea],
    ['الهدف', b.objective],
    ['الجمهور', b.audience],
    ['المدة', `${b.duration} ثانية`],
    ['الأبعاد', b.aspect],
    ['الأسلوب', b.style]
  ];
  return rows.filter(([, v]) => v);
}
