/* app.js - ربط الواجهة بالوحدات.
   لا يحتوي منطق أعمال: كل المنطق في js/*. هنا DOM فقط.
*/
import { CONFIG } from './config.js';
import { initSupabase } from './js/supabase-client.js';
import { createAuth } from './js/auth.js';
import { createLocalBackend, createMemoryBackend, createSupabaseBackend } from './js/store.js';
import { createProjectManager } from './js/project-manager.js';
import { createAssetManager, ASSET_TYPES, assetLabel } from './js/asset-manager.js';
import { createBackupManager, backupFileName } from './js/backup-manager.js';
import { uid, nowIso } from './js/store.js';
import { proposeFromFeedback, learningSummary } from './js/learning-engine.js';
import { applyDecision, decisionHistory } from './js/approval-center.js';
import { makeItem, isDuplicate, typeLabel, ITEM_TYPES } from './js/knowledge-base.js';
import {
  SOURCE_TYPES, RELIABILITY, SOURCE_TYPE_LABEL, RELIABILITY_LABEL,
  makeSource, staleInfo, filterSources, sourceLabel, makeKnowledgeFromSource, flagInstructionLike
} from './js/research-engine.js';
import {
  checkLimits, planFrames, parseMetadata, buildAnalysisReport, DEFAULT_LIMITS as ANALYZE_LIMITS
} from './js/video-analyzer.js';
import {
  validateSelection, move, reorder, clipName, buildConcatList, buildMergeArgs, estimateRisk, DEFAULT_LIMITS as MONTAGE_LIMITS
} from './js/montage-engine.js';

/* ---------- أدوات ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = (id, yes = true) => { const el = $(id); if (el) el.classList.toggle('hidden', !yes); };

function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg;
  $('toast').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}
function setMsg(id, text, kind = '') {
  const el = $(id); if (!el) return;
  el.textContent = text || ''; el.className = 'message ' + kind;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('تم النسخ ✓', 'ok'); }
  catch { toast('تعذر النسخ تلقائياً. اضغط مطولاً على النص.', 'error'); }
}

/* ---------- حالة التطبيق ---------- */
const app = { mode: null, auth: null, store: null, pm: null, am: null, bm: null, plan: null, scenes: null };

/* ---------- الإقلاع ---------- */
async function boot() {
  $('year').textContent = new Date().getFullYear();
  const res = initSupabase(CONFIG);
  app.mode = res.mode;

  if (res.mode === 'demo') {
    const store = (() => { try { return createLocalBackend(globalThis.localStorage); } catch { return createMemoryBackend(); } })();
    app.store = store;
    app.auth = createAuth({ demo: true });
    setBackend();
    $('statusDot').classList.add('demo');
    $('connectionLabel').textContent = 'وضع تجريبي محلي';
    $('loginHint').textContent = 'وضع التجربة مفعّل: أي بريد/كلمة مرور تدخلك، والبيانات تُحفظ في هذا المتصفح فقط.';
    show('loginView', true); show('appView', false);
    $('logoutBtn').classList.add('hidden');
    return;
  }

  if (res.mode === 'cloud') {
    app.store = createSupabaseBackend(res.client);
    app.auth = createAuth({ client: res.client });
    setBackend();
    $('statusDot').classList.remove('demo');
    $('connectionLabel').textContent = 'Supabase متصل';
    const session = await app.auth.getSession();
    if (session) enterApp(); else showLogin('سجّل الدخول بحساب المالك الذي أنشأته في Supabase.');
    return;
  }

  // unconfigured / error
  $('connectionLabel').textContent = res.mode === 'error' ? 'خطأ اتصال' : 'غير مُهيأ';
  $('statusDot').classList.add('demo');
  $('loginHint').textContent = res.message + ' يمكنك التجربة الآن بجعل DEMO_MODE = true في config.js.';
  show('loginView', true);
}

function setBackend() {
  app.pm = createProjectManager(app.store);
  app.am = createAssetManager(app.store);
  app.bm = createBackupManager(app.store);
}

function showLogin(msg) {
  show('loginView', true); show('appView', false);
  $('logoutBtn').classList.add('hidden');
  if (msg) setMsg('loginMessage', msg);
}

