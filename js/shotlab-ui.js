/* js/shotlab-ui.js
   «معمل اللقطات»: يبني خطة الإخراج من بيانات الاستوديو، يوزّع عليها قوالب
   لقطات عربية، يوحّد الهوية البصرية لكل المشاهد، ثم يصدّر ملفات جاهزة للمونتاج.
   ---------------------------------------------------------------------------
   هذا القسم لا يلمس app.js ولا منطق الاستوديو:
   - يقرأ نفس حقول الاستوديو من الصفحة (pTitle/pIdea/... ) فلا تصير البيانات مكرّرة.
   - يبني الخطته بنفسه عبر js/director-engine.js (نفس المحرك الذي يستخدمه الاستوديو).
   - لا يولّد فيديو، ولا يستدعي أي خدمة، ولا يحتاج أي مفتاح.
   - لا يُنشئ مشروعاً في قاعدة البيانات ولا يعدّل مشروعاً موجوداً.
*/
import { planProject } from './director-engine.js';
import {
  RECIPE_CATEGORIES, getRecipe, recipesByCategory, suggestRecipeFor
} from './shot-recipes.js';
import {
  THEME_FIELDS, themeForStyle, normalizeTheme,
  referenceFrameSummary, enrichScenes, themeConsistencyReport
} from './visual-theme.js';
import {
  buildExportFiles, safeFileName, buildShotListMarkdown, buildPromptsMarkdown,
  exportSummaryLines, srtCueCount
} from './export-kit.js';

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function setMsg(id, text, kind = '') {
  const node = $(id); if (!node) return;
  node.textContent = text || ''; node.className = 'message ' + kind;
}

const state = {
  plan: null,
  scenes: [],
  theme: null,
  recipeIds: {},   /* رقم المشهد ← معرّف القالب */
  built: false
};

/* ---------- قراءة بيانات الاستوديو ---------- */
export function readStudioFields(getEl = $) {
  const val = (id) => { const n = getEl(id); return n && n.value ? String(n.value) : ''; };
  return {
    title: val('pTitle').trim(),
    idea: val('pIdea').trim(),
    objective: val('pObjective').trim(),
    audience: val('pAudience').trim(),
    duration: Number(val('pDuration')) || 0,
    aspect: val('pAspect').trim(),
    style: val('pStyle').trim(),
    assets: []
  };
}

/* ---------- بناء الخطة ---------- */
function rebuild() {
  const input = readStudioFields();
  if (!input.idea) {
    state.built = false;
    setMsg('labStatus', 'اكتب «الفكرة أو وصف الفيديو» في الاستوديو أولاً، ثم ارجع إلى هنا.', 'error');
    renderScenes();
    return false;
  }
  try {
    const { plan, scenes } = planProject(input);
    state.plan = plan;
    state.scenes = scenes;
    state.theme = state.theme && state.theme.style === plan.style
      ? normalizeTheme(state.theme, plan.style)
      : themeForStyle(plan.style);
    state.recipeIds = {};
    for (const s of scenes) state.recipeIds[s.number] = suggestRecipeFor(s, plan);
    state.built = true;
    refresh();
    setMsg('labStatus', `تم بناء ${scenes.length} مشهداً ووزّعنا قالباً مناسباً على كل لقطة. عدّل ما تشاء ثم صدّر.`, 'ok');
    return true;
  } catch (e) {
    state.built = false;
    setMsg('labStatus', (e && e.message) || 'تعذّر بناء الخطة. راجع بيانات الاستوديو.', 'error');
    return false;
  }
}

/* ---------- تحديث العرض بعد أي تغيير ---------- */
function enriched() {
  if (!state.built) return [];
  const recipes = {};
  for (const [n, id] of Object.entries(state.recipeIds)) {
    const r = getRecipe(id);
    if (r) recipes[n] = r;
  }
  return enrichScenes(state.scenes, { plan: state.plan, theme: state.theme, recipes });
}

function refresh() {
  renderBrief();
  renderTheme();
  renderScenes();
  renderExportInfo();
}

