/* tests/run-tests-managers.mjs
   اختبارات آلية لطبقة التخزين والمديرين والنسخ الاحتياطي.
   تعمل على الـ backend الMemory (بلا متصفح أو Supabase).
*/
import { createMemoryBackend, createLocalBackend } from '../js/store.js';
import { createProjectManager } from '../js/project-manager.js';
import { createAssetManager, ASSET_TYPES } from '../js/asset-manager.js';
import { createBackupManager, validateBackup, buildBackup, BACKUP_VERSION } from '../js/backup-manager.js';

let pass = 0, fail = 0; const results = [];
function check(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { pass++; results.push(`PASS  ${name}`); })
    .catch((e) => { fail++; results.push(`FAIL  ${name}\n      ${e.message}`); });
}
function assert(c, m) { if (!c) throw new Error(m); }
function eq(a, b, m) { if (a !== b) throw new Error(`${m} (المتوقع ${b} والفعلي ${a})`); }

const baseInput = { title: 'مشروع اختبار', idea: 'فارس يعبر الصحراء لإنقاذ أخته', duration: 60, aspect: '9:16', style: 'سينمائي واقعي للغاية' };

await check('إنشاء مشروع: يُحفظ ويُسترجع مع مشاهد مجموعه = المدة', async () => {
  const store = createMemoryBackend();
  const pm = createProjectManager(store);
  const { project, scenes } = await pm.createProject(baseInput);
  assert(project.id, 'يجب أن يُنشأ معرّف للمشروع');
  eq(scenes.length, project.plan.totalScenes, 'عدد المشاهد المحفوظة يطابق الخطة');
  const loaded = await pm.getProject(project.id);
  const total = loaded.scenes.reduce((a, s) => a + Number(s.duration_seconds), 0);
  eq(total, 60, 'مجموع مدة المشاهد المحفوظة يجب أن يساوي 60');
});

await check('قائمة المشاريع تعيد الأحدث أولاً وتُحذف بشكل صحيح', async () => {
  const store = createMemoryBackend();
  const pm = createProjectManager(store);
  const a = await pm.createProject({ ...baseInput, title: 'أول' });
  await new Promise((r) => setTimeout(r, 5));
  const b = await pm.createProject({ ...baseInput, title: 'ثاني' });
  let list = await pm.listProjects();
  eq(list.length, 2, 'يجب وجود مشروعين');
  eq(list[0].title, 'ثاني', 'الأحدث أولاً');
  await pm.deleteProject(a.project.id);
  list = await pm.listProjects();
  eq(list.length, 1, 'بعد الحذف يبقى مشروع واحد');
  eq(list[0].id, b.project.id, 'المشروع المتبقي هو الثاني');
  eq((await pm.getProject(a.project.id)), null, 'المحذوف لا يُسترجع');
});

await check('تحديث حالة المشروع', async () => {
  const store = createMemoryBackend();
  const pm = createProjectManager(store);
  const { project } = await pm.createProject(baseInput);
  const up = await pm.updateProject(project.id, { status: 'ready' });
  eq(up.status, 'ready', 'الحالة يجب أن تتحدّث');
});

await check('الوضع المحلي (localStorage محاكى) يحفظ ويسترجع', async () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  const store = createLocalBackend(storage);
  const pm = createProjectManager(store);
  const { project } = await pm.createProject(baseInput);
  const back = await createProjectManager(store).getProject(project.id);
  assert(back && back.project.title === 'مشروع اختبار', 'يجب استرجاع المشروع من localStorage');
  eq(back.scenes.length, project.plan.totalScenes, 'المشاهد تُسترجع أيضاً');
});

await check('مدير الأصول يرفض نوعاً غير صحيح ويولّد معرّفاً ثابتاً', async () => {
  const store = createMemoryBackend();
  const am = createAssetManager(store);
  let threw = false;
  try { await am.upsertAsset({ name: 'شيء', asset_type: 'nope', description: 'x' }); } catch { threw = true; }
  assert(threw, 'يجب رفض نوع أصل غير مدعوم');

  const a = await am.upsertAsset({ name: 'التنين الأزرق', asset_type: 'character', description: 'أزرق داكن، عيون ذهبية' });
  assert(a.asset_key.startsWith('cha-'), 'المعرّف يبدأ بنوع الأصل');
  const same = await am.upsertAsset({ id: a.id, name: 'التنين الأزرق', asset_type: 'character', description: 'تحديث' });
  eq(same.asset_key, a.asset_key, 'المعرّف الثابت لا يتغير عند التحديث');
  const found = await am.getByKey(a.asset_key);
  eq(found.id, a.id, 'الاسترجاع بالمعرّف الثابت يعمل');
  eq(ASSET_TYPES.length, 8, 'عدد أنواع الأصول 8');
});