async function enterApp() {
  show('loginView', false); show('appView', true);
  if (!app.auth.demo) $('logoutBtn').classList.remove('hidden');
  fillAssetTypes();
  fillKTypes();
  fillSourceTypes();
  await refreshAll();
  switchView('dashboard');
}

/* ---------- الدخول ---------- */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim(), password = $('password').value;
  try {
    setMsg('loginMessage', 'جارٍ تسجيل الدخول...');
    await app.auth.signIn(email, password);
    await enterApp();
  } catch (err) {
    setMsg('loginMessage', err.message, 'error');
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await app.auth.signOut();
  showLogin('تم تسجيل الخروج.');
});

/* ---------- التنقل ---------- */
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  switchView(b.dataset.view);
});
function switchView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== 'view-' + name));
  if (name === 'learning') renderLearning();
  if (name === 'knowledge') renderKnowledge();
  if (name === 'projects') renderProjects();
  if (name === 'research') renderSources();
  if (name === 'montage') renderMontage();
  if (name === 'dashboard') renderStats();
}

/* ---------- لوحة التحكم ---------- */
async function renderStats() {
  const [projects, assets] = await Promise.all([app.pm.listProjects(), app.am.listAssets()]);
  $('stats').innerHTML = `
    <div class="stat"><b>${projects.length}</b><small>مشروع محفوظ</small></div>
    <div class="stat"><b>${assets.length}</b><small>أصل مرجعي</small></div>
    <div class="stat"><b>${app.mode === 'cloud' ? 'سحابي' : 'محلي'}</b><small>وضع التخزين</small></div>
    <div class="stat"><b>4</b><small>وحدات قيد التنفيذ</small></div>`;
}

/* ---------- الأصول ---------- */
function fillAssetTypes() {
  $('aType').innerHTML = ASSET_TYPES.map((t) => `<option value="${t}">${assetLabel(t)}</option>`).join('');
}
async function renderAssets() {
  const assets = await app.am.listAssets();
  $('assetList').innerHTML = assets.length
    ? assets.map((a) => `<div class="list-item"><b>${esc(a.name)}</b>
        <div class="scene-meta"><span class="tag">${esc(assetLabel(a.asset_type))}</span>
        <code style="direction:ltr">${esc(a.asset_key)}</code></div>
        <p class="muted" style="font-size:12px;margin:6px 0">${esc(a.description)}</p>
        <button class="btn btn-danger small-btn" data-del-asset="${a.id}">حذف</button></div>`).join('')
    : '<div class="empty">لا أصول بعد. أضف شخصية أو موقعاً ليُستخدم في البرومبتات.</div>';
  $('assetList').querySelectorAll('[data-del-asset]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('حذف هذا الأصل؟')) return;
      await app.am.deleteAsset(b.dataset.delAsset); toast('تم الحذف', 'ok'); await renderAssets(); renderStudioAssetOptions();
    }));
  await renderStudioAssetOptions();
}
async function renderStudioAssetOptions() {
  const assets = await app.am.listAssets();
  $('pAssets').innerHTML = assets.map((a) => `<option value="${a.id}">${esc(a.name)} (${esc(assetLabel(a.asset_type))})</option>`).join('');
}
$('assetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const tags = $('aTags').value.split(',').map((s) => s.trim()).filter(Boolean);
    const a = await app.am.upsertAsset({ name: $('aName').value, asset_type: $('aType').value, description: $('aDesc').value, tags });
    setMsg('assetMessage', `تم حفظ الأصل بمعرّف ثابت: ${a.asset_key}`, 'ok');
    $('assetForm').reset(); fillAssetTypes();
    await renderAssets();
  } catch (err) { setMsg('assetMessage', err.message, 'error'); }
});

