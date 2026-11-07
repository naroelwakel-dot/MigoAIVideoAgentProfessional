/* Migo AI Video Agent Professional - config.js
   ---------------------------------------------------------
   هذا الملف يصل إلى المتصفح، لذلك يحوي المفتاح العام anon/public فقط.
   لا تضع service_role أو أي مفتاح سري هنا إطلاقاً.
   القيم الفارغة/الحقيقية أدناه تعني أن التطبيق يعمل في الوضع التجريبي المحلي.

   خطوات التشغيل السحابي:
   1) ضع SUPABASE_URL و SUPABASE_ANON_KEY.
   2) اجعل DEMO_MODE = false.
   3) نفّذ database/schema.sql ثم database/policies.sql في Supabase.
*/
export const CONFIG = {
  SUPABASE_URL: 'https://xydgyyjpqtkmcpzbhzyf.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_hFEj6jel46eFN9waFscjZw_tnPI8QQc',

  DEMO_MODE: false,

  MAX_FILE_MB: 120,
  MAX_TOTAL_FILES_MB: 300,
  MAX_FILES_COUNT: 12,
  MAX_ANALYZE_FRAMES: 24,
  MAX_ANALYZE_MB: 60
};
