/* js/store.js
   طبقة تخزين موحّدة. ثلاث واجهات متطابقة:
   - createMemoryBackend(): للاختبارات في Node.
   - createLocalBackend(storage): localStorage في المتصفح (وضعه التجريبي محلي فقط).
   - createSupabaseBackend(client): السحابة عبر Supabase (RLS هو الحامي).
   كل الدوال async لتبقى الواجهات متطابقة.
   مهم: بيانات Local وبيانات Supabase لا تُخلط. كل backend مستقل تماماً.
*/

export function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

export const nowIso = () => new Date().toISOString();
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/* مجموعة عامة على مصفوفة في الذاكرة */
function memColl(arr) {
  return {
    list: async () => clone(arr),
    get: async (id) => clone(arr.find((x) => x.id === id) || null),
    save: async (o) => {
      const i = arr.findIndex((x) => x.id === o.id);
      if (i >= 0) arr[i] = clone(o); else arr.unshift(clone(o));
      return clone(o);
    },
    remove: async (id) => { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); }
  };
}

/* -------------------------------------------------------------------------- */
/* ذاكرة مؤقتة - تستخدمها الاختبارات وللطوارئ                                  */
/* -------------------------------------------------------------------------- */
export function createMemoryBackend(seed = {}) {
  const P = memColl(clone(seed.projects || []));
  const A = memColl(clone(seed.assets || []));
  const KN = memColl(clone(seed.knowledge || []));
  const PR = memColl(clone(seed.proposals || []));
  const DC = memColl(clone(seed.decisions || []));
  const SR = memColl(clone(seed.sources || []));
  const FB = memColl(clone(seed.feedback || []));
  const AN = memColl(clone(seed.analyses || []));
  const scenes = clone(seed.scenes || {});
  return {
    mode: 'memory',
    listProjects: P.list, getProject: P.get, saveProject: P.save,
    deleteProject: async (id) => { await P.remove(id); delete scenes[id]; },
    listScenes: async (pid) => clone(scenes[pid] || []),
    saveScenes: async (pid, s) => { scenes[pid] = clone(s); },
    listAssets: A.list, saveAsset: A.save, deleteAsset: A.remove,
    listKnowledge: KN.list, saveKnowledge: KN.save, deleteKnowledge: KN.remove,
    listProposals: PR.list, saveProposal: PR.save, deleteProposal: PR.remove,
    listDecisions: DC.list, saveDecision: DC.save,
    listSources: SR.list, saveSource: SR.save, deleteSource: SR.remove,
    listFeedback: FB.list, saveFeedback: FB.save,
    listAnalyses: AN.list, saveAnalysis: AN.save
  };
}

