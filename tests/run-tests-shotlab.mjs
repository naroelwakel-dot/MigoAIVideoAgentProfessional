/* tests/run-tests-shotlab.mjs
   اختبارات معمل اللقطات: مكتبة الوصفات، الثيم البصري، الإطار المرجعي، والتصدير.
   منطق نقي فقط: لا DOM، ولا شبكة، ولا مفاتيح.
*/
import {
  RECIPES, RECIPE_CATEGORIES, listRecipes, getRecipe, recipesByCategory,
  validateRecipe, suggestRecipeFor, applyRecipe, applyRecipes, recipeSummaryLine
} from '../js/shot-recipes.js';
import {
  THEME_FIELDS, THEME_PRESETS, themeForStyle, normalizeTheme, themeSummaryLines,
  themePromptBlock, referenceFrameBlock, referenceFrameSummary, enrichScenePrompt,
  enrichScenes, themeConsistencyReport
} from '../js/visual-theme.js';
import {
  formatSrtTime, cueTextFor, buildSrt, srtCueCount, buildShotListMarkdown,
  buildPromptsMarkdown, safeFileName, buildExportFiles, exportSummaryLines
} from '../js/export-kit.js';
import { planProject } from '../js/director-engine.js';

let pass = 0, fail = 0; const results = [];
function check(name, fn) {
  try { fn(); pass++; results.push(`PASS  ${name}`); }
  catch (e) { fail++; results.push(`FAIL  ${name}\n      ${e.message}`); }
}
function assert(c, m) { if (!c) throw new Error(m); }
function eq(a, b, m) { if (a !== b) throw new Error(`${m} (المتوقع ${JSON.stringify(b)} والفعلي ${JSON.stringify(a)})`); }
function ok(a, m) { if (!a) throw new Error(m); }

/* ---------- مكتبة الوصفات ---------- */
check('كل وصفة في المكتبة سليمة', () => {
  ok(RECIPES.length >= 15, `عدد الوصفات ${RECIPES.length} يجب أن يكون 15 على الأقل`);
  const ids = new Set();
  for (const r of RECIPES) {
    const errors = validateRecipe(r);
    eq(errors.length, 0, `الوصفة ${r.id}: ${errors.join(' | ')}`);
    ok(!ids.has(r.id), `معرّف مكرر: ${r.id}`);
    ids.add(r.id);
  }
});

check('validateRecipe يرفض وصفة ناقصة أو بتصنيف مجهول', () => {
  ok(validateRecipe({}).length > 0, 'الوصفة الفارغة مرفوضة');
  ok(validateRecipe({ id: 'x', name: 'س', category: 'غير موجود' }).some((e) => e.includes('تصنيف')), 'تصنيف مجهول مرفوض');
  const good = RECIPES[0];
  eq(validateRecipe({ ...good, action: '   ' }).length > 0, true, 'حقل فارغ مرفوض');
});

check('كل تصنيف معلن له وصفات فعلية', () => {
  for (const c of RECIPE_CATEGORIES) {
    ok(recipesByCategory(c).length > 0, `التصنيف ${c} بلا وصفات`);
  }
});

check('listRecipes وgetRecipe يرجّعان نسخاً لا الأصل', () => {
  const a = listRecipes();
  a[0].name = 'تعديل مدمّر';
  ok(RECIPES[0].name !== 'تعديل مدمّر', 'الأصل لم يتأثر');
  const r = getRecipe(RECIPES[0].id);
  r.name = 'تعديل آخر';
  ok(RECIPES[0].name !== 'تعديل آخر', 'الأصل لم يتأثر هنا أيضاً');
});

check('getRecipe يرجّع null لمعرّف غير موجود', () => {
  eq(getRecipe('لا-يوجد'), null, 'معرّف مجهول');
  eq(getRecipe(''), null, 'معرّف فارغ');
});

