/* js/director-engine.js
   محرك الإخراج Director Engine (منطق نقي، بلا DOM أو شبكة).
   يحوّل الفكرة إلى خطة إنتاج: تحليل، معالجة، سيناريو مبدئي، ومشاهد بتوقيتات وبرومبتات.
   التقسيم مدفوع بالإيقاع والحدث، ومجموع مدة المشاهد يساوي مدة الفيديو بدقة.
*/

import { buildScenePrompt, buildMasterPrompt, buildContinuityBlock, NEGATIVE_PROMPT } from './prompt-builder.js';

export const SUPPORTED_DURATIONS = [15, 30, 45, 60, 90, 120];
export const SUPPORTED_ASPECTS = ['9:16', '16:9', '1:1'];
export const SUPPORTED_STYLES = [
  'سينمائي واقعي للغاية',
  'فانتازيا ملحمية',
  'إعلان تجاري فاخر',
  'أنيميشن ثلاثي الأبعاد',
  'وثائقي واقعي'
];

const SCENE_COUNT = { 15: 3, 30: 4, 45: 5, 60: 7, 90: 9, 120: 12 };

function sceneCountFor(duration) {
  return SCENE_COUNT[duration] ?? Math.max(3, Math.round(duration / 9));
}

function roleFor(index, total) {
  if (index === 0) return 'افتتاحية';
  if (index === total - 1) return 'خاتمة';
  const t = index / (total - 1);
  if (t < 0.4) return 'تمهيد';
  if (t < 0.75) return 'تصاعد';
  return 'ذروة';
}

const BEATS = {
  'افتتاحية': [
    'لقطة تأسيسية تكشف المكان والشخصية الرئيسية وتشد الانتباه من الثانية الأولى',
    'افتتاحية غامضة تطرح سؤالاً بصرياً دون كشف النهاية'
  ],
  'تمهيد': [
    'تقديم السياق والحدث الأول بحركة كاميرا هادئة وتفاصيل بيئية غنية',
    'بناء العالم وإظهار تفاعل الشخصية مع المكان بوضوح'
  ],
  'تصاعد': [
    'تصاعد الحدث وزيادة الإيقاع مع تغيير زاوية التصوير وإظهار العائق',
    'تسارع الأحداث وتقارب اللقطات مع زيادة الحركة داخل الإطار'
  ],
  'ذروة': [
    'لحظة الذروة البصرية بحركة قوية وإضاءة درامية وأقصى تفاصيل واقعية',
    'المواجهة الحاسمة مع أعلى مستوى حركة وتباين بصري'
  ],
  'خاتمة': [
    'خاتمة مؤثرة أو لقطة كشف نهائية مع إبطاء الإيقاع وإتاحة مساحة لظهور العنوان',
    'لقطة إغلاق هادئة تربط النهاية بالبداية وتترك أثراً'
  ]
};

const SHOTS = {
  'افتتاحية': ['لقطة واسعة تأسيسية', 'لقطة جوية واسعة'],
  'تمهيد': ['لقطة متوسطة', 'لقطة متوسطة واسعة'],
  'تصاعد': ['لقطة متوسطة قريبة', 'لقطة من فوق الكتف'],
  'ذروة': ['لقطة قريبة', 'لقطة قريبة جداً مع حركة'],
  'خاتمة': ['لقطة واسعة', 'لقطة قريبة ثابتة']
};

const CAMERA_MOVES = [
  'dolly in بطيء', 'pan أفقي ناعم', 'crane up', 'tracking جانبي',
  'handheld خفيف', 'push-in سريع', 'orbit حول الشخصية', 'pull back تدريجي'
];
const CAMERA_ANGLES = [
  'مستوى العين', 'زاوية منخفضة قليلاً لإضفاء هيبة', 'زاوية عالية لإبراز الضعف',
  'زاوية هولندية خفيفة', 'مستوى العين مع مسافة أمان'
];
const LENSES = ['24mm', '35mm', '50mm', '85mm', '135mm'];
const DOF = ['عمق ميدان واسع', 'عمق ميدان ضحل (bokeh خلفي)', 'تركيز حاد على الوجه'];
const LIGHTING = [
  'ضوء طبيعي ناعم', 'إضاءة ذهبية عند الغروب', 'إضاءة درامية عالية التباين',
  'إضاءة نيون ملوّنة', 'إضاءة داخلية دافئة'
];
const PALETTES = [
  'كحلي وسماوي بلمسة دافئة', 'برتقالي وتركوازي', 'أخضر داكن وذهبي',
  'رمادي معدني وأزرق بارد', 'أحمر ورمادي سينمائي'
];
const AUDIO = [
  'نغمة تمهيدية هادئة تتزايد تدريجياً', 'طبقة صوت محيطية ambience مع إيقاع خفيف',
  'موسيقى تصعيدية مع مؤثرات حركة', 'ذروة موسيقية قوية مع مؤثر ارتطام',
  'نغمة ختامية تهدأ تدريجياً'
];
const TRANSITIONS = ['قطع مباشر', 'تلاشٍ تدريجي (dissolve)', 'قطع على الحركة', 'انتقال match cut', 'تلاشٍ إلى الأسود'];

