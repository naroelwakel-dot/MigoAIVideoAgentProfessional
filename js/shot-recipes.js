/* js/shot-recipes.js
   مكتبة «وصفات اللقطات» العربية (منطق نقي، بلا DOM أو شبكة).
   ---------------------------------------------------------------------------
   الفكرة: بدل ما المستخدم يبدأ من صفحة بيضاء، يختار قالب لقطة إخراجية جاهز
   (زاوية، حركة كاميرا، إضاءة، تكوين، إيقاع) ويُطبَّق على مشهد من مشاهد خطته.
   كل الوصفات مكتوبة بالعربية لأن كل حقول المشهد في هذا المشروع عربية أصلاً.

   قواعد ثابتة:
   - التطبيق لا يعدّل المشهد الأصلي، بل يرجّع نسخة جديدة (immutable).
   - لا نولّد فيديو ولا نستدعي أي خدمة. هذه قوالب نصية فقط.
   - الوصفة لا تعيد كتابة البرومبت، بل تُضاف إليه عبر js/visual-theme.js.
*/

export const RECIPE_CATEGORIES = ['إعلان', 'منتج', 'وثائقي', 'ريلز', 'دراما'];

/* الوصفة: وصف بشري بالعربية + قيم جاهزة تُوضع في حقول المشهد. */
export const RECIPES = [
  {
    id: 'ad-hero-product', name: 'المنتج البطل', category: 'إعلان',
    purpose: 'تقديم المنتج كبطل اللقطة الوحيد، بلا تشتيت، في ثانيتين.',
    shotType: 'لقطة قريبة جداً على المنتج', cameraMovement: 'push-in سريع نحو المنتج',
    cameraAngle: 'زاوية منخفضة قليلاً لتمنح المنتج هيبة', lighting: 'إضاءة استوديو محكومة مع ريم خفيف',
    composition: 'المنتج في الثلث مع فراغ نظيف حوله', action: 'المنتج يظهر ثم الكاميرا تقترب حتى يملأ الإطار',
    audio: 'نغمة صعود واحدة قصيرة تنتهي عند الكشف',
    note: 'لا تضع نصاً على الشاشة؛ البرومبت السلبي في المشروع يمنعه أصلاً.'
  },
  {
    id: 'ad-slowlux', name: 'الرشة البطيئة', category: 'إعلان',
    purpose: 'إبراز الملمس والجودة بحركة سائل شديد البطء.',
    shotType: 'لقطة ماكرو على السائل أو المسحوق', cameraMovement: 'tracking جانبي بطيء جداً',
    cameraAngle: 'مستوى الطاولة', lighting: 'إضاءة خلفية دافئة تُظهر الرذاذ',
    composition: 'الحركة تعبر الإطار من الحافة إلى الحافة', action: 'سائل أو مسحوق يتناثر ببطء شديد مع بريق يخترقه الضوء',
    audio: 'مؤثر صوتي دقيق للملمس مع صمت حوله',
    note: 'البطء الشديد يحتاج سرعة إطارات عالية؛ اطلب صراحة «slow motion عالي السرعة».'
  },
  {
    id: 'ad-transformation', name: 'قبل وبعد', category: 'إعلان',
    purpose: 'إظهار الفرق الذي يصنعه المنتج في لقطة واحدة مقنعة.',
    shotType: 'لقطتان متطابقتان في الإطار نفسه', cameraMovement: 'ثابتة تماماً بين اللقطتين',
    cameraAngle: 'مستوى العين، تكوين مطابق تماماً في اللقطتين', lighting: 'نفس الإضاءة والمسافة والعدسة في الحالتين',
    composition: 'نفس الكادر قبل وبعد، الفرق في التفاصيل فقط', action: 'نفس المشهد يتكرر مع تغيّر واضح في النتيجة',
    audio: 'صمت قصير عند نقطة التحول ثم نغمة إيجابية',
    note: 'أهم شرط هنا هو تطابق الكادر والإضاءة، وإلا لا يقرأ المشاهد الفرق.'
  },
  {
    id: 'ad-macro-detail', name: 'ماكرو التفاصيل', category: 'إعلان',
    purpose: 'إقناع بصري بالجودة من أقرب مسافة ممكنة.',
    shotType: 'لقطة ماكرو شديدة القرب على تفصيلة واحدة', cameraMovement: 'انزلاق قطري ناعم',
    cameraAngle: 'زاوية مائلة ٤٥ درجة', lighting: 'ضوء جانبي يكشف الملمس والنسيج',
    composition: 'التفصيلة تملأ الإطار والخلفية غير مقروءة', action: 'الكاميرا تمرّ على الملمس ببطء وتكشف الحواف',
    audio: 'نغمة خفيفة بلا إيقاع قوي حتى لا تسرق الانتباه',
    note: 'عمق ميدان ضحل جداً ضروري، وإلا تصبح الخلفية مشتتة.'
  },
  {
    id: 'prod-360', name: 'الدوران ٣٦٠', category: 'منتج',
    purpose: 'عرض المنتج من كل الجهات في لقطة واحدة مفهومة.',
    shotType: 'لقطة متوسطة للمنتج على قاعدة دوّارة', cameraMovement: 'orbit كامل حول المنتج',
    cameraAngle: 'مستوى المنتج نفسه', lighting: 'إضاءة ناعمة من ثلاث جهات بلا ظلال قاسية',
    composition: 'المنتج في المنتصف تماماً بخلفية سادة', action: 'المنتج يدور ببطء ثابت في الضوء',
    audio: 'طبقة موسيقية هادئة بعيدة',
    note: 'اطلب «rotation منتظم وبلا اهتزاز» وإلا خرج الدوران متقطعاً.'
  },
  {
    id: 'prod-flatlay', name: 'تكوين من الأعلى', category: 'منتج',
    purpose: 'إظهار المنتج مع كل ملحقاته في صورة واحدة نظيفة.',
    shotType: 'لقطة من أعلى (top-down) لكل العناصر', cameraMovement: 'ثابتة تماماً',
    cameraAngle: 'عمودية ٩٠ درجة على السطح', lighting: 'ضوء ناعم منتشر بلا ظلال ظاهرة',
    composition: 'ترتيب هندسي منظم على سطح واحد بلون موحد', action: 'العناصر ثابتة والحركة تصنعها اليد عند الدخول للإطار',
    audio: 'نغمة هادئة جداً أو صمت مقصود',
    note: 'الاتجاه للأعلى يمنع ظهور أي منظور؛ انتبه لتشوّه الحواف.'
  },
  {
    id: 'prod-lifestyle', name: 'في الاستخدام اليومي', category: 'منتج',
    purpose: 'ربط المنتج بلحظة حقيقية يفهمها المشاهد.',
    shotType: 'لقطة متوسطة للمستخدم مع المنتج', cameraMovement: 'handheld خفيف يواكب الحركة',
    cameraAngle: 'من فوق الكتف قليلاً', lighting: 'ضوء نهار طبيعي من نافذة',
    composition: 'المستخدم في الثلث والمنتج مقروء في يده', action: 'شخص يستخدم المنتج بطبيعية داخل مكان مألوف',
    audio: 'أصوات المكان المحيطة بمستوى منخفض',
    note: 'ثبات الملامح والملابس بين اللقطات هو أصعب نقطة هنا.'
  },
  {
    id: 'doc-interview', name: 'مقابلة بعمق ضحل', category: 'وثائقي',
    purpose: 'لقطة حديث تُسمع فيها الشخصية وتُعزل عن الخلفية.',
    shotType: 'لقطة قريبة على وجه المتحدث', cameraMovement: 'ثابتة مع اهتزاز يد خفيف جداً',
    cameraAngle: 'مستوى العين، الشخصية في الثلث مع فراغ نظر', lighting: 'ضوء نافذة جانبي طبيعي',
    composition: 'الخلفية ضبابية لكن يظهر منها سياق المكان', action: 'الشخصية تتحدث بهدوء مع حركة يد بسيطة',
    audio: 'صوت الحديث واضحاً مع خفض أصوات المكان',
    note: 'لا تكتب الحوار في البرومبت إن كنت ستصوّر الصوت منفصلاً لاحقاً.'
  },
  {
    id: 'doc-establish-pan', name: 'بانوراما تأسيسية', category: 'وثائقي',
    purpose: 'تعريف المكان في أول ثوانٍ بلا شرح لفظي.',
    shotType: 'لقطة واسعة جداً للموقع', cameraMovement: 'pan أفقي ناعم بمعدل ثابت',
    cameraAngle: 'زاوية مرتفعة قليلاً عن مستوى الإنسان', lighting: 'ضوء متاح في الساعة الذهبية',
    composition: 'خط الأفق مستقر والمكان يملأ الإطار', action: 'الكاميرا تكشف المكان تدريجياً من طرف إلى طرف',
    audio: 'أصوات المكان الطبيعية مع موسيقى ضعيفة',
    note: 'احفظ اتجاه البانوراما بين اللقطات حتى لا يضيع المشاهد.'
  },
  {
    id: 'doc-archive', name: 'تفاصيل أرشيفية', category: 'وثائقي',
    purpose: 'إضافة عمق زمني بملمس قديم مصنوع بعناية.',
    shotType: 'لقطة قريبة على صورة أو مستند قديم', cameraMovement: 'زوم بطيء جداً للأمام',
    cameraAngle: 'من أعلى بزاوية مائلة خفيفة', lighting: 'ضوء مكتب دافئ مع ظل اليد',
    composition: 'المستند يملأ الإطار وبقعة الضوء على التفصيلة المهمة', action: 'يد تقلب الصفحة ببطء',
    audio: 'صوت ورق وموسيقى خافتة',
    note: 'الملمس القديم يُطلب «grain قديم» لا فلاتر مبالغ فيها.'
  },
  {
    id: 'doc-broll', name: 'B-roll محيطي', category: 'وثائقي',
    purpose: 'تغطية سردية تمنح المونتاج مساحة تنفّس.',
    shotType: 'لقطة متوسطة لتفاصيل البيئة', cameraMovement: 'tracking جانبي هادئ',
    cameraAngle: 'مستوى العين أو أخفض قليلاً', lighting: 'ضوء طبيعي غير معدّل',
    composition: 'تفاصيل صغيرة تحكي المكان: أيدٍ، أدوات، ممرات', action: 'حركة يومية عادية بلا تصنّع',
    audio: 'محيط المكان فقط',
    note: 'صوّر أكثر مما تحتاج؛ هذه اللقطات هي التي تنقذ المونتاج.'
  },
  {
    id: 'reel-hook', name: 'الخطّاف', category: 'ريلز',
    purpose: 'منع التمرير في أول ثانيتين بلحظة بصرية غير مكتملة.',
    shotType: 'لقطة قريبة جداً بلا مقدمة', cameraMovement: 'push-in سريع ثم توقف مفاجئ',
    cameraAngle: 'زاوية غير معتادة لإحداث ارتباك بسيط', lighting: 'تباين عالٍ وجزء من الإطار مظلم',
    composition: 'الإطار مقطوع عمداً بحيث لا يكتمل المعنى', action: 'حدث غامض يبدأ في منتصفه بلا تفسير',
    audio: 'مؤثر ارتطام أو صمت حاد في البداية',
    note: 'الخطّاف يعمل بالغموض لا بالإبهار؛ أخفِ المعلومة لا تُظهرها.'
  },
  {
    id: 'reel-whip', name: 'التحويل السريع', category: 'ريلز',
    purpose: 'ربط مشهدين بإحساس حركة متصل يمنع الملل.',
    shotType: 'لقطتان متتاليتان بنفس اتجاه الحركة', cameraMovement: 'whip pan سريع بين المكانين',
    cameraAngle: 'نفس الارتفاع في اللقطتين', lighting: 'نفس اتجاه الضوء بقدر الإمكان',
    composition: 'العنصر المهم يبقى في النصف نفسه من الإطار', action: 'الكاميرا تتحرك بسرعة ثم تستقر على الهدف الجديد',
    audio: 'مؤثر تحويل مع نبضة إيقاعية على القطع',
    note: 'لو اختلف اتجاه الحركة بين اللقطتين، يقرأ المشاهد القطع كخطأ.'
  },
  {
    id: 'reel-detail-closeup', name: 'القرب المفاجئ', category: 'ريلز',
    purpose: 'تغيير الإيقاع بلقطة أقرب من المتوقع.',
    shotType: 'لقطة قريبة جداً على تفصيلة صغيرة', cameraMovement: 'ثابتة ثم اهتزاز خفيف',
    cameraAngle: 'قريب جداً من مستوى التفصيلة', lighting: 'ضوء قوي واحد يخلق ظلاً قوياً',
    composition: 'التفصيلة تملأ أكثر من نصف الإطار', action: 'تفصيلة صغيرة تتحرك فجأة',
    audio: 'قطع مفاجئ في الموسيقى عند اللقطة',
    note: 'استخدمها مرة واحدة في الفيديو؛ تكرارها يفقدها أثرها.'
  },
  {
    id: 'reel-loop-end', name: 'خاتمة تُعيد للبداية', category: 'ريلز',
    purpose: 'جعل الفيديو يعيد نفسه تلقائياً بلا نقطة توقف واضحة.',
    shotType: 'لقطة مطابقة للإطار الأول', cameraMovement: 'نفس حركة اللقطة الأولى بالعكس',
    cameraAngle: 'نفس زاوية اللقطة الافتتاحية تماماً', lighting: 'نفس إضاءة الافتتاحية',
    composition: 'نفس التكوين الافتتاحي بلا تغيير', action: 'العمل يعود إلى وضعه الأول',
    audio: 'نغمة تنتهي عند بداية النغمة الافتتاحية',
    note: 'التطابق يجب أن يكون حرفياً في الكادر والإضاءة، وإلا لا تُقرأ الحلقة.'
  },
  {
    id: 'drama-face-closeup', name: 'الوجه القريب', category: 'دراما',
    purpose: 'نقل انفعال داخلي بلا حوار ولا شرح.',
    shotType: 'لقطة قريبة على الوجه', cameraMovement: 'ثابتة تماماً مع تنفس الكاميرا',
    cameraAngle: 'مستوى العين مباشرة', lighting: 'إضاءة جانبية واحدة تترك نصف الوجه في الظل',
    composition: 'الوجه يملأ الإطار والخلفية مظلمة مقروءة', action: 'تعبير يتغير ببطء دون كلام',
    audio: 'صمت شبه كامل مع أنفاس مسموعة',
    note: 'الملامح يجب أن تبقى مطابقة لكل اللقطات الأخرى لهذه الشخصية.'
  },
  {
    id: 'drama-ots', name: 'من فوق الكتف', category: 'دراما',
    purpose: 'إظهار العلاقة والمسافة بين شخصيتين.',
    shotType: 'لقطة من فوق كتف شخصية نحو الأخرى', cameraMovement: 'tracking بطيء مع الحوار',
    cameraAngle: 'خلف كتف الشخصية الأولى عند مستوى نظرها', lighting: 'إضاءة دافئة من جهة والمكان معتم',
    composition: 'كتف الشخصية في المقدمة والوجه الآخر هو محور الإطار', action: 'تبادل حديث مع مسافة جسدية واضحة',
    audio: 'صوت الحوار مع محيط المكان',
    note: 'احفظ الجهة التي تظهر فيها كل شخصية، وإلا يضيع المشاهد في القطع.'
  },
  {
    id: 'drama-silence', name: 'الصمت الطويل', category: 'دراما',
    purpose: 'منح اللحظة ثقلاً قبل الانقلاب.',
    shotType: 'لقطة واسعة بلا حركة داخل الإطار', cameraMovement: 'ثابتة لمدة اللقطة كاملة',
    cameraAngle: 'زاوية مرتفعة تجعل الشخصية صغيرة في الفراغ', lighting: 'إضاءة باهتة متساوية بلا مصدر واضح',
    composition: 'الشخصية إلى طرف الإطار والفراغ هو البطل', action: 'شخصية ساكنة في مساحة كبيرة بلا حدث ظاهر',
    audio: 'صمت مقصود مع أضعف طبقة محيطية',
    note: 'الصمت يعمل فقط إذا كان المشهد قبله صاخباً؛ ضعه في مكانه الصحيح.'
  }
];