await check('الأصول تُمرَّر لمحرك الإخراج وتظهر في برومبت المشهد', async () => {
  const store = createMemoryBackend();
  const am = createAssetManager(store);
  const pm = createProjectManager(store);
  const a = await am.upsertAsset({ name: 'السيف الذهبي', asset_type: 'prop', description: 'سيف ذهبي بنقوش' });
  const { scenes } = await pm.createProject(baseInput, [a]);
  assert(scenes[0].prompt.includes(a.asset_key), 'معرّف الأصل يجب أن يظهر في البرومبت');
});

await check('النسخة الاحتياطية: تصدير سليم واستيراد مع تخطي المكرر', async () => {
  const src = createMemoryBackend();
  const spm = createProjectManager(src);
  const sam = createAssetManager(src);
  await spm.createProject(baseInput);
  await sam.upsertAsset({ name: 'موقع', asset_type: 'location', description: 'صحراء عند الغروب' });
  const backup = await createBackupManager(src).exportAll();
  eq(validateBackup(backup).length, 0, 'النسخة الصادرة صالحة');

  const dst = createMemoryBackend();
  const bm = createBackupManager(dst);
  const r1 = await bm.importAll(backup);
  eq(r1.imported, 1, 'مشروع واحد استُورد');
  const r2 = await bm.importAll(backup);
  eq(r2.skipped, 1, 'الاستيراد الثاني يتخطى الموجود');
  const back = await createProjectManager(dst).getProject(backup.projects[0].id);
  eq(back.scenes.length, backup.scenes[backup.projects[0].id].length, 'المشاهد استُوردت مع المشروع');
  eq((await createAssetManager(dst).listAssets()).length, 1, 'الأصل استُورد');
});

await check('الاستيراد يرفض ملفاً ليس من التطبيق ونسخة أحدث', async () => {
  const dst = createMemoryBackend();
  const bm = createBackupManager(dst);
  let e1 = false;
  try { await bm.importAll({ app: 'other', backup_version: 1, projects: [] }); } catch (e) { e1 = Array.isArray(e.validation) && e.validation.length > 0; }
  assert(e1, 'يجب رفض ملف تطبيق آخر مع أسباب');

  let e2 = false;
  try { await bm.importAll(buildBackup({}) && { app: 'MigoAIVideoAgentProfessional', backup_version: BACKUP_VERSION + 1, projects: [] }); }
  catch (e) { e2 = /أحدث/.test(e.message); }
  assert(e2, 'يجب رفض نسخة أحدث من التطبيق');
});

await check('الاستيراد لا يرقّي اقتراحاً معلّقاً إلى معتمد', async () => {
  const dst = createMemoryBackend();
  const bm = createBackupManager(dst);
  const data = buildBackup({
    projects: [],
    knowledge: [{ id: 'k1', title: 'قاعدة', body: 'نص', item_type: 'documented', status: 'pending' }],
    proposals: [{ id: 'p1', status: 'pending', rule_text: 'اقتراح معلّق' }]
  });
  const r = await bm.importAll(data);
  eq((await dst.listKnowledge())[0].status, 'pending', 'المعرفة تبقى معلّقة');
  eq((await dst.listProposals())[0].status, 'pending', 'الاقتراح يبقى معلّقاً');
  eq(r.knowledge, 1, 'عدد بنود المعرفة المستوردة');
  eq(r.proposals, 1, 'عدد الاقتراحات المستوردة');
});

console.log('\n=== اختبارات المديرين وطبقة التخزين ===\n');
for (const r of results) console.log(r);
console.log(`\nالنتيجة: ${pass} ناجح, ${fail} فاشل, ${results.length} إجمالي.\n`);
process.exit(fail === 0 ? 0 : 1);
