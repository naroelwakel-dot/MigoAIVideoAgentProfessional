/* js/supabase-client.js
   تهيئة عميل Supabase. لا تُنشئ العميل في الوضع التجريبي.
   المفتاح المستخدم هو anon/public فقط. لا service_role هنا أبداً.
*/
import { CONFIG } from '../config.js';

export function looksUnconfigured(config = CONFIG) {
  return !config || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY ||
    String(config.SUPABASE_URL).startsWith('YOUR_') ||
    String(config.SUPABASE_ANON_KEY).startsWith('YOUR_');
}

export function initSupabase(config = CONFIG) {
  if (config.DEMO_MODE) return { client: null, mode: 'demo', message: 'وضع تجريبي محلي' };

  if (looksUnconfigured(config)) {
    return { client: null, mode: 'unconfigured', message: 'أكمل ملف config.js بمفاتيح Supabase.' };
  }
  if (!globalThis.supabase || typeof globalThis.supabase.createClient !== 'function') {
    return { client: null, mode: 'error', message: 'تعذر تحميل مكتبة Supabase. تحقق من الاتصال ثم أعد تحميل الصفحة.' };
  }
  try {
    const client = globalThis.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    return { client, mode: 'cloud', message: 'Supabase متصل' };
  } catch (e) {
    return { client: null, mode: 'error', message: 'فشل الاتصال بـ Supabase: ' + e.message };
  }
}