/* ---------- الاستوديو ---------- */
$('projectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    setMsg('studioMessage', 'جارٍ بناء الخطة...');
    const selected = Array.from($('pAssets').selectedOptions).map((o) => o.value);
    const assets = await app.am.resolveAssets(selected);
    const input = {
      title: $('pTitle').value, idea: $('pIdea').value,
      objective: $('pObjective').value, audience: $('pAudience').value,
      duration: Number($('pDuration').value), aspect: $('pAspect').value, style: $('pStyle').value
    };
    const { project, scenes } = await app.pm.createProject(input, assets);
    app.plan = project.plan; app.scenes = scenes;
    renderPlan(project, scenes);
    setMsg('studioMessage', 'تم إنشاء المشروع وحفظه.', 'ok');
    await renderProjects(); await renderStats();
  } catch (err) {
    setMsg('studioMessage', (err.validation ? err.validation.join(' • ') : err.message), 'error');
  }
});

function renderPlan(project, scenes) {
  $('planSummary').innerHTML = `<b>${esc(project.title)}</b> — ${esc(project.visual_style || '')} • ${project.duration_seconds}ث • ${esc(project.aspect_ratio)} • ${scenes.length} مشهد.
    <p class="muted" style="font-size:12px">${esc(project.treatment)}</p>`;
  $('sceneOutput').innerHTML = scenes.map((s) => `
    <article class="scene-card">
      <div class="scene-top"><b>المشهد ${s.scene_number} • ${esc(s.role)}</b>
        <span class="scene-time">${s.start_seconds}s → ${s.end_seconds}s</span></div>
      <div class="scene-meta">${esc(s.shot_type)} • ${esc(s.camera_movement)} • ${esc(s.lens)} • ${esc(s.lighting)}</div>
      <p class="muted" style="font-size:12.5px;margin:6px 0">${esc(s.beat)}</p>
      <div class="prompt-box">${esc(s.prompt)}</div>
      <div class="row" style="justify-content:flex-end;margin-top:8px">
        <button class="btn btn-ghost small-btn" data-copy="${s.scene_number}">نسخ البرومبت</button>
      </div>
    </article>`).join('');
  show('planActions', true);
  $('sceneOutput').querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', () => copyText(scenes.find((s) => String(s.scene_number) === b.dataset.copy).prompt)));
}
$('copyAllBtn').addEventListener('click', () => {
  if (!app.scenes) return;
  copyText(app.scenes.map((s) => `SCENE ${s.scene_number}\n${s.prompt}`).join('\n\n'));
});
$('copyMasterBtn').addEventListener('click', () => { if (app.plan) copyText(app.plan.masterPrompt); });

/* ---------- المشاريع ---------- */
async function renderProjects() {
  const projects = await app.pm.listProjects();
  $('projectList').innerHTML = projects.length
    ? projects.map((p) => `<div class="list-item"><b>${esc(p.title)}</b>
        <div class="scene-meta">${p.duration_seconds || p.duration}ث • ${esc(p.aspect_ratio || '')} • ${esc(p.visual_style || '')} • ${new Date(p.created_at || Date.now()).toLocaleDateString('ar-EG')}</div>
        <div class="row">
          <button class="btn btn-ghost small-btn" data-open="${p.id}">فتح الخطة</button>
          <button class="btn btn-danger small-btn" data-del="${p.id}">حذف</button>
        </div></div>`).join('')
    : '<div class="empty">لا مشاريع بعد. ابدأ من «استوديو الإنتاج».</div>';
  $('projectList').querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', async () => {
      const got = await app.pm.getProject(b.dataset.open);
      if (!got) return;
      app.plan = got.project.plan; app.scenes = got.scenes;
      switchView('studio'); renderPlan(got.project, got.scenes);
    }));
  $('projectList').querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirm('حذف هذا المشروع؟')) return;
      await app.pm.deleteProject(b.dataset.del); toast('تم الحذف', 'ok');
      await renderProjects(); await renderStats();
    }));
}
$('refreshProjects').addEventListener('click', renderProjects);

