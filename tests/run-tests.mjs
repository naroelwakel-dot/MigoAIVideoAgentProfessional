/* tests/run-tests.mjs
   اختبارات آلية قابلة للتشغيل: node tests/run-tests.mjs
   تغطي منطق النواة النقي (Director Engine + Prompt Builder).
   لا تغطي الواجهة أو Supabase أو FFmpeg (تحتاج متصفحاً حقيقياً).
*/
import {
  planProject, validateInput, allocateDurations,
  SUPPORTED_DURATIONS, SUPPORTED_ASPECTS
} from '../js/director-engine.js';
import { NEGATIVE_PROMPT, buildContinuityBlock } from '../js/prompt-builder.js';

let pass = 0, fail = 0;
const results = [];
function check(name, fn) {
  try { fn(); pass++; results.push(`PASS  ${name}`); }
  catch (e) { fail++; results.push(`FAIL  ${name}\n      ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg} (المتوقع ${b} والفعلي ${a})`); }

const baseIdea = 'تنين أخير يحمي مدينة صغيرة من عاصفة قادمة';

for (const duration of SUPPORTED_DURATIONS) {
  for (const aspect of SUPPORTED_ASPECTS) {
    check(`المجموع = المدة (${duration}s / ${aspect})`, () => {
      const { plan, scenes } = planProject({ title: 'اختبار', idea: baseIdea, duration, aspect, style: 'سينمائي واقعي للغاية' });
      const total = scenes.reduce((a, s) => a + s.durationSeconds, 0);
      eq(total, duration, 'مجموع مدة المشاهد يجب أن يساوي مدة الفيديو');
      eq(scenes.length, plan.totalScenes, 'عدد المشاهد الفعلي يجب أن يطابق الخطة');
    });
  }
}

check('التوقيتات متصلة وتبدأ من الصفر', () => {
  const { plan, scenes } = planProject({ idea: baseIdea, duration: 60, aspect: '9:16', style: 'فانتازيا ملحمية' });
  eq(scenes[0].startSeconds, 0, 'المشهد الأول يبدأ من الثانية صفر');
  for (let i = 1; i < scenes.length; i++) {
    eq(scenes[i].startSeconds, scenes[i - 1].endSeconds, `المشهد ${i + 1} يجب أن يبدأ حيث انتهى السابق`);
  }
  eq(scenes[scenes.length - 1].endSeconds, 60, 'آخر مشهد ينتهي عند المدة الكاملة');
});

check('كل مشهد له برومبت غير فارغ', () => {
  const { scenes } = planProject({ idea: baseIdea, duration: 45, aspect: '16:9', style: 'إعلان تجاري فاخر' });
  for (const s of scenes) assert(s.prompt && s.prompt.length > 40, `برومبت المشهد ${s.number} قصير أو فارغ`);
});

check('البرومبت الرئيسي موجود ويشمل البرومبت السلبي', () => {
  const { plan } = planProject({ idea: baseIdea, duration: 30, aspect: '1:1', style: 'وثائقي واقعي' });
  assert(plan.masterPrompt.includes('MASTER PROMPT'), 'البرومبت الرئيسي يجب أن يبدأ بعنوان');
  assert(plan.masterPrompt.includes(NEGATIVE_PROMPT), 'البرومبت الرئيسي يجب أن يشمل البرومبت السلبي');
});

check('التقسيم ليس متساوياً (مدفوع بالإيقاع)', () => {
  const { scenes } = planProject({ idea: baseIdea, duration: 120, aspect: '16:9', style: 'سينمائي واقعي للغاية' });
  const uniq = new Set(scenes.map((s) => s.durationSeconds));
  assert(uniq.size > 1, 'مدد المشاهد يجب أن تختلف، لا أن تكون موحّدة');
});

check('الأصول المرجعية تظهر في برومبت المشهد مع تنبيه الإرفاق', () => {
  const assets = [{
    assetKey: 'chr-dragon-01', name: 'التنين الأزرق', assetType: 'character',
    description: 'تنين أزرق داكن بعينين ذهبيتين وجناح مصاب على اليمين'
  }];
  const { scenes } = planProject({ idea: baseIdea, duration: 30, aspect: '9:16', style: 'فانتازيا ملحمية', assets });
  assert(scenes[0].prompt.includes('chr-dragon-01'), 'معرّف الأصل يجب أن يظهر في البرومبت');
  assert(scenes[0].prompt.includes('Re-attach the reference image'), 'يجب وجود تنبيه إعادة إرفاق المرجع');
});

check('مدخل غير صالح يرمي خطأً مع أسبابه', () => {
  let threw = false;
  try { planProject({ idea: '', duration: 77, aspect: '4:3' }); } catch (e) { threw = true; assert(Array.isArray(e.validation) && e.validation.length >= 3, 'يجب إرجاع كل أسباب الرفض'); }
  assert(threw, 'يجب رفض المدخل غير الصالح');
});

check('توزيع المدة يضبط الفروق الحسابية', () => {
  const out = allocateDurations([0.7, 1.6, 0.7], 15);
  eq(out.reduce((a, b) => a + b, 0), 15, 'المجموع يجب أن يُضبط على 15');
  assert(out.every((x) => x >= 1), 'لا مشهد أقل من ثانية');
});

check('بلوك الاستمرارية يذكر القاعدة الأساسية', () => {
  const block = buildContinuityBlock([]);
  assert(block.includes('identical face'), 'يجب ذكر ثبات الوجه');
  assert(!block.includes('Re-attach'), 'بلا أصول لا يجب ذكر إعادة الإرفاق');
});

console.log('\n=== Migo AI Video Agent Professional - تقرير الاختبارات ===\n');
for (const r of results) console.log(r);
console.log(`\nالنتيجة: ${pass} ناجح, ${fail} فاشل, ${results.length} إجمالي.\n`);
process.exit(fail === 0 ? 0 : 1);
