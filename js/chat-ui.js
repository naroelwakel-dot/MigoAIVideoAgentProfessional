/* js/chat-ui.js
   واجهة محادثة التخطيط: المستخدم يناقش الفكرة قبل كتابة أي برومبت.
   ---------------------------------------------------------------------------
   الأمان أولاً:
   - مفتاح Gemini يُحفظ في localStorage على هذا الجهاز فقط. لا يُرسل إلينا،
     ولا يُكتب في المستودع، ولا يُقرأ من أي ملف في المشروع.
   - الطلب يذهب من متصفح المستخدم مباشرة إلى Google، بلا وسيط.
   - لا نطبع المفتاح في السجل ولا في رسائل الخطأ.
   ---------------------------------------------------------------------------
   الوحدة مستقلة تماماً عن app.js: لا تستورد منه شيئاً، ولا تعدّل منطقه.
   التواصل مع الاستوديو يتم بضغطة المستخدم على زر «افتحه في الاستوديو»،
   عبر تعبئة حقول النموذج ثم الضغط على تبويب الاستوديو.
*/
import {
  DEFAULT_MODEL, endpointFor, buildRequestBody, extractText, extractError,
  parseAssistantMessage, briefToStudioFields, briefSummaryLines,
  newChatState, pushMessage, historyForModel
} from './chat-engine.js';

const KEY_STORAGE = 'migo.gemini.key';
const MODEL_STORAGE = 'migo.gemini.model';

const QUICK_CHIPS = [
  'عندي فكرة إعلان لمتجر، عايز نطوّرها',
  'فكرة قصة قصيرة مدتها ٣٠ ثانية',
  'محتاج فيديو تعريفي بخدمة جديدة',
  'اقترح عليّ أفكار فيديو لمشروعي'
];

const state = newChatState();
let busy = false;

/* ---------- أدوات صغيرة ---------- */
const $ = (id) => document.getElementById(id);
function setMsg(id, text, kind = '') {
  const el = $(id); if (!el) return;
  el.textContent = text || ''; el.className = 'message ' + kind;
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ---------- المفتاح على الجهاز ---------- */
function loadKey() {
  try { return globalThis.localStorage.getItem(KEY_STORAGE) || ''; }
  catch { return ''; }
}
function loadModel() {
  try { return globalThis.localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL; }
  catch { return DEFAULT_MODEL; }
}
function saveKey(v) {
  try { globalThis.localStorage.setItem(KEY_STORAGE, v); return true; }
  catch { return false; }
}
function eraseKey() {
  try { globalThis.localStorage.removeItem(KEY_STORAGE); } catch { /* لا شيء */ }
}
/* نعرض حالة المفتاح دون إظهار قيمته. */
function keyStatusText() {
  const k = loadKey();
  if (!k) return 'لا يوجد مفتاح محفوظ على هذا الجهاز بعد.';
  return `مفتاح محفوظ على هذا الجهاز ✓ (${k.length} خانة، لا نعرض قيمته).`;
}

/* ---------- عرض المحادثة ---------- */
function renderLog() {
  const log = $('chatLog'); if (!log) return;
  log.innerHTML = '';
  if (!state.messages.length) {
    log.appendChild(el('div', 'chat-empty', 'ابدأ بوصف فكرتك في سطرين، وأنا هسألك عن الباقي.'));
    return;
  }
  for (const m of state.messages) {
    const wrap = el('div', 'chat-msg ' + (m.role === 'user' ? 'me' : 'ai'));
    wrap.appendChild(el('div', 'chat-bubble', m.text));
    log.appendChild(wrap);
  }
  log.scrollTop = log.scrollHeight;
}

function renderBrief() {
  const wrap = $('chatBriefWrap'), box = $('chatBrief');
  if (!wrap || !box) return;
  const rows = briefSummaryLines(state.pendingBrief);
  if (!rows || !rows.length) { wrap.classList.add('hidden'); box.innerHTML = ''; return; }
  box.innerHTML = '';
  const dl = el('div', 'brief-rows');
  for (const [k, v] of rows) {
    const r = el('div', 'brief-row');
    r.appendChild(el('span', 'brief-k', k));
    r.appendChild(el('span', 'brief-v', v));
    dl.appendChild(r);
  }
  box.appendChild(dl);
  wrap.classList.remove('hidden');
}

function renderChips() {
  const box = $('chatChips'); if (!box) return;
  box.innerHTML = '';
  if (state.messages.length) return;
  for (const c of QUICK_CHIPS) {
    const b = el('button', 'chip', c);
    b.type = 'button';
    b.addEventListener('click', () => { $('chatInput').value = c; $('chatInput').focus(); });
    box.appendChild(b);
  }
}

/* ---------- نداء Gemini ---------- */
async function callGemini(history, key, model) {
  const res = await fetch(endpointFor(model), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key
    },
    body: JSON.stringify(buildRequestBody(history))
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg = extractError(data);
    if (res.status === 400 || res.status === 403) {
      throw new Error(msg || 'المفتاح غير صالح أو غير مسموح. تأكد أنك نسخت مفتاح Gemini API كاملاً.');
    }
    if (res.status === 429) throw new Error(msg || 'تجاوزت حد الاستخدام المجاني مؤقتاً. جرّب بعد قليل.');
    throw new Error(msg || `فشل الاتصال بـ Gemini (رمز ${res.status}).`);
  }
  const text = extractText(data);
  if (!text) throw new Error(extractError(data) || 'وصل رد فارغ من النموذج. جرّب مرة أخرى.');
  return text;
}