/* وصفات مقروءة كنسخة، حتى لا يعدّل أحد قائمة الوصفات الأصلية بالخطأ. */
export function listRecipes() {
  return RECIPES.map((r) => ({ ...r }));
}

export function getRecipe(id) {
  const found = RECIPES.find((r) => r.id === id);
  return found ? { ...found } : null;
}

export function recipesByCategory(category) {
  return RECIPES.filter((r) => r.category === category).map((r) => ({ ...r }));
}

/* التحقق من سلامة وصفة: مفيد للاختبارات ولأي وصفة يضيفها المستخدم لاحقاً. */
export function validateRecipe(recipe = {}) {
  const errors = [];
  if (!recipe.id || !String(recipe.id).trim()) errors.push('الوصفة بلا معرّف.');
  if (!recipe.name || !String(recipe.name).trim()) errors.push('الوصفة بلا اسم.');
  if (!RECIPE_CATEGORIES.includes(recipe.category)) {
    errors.push(`تصنيف غير معروف: ${recipe.category}. المتاح: ${RECIPE_CATEGORIES.join(', ')}.`);
  }
  for (const f of ['purpose', 'shotType', 'cameraMovement', 'cameraAngle', 'lighting', 'composition', 'action', 'audio']) {
    if (!recipe[f] || !String(recipe[f]).trim()) errors.push(`الوصفة بلا قيمة للحقل: ${f}.`);
  }
  return errors;
}