const pick = (arr, i) => arr[i % arr.length];

export function validateInput(input = {}) {
  const errors = [];
  if (!input.idea || !String(input.idea).trim()) errors.push('الفكرة أو وصف الفيديو مطلوب.');
  const duration = Number(input.duration);
  if (!SUPPORTED_DURATIONS.includes(duration)) errors.push(`المدة غير مدعومة: ${input.duration}. المدعوم: ${SUPPORTED_DURATIONS.join(', ')} ثانية.`);
  if (!SUPPORTED_ASPECTS.includes(input.aspect)) errors.push(`الأبعاد غير مدعومة: ${input.aspect}. المدعوم: ${SUPPORTED_ASPECTS.join(', ')}.`);
  if (input.style && !SUPPORTED_STYLES.includes(input.style)) errors.push(`الأسلوب غير مدعوم: ${input.style}.`);
  return errors;
}

/* منحنى الإيقاع: يقصر الافتتاحية ويطيل الذروة، فلا تكون المشاهد متساوية. */
function buildWeights(n) {
  const w = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    let v = 0.75 + 0.9 * Math.sin(Math.PI * t);
    v += 0.5 * Math.exp(-Math.pow((t - 0.78) / 0.18, 2)); // دفعة ذروة قرب ثلاثة أرباع الفيديو
    w.push(v);
  }
  return w;
}

/* توزيع المدة بثوانٍ صحيحة مع ضمان أن المجموع = المدة تماماً. */
export function allocateDurations(weights, total) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((x) => (x / sum) * total);
  const out = raw.map((v) => Math.max(1, Math.floor(v)));
  let used = out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  let k = 0;
  while (used < total) { out[order[k % order.length].i] += 1; used++; k++; }
  while (used > total) {
    const idx = out.indexOf(Math.max(...out));
    if (out[idx] <= 1) break;
    out[idx] -= 1; used--;
  }
  return out;
}

function buildAnalysis(input) {
  return {
    title: input.title ? String(input.title).trim() : 'مشروع بلا عنوان',
    idea: String(input.idea).trim(),
    objective: input.objective ? String(input.objective).trim() : 'عرض الفكرة بوضوح وجذب انتباه المشاهد حتى النهاية.',
    audience: input.audience ? String(input.audience).trim() : 'جمهور عام على الهاتف.',
    duration: Number(input.duration),
    aspect: input.aspect,
    style: input.style || SUPPORTED_STYLES[0]
  };
}

function buildTreatment(analysis, sceneCount) {
  return `${analysis.style} بمقاس ${analysis.aspect} ومدة ${analysis.duration} ثانية، موزّعة على ${sceneCount} مشهد. ` +
    `تبدأ بافتتاحية تشد الانتباه، تبني الحدث تدريجياً، تصل إلى ذروة بصرية قوية، ثم تختم بخاتمة تترك أثراً. ` +
    `${analysis.objective}`;
}

/* إنشاء الخطة الكاملة. يرمي خطأً عند إدخال غير صالح. */
export function planProject(input = {}) {
  const errors = validateInput(input);
  if (errors.length) {
    const err = new Error(errors.join(' | '));
    err.validation = errors;
    throw err;
  }

  const analysis = buildAnalysis(input);
  const n = sceneCountFor(analysis.duration);
  const durations = allocateDurations(buildWeights(n), analysis.duration);
  const assets = Array.isArray(input.assets) ? input.assets : [];

  let cursor = 0;
  const scenes = durations.map((d, i) => {
    const role = roleFor(i, n);
    const start = cursor;
    const end = cursor + d;
    cursor = end;
    const scene = {
      number: i + 1,
      role,
      startSeconds: start,
      endSeconds: end,
      durationSeconds: d,
      beat: pick(BEATS[role], i),
      shotType: pick(SHOTS[role], i),
      cameraMovement: pick(CAMERA_MOVES, i),
      cameraAngle: pick(CAMERA_ANGLES, i),
      lens: pick(LENSES, i),
      depthOfField: pick(DOF, i),
      lighting: pick(LIGHTING, i),
      colorPalette: pick(PALETTES, i),
      audio: pick(AUDIO, i),
      transition: i === n - 1 ? 'تلاشٍ إلى الأسود' : pick(TRANSITIONS, i),
      dialogue: '',
      assets: assets.slice(),
      negativePrompt: NEGATIVE_PROMPT
    };
    return scene;
  });

  const plan = {
    ...analysis,
    totalScenes: n,
    treatment: buildTreatment(analysis, n),
    scenes: scenes.length,
    assets,
    generatedAt: new Date().toISOString()
  };

  for (const s of scenes) s.prompt = buildScenePrompt(s, plan);
  plan.masterPrompt = buildMasterPrompt(plan, scenes);
  plan.continuity = buildContinuityBlock(assets);

  return { plan, scenes };
}

export { buildScenePrompt, buildMasterPrompt, buildContinuityBlock, NEGATIVE_PROMPT };