/* ---------- النسخ الاحتياطي ---------- */
$('exportBtn').addEventListener('click', async () => {
  try {
    const data = await app.bm.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = backupFileName(); a.click();
    URL.revokeObjectURL(a.href);
    setMsg('backupMessage', `تم تصدير ${data.counts.projects} مشروع و${data.counts.assets} أصل.`, 'ok');
  } catch (e) { setMsg('backupMessage', e.message, 'error'); }
});
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const r = await app.bm.importAll(data);
    setMsg('backupMessage', `تم استيراد ${r.imported} مشروع (تخطّي ${r.skipped} موجود) و${r.assets} أصل.`, 'ok');
    await refreshAll();
  } catch (err) { setMsg('backupMessage', err.message, 'error'); }
  finally { e.target.value = ''; }
});
$('dangerWipe').addEventListener('click', async () => {
  if (app.mode !== 'local' && app.mode !== 'demo') { toast('الحذف متاح في الوضع المحلي فقط. في السحابة احذف من Supabase.', 'error'); return; }
  if (!confirm('حذف كل بيانات هذا المتصفح؟ لا يمكن التراجع.')) return;
  ['migo.v2.projects', 'migo.v2.scenes', 'migo.v2.assets'].forEach((k) => localStorage.removeItem(k));
  toast('تم الحذف', 'ok'); await refreshAll();
});

/* ---------- التعلم والموافقات ---------- */
const DECISION_LABEL = { approved: 'اعتماد', rejected: 'رفض', archived: 'أرشفة', rolled_back: 'تراجع' };
const STATUS_LABEL = { pending: 'معلّق', approved: 'معتمد', rejected: 'مرفوض', archived: 'مؤرشف', rolled_back: 'متراجَع' };

async function renderFeedbackProjects() {
  const projects = await app.pm.listProjects();
  $('fbProject').innerHTML = projects.length
    ? projects.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')
    : '<option value="">لا مشاريع بعد</option>';
}