/* ---------- اختيار وتطبيق القوالب ---------- */
check('suggestRecipeFor يرجع معرّفاً صالحاً لكل مشهد ولكل أسلوب', () => {
  const styles = ['سينمائي واقعي للغاية', 'إعلان تجاري فاخر', 'وثائقي واقعي', 'فانتازيا ملحمية', 'أنيميشن ثلاثي الأبعاد'];
  for (const style of styles) {
    for (const role of ['افتتاحية', 'تمهيد', 'تصاعد', 'ذروة', 'خاتمة']) {
      const id = suggestRecipeFor({ number: 3, role }, { style, aspect: '16:9', duration: 60 });
      ok(getRecipe(id), `لا وصفة للمعرّف ${id} (${style} / ${role})`);
    }
  }
});

check('suggestRecipeFor قراره حتمي ولا يعتمد على العشوائية', () => {
  const scene = { number: 2, role: 'تصاعد' };
  const plan = { style: 'إعلان تجاري فاخر', aspect: '16:9', duration: 60 };
  eq(suggestRecipeFor(scene, plan), suggestRecipeFor(scene, plan), 'نفس المدخل يعطي نفس القرار');
});

check('الفيديو الرأسي القصير يأخذ قوالب ريلز', () => {
  const plan = { style: 'سينمائي واقعي للغاية', aspect: '9:16', duration: 15 };
  eq(suggestRecipeFor({ number: 1, role: 'افتتاحية' }, plan), 'reel-hook', 'الخطّاف في البداية');
  eq(suggestRecipeFor({ number: 3, role: 'خاتمة' }, plan), 'reel-loop-end', 'الحلقة في النهاية');
});

check('applyRecipe يعدّل نسخة جديدة ولا يمسّ الأصل', () => {
  const before = { number: 1, shotType: 'قديم', lighting: 'قديمة', beat: 'حدث قديم', dialogue: 'سطر' };
  const recipe = getRecipe('ad-hero-product');
  const after = applyRecipe(before, recipe);
  eq(before.shotType, 'قديم', 'المشهد الأصلي لم يتغير');
  eq(after.shotType, recipe.shotType, 'نوع اللقطة طُبّق');
  eq(after.beat, recipe.action, 'الحدث أُخذ من الوصفة');
  eq(after.dialogue, 'سطر', 'الحوار لم يُلمس');
  eq(after.recipeId, 'ad-hero-product', 'هوية القالب محفوظة');
});

check('applyRecipe بلا وصفة يرجّع نسخة مطابقة', () => {
  const s = { number: 2, beat: 'حدث' };
  const out = applyRecipe(s, null);
  eq(out.beat, 'حدث', 'لم يتغير شيء');
  ok(out !== s, 'نسخة جديدة لا نفس الكائن');
});

check('applyRecipes يطبّق الخريطة على المشاهد الصحيحة فقط', () => {
  const scenes = [{ number: 1, beat: 'أ' }, { number: 2, beat: 'ب' }, { number: 3, beat: 'ج' }];
  const out = applyRecipes(scenes, { 2: 'prod-360' });
  ok(!out[0].recipeId, 'المشهد 1 بلا قالب');
  eq(out[1].recipeId, 'prod-360', 'المشهد 2 أخذ قالبه');
  eq(out[1].beat, getRecipe('prod-360').action, 'حدثه تبدّل');
  eq(scenes[1].beat, 'ب', 'الأصل سليم');
});

check('recipeSummaryLine يلخّص الوصفة أو يرجّع null', () => {
  const line = recipeSummaryLine(getRecipe('doc-interview'));
  ok(line.includes('مقابلة'), 'الاسم في السطر');
  eq(recipeSummaryLine(null), null, 'لا وصفة تعني لا سطر');
});

/* ---------- الثيم البصري ---------- */
check('لكل أسلوب من أساليب المشروع ثيم جاهز كامل', () => {
  const styles = Object.keys(THEME_PRESETS);
  ok(styles.length >= 5, 'خمسة أساليب على الأقل');
  for (const s of styles) {
    const t = normalizeTheme({}, s);
    for (const [key] of THEME_FIELDS) ok(t[key], `الثيم ${s} بلا قيمة للحقل ${key}`);
  }
});

