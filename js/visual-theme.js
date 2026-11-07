/* js/visual-theme.js
   طبقة «الثيم البصري المشترك» + الإطار المرجعي لكل لقطة (منطق نقي، بلا DOM).
   ---------------------------------------------------------------------------
   المشكلة التي تحلّها: كل مشهد في المشروع له إضاءة ولون وعدسة خاصة به، فإذا
   ولّد المستخدم كل لقطة في أداة خارجية منفصلة، يخرج الفيديو بهوية بصرية
   مبعثرة. الحل: طبقة ثيم واحدة تُلزم كل اللقطات، ووصف «إطار مرجعي» لكل لقطة
   يستطيع المستخدم توليده أو رفعه كصورة مرجعية في أداته.

   أمانة مهمة تُذكر في نص البرومبت نفسه:
   ذكر الإطار المرجعي في النص لا يمنح أداة التوليد الصورة. لا بد أن يرفعها
   المستخدم بنفسه. هذه القاعدة موجودة في المشروع منذ المرحلة الأولى.

   اللغات: نصوص العرض بالعربية، ونص البرومبت المُلحق بالإنجليزية، لأن كل
   برومبتات المشروع مكتوبة بالإنجليزية أصلاً.
*/

import { SUPPORTED_STYLES } from './director-engine.js';
import { buildScenePrompt } from './prompt-builder.js';
import { applyRecipe } from './shot-recipes.js';

/* حقول الثيم: المفتاح التقني ← الاسم المعروض بالعربية. */
export const THEME_FIELDS = [
  ['palette', 'لوحة الألوان'],
  ['lighting', 'قاعدة الإضاءة'],
  ['lensLook', 'العدسة والمظهر'],
  ['motionLanguage', 'لغة الحركة'],
  ['texture', 'الملمس والتشطيب']
];

/* ثيم جاهز لكل أسلوب من أساليب المشروع الخمسة. */
export const THEME_PRESETS = {
  'سينمائي واقعي للغاية': {
    palette: 'تباين دافئ مع ظلال باردة، ولمسة برتقالية في الإضاءة الزائدة',
    lighting: 'ضوء طبيعي ناعم بمصدر واحد واضح الاتجاه',
    lensLook: '35mm و50mm بعمق ميدان ضحل',
    motionLanguage: 'حركة كاميرا محفَّزة بالسرد، بلا اهتزاز عشوائي',
    texture: 'حبيبات فيلم خفيفة، بلا تشبّع أو إفراط في الحدّة'
  },
  'فانتازيا ملحمية': {
    palette: 'ذهبي دافئ مقابل أرجواني عميق',
    lighting: 'إضاءة درامية بمصادر ملوّنة وشعاع من خلال الضباب',
    lensLook: '24mm للمشاهد الواسعة و85mm للشخصيات',
    motionLanguage: 'حركة كاميرا واسعة وبطيئة تمنح المكان ضخامة',
    texture: 'ضباب خفيف وتوهّج حول مصادر الضوء'
  },
  'إعلان تجاري فاخر': {
    palette: 'أسود وخلفية نظيفة بسطح معدني دافئ',
    lighting: 'إضاءة استوديو محكومة مع ضوء حافة (rim) رقيق',
    lensLook: '85mm و135mm بمظهر نظيف جداً',
    motionLanguage: 'حركة دقيقة وبطيئة عدا لحظة الكشف',
    texture: 'سطوح نظيفة وتشطيب لامع بلا ضجيج بصري'
  },
  'أنيميشن ثلاثي الأبعاد': {
    palette: 'ألوان مشبعة متناسقة مع تباين واضح بين الشخصيات',
    lighting: 'إضاءة محسوبة بخلفية ملوّنة ونقاط إضاءة صغيرة',
    lensLook: 'عدسة واسعة بمنظور مبالغ فيه قليلاً',
    motionLanguage: 'حركة كرتونية سريعة بتسارع وتباطؤ واضحين',
    texture: 'سطوح ناعمة بلا تفاصيل واقعية زائدة'
  },
  'وثائقي واقعي': {
    palette: 'ألوان طبيعية غير معالجة',
    lighting: 'ضوء متاح فقط، بلا إضاءة مضافة',
    lensLook: '24mm و35mm بمظهر خام',
    motionLanguage: 'كاميرا محمولة خفيفة تواكب الحدث',
    texture: 'بلا فلاتر لونية، مظهر واقعي مباشر'
  }
};

const FALLBACK_STYLE = 'سينمائي واقعي للغاية';

export function themeForStyle(style) {
  const key = THEME_PRESETS[style] ? style : FALLBACK_STYLE;
  return { style: key, ...THEME_PRESETS[key] };
}

/* يكمّل أي ثيم ناقص من أسلوبه، وينظّف المسافات. يرجّع دائماً ثيماً صالحاً،
   ويتحمّل null صراحةً (لا الافتراضي فقط) لأن الواجهة قد تمرّر null. */
export function normalizeTheme(partial, style) {
  const given = partial || {};
  const base = themeForStyle(style || given.style);
  const out = { style: base.style };
  for (const [key] of THEME_FIELDS) {
    const raw = given[key];
    const val = raw === undefined || raw === null ? '' : String(raw).trim();
    out[key] = val || base[key];
  }
  return out;
}