async function renderLearning() {
  await renderFeedbackProjects();
  const [proposals, decisions, feedbacks] = await Promise.all([
    app.store.listProposals(), app.store.listDecisions(), app.store.listFeedback()
  ]);
  const s = learningSummary({ feedbacks, proposals });
  $('proposalList').innerHTML = proposals.length || feedbacks.length
    ? `<p class="muted" style="font-size:12px">تقييمات: ${s.feedbacks} • متوسط: ${s.average_rating} • معلّق: ${s.by_status.pending || 0} • معتمد: ${s.by_status.approved || 0}</p>` +
      (proposals.length ? proposals.map((p) => {
        const st = p.status || 'pending';
        const btns = st === 'pending' ? `<button class="btn btn-primary small-btn" data-dec="approved" data-pid="${p.id}">اعتماد</button>
                             <button class="btn btn-danger small-btn" data-dec="rejected" data-pid="${p.id}">رفض</button>`
          : st === 'approved' ? `<button class="btn btn-ghost small-btn" data-dec="archived" data-pid="${p.id}">أرشفة</button>
                             <button class="btn btn-ghost small-btn" data-dec="rolled_back" data-pid="${p.id}">تراجع</button>`
          : st === 'archived' ? `<button class="btn btn-ghost small-btn" data-dec="approved" data-pid="${p.id}">إعادة تنشيط</button>`
          : '';
        return `<div class="list-item"><div class="row" style="justify-content:space-between">
            <span class="tag">${esc(STATUS_LABEL[st] || st)}</span><span class="muted" style="font-size:11px">${esc(p.source || '')}</span></div>
          <p style="margin:8px 0;font-size:13.5px">${esc(p.rule_text)}</p>
          <p class="muted" style="font-size:12px;margin:4px 0">السبب: ${esc(p.reason || '-')}</p>
          <p class="muted" style="font-size:12px;margin:4px 0">الأثر المتوقع: ${esc(p.expected_impact || '-')}</p>
          ${p.diff && p.diff.changed ? `<div class="prompt-box" style="max-height:120px">${esc(p.diff.summary)}</div>` : ''}
          <div class="row" style="margin-top:8px">${btns}</div></div>`;
      }).join('') : '')
    : '<div class="empty">لا اقتراحات بعد. قيّم مشروعاً ليظهر اقتراح هنا.</div>';

  $('proposalList').querySelectorAll('[data-dec]').forEach((b) =>
    b.addEventListener('click', () => decideProposal(b.dataset.pid, b.dataset.dec)));

  const hist = decisionHistory(decisions);
  $('decisionList').innerHTML = hist.length
    ? hist.map((d) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">
        ${esc(DECISION_LABEL[d.decision] || d.decision)} • ${new Date(d.decided_at).toLocaleString('ar-EG')}
        <span class="muted">(من ${esc(STATUS_LABEL[d.previous_status] || d.previous_status || '-')})</span></div>`).join('')
    : '<p class="muted" style="font-size:12px">لا قرارات بعد.</p>';
}

async function decideProposal(id, decision) {
  const p = (await app.store.listProposals()).find((x) => x.id === id);
  if (!p) return;
  try {
    const { proposal, record } = applyDecision(p, decision, { notes: '' });
    await app.store.saveProposal(proposal);
    await app.store.saveDecision(record);
    toast('تم: ' + (DECISION_LABEL[decision] || decision), 'ok');
    await renderLearning();
  } catch (e) { toast(e.message, 'error'); }
}

$('feedbackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const projectId = $('fbProject').value;
    const projects = await app.pm.listProjects();
    const project = projects.find((p) => p.id === projectId) || { id: projectId, title: 'مشروع' };
    const fb = {
      id: uid(), project_id: projectId || null, rating: Number($('fbRating').value),
      success_notes: $('fbSuccess').value, failure_notes: $('fbFailure').value, created_at: nowIso()
    };
    await app.store.saveFeedback(fb);
    const proposal = proposeFromFeedback(fb, project);
    if (proposal) await app.store.saveProposal(proposal);
    setMsg('fbMessage', proposal ? 'تم الحفظ وإنشاء اقتراح ينتظر موافقتك.' : 'تم حفظ التقييم. لا اقتراح جديد.', 'ok');
    $('feedbackForm').reset();
    await renderLearning();
  } catch (err) { setMsg('fbMessage', err.message, 'error'); }
});

/* ---------- قاعدة المعرفة ---------- */
function fillKTypes() {
  $('kType').innerHTML = ITEM_TYPES.map((t) => `<option value="${t}">${typeLabel(t)}</option>`).join('');
}
function kBadge(status) {
  const kind = status === 'approved' ? 'color:var(--green)' : status === 'rejected' ? 'color:var(--red)' : 'color:var(--amber)';
  return `<span style="font-size:11px;${kind}">${esc(STATUS_LABEL[status] || status)}</span>`;
}
async function renderKnowledge() {
  const q = ($('kSearch').value || '').toLowerCase().trim();
  const items = await app.store.listKnowledge();
  const filtered = q ? items.filter((i) => `${i.title} ${i.body} ${(i.tags || []).join(' ')}`.toLowerCase().includes(q)) : items;
  $('knowledgeList').innerHTML = filtered.length
    ? filtered.map((i) => `<div class="list-item">
        <div class="row" style="justify-content:space-between">
          <b>${esc(i.title)}</b><span>${kBadge(i.status)} • <span class="tag">${esc(typeLabel(i.item_type))}</span></span></div>
        <p class="muted" style="font-size:12.5px;margin:6px 0">${esc(i.body)}</p>
        ${(i.tags || []).length ? `<div>${i.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="row" style="margin-top:8px">
          ${i.status !== 'approved' ? `<button class="btn btn-primary small-btn" data-kdec="approved" data-kid="${i.id}">اعتماد</button>` : ''}
          ${i.status === 'pending' ? `<button class="btn btn-danger small-btn" data-kdec="rejected" data-kid="${i.id}">رفض</button>` : ''}
          ${i.status === 'approved' ? `<button class="btn btn-ghost small-btn" data-kdec="archived" data-kid="${i.id}">أرشفة</button>` : ''}
        </div></div>`).join('')
    : '<div class="empty">لا نتائج. أضف معلومة أو اعتمد واحدة.</div>';
  $('knowledgeList').querySelectorAll('[data-kdec]').forEach((b) =>
    b.addEventListener('click', async () => {
      const it = (await app.store.listKnowledge()).find((x) => x.id === b.dataset.kid);
      if (!it) return;
      await app.store.saveKnowledge({ ...it, status: b.dataset.kdec, updated_at: nowIso() });
      toast('تم: ' + (DECISION_LABEL[b.dataset.kdec] || b.dataset.kdec), 'ok');
      await renderKnowledge();
    }));
}
$('knowledgeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const items = await app.store.listKnowledge();
    const draft = makeItem({
      title: $('kTitle').value, body: $('kBody').value, category: $('kCategory').value,
      tags: $('kTags').value.split(',').map((s) => s.trim()).filter(Boolean),
      item_type: $('kType').value, status: 'pending'
    });
    if (isDuplicate(items, draft)) { setMsg('kMessage', 'هذه المعلومة موجودة مسبقاً (منع تكرار).', 'error'); return; }
    await app.store.saveKnowledge(draft);
    setMsg('kMessage', 'أُضيفت كمعلّقة. اعتمدها لتُستخدم في المشاريع.', 'ok');
    $('knowledgeForm').reset(); fillKTypes();
    await renderKnowledge();
  } catch (err) { setMsg('kMessage', err.message, 'error'); }
});
$('kSearch').addEventListener('input', renderKnowledge);

