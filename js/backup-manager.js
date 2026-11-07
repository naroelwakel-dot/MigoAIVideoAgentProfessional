/* js/backup-manager.js
   تصدير واستيراد نسخة JSON كاملة: مشاريع، مشاهد، أصول، معرفة، اقتراحات، مصادر.

   قاعدة صارمة: الاستيراد يحفظ حالة كل سجل كما هي. اقتراح معلّق يبقى معلّقاً،
   والمرفوض يبقى مرفوضاً. لا يُرقّى أي اقتراح إلى «قاعدة معتمدة» أثناء الاستيراد.
*/
import { uid, nowIso } from './store.js';

export const BACKUP_VERSION = 3;

export function buildBackup({ projects = [], scenes = {}, assets = [], knowledge = [], proposals = [], sources = [] } = {}) {
  return {
    app: 'MigoAIVideoAgentProfessional',
    backup_version: BACKUP_VERSION,
    exported_at: nowIso(),
    counts: {
      projects: projects.length,
      assets: assets.length,
      knowledge: knowledge.length,
      proposals: proposals.length,
      sources: sources.length
    },
    projects,
    scenes,
    assets,
    knowledge,
    proposals,
    sources
  };
}

export function validateBackup(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['الملف ليس JSON صالحاً.'];
  if (data.app !== 'MigoAIVideoAgentProfessional') errors.push('هذا الملف ليس نسخة احتياطية من Migo AI Video Agent Professional.');
  if (!Number.isInteger(data.backup_version)) errors.push('رقم إصدار النسخة الاحتياطية مفقود.');
  if (Number.isInteger(data.backup_version) && data.backup_version > BACKUP_VERSION) {
    errors.push(`النسخة الاحتياطية أحدث من التطبيق (v${data.backup_version} > v${BACKUP_VERSION}). حدّث التطبيق أولاً.`);
  }
  if (!Array.isArray(data.projects)) errors.push('قائمة المشاريع مفقودة أو غير صالحة.');
  for (const f of ['assets', 'knowledge', 'proposals', 'sources']) {
    if (data[f] !== undefined && !Array.isArray(data[f])) errors.push(`قائمة ${f} غير صالحة.`);
  }
  return errors;
}

/* يعيد عناصر النسخة مع إبقاء حالاتها الأصلية دون تغيير. */
export function planImport(data, existingIds = new Set(), { overwrite = false } = {}) {
  const projects = (data.projects || []).map((p) => ({
    row: p, skip: !overwrite && existingIds.has(p.id)
  }));
  return {
    projects,
    knowledge: data.knowledge || [],
    proposals: data.proposals || [],
    sources: data.sources || [],
    assets: data.assets || []
  };
}

export function createBackupManager(store) {
  if (!store) throw new Error('createBackupManager يحتاج backend تخزين.');

  async function exportAll() {
    const projects = await store.listProjects();
    const scenes = {};
    for (const p of projects) scenes[p.id] = await store.listScenes(p.id);
    const assets = await store.listAssets();
    const knowledge = await store.listKnowledge();
    const proposals = await store.listProposals();
    const sources = await store.listSources();
    return buildBackup({ projects, scenes, assets, knowledge, proposals, sources });
  }

  async function importAll(data, { overwrite = false } = {}) {
    const errors = validateBackup(data);
    if (errors.length) { const e = new Error(errors.join(' | ')); e.validation = errors; throw e; }

    const existing = new Set((await store.listProjects()).map((p) => p.id));
    let imported = 0, skipped = 0;

    for (const p of data.projects) {
      if (!overwrite && existing.has(p.id)) { skipped++; continue; }
      const row = { ...p }; if (!row.id) row.id = uid(); row.updated_at = nowIso();
      await store.saveProject(row);
      await store.saveScenes(row.id, (data.scenes && data.scenes[p.id]) || []);
      imported++;
    }
    for (const a of (data.assets || [])) { const row = { ...a }; if (!row.id) row.id = uid(); await store.saveAsset(row); }

    // المعرفة والاقتراحات: تُحفظ بحالتها كما هي بالضبط (لا ترقية تلقائية)
    for (const k of (data.knowledge || [])) { const row = { ...k, status: k.status || 'pending' }; if (!row.id) row.id = uid(); await store.saveKnowledge(row); }
    for (const pr of (data.proposals || [])) { const row = { ...pr, status: pr.status || 'pending' }; if (!row.id) row.id = uid(); await store.saveProposal(row); }
    for (const s of (data.sources || [])) { const row = { ...s }; if (!row.id) row.id = uid(); await store.saveSource(row); }

    return {
      imported, skipped,
      assets: (data.assets || []).length,
      knowledge: (data.knowledge || []).length,
      proposals: (data.proposals || []).length,
      projects_in_file: data.projects.length
    };
  }

  return { exportAll, importAll };
}

export function backupFileName(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `migo-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