function renderBrief() {
  const box = $('labBrief'); if (!box) return;
  if (!state.built) {
    box.textContent = 'لم تُبنَ الخطة بعد. املأ بيانات الاستوديو ثم اضغط «ابنِ الخطة ووزّع القوالب».';
    return;
  }
  const p = state.plan;
  const report = themeConsistencyReport(state.scenes);
  box.innerHTML = '';
  box.appendChild(el('div', '', `${p.title} — ${p.style} • ${p.duration}ث • ${p.aspect} • ${state.scenes.length} مشهد`));
  box.appendChild(el('div', '', report.note));
}

/* ---------- لوحة الثيم ---------- */
function renderTheme() {
  const box = $('labTheme'); if (!box) return;
  box.innerHTML = '';
  if (!state.built) return;
  for (const [key, label] of THEME_FIELDS) {
    const wrap = el('label');
    wrap.appendChild(el('span', '', label));
    const input = document.createElement('input');
    input.type = 'text';
    input.value = state.theme[key];
    input.dataset.themeKey = key;
    input.addEventListener('change', () => {
      const v = String(input.value || '').trim();
      state.theme = normalizeTheme({ ...state.theme, [key]: v }, state.theme.style);
      setMsg('labThemeMsg', 'تم تحديث الثيم. البرومبتات ستُبنى بالقيمة الجديدة.', 'ok');
      renderScenes(); renderExportInfo();
    });
    wrap.appendChild(input);
    box.appendChild(wrap);
  }
}

/* ---------- بطاقات اللقطات ---------- */
function renderScenes() {
  const box = $('labScenes'); if (!box) return;
  box.innerHTML = '';
  if (!state.built) {
    box.appendChild(el('div', 'muted', 'لم تُبنَ الخطة بعد.'));
    return;
  }
  const list = enriched();
  for (const s of list) {
    const card = el('div', 'scene-card');

    const top = el('div', 'scene-top');
    top.appendChild(el('b', '', `مشهد ${s.number} · ${s.role}`));
    top.appendChild(el('span', 'scene-time', `${s.startSeconds}–${s.endSeconds}ث`));
    card.appendChild(top);

    card.appendChild(el('div', 'scene-meta',
      `${s.shotType || ''} • ${s.cameraMovement || ''} • ${s.lighting || ''}`));
    card.appendChild(el('div', 'scene-meta', referenceFrameSummary(s)));

    /* اختيار القالب */
    const pickRow = el('div', 'row');
    const select = document.createElement('select');
    select.className = 'lab-scene-select';
    const opt0 = document.createElement('option');
    opt0.value = ''; opt0.textContent = 'بلا قالب';
    select.appendChild(opt0);
    for (const cat of RECIPE_CATEGORIES) {
      const group = document.createElement('optgroup');
      group.label = cat;
      for (const r of recipesByCategory(cat)) {
        const o = document.createElement('option');
        o.value = r.id; o.textContent = r.name;
        group.appendChild(o);
      }
      select.appendChild(group);
    }
    select.value = state.recipeIds[s.number] || '';
    select.addEventListener('change', () => {
      const v = select.value;
      if (v) state.recipeIds[s.number] = v; else delete state.recipeIds[s.number];
      setMsg('labStatus', v ? `تم تطبيق «${getRecipe(v).name}» على المشهد ${s.number}.` : `تم إلغاء قالب المشهد ${s.number}.`, 'ok');
      renderScenes(); renderExportInfo();
    });
    pickRow.appendChild(select);
    const copyBtn = el('button', 'btn btn-ghost small-btn', 'انسخ برومبت اللقطة');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => copy(String(s.promptEnriched || s.prompt || ''), 'labStatus', 'تم نسخ برومبت اللقطة ✓'));
    pickRow.appendChild(copyBtn);
    card.appendChild(pickRow);

    const r = state.recipeIds[s.number] ? getRecipe(state.recipeIds[s.number]) : null;
    if (r) card.appendChild(el('div', 'scene-meta', `الغرض من القالب: ${r.purpose}`));
    if (r && r.note) card.appendChild(el('div', 'scene-meta', `نصيحة: ${r.note}`));

    const pre = el('div', 'prompt-box', String(s.promptEnriched || s.prompt || ''));
    card.appendChild(pre);
    box.appendChild(card);
  }
}

