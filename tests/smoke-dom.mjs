/* tests/smoke-dom.mjs
   اختبار دخان: يحمّل app.js فعلياً مع DOM وهمي بسيط، للتأكد أن كل الوحدات
   تُستورد، وأن مسار الإقلاع (boot) في الوضع التجريبي لا يرمي خطأً.
   هذا لا يغني عن اختبار متصفح حقيقي، لكنه يكشف أخطاء الاستيراد والأسماء.
*/
function fakeEl() {
  return {
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    options: [], selectedOptions: [],
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    querySelectorAll() { return []; }, querySelector() { return null; },
    closest() { return null; }, reset() {}, click() {}, focus() {}
  };
}
globalThis.document = {
  getElementById: () => fakeEl(),
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => fakeEl(),
  addEventListener() {}
};
globalThis.window = globalThis;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} } }, configurable: true
});
globalThis.confirm = () => false;
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} };

let rejected = null;
process.on('unhandledRejection', (e) => { rejected = e; });

try {
  await import('../app.js');
  await new Promise((r) => setTimeout(r, 60)); // فرصة لمسار boot غير المتزامن
  if (rejected) throw rejected;
  console.log('PASS  app.js استُورد وأقلع في الوضع التجريبي دون أخطاء');

  // وحدة المحادثة تُحمَّل مستقلة: نتحقق أنها تُستورد وتبني واجهتها بلا خطأ.
  // لا نستدعي أي شبكة هنا، فالمفتاح غير موجود والاختبار بلا مفاتيح.
  await import('../js/chat-ui.js');
  await new Promise((r) => setTimeout(r, 30));
  if (rejected) throw rejected;
  console.log('PASS  js/chat-ui.js استُورد وبنت واجهتها دون أخطاء');

  // معمل اللقطات: نفس الفحص. لا نضغط أي زر ولا ننزّل ملفاً، فقط نتأكد
  // أن الاستيراد والإقلاع وتوزيع القوالب لا ترمي خطأً بلا بيانات.
  await import('../js/shotlab-ui.js');
  await new Promise((r) => setTimeout(r, 30));
  if (rejected) throw rejected;
  console.log('PASS  js/shotlab-ui.js استُورد وبنت واجهته دون أخطاء');
  process.exit(0);
} catch (e) {
  console.log('FAIL  ' + (e && e.message));
  process.exit(1);
}
