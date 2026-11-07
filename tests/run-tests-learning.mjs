/* tests/run-tests-learning.mjs
   اختبارات محرك التعلم ومركز الموافقات وقاعدة المعرفة (منطق نقي).
*/
import { proposeFromFeedback, proposeFromPattern, learningSummary } from '../js/learning-engine.js';
import { applyDecision, canDecide, activeRules, isUsable, rulesDiff, proposeRuleUpdate, decisionHistory } from '../js/approval-center.js';
import { isDuplicate, makeItem, retrieve, activeKnowledge, typeLabel } from '../js/knowledge-base.js';

let pass = 0, fail = 0; const results = [];
function check(name, fn) {
  try { fn(); pass++; results.push(`PASS  ${name}`); }
  catch (e) { fail++; results.push(`FAIL  ${name}\n      ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }
function eq(a, b, m) { if (a !== b) throw new Error(`${m} (المتوقع ${b} والفعلي ${a})`); }
function throws(fn, m) { let t = false; try { fn(); } catch { t = true; } assert(t, m); }

/* ---------- محرك التعلم ---------- */
check('تقييم منخفض يولّد اقتراحاً معلّقاً', () => {
  const p = proposeFromFeedback({ rating: 2, failure_notes: 'الوجوه تتغير بين اللقطات' }, { title: 'تنين', id: 'proj1' });
  assert(p && p.status === 'pending', 'الاقتراح يجب أن يكون معلّقاً');
  assert(p.rule_text.includes('الوجوه تتغير'), 'القاعدة يجب أن تشمل نص الفشل');
  eq(p.project_id, 'proj1', 'يربط بالمشروع');
});

check('تقييم مرتفع يولّد اقتراحاً بأسلوب ناجح', () => {
  const p = proposeFromFeedback({ rating: 5, success_notes: 'الإضاءة الذهبية عند الغروب' }, { title: 'صحراء' });
  assert(p && p.rule_text.includes('الإضاءة الذهبية'), 'يستخرج أسلوب النجاح');
});

check('تقييم بلا ملاحظات لا يولّد اقتراحاً', () => {
  eq(proposeFromFeedback({ rating: 5 }, { title: 'x' }), null, 'بلا ملاحظات لا اقتراح');
  eq(proposeFromFeedback({ rating: 0 }, { title: 'x' }), null, 'تقييم خارج المدى مرفوض');
});

check('اكتشاف نمط متكرر في التقييمات المنخفضة', () => {
  const fb = [
    { rating: 2, failure_notes: 'ضبابية في الوجوه' },
    { rating: 1, failure_notes: 'ضبابية واضحة في الوجوه' }
  ];
  const ps = proposeFromPattern(fb, { minOccurrences: 2 });
  assert(ps.length >= 1, 'يجب اكتشاف نمط متكرر');
  assert(ps[0].status === 'pending', 'النمط يبقى اقتراحاً معلّقاً دائماً');
});

check('ملخص التعلم يحسب المتوسط والحالات', () => {
  const s = learningSummary({
    projects: [1, 2], feedbacks: [{ rating: 5 }, { rating: 3 }],
    proposals: [{ status: 'pending' }, { status: 'approved' }, { status: 'approved' }]
  });
  eq(s.average_rating, 4, 'متوسط (5+3)/2 = 4');
  eq(s.by_status.pending, 1, 'عدد المعلّق');
  eq(s.by_status.approved, 2, 'عدد المعتمد');
});

/* ---------- مركز الموافقات ---------- */
check('لا يصبح الاقتراح نشطاً قبل الاعتماد', () => {
  const pending = { id: 'p1', status: 'pending', rule_text: 'قاعدة' };
  assert(!isUsable(pending), 'المعلّق غير قابل للاستخدام');
  assert(activeRules([pending]).length === 0, 'لا قواعد نشطة قبل الاعتماد');
});

check('الاعتماد ينتقل من pending إلى approved مع سجل قرار', () => {
  const { proposal, record } = applyDecision({ id: 'p1', status: 'pending' }, 'approved', { notes: 'مقبول' });
  eq(proposal.status, 'approved', 'يصبح معتمداً');
  eq(record.decision, 'approved', 'سجل القرار');
  eq(record.previous_status, 'pending', 'يحفظ الحالة السابقة');
  assert(activeRules([proposal]).length === 1, 'يصبح نشطاً بعد الاعتماد فقط');
});

check('الاقتراح المرفوض لا يصبح نشطاً أبداً', () => {
  const { proposal } = applyDecision({ id: 'p2', status: 'pending' }, 'rejected');
  eq(proposal.status, 'rejected', 'مرفوض');
  assert(!isUsable(proposal), 'المرفوض غير قابل للاستخدام');
  assert(activeRules([proposal]).length === 0, 'لا يصبح قاعدة نشطة');
  assert(!canDecide(proposal, 'approved'), 'لا انتقال من مرفوض إلى معتمد مباشرة');
  throws(() => applyDecision(proposal, 'approved'), 'يجب رفض الانتقال غير المسموح');
});

check('يمكن التراجع عن اعتماد سابق', () => {
  const approved = { id: 'p3', status: 'approved' };
  assert(canDecide(approved, 'rolled_back'), 'التراجع مسموح من معتمد');
  const { proposal } = applyDecision(approved, 'rolled_back');
  eq(proposal.status, 'rolled_back', 'الحالة تراجعت');
  assert(activeRules([proposal]).length === 0, 'لم تعد نشطة');
});

check('تحديث قاعدة معتمدة ينشئ اقتراحاً جديداً بلا تعديل صامت', () => {
  const old = { id: 'r1', status: 'approved', rule_text: 'استخدم 85mm دائماً' };
  const upd = proposeRuleUpdate(old, 'استخدم 85mm للوجوه و35mm للمشاهد الواسعة');
  eq(old.rule_text, 'استخدم 85mm دائماً', 'القاعدة القديمة لم تُلمس');
  eq(upd.status, 'pending', 'التحديث ينتظر الموافقة');
  eq(upd.previous_rule_id, 'r1', 'يشير للقاعدة السابقة');
  assert(upd.diff && upd.diff.changed, 'يعرض فرقاً');
  throws(() => proposeRuleUpdate({ status: 'pending' }, 'x'), 'لا تحديث لقاعدة غير معتمدة');
});

check('rulesDiff و decisionHistory يعملان', () => {
  assert(rulesDiff('أ', 'أ').changed === false, 'لا تغيير');
  assert(rulesDiff('أ', 'ب').changed === true, 'تغيير');
  const h = decisionHistory([{ decided_at: '2026-01-01' }, { decided_at: '2026-05-01' }]);
  eq(h[0].decided_at, '2026-05-01', 'الأحدث أولاً');
});

/* ---------- قاعدة المعرفة ---------- */
check('الاسترجاع يعيد المعتمد فقط', () => {
  const items = [
    { id: '1', title: 'قاعدة معتمدة', body: 'تفاصيل', item_type: 'documented', status: 'approved', tags: ['تنين'] },
    { id: '2', title: 'معلّقة', body: 'تفاصيل', item_type: 'proposal', status: 'pending', tags: ['تنين'] }
  ];
  const r = retrieve(items, { query: 'تفاصيل' });
  eq(r.length, 1, 'يُسترجع المعتمد فقط');
  eq(r[0].id, '1', 'البند المعتمد');
  eq(activeKnowledge(items).length, 1, 'المعرفة النشطة = المعتمدة');
});

check('البحث يفضّل الوسوم المطابقة', () => {
  const items = [
    { id: 'a', title: 'x', body: 'y', item_type: 'documented', status: 'approved', tags: ['إضاءة'] },
    { id: 'b', title: 'x', body: 'y', item_type: 'documented', status: 'approved', tags: ['موسيقى'] }
  ];
  eq(retrieve(items, { tags: ['إضاءة'] })[0].id, 'a', 'الوسم المطابق أولاً');
});

check('منع تكرار المعلومة نفسها', () => {
  const items = [{ id: '1', title: 'الإضاءة الذهبية', body: 'استخدم ضوء الغروب' }];
  assert(isDuplicate(items, { title: 'الإضاءة الذهبية', body: 'شيء آخر' }), 'عنوان مكرر');
  assert(!isDuplicate(items, { title: 'مختلف', body: 'نص جديد' }), 'غير مكرر');
});

check('makeItem يرفض الناقص ويطبّق الافتراضات', () => {
  throws(() => makeItem({ title: 'بلا متن' }), 'يجب رفض بلا متن');
  const it = makeItem({ title: 'عنوان', body: 'نص', item_type: 'inference' });
  eq(it.status, 'pending', 'الافتراضي معلّق');
  eq(it.item_type, 'inference', 'النوع محفوظ');
  throws(() => makeItem({ title: 'x', body: 'y', item_type: 'nope' }), 'نوع غير مدعوم');
});

check('فصل النوع: موثّق/اقتراح/استنتاج له وسم عربي', () => {
  eq(typeLabel('documented'), 'موثّق', 'وسم موثّق');
  eq(typeLabel('inference'), 'استنتاج', 'وسم استنتاج');
});

console.log('\n=== اختبارات التعلم والموافقات وقاعدة المعرفة ===\n');
for (const r of results) console.log(r);
console.log(`\nالنتيجة: ${pass} ناجح, ${fail} فاشل, ${results.length} إجمالي.\n`);
process.exit(fail === 0 ? 0 : 1);