check('themeForStyle يرجع للأسلوب الافتراضي عند أسلوب مجهول', () => {
  const t = themeForStyle('أسلوب لا وجود له');
  ok(THEME_PRESETS[t.style], 'الأسلوب الافتراضي موجود في القوالب');
});

check('normalizeTheme يستخدم قيمة المستخدم ويتجاهل الفارغ', () => {
  const t = normalizeTheme({ palette: '  أحمر وأسود  ', lighting: '   ' }, 'وثائقي واقعي');
  eq(t.palette, 'أحمر وأسود', 'ينظّف المسافات ويحفظ قيمة المستخدم');
  eq(t.lighting, THEME_PRESETS['وثائقي واقعي'].lighting, 'الفارغ يرجع للافتراضي');
});

check('themeSummaryLines يرجّع كل حقول الثيم بالعربية', () => {
  const rows = themeSummaryLines(themeForStyle('إعلان تجاري فاخر'));
  eq(rows.length, THEME_FIELDS.length, 'عدد الصفوف = عدد الحقول');
  ok(rows.every(([k, v]) => k && v), 'لا صف فارغ');
  eq(themeSummaryLines(null), null, 'لا ثيم يعني لا صفوف');
});

check('themePromptBlock يذكر كل حقول الثيم ويطلب الالتزام', () => {
  const block = themePromptBlock(themeForStyle('سينمائي واقعي للغاية'));
  ok(block.includes('SHARED VISUAL THEME'), 'عنوان البلوك');
  const t = themeForStyle('سينمائي واقعي للغاية');
  for (const [key] of THEME_FIELDS) ok(block.includes(t[key]), `البلوك يفتقد قيمة ${key}`);
  ok(/every scene/i.test(block), 'يطلب الالتزام في كل المشاهد');
});

check('referenceFrameBlock يصف كادراً ثابتاً وينبّه لرفع الصورة', () => {
  const block = referenceFrameBlock({ shotType: 'لقطة قريبة', cameraAngle: 'مستوى العين', beat: 'حدث' }, themeForStyle('وثائقي واقعي'));
  ok(block.includes('REFERENCE FRAME'), 'عنوان البلوك');
  ok(block.includes('لقطة قريبة'), 'يذكر نوع اللقطة');
  ok(/re-attach the file|does not give the generator the image/i.test(block), 'التنبيه الأمني موجود');
});

check('referenceFrameSummary سطر عربي قصير', () => {
  const line = referenceFrameSummary({ shotType: 'لقطة واسعة', composition: 'المنتج في الثلث' });
  ok(line.includes('كادر مرجعي'), 'يبدأ بالوصف');
  ok(line.includes('لقطة واسعة'), 'يذكر اللقطة');
});

/* ---------- الدمج: خطة حقيقية من محرك الإخراج ---------- */
const planInput = {
  title: 'إعلان متجر', idea: 'فتاة تفتح صندوقاً وتكتشف منتجاً', objective: 'إعلان تشويقي',
  audience: 'شباب على الهاتف', duration: 30, aspect: '9:16', style: 'إعلان تجاري فاخر'
};
const built = planProject(planInput);

check('enrichScenes يضيف برومبتاً محسّناً لكل مشهد ويحفظ الأصل', () => {
  const theme = normalizeTheme({}, planInput.style);
  const ids = {};
  for (const s of built.scenes) ids[s.number] = suggestRecipeFor(s, built.plan);
  const recipes = {};
  for (const [n, id] of Object.entries(ids)) recipes[n] = getRecipe(id);
  const out = enrichScenes(built.scenes, { plan: built.plan, theme, recipes });

  eq(out.length, built.scenes.length, 'نفس عدد المشاهد');
  for (const s of out) {
    ok(s.promptEnriched.includes('SHARED VISUAL THEME'), `المشهد ${s.number} بلا ثيم`);
    ok(s.promptEnriched.includes('REFERENCE FRAME'), `المشهد ${s.number} بلا إطار مرجعي`);
    ok(s.promptEnriched.startsWith(String(s.prompt).slice(0, 40)), `المشهد ${s.number} لا يبدأ ببرومبته`);
    ok(s.recipeName, `المشهد ${s.number} بلا قالب`);
    eq(s.promptEnriched, enrichScenePrompt(s, { theme, recipe: recipes[s.number] }), 'نفس الدالة تعطي نفس الناتج');
  }
  ok(!built.scenes[0].promptEnriched, 'الخطة الأصلية لم تُلوَّث بحقل جديد');
});