/* ---------- البحث والمصادر ---------- */
function fillSourceTypes() {
  $('sType').innerHTML = SOURCE_TYPES.map((v) => `<option value="${v}">${SOURCE_TYPE_LABEL[v] || v}</option>`).join('');
  $('sReliability').innerHTML = RELIABILITY.map((v) => `<option value="${v}">${RELIABILITY_LABEL[v] || v}</option>`).join('');
  $('sFilterRel').innerHTML = '<option value="">كل الدرجات</option>' + RELIABILITY.map((v) => `<option value="${v}">${RELIABILITY_LABEL[v] || v}</option>`).join('');
}
async function renderSources() {
  const src = await app.store.listSources();
  const list = filterSources(src, { query: $('sSearch').value, reliability: $('sFilterRel').value, staleOnly: $('sStaleOnly').checked });
  $('sourceList').innerHTML = list.length
    ? list.map((s) => {
      const st = staleInfo(s);
      return `<div class="list-item"><div class="row" style="justify-content:space-between">
          <b>${esc(s.title)}</b><span class="muted" style="font-size:11px">${esc(sourceLabel(s))}</span></div>
        ${s.url ? `<div style="font-size:12px;direction:ltr;text-align:left"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>` : ''}
        <p class="muted" style="font-size:12px;margin:6px 0">${esc(s.summary || '')}</p>
        <div class="scene-meta">أُضيف: ${esc(s.accessed_at || '')} • <span style="color:${st.stale ? 'var(--amber)' : 'var(--green)'}">${esc(st.reason)}</span></div>
        <div class="row" style="margin-top:8px">
          <button class="btn btn-ghost small-btn" data-mk-src="${s.id}">أنشئ معرفة من هذا المصدر</button>
          <button class="btn btn-danger small-btn" data-del-src="${s.id}">حذف</button>
        </div></div>`;
    }).join('')
    : '<div class="empty">لا مصادر بعد.</div>';

  $('sourceList').querySelectorAll('[data-del-src]').forEach((b) =>
    b.addEventListener('click', async () => { if (!confirm('حذف المصدر؟')) return; await app.store.deleteSource(b.dataset.delSrc); await renderSources(); }));
  $('sourceList').querySelectorAll('[data-mk-src]').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = (await app.store.listSources()).find((x) => x.id === b.dataset.mkSrc); if (!s) return;
      const body = s.summary || s.title;
      const flag = flagInstructionLike(body);
      if (flag.flagged) toast('تنبيه: النص يحتوي صياغات تشبه التعليمات، وتُعامل كبيانات فقط.', 'error');
      const k = makeKnowledgeFromSource(s, { title: s.title, body });
      await app.store.saveKnowledge(k);
      toast('أُضيفت للمعرفة كمعلّقة.', 'ok'); await renderSources();
    }));
}
$('sourceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const s = makeSource({ title: $('sTitle').value, url: $('sUrl').value, source_type: $('sType').value, reliability: $('sReliability').value, summary: $('sSummary').value });
    await app.store.saveSource(s);
    setMsg('srcMessage', 'تم حفظ المصدر.', 'ok');
    $('sourceForm').reset(); fillSourceTypes(); await renderSources();
  } catch (err) { setMsg('srcMessage', err.message, 'error'); }
});
$('sSearch').addEventListener('input', renderSources);
$('sFilterRel').addEventListener('change', renderSources);
$('sStaleOnly').addEventListener('change', renderSources);