const pick = (arr, i) => arr[Math.abs(i) % arr.length];

/* اختيار قالب مناسب آلياً. القرار حتمي (لا عشوائية) حتى يكون قابلاً للاختبار. */
export function suggestRecipeFor(scene = {}, plan = {}) {
  const style = String(plan.style || '');
  const role = String(scene.role || '');
  const n = Number(scene.number) || 1;
  const isReel = String(plan.aspect || '') === '9:16' && Number(plan.duration) <= 30;

  if (isReel) {
    if (role === 'افتتاحية') return 'reel-hook';
    if (role === 'خاتمة') return 'reel-loop-end';
    return pick(['reel-whip', 'reel-detail-closeup'], n);
  }
  if (style.includes('إعلان')) {
    if (role === 'افتتاحية') return 'ad-hero-product';
    if (role === 'ذروة') return 'ad-transformation';
    return pick(['ad-macro-detail', 'ad-slowlux'], n);
  }
  if (style.includes('وثائقي')) {
    if (role === 'ذروة') return 'doc-interview';
    return pick(['doc-establish-pan', 'doc-broll', 'doc-archive'], n);
  }
  if (style.includes('فانتازيا') || style.includes('أنيميشن')) {
    if (role === 'ذروة') return 'drama-silence';
    return pick(['drama-face-closeup', 'drama-ots'], n);
  }
  if (role === 'افتتاحية') return 'doc-establish-pan';
  if (role === 'ذروة') return 'drama-face-closeup';
  return pick(['prod-lifestyle', 'prod-360', 'prod-flatlay'], n);
}