check('تطبيق القالب يُعاد بناء البرومبت به فلا يتناقض سطر اللقطة', () => {
  const theme = normalizeTheme({}, planInput.style);
  const scene = built.scenes[0];
  const recipe = getRecipe('ad-hero-product');
  const out = enrichScenes([scene], { plan: built.plan, theme, recipes: { [scene.number]: recipe } })[0];

  eq(out.shotType, recipe.shotType, 'حقل اللقطة أخذ قيمة القالب');
  eq(out.beat, recipe.action, 'الحدث أخذ قيمة القالب');
  ok(out.prompt.includes(recipe.shotType), 'البرومبت الأساسي أُعيد بناؤه بالقالب');
  ok(out.prompt.includes(recipe.action), 'وصف الحدث في البرومبت هو حدث القالب');
  ok(!out.prompt.includes(scene.shotType), 'لم تبقَ عبارة اللقطة القديمة المتناقضة');
  eq(built.scenes[0].shotType, scene.shotType, 'الأصل لم يتغير');
});

check('enrichScenes بلا خطة يطبّق حقول القالب دون إعادة بناء البرومبت', () => {
  const out = enrichScenes([{ number: 1, prompt: 'نص أصلي', shotType: 'قديم' }], {
    recipes: { 1: getRecipe('prod-360') }
  })[0];
  eq(out.shotType, getRecipe('prod-360').shotType, 'الحقول طُبّقت');
  ok(out.promptEnriched.startsWith('نص أصلي'), 'البرومبت الأصلي كما هو في بداية النص');
});

check('enrichScenePrompt يتحمّل مدخلاً فارغاً بلا انفجار', () => {
  const out = enrichScenePrompt({});
  ok(out.includes('REFERENCE FRAME'), 'يبني الإطار المرجعي حتى بلا مشهد');
  ok(!out.includes('SHARED VISUAL THEME'), 'لا يضيف ثيماً لم يُطلب');
});

check('normalizeTheme يتحمّل null صراحةً بدل الافتراضي فقط', () => {
  const t = normalizeTheme(null, 'وثائقي واقعي');
  ok(t.palette, 'يرجّع ثيماً صالحاً بدل الانفجار');
  eq(t.style, 'وثائقي واقعي', 'يحترم الأسلوب المطلوب');
  ok(themePromptBlock(null).includes('SHARED VISUAL THEME'), 'بلوك البرومبت لا ينفجر مع null');
  ok(normalizeTheme(undefined, undefined).style, 'بلا أي مدخل يرجع للأسلوب الافتراضي');
});

check('themeConsistencyReport يكتشف المشاهد الناقصة', () => {
  const bad = themeConsistencyReport([{ number: 1, lighting: 'نور', colorPalette: 'ألوان' }, { number: 2 }]);
  eq(bad.ok, false, 'مشهد ناقص يعني لا التزام');
  eq(bad.missingScenes.length, 1, 'مشهد واحد ناقص');
  const good = themeConsistencyReport(built.scenes);
  eq(good.ok, true, 'مشاهد الخطة كاملة الإضاءة واللون');
});

/* ---------- التصدير ---------- */
check('formatSrtTime ينسّق التوقيت بالشكل الصحيح', () => {
  eq(formatSrtTime(0), '00:00:00,000', 'الصفر');
  eq(formatSrtTime(1.5), '00:00:01,500', 'نصف ثانية');
  eq(formatSrtTime(61), '00:01:01,000', 'دقيقة وثانية');
  eq(formatSrtTime(3661.25), '01:01:01,250', 'ساعة');
  eq(formatSrtTime(-5), '00:00:00,000', 'القيمة السالبة تُضبط');
});