/* ---------- محلل الفيديو ---------- */
const anState = { file: null, meta: null, timeline: [] };
function videoMetaFromEl(el, file) {
  return parseMetadata({ file_name: file.name, file_size_bytes: file.size, duration_seconds: el.duration, width: el.videoWidth, height: el.videoHeight });
}
async function extractFrames(file, timestamps) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url; v.muted = true; v.playsInline = true;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('تعذر قراءة الفيديو.')); });
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 320 / (v.videoWidth || 320));
  canvas.width = Math.max(1, Math.round((v.videoWidth || 320) * scale));
  canvas.height = Math.max(1, Math.round((v.videoHeight || 180) * scale));
  const ctx = canvas.getContext('2d');
  const shots = [];
  for (const t of timestamps) {
    await new Promise((res) => { v.onseeked = res; v.currentTime = Math.min(t, Math.max(0, (v.duration || t) - 0.05)); });
    try { ctx.drawImage(v, 0, 0, canvas.width, canvas.height); shots.push({ t, dataUrl: canvas.toDataURL('image/jpeg', 0.6) }); }
    catch { shots.push({ t, dataUrl: null }); }
  }
  URL.revokeObjectURL(url);
  return { meta: videoMetaFromEl(v, file), shots };
}
$('anFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const lim = checkLimits(file, ANALYZE_LIMITS);
  if (!lim.ok) { setMsg('anMeta', lim.reason, 'error'); return; }
  setMsg('anMeta', 'جارٍ قراءة الفيديو واستخراج الإطارات...');
  try {
    const probe = document.createElement('video'); probe.src = URL.createObjectURL(file); probe.muted = true;
    await new Promise((res, rej) => { probe.onloadedmetadata = res; probe.onerror = () => rej(new Error('تعذر قراءة الفيديو.')); });
    const plan = planFrames(probe.duration, ANALYZE_LIMITS.MAX_ANALYZE_FRAMES);
    URL.revokeObjectURL(probe.src);
    const { meta, shots } = await extractFrames(file, plan.timestamps);
    anState.file = file; anState.meta = meta;
    anState.timeline = shots.map((s) => ({ t: s.t, dataUrl: s.dataUrl, description: '' }));
    $('anFrames').innerHTML = anState.timeline.map((s, i) => `
      <div style="width:150px"><img src="${s.dataUrl || ''}" alt="frame" style="width:100%;border-radius:8px;background:#000">
      <div class="muted" style="font-size:11px;text-align:center">${s.t}s</div>
      <input placeholder="وصف اللقطة" data-frame="${i}" style="margin-top:4px;font-size:12px;padding:6px"></div>`).join('');
    $('anFrames').querySelectorAll('[data-frame]').forEach((inp) =>
      inp.addEventListener('input', () => { anState.timeline[Number(inp.dataset.frame)].description = inp.value; }));
    setMsg('anMeta', `المدة ${meta.duration_seconds ?? '؟'}ث • ${meta.width || '؟'}×${meta.height || '؟'} • استُخرج ${anState.timeline.length} إطاراً.`, 'ok');
    if (plan.note) setMsg('anMeta', plan.note, 'error');
    $('anReportBtn').disabled = false; $('anSaveBtn').disabled = false;
  } catch (err) { setMsg('anMeta', err.message, 'error'); }
});
$('anReportBtn').addEventListener('click', () => {
  const report = buildAnalysisReport({ analysis: anState.meta || {}, timeline: anState.timeline, notes: $('anNotes').value });
  const el = $('anReport'); el.textContent = report; el.classList.remove('hidden');
});
$('anSaveBtn').addEventListener('click', async () => {
  try {
    const report = buildAnalysisReport({ analysis: anState.meta || {}, timeline: anState.timeline, notes: $('anNotes').value });
    await app.store.saveAnalysis({
      file_name: anState.meta?.file_name, file_size_bytes: anState.meta?.file_size_bytes,
      duration_seconds: anState.meta?.duration_seconds, width: anState.meta?.width, height: anState.meta?.height,
      frame_rate: anState.meta?.frame_rate, timeline: anState.timeline, notes: $('anNotes').value, report
    });
    setMsg('anMessage', 'تم حفظ التحليل.', 'ok');
  } catch (err) { setMsg('anMessage', err.message, 'error'); }
});

