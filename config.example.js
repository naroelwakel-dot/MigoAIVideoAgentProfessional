/* Migo AI Video Agent Professional - config.example.js
   ---------------------------------------------------------
   1) انسخ هذا الملف إلى config.js (بنفس الاسم config.js).
   2) ضع Supabase Project URL و anon/public key فقط.
   3) اترك DEMO_MODE=true للتجربة المحلية فقط، أو اجعله false بعد إعداد Supabase.
   4) لا تضع service_role key أو أي سر إداري هنا مطلقاً. هذا الملف يصل إلى المتصفح.

   ملاحظة أمان: config.js مضاف إلى .gitignore حتى لا يُرفع، لكن تذكّر أن أي مفتاح
   يوضع في واجهة الويب يصل إلى المتصفح. الحماية الحقيقية هي سياسات RLS على Supabase.
*/
export const CONFIG = {
  SUPABASE_URL: 'YOUR_SUPABASE_PROJECT_URL',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_PUBLIC_KEY',

  // true = وضع تجريبي محلي بالكامل (localStorage فقط، دخول تجريبي، بلا سحابة)
  DEMO_MODE: true,

  // حدود الاستخدام (تحمي متصفح Android من الانهيار)
  MAX_FILE_MB: 120,          // أكبر حجم ملف فيديو واحد
  MAX_TOTAL_FILES_MB: 300,   // أكبر مجموع أحجام في الجلسة الواحدة
  MAX_FILES_COUNT: 12,       // أقصى عدد مقاطع في التجميع
  MAX_ANALYZE_FRAMES: 24,    // أقصى عدد إطارات يستخرجها محلل الفيديو
  MAX_ANALYZE_MB: 60         // أكبر ملف يسمح بتحليله (تجنب انهيار الهاتف)
};