export function themeSummaryLines(theme) {
  if (!theme) return null;
  const t = normalizeTheme(theme, theme.style);
  return THEME_FIELDS.map(([key, label]) => [label, t[key]]);
}

/* بلوك إنجليزي يُلحق بكل برومبت مشهد حتى تلتزم كل اللقطات بهوية واحدة. */
export function themePromptBlock(theme) {
  const t = normalizeTheme(theme, theme && theme.style);
  return [
    'SHARED VISUAL THEME (must hold across every scene, do not reinterpret):',
    `- Color palette: ${t.palette}`,
    `- Lighting rule: ${t.lighting}`,
    `- Optics: ${t.lensLook}`,
    `- Camera motion language: ${t.motionLanguage}`,
    `- Texture and finish: ${t.texture}`,
    '- Keep the same grade, the same light direction, and the same character identity in every shot.'
  ].join('\n');
}

/* وصف الإطار المرجعي للقطة: الصورة الثابتة التي تُرفع كمرجع قبل التحريك. */
export function referenceFrameBlock(scene = {}, theme) {
  const t = normalizeTheme(theme, theme && theme.style);
  return [
    'REFERENCE FRAME (a still for this shot, before any motion):',
    `- Framing: ${scene.shotType || 'لقطة متوسطة'} من ${scene.cameraAngle || 'مستوى العين'}.`,
    `- Composition: ${scene.composition || 'الشخصية في الثلث مع فراغ واضح'}.`,
    `- Subject and action, frozen: ${scene.beat || 'لحظة واحدة واضحة بلا حركة'}.`,
    `- Look locked to the theme: ${t.palette}; ${t.lighting}; ${t.lensLook}.`,
    '- Generate or attach this still first, then animate it. Naming a reference in text does not give the generator the image: re-attach the file in the external tool.'
  ].join('\n');
}

/* ملخص عربي للإطار المرجعي، للعرض في الواجهة والتقارير. */
export function referenceFrameSummary(scene = {}) {
  return `كادر مرجعي: ${scene.shotType || 'لقطة متوسطة'} — ${scene.composition || 'تكوين واضح'} — بلا حركة`;
}

function recipeBlock(recipe) {
  if (!recipe) return null;
  return [
    `SHOT RECIPE (${recipe.name} / ${recipe.category}):`,
    `- Purpose: ${recipe.purpose}`,
    `- Composition: ${recipe.composition}`,
    `- Camera: ${recipe.shotType}, ${recipe.cameraMovement}, ${recipe.cameraAngle}.`,
    `- Light: ${recipe.lighting}. Action: ${recipe.action}. Sound: ${recipe.audio}`
  ].join('\n');
}

/* يبني البرومبت النهائي: برومبت المشهد الأصلي + الثيم + القالب + الإطار المرجعي.
   لا يعدّل المشهد ولا نصه الأصلي، بل يرجّع نصاً جديداً. */
export function enrichScenePrompt(scene = {}, opts = {}) {
  const parts = [String(scene.prompt || '').trim()];
  const theme = opts.theme ? themePromptBlock(opts.theme) : null;
  const recipe = opts.recipe ? recipeBlock(opts.recipe) : null;
  const frame = referenceFrameBlock(scene, opts.theme);
  for (const block of [theme, recipe, frame]) if (block) parts.push(block);
  return parts.filter(Boolean).join('\n\n');
}

/* يرجّع نسخة جديدة من قائمة المشاهد، كل مشهد فيها يحمل:
   الحقول بعد تطبيق القالب + promptEnriched.
   مهم: عند تطبيق قالب نُعيد بناء البرومبت الأساسي بحقول القالب، وإلا صار
   البرومبت متناقضاً: سطر يقول «لقطة واسعة» وسطر آخر يقول «لقطة قريبة جداً».
   ولا نلمس المشهد الأصلي في القائمة المُمرَّرة. */
export function enrichScenes(scenes = [], opts = {}) {
  const recipeMap = opts.recipes || {};
  return scenes.map((s) => {
    const recipe = recipeMap[s.number] || null;
    const base = recipe ? applyRecipe(s, recipe) : { ...s };
    if (recipe && opts.plan) base.prompt = buildScenePrompt(base, opts.plan);
    return {
      ...base,
      recipeId: recipe ? recipe.id : null,
      recipeName: recipe ? recipe.name : null,
      promptEnriched: enrichScenePrompt(base, { theme: opts.theme, recipe })
    };
  });
}

/* هل كل المشاهد ملتزمة بثيم واحد؟ يُستخدم كتنبيه فقط، لا يمنع شيئاً. */
export function themeConsistencyReport(scenes = []) {
  const missing = scenes.filter((s) => !s.lighting || !s.colorPalette).map((s) => s.number);
  return {
    ok: missing.length === 0,
    missingScenes: missing,
    note: missing.length
      ? 'بعض المشاهد بلا إضاءة أو لون، فلا يمكن الحكم على التزامها بالثيم.'
      : 'كل المشاهد تحمل إضاءة ولوناً، والثيم المشترك يوحّدها.'
  };
}

export { SUPPORTED_STYLES };
