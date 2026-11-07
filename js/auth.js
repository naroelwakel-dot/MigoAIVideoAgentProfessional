/* js/auth.js
   مصادقة بلا تسجيل عام: دخول المالك فقط، استعادة الجلسة، وتسجيل خروج.
   في الوضع التجريبي: دخول وهمي محلي بلا تحقق (لا حماية حقيقية - موضّح في الواجهة).
   لا تُخزَّن كلمات المرور في localStorage مطلقاً؛ Supabase يتولى الجلسة بنفسه.
*/

export function createAuth({ client, demo = false } = {}) {
  return {
    demo,
    /* جلسة حالية إن وُجدت */
    async getSession() {
      if (demo) return { user: { id: 'demo-user', email: 'demo@local' }, isDemo: true };
      if (!client) return null;
      const { data, error } = await client.auth.getSession();
      if (error) return null;
      return data.session || null;
    },

    async getUser() {
      if (demo) return { id: 'demo-user', email: 'demo@local' };
      if (!client) return null;
      const { data } = await client.auth.getUser();
      return data ? data.user : null;
    },

    async signIn(email, password) {
      if (demo) return { user: { id: 'demo-user', email: email || 'demo@local' }, isDemo: true };
      if (!client) throw new Error('Supabase غير متصل.');
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(translate(error.message));
      return data;
    },

    async signOut() {
      if (demo) return;
      if (client) await client.auth.signOut();
    },

    /* يستدعي cb عند تغيّر حالة الدخول. يعيد دالة إلغاء الاشتراك. */
    onChange(cb) {
      if (demo || !client) return () => {};
      const { data } = client.auth.onAuthStateChange((_event, session) => cb(session));
      return () => data.subscription.unsubscribe();
    }
  };
}

function translate(msg = '') {
  if (/invalid login credentials/i.test(msg)) return 'البريد أو كلمة المرور غير صحيحة.';
  if (/email not confirmed/i.test(msg)) return 'البريد غير مؤكد. أكّده من Supabase.';
  if (/rate limit|too many/i.test(msg)) return 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.';
  return msg;
}