check('cueTextFor يفضّل الحوار ثم يقع على وصف الحدث', () => {
  eq(cueTextFor({ dialogue: 'مرحباً', beat: 'حدث' }), 'مرحباً', 'الحوار أولاً');
  eq(cueTextFor({ dialogue: '   ', beat: 'حدث' }), 'حدث', 'الحوار الفارغ لا يُحتسب');
  eq(cueTextFor({}), '', 'مشهد بلا شيء');
});

check('buildSrt يخرج ملفاً صالحاً بأرقام متسلسلة وسهم التوقيت', () => {
  const srt = buildSrt(built.scenes);
  ok(srt.includes(' --> '), 'يحتوي سهم التوقيت');
  ok(srt.startsWith('1\n00:00:00,000 --> '), 'يبدأ بالترقيم الصحيح');
  const cueCount = srtCueCount(built.scenes);
  ok(cueCount === built.scenes.length, 'كل مشهد له سطر لأنه بلا حوار');
  eq(srt.split('\n\n').filter(Boolean).length, cueCount, 'عدد الكتل = عدد الأسطر');
});

check('buildSrt يتخطّى المشهد بلا نص تماماً', () => {
  const srt = buildSrt([{ number: 1, startSeconds: 0, endSeconds: 2, beat: '' }]);
  eq(srt, '', 'لا نص يعني ملفاً فارغاً');
  eq(srtCueCount([{ number: 1, beat: ' ' }]), 0, 'المسافات لا تُحتسب نصاً');
});

check('buildShotListMarkdown يبني جدولاً بصف لكل مشهد', () => {
  const md = buildShotListMarkdown(built.plan, built.scenes);
  ok(md.includes('# قائمة لقطات'), 'العنوان');
  ok(md.includes('| # | التوقيت |'), 'رأس الجدول');
  const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.includes('---') && !l.includes('| # |'));
  eq(rows.length, built.scenes.length, 'صف لكل مشهد');
});

check('buildPromptsMarkdown يضع البرومبت الرئيسي وكل المشاهد', () => {
  const md = buildPromptsMarkdown(built.plan, built.scenes);
  ok(md.includes('## البرومبت الرئيسي'), 'قسم الرئيسي');
  for (const s of built.scenes) ok(md.includes(`### مشهد ${s.number}`), `قسم المشهد ${s.number}`);
  ok(md.includes('```text'), 'كتل نصية');
});

check('safeFileName ينظّف الرموز الممنوعة في أسماء الملفات', () => {
  eq(safeFileName('إعلان / متجر: نسخة 2'), 'إعلان-متجر-نسخة-2', 'الرموز تُستبدل');
  eq(safeFileName('   '), 'migo-project', 'الفراغ يرجع للاسم الافتراضي');
  ok(safeFileName('أ'.repeat(200)).length <= 60, 'الطول محدود');
});

check('buildExportFiles يرجّع الملفات الثلاثة غير الفارغة', () => {
  const files = buildExportFiles(built.plan, built.scenes);
  const names = Object.keys(files).sort();
  eq(names.join(','), 'prompts.md,shot-list.md,subtitles.srt', 'أسماء الملفات');
  for (const [name, content] of Object.entries(files)) ok(content.length > 0, `${name} فارغ`);
});

check('exportSummaryLines يلخّص ما سيُصدَّر', () => {
  const rows = exportSummaryLines(built.plan, built.scenes);
  ok(rows.length >= 4, 'أربعة أسطر على الأقل');
  eq(rows[0][1], String(built.scenes.length), 'عدد المشاهد مطابق');
  ok(rows.every(([k, v]) => k && v), 'لا سطر فارغ');
});

/* ---------- النتيجة ---------- */
console.log(results.join('\n'));
console.log(`\n${pass} ناجح، ${fail} فاشل`);
process.exit(fail ? 1 : 0);