/* ---------- التصدير ---------- */
function renderExportInfo() {
  const box = $('labExportInfo'); if (!box) return;
  box.innerHTML = '';
  if (!state.built) { box.textContent = 'ابنِ الخطة أولاً ليصبح التصدير متاحاً.'; return; }
  for (const [k, v] of exportSummaryLines(state.plan, enriched())) {
    box.appendChild(el('div', '', `${k}: ${v}`));
  }
  const cues = srtCueCount(state.scenes);
  box.appendChild(el('div', 'muted', cues
    ? `ملف الترجمة سيحمل ${cues} سطراً من وصف كل لقطة. إن أضفت حواراً لاحقاً صار الحوار هو السطر.`
    : 'لا توجد أسطر ترجمة لأن كل اللقطات بلا نص.'));
}

function download(name, content) {
  const base = safeFileName(state.plan ? state.plan.title : '', 'migo-project');
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${base}-${name}`;
    if (document.body) document.body.appendChild(a);
    a.click();
    if (document.body) document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

async function copy(text, msgId, okText) {
  if (!text) { setMsg(msgId, 'لا يوجد نص لنسخه.', 'error'); return; }
  try {
    await navigator.clipboard.writeText(text);
    setMsg(msgId, okText, 'ok');
  } catch {
    setMsg(msgId, 'تعذّر النسخ تلقائياً. انسخ من الصندوق يدوياً.', 'error');
  }
}

/* ---------- الربط ---------- */
function goTo(view) {
  const tab = document.querySelector(`.tab[data-view="${view}"]`);
  if (tab) tab.click();
}

function boot() {
  if (!$('view-shotlab')) return;

  $('labBuild').addEventListener('click', () => {
    state.theme = null; /* بناء جديد يعني ثيم الأسلوب من جديد */
    rebuild();
  });
  $('labGoStudio').addEventListener('click', () => goTo('studio'));

  $('labAuto').addEventListener('click', () => {
    if (!state.built) { setMsg('labStatus', 'ابنِ الخطة أولاً.', 'error'); return; }
    for (const s of state.scenes) state.recipeIds[s.number] = suggestRecipeFor(s, state.plan);
    renderScenes(); renderExportInfo();
    setMsg('labStatus', 'أعدنا توزيع القوالب تلقائياً على كل المشاهد.', 'ok');
  });

  $('labThemeReset').addEventListener('click', () => {
    if (!state.built) { setMsg('labThemeMsg', 'ابنِ الخطة أولاً.', 'error'); return; }
    state.theme = themeForStyle(state.plan.style);
    renderTheme(); renderScenes(); renderExportInfo();
    setMsg('labThemeMsg', 'رجعنا إلى ثيم الأسلوب الافتراضي.', 'ok');
  });

  $('labExportAll').addEventListener('click', () => {
    if (!state.built) { setMsg('labStatus', 'ابنِ الخطة أولاً.', 'error'); return; }
    const files = buildExportFiles(state.plan, enriched());
    let done = 0;
    for (const [name, content] of Object.entries(files)) if (download(name, content)) done++;
    setMsg('labStatus', done
      ? `تم تنزيل ${done} ملفات (قائمة اللقطات، البرومبتات، الترجمة).`
      : 'تعذّر التنزيل على هذا المتصفح.', done ? 'ok' : 'error');
  });

  $('labCopyPrompts').addEventListener('click', () => {
    if (!state.built) { setMsg('labStatus', 'ابنِ الخطة أولاً.', 'error'); return; }
    copy(buildPromptsMarkdown(state.plan, enriched()), 'labStatus', 'تم نسخ كل البرومبتات ✓');
  });

  $('labCopyShotList').addEventListener('click', () => {
    if (!state.built) { setMsg('labStatus', 'ابنِ الخطة أولاً.', 'error'); return; }
    copy(buildShotListMarkdown(state.plan, state.scenes), 'labStatus', 'تم نسخ قائمة اللقطات ✓');
  });

  /* إن كانت بيانات الاستوديو مملوءة أصلاً، نبني تلقائياً عند أول مرة. */
  if (readStudioFields().idea) rebuild();
  else { renderBrief(); renderExportInfo(); setMsg('labStatus', ''); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export { state, boot, rebuild, enriched };