/* تطبيق وصفة على مشهد: يرجّع مشهداً جديداً ولا يمسّ الأصل. */
export function applyRecipe(scene = {}, recipe) {
  if (!recipe) return { ...scene };
  const next = { ...scene };
  next.shotType = recipe.shotType;
  next.cameraMovement = recipe.cameraMovement;
  next.cameraAngle = recipe.cameraAngle;
  next.lighting = recipe.lighting;
  next.composition = recipe.composition;
  next.beat = recipe.action;
  if (recipe.audio) next.audio = recipe.audio;
  next.recipeId = recipe.id;
  next.recipeName = recipe.name;
  if (recipe.note) next.recipeNote = recipe.note;
  return next;
}

/* إضافة القالب لعدة مشاهد: recipeIds خريطة «رقم المشهد ← معرّف الوصفة». */
export function applyRecipes(scenes = [], recipeIds = {}) {
  return scenes.map((s) => {
    const id = recipeIds[s.number];
    return id ? applyRecipe(s, getRecipe(id)) : { ...s };
  });
}

/* سطر واحد يلخّص القالب لبطاقة الواجهة. */
export function recipeSummaryLine(recipe) {
  if (!recipe) return null;
  return `${recipe.name} · ${recipe.category} — ${recipe.shotType}، ${recipe.cameraMovement}`;
}