/* -------------------------------------------------------------------------- */
/* localStorage - الوضع التجريبي                                               */
/* -------------------------------------------------------------------------- */
const K = {
  p: 'migo.v2.projects', s: 'migo.v2.scenes', a: 'migo.v2.assets',
  k: 'migo.v2.knowledge', pr: 'migo.v2.proposals', dc: 'migo.v2.decisions', sr: 'migo.v2.sources',
  fb: 'migo.v2.feedback', an: 'migo.v2.analyses'
};
function readJson(storage, key, fallback) {
  try { const raw = storage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
const writeJson = (storage, key, val) => storage.setItem(key, JSON.stringify(val));

function localColl(storage, key) {
  return {
    list: async () => readJson(storage, key, []),
    get: async (id) => readJson(storage, key, []).find((x) => x.id === id) || null,
    save: async (o) => {
      const all = readJson(storage, key, []); const c = clone(o);
      const i = all.findIndex((x) => x.id === o.id);
      if (i >= 0) all[i] = c; else all.unshift(c);
      writeJson(storage, key, all); return c;
    },
    remove: async (id) => writeJson(storage, key, readJson(storage, key, []).filter((x) => x.id !== id))
  };
}

export function createLocalBackend(storage) {
  if (!storage) storage = globalThis.localStorage;
  if (!storage) throw new Error('لا يوجد localStorage متاح. افتح الصفحة في متصفح حديث أو استخدم وضع الذاكرة.');
  const P = localColl(storage, K.p), A = localColl(storage, K.a);
  const KN = localColl(storage, K.k), PR = localColl(storage, K.pr);
  const DC = localColl(storage, K.dc), SR = localColl(storage, K.sr), FB = localColl(storage, K.fb);
  const AN = localColl(storage, K.an);
  return {
    mode: 'local',
    listProjects: P.list, getProject: P.get,
    saveProject: async (p) => {
      const saved = await P.save(p);
      const s = readJson(storage, K.s, {});
      if (!s[p.id]) { s[p.id] = []; writeJson(storage, K.s, s); }
      return saved;
    },
    deleteProject: async (id) => {
      await P.remove(id);
      const s = readJson(storage, K.s, {}); delete s[id]; writeJson(storage, K.s, s);
    },
    listScenes: async (pid) => readJson(storage, K.s, {})[pid] || [],
    saveScenes: async (pid, s) => { const all = readJson(storage, K.s, {}); all[pid] = clone(s); writeJson(storage, K.s, all); },
    listAssets: A.list, saveAsset: A.save, deleteAsset: A.remove,
    listKnowledge: KN.list, saveKnowledge: KN.save, deleteKnowledge: KN.remove,
    listProposals: PR.list, saveProposal: PR.save, deleteProposal: PR.remove,
    listDecisions: DC.list, saveDecision: DC.save,
    listSources: SR.list, saveSource: SR.save, deleteSource: SR.remove,
    listFeedback: FB.list, saveFeedback: FB.save,
    listAnalyses: AN.list, saveAnalysis: AN.save
  };
}

/* -------------------------------------------------------------------------- */
/* Supabase - السحابة                                                          */
/* -------------------------------------------------------------------------- */
function throwIf(error, what) { if (error) throw new Error(`${what}: ${error.message}`); }

export function createSupabaseBackend(client) {
  if (!client) throw new Error('لم يتم تمرير عميل Supabase.');

  const table = (name) => ({
    list: async (order = 'created_at') => {
      const { data, error } = await client.from(name).select('*').order(order, { ascending: false });
      throwIf(error, `قراءة ${name}`); return data || [];
    },
    save: async (row) => {
      const r = { ...clone(row) }; if (!r.id) r.id = uid();
      const { data, error } = await client.from(name).upsert(r).select().single();
      throwIf(error, `حفظ ${name}`); return data;
    },
    remove: async (id) => { const { error } = await client.from(name).delete().eq('id', id); throwIf(error, `حذف ${name}`); }
  });

  const PROJ = table('video_projects'), AST = table('reference_assets');
  const KNOW = table('knowledge_items'), PROP = table('learning_proposals');
  const DEC = table('learning_decisions'), SRC = table('source_registry');
  const FBK = table('project_feedback');
  const ANL = table('video_analyses');

  return {
    mode: 'cloud',
    listProjects: PROJ.list,
    getProject: async (id) => { const { data, error } = await client.from('video_projects').select('*').eq('id', id).maybeSingle(); throwIf(error, 'قراءة المشروع'); return data || null; },
    saveProject: async (p) => { const r = { ...clone(p) }; delete r.scenes; return PROJ.save(r); },
    deleteProject: PROJ.remove,
    listScenes: async (pid) => {
      const { data, error } = await client.from('project_scenes').select('*').eq('project_id', pid).order('scene_number', { ascending: true });
      throwIf(error, 'قراءة المشاهد'); return data || [];
    },
    saveScenes: async (pid, scenes) => {
      const del = await client.from('project_scenes').delete().eq('project_id', pid);
      throwIf(del.error, 'تحديث المشاهد');
      if (!scenes.length) return;
      const rows = scenes.map((s) => {
        const r = { ...clone(s), project_id: pid, scene_number: s.scene_number ?? s.number };
        delete r.number; return r;
      });
      const { error } = await client.from('project_scenes').insert(rows);
      throwIf(error, 'حفظ المشاهد');
    },
    listAssets: AST.list, saveAsset: AST.save, deleteAsset: AST.remove,
    listKnowledge: KNOW.list, saveKnowledge: KNOW.save, deleteKnowledge: KNOW.remove,
    listProposals: PROP.list, saveProposal: PROP.save, deleteProposal: PROP.remove,
    listDecisions: DEC.list, saveDecision: DEC.save,
    listSources: SRC.list, saveSource: SRC.save, deleteSource: SRC.remove,
    listFeedback: FBK.list, saveFeedback: FBK.save,
    listAnalyses: ANL.list, saveAnalysis: ANL.save
  };
}