/* ---------- الإرسال ---------- */
async function send() {
  if (busy) return;
  const input = $('chatInput');
  const text = (input.value || '').trim();
  if (!text) { setMsg('chatStatus', 'اكتب رسالة أولاً.', 'error'); return; }

  const key = loadKey();
  if (!key) {
    setMsg('chatStatus', 'محتاج مفتاح Gemini أولاً: الصقه في خانة المفتاح واضغط «حفظ على هذا الجهاز».', 'error');
    $('chatKey') && $('chatKey').focus();
    return;
  }

  const next = pushMessage(state, 'user', text);
  state.messages = next.messages;
  input.value = '';
  renderLog(); renderChips();
  setMsg('chatStatus', 'جارٍ التفكير...');

  busy = true;
  $('chatSend').disabled = true;
  try {
    const raw = await callGemini(historyForModel(state), key, loadModel());
    const parsed = parseAssistantMessage(raw);
    state.messages = pushMessage(state, 'assistant', parsed.text || '...').messages;
    if (parsed.ready && parsed.brief) state.pendingBrief = parsed.brief;
    renderLog(); renderBrief();
    setMsg('chatStatus', parsed.ready ? 'الملخص جاهز للمراجعة في العمود الجانبي.' : '');
  } catch (e) {
    setMsg('chatStatus', e.message || 'حدث خطأ غير متوقع.', 'error');
  } finally {
    busy = false;
    $('chatSend').disabled = false;
  }
}

/* ---------- فتح الملخص في الاستوديو (بضغطة صريحة فقط) ---------- */
function openInStudio() {
  const fields = briefToStudioFields(state.pendingBrief);
  if (!fields) { setMsg('chatStatus', 'لا يوجد ملخص صالح لفتحه.', 'error'); return; }
  const map = {
    pTitle: fields.pTitle, pIdea: fields.pIdea, pObjective: fields.pObjective,
    pAudience: fields.pAudience, pDuration: fields.pDuration, pAspect: fields.pAspect,
    pStyle: fields.pStyle
  };
  let written = 0;
  for (const [id, value] of Object.entries(map)) {
    const node = $(id);
    if (!node || value === undefined || value === null) continue;
    node.value = String(value);
    written++;
  }
  const tab = document.querySelector('.tab[data-view="studio"]');
  if (tab) tab.click();
  setMsg('chatStatus', written
    ? 'تم تعبئة نموذج المشروع من الملخص. راجعه ثم اضغط «إنشاء خطة المشاهد».'
    : 'تعذر الوصول إلى حقول الاستوديو.', written ? 'ok' : 'error');
}

/* ---------- الربط ---------- */
function boot() {
  if (!$('view-chat')) return;

  /* أزرار «ملخص مهامك» في لوحة التحكم تقفز إلى التبويب المناسب.
     نستخدم نفس زر التبويب حتى يبقى سلوك التنقل في مكان واحد داخل app.js. */
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = document.querySelector(`.tab[data-view="${btn.dataset.goto}"]`);
      if (tab) tab.click();
    });
  });

  renderLog(); renderChips(); renderBrief();
  const st = $('chatKeyState'); if (st) st.textContent = keyStatusText();
  const modelInput = $('chatModel'); if (modelInput) modelInput.value = loadModel();

  $('chatSend').addEventListener('click', send);
  $('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  });

  $('chatKeySave').addEventListener('click', () => {
    const v = ($('chatKey').value || '').trim();
    if (!v) { setMsg('chatKeyMsg', 'الصق المفتاح أولاً.', 'error'); return; }
    if (!saveKey(v)) { setMsg('chatKeyMsg', 'تعذر الحفظ على هذا المتصفح (التخزين مغلق؟).', 'error'); return; }
    $('chatKey').value = '';
    $('chatKeyState').textContent = keyStatusText();
    setMsg('chatKeyMsg', 'تم الحفظ على هذا الجهاز فقط ✓', 'ok');
  });

  $('chatKeyErase').addEventListener('click', () => {
    eraseKey();
    $('chatKey').value = '';
    $('chatKeyState').textContent = keyStatusText();
    setMsg('chatKeyMsg', 'تم مسح المفتاح من هذا الجهاز.', 'ok');
  });

  if (modelInput) {
    modelInput.addEventListener('change', () => {
      const v = (modelInput.value || '').trim() || DEFAULT_MODEL;
      try { globalThis.localStorage.setItem(MODEL_STORAGE, v); } catch { /* لا شيء */ }
    });
  }

  $('chatToStudio').addEventListener('click', openInStudio);

  $('chatReset').addEventListener('click', () => {
    state.messages = [];
    state.pendingBrief = null;
    renderLog(); renderChips(); renderBrief();
    setMsg('chatStatus', '');
  });

  $('chatCopyAll').addEventListener('click', async () => {
    const txt = state.messages.map((m) => (m.role === 'user' ? 'أنا: ' : 'ميجو: ') + m.text).join('\n\n');
    if (!txt) { setMsg('chatStatus', 'المحادثة فارغة.', 'error'); return; }
    try {
      await navigator.clipboard.writeText(txt);
      setMsg('chatStatus', 'تم نسخ المحادثة ✓', 'ok');
    } catch {
      setMsg('chatStatus', 'تعذر النسخ تلقائياً. اضغط مطولاً على النص.', 'error');
    }
  });

  setMsg('chatStatus', '');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