/* ---------- استوديو التجميع ---------- */
let mgFiles = [];
function renderMontage() {
  const risk = estimateRisk(mgFiles, MONTAGE_LIMITS);
  $('mgList').innerHTML = mgFiles.length
    ? mgFiles.map((f, i) => `<div class="list-item"><div class="row" style="justify-content:space-between">
        <span>${i + 1}. ${esc(f.name)}</span><span class="muted" style="font-size:12px">${(f.size / 1024 / 1024).toFixed(1)}MB</span></div>
      <div class="row" style="margin-top:8px">
        <button class="btn btn-ghost small-btn" data-up="${i}">▲</button>
        <button class="btn btn-ghost small-btn" data-down="${i}">▼</button>
        <button class="btn btn-danger small-btn" data-rm="${i}">إزالة</button>
      </div></div>`).join('')
    : '<div class="empty">اختر مقطعين أو أكثر لترتيبها ثم الدمج.</div>';
  const warns = [...risk.errors, ...risk.warnings];
  $('mgWarn').textContent = warns.join(' ');
  $('mgWarn').className = 'message ' + (risk.errors.length ? 'error' : '');
  $('mgMergeBtn').disabled = !risk.level || risk.level === 'blocked' || mgFiles.length < 2;
  $('mgPreviewBtn').disabled = mgFiles.length < 1;

  $('mgList').querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { mgFiles = move(mgFiles, Number(b.dataset.up), -1); renderMontage(); }));
  $('mgList').querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => { mgFiles = move(mgFiles, Number(b.dataset.down), 1); renderMontage(); }));
  $('mgList').querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { mgFiles = mgFiles.filter((_, i) => i !== Number(b.dataset.rm)); renderMontage(); }));
}
$('mgFile').addEventListener('change', (e) => { mgFiles = Array.from(e.target.files || []); renderMontage(); });
$('mgPreviewBtn').addEventListener('click', () => { if (!mgFiles.length) return; const v = $('mgPreview'); v.src = URL.createObjectURL(mgFiles[0]); show('mgPreview', true); });
$('mgMergeBtn').addEventListener('click', async () => {
  const v = validateSelection(mgFiles, MONTAGE_LIMITS);
  if (!v.ok) { setMsg('mgStatus', v.errors.join(' '), 'error'); return; }
  const btn = $('mgMergeBtn'); btn.disabled = true;
  try {
    if (!window.FFmpegWASM || !window.FFmpegUtil) throw new Error('تعذر تحميل مكتبة FFmpeg. تحقق من الاتصال ثم أعد تحميل الصفحة.');
    const { FFmpeg } = window.FFmpegWASM; const { toBlobURL } = window.FFmpegUtil;
    const ff = new FFmpeg();
    ff.on('log', ({ message }) => { if (message) $('mgStatus').textContent = message.slice(-110); });
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
    setMsg('mgStatus', 'تحميل محرك الفيديو...');
    await ff.load({ coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'), wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm') });
    const names = [];
    for (let i = 0; i < mgFiles.length; i++) { const name = clipName(i, mgFiles[i].name); await ff.writeFile(name, new Uint8Array(await mgFiles[i].arrayBuffer())); names.push(name); }
    await ff.writeFile('list.txt', new TextEncoder().encode(buildConcatList(names)));
    setMsg('mgStatus', 'جارٍ دمج المقاطع... اترك الصفحة مفتوحة.');
    await ff.exec(buildMergeArgs({ output: 'output.mp4' }));
    const data = await ff.readFile('output.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const vid = $('mgPreview'); vid.src = url; show('mgPreview', true);
    const a = document.createElement('a'); a.href = url; a.download = 'migo-final-video.mp4'; a.click();
    setMsg('mgStatus', 'اكتمل التجميع وجهّز ملف MP4.', 'ok');
  } catch (err) { setMsg('mgStatus', 'لم يكتمل التجميع: ' + err.message, 'error'); }
  finally { btn.disabled = false; }
});

async function refreshAll() { await renderStats(); await renderProjects(); await renderAssets(); }

boot();
