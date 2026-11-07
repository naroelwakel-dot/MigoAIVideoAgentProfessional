/* js/asset-manager.js
   مكتبة الأصول وثبات الشخصيات. كل أصل له اسم ومعرّف ثابت asset_key يُعاد استخدامه
   حرفياً في البرومبتات، مع وصف تفصيلي. التخزين عبر backend مُمرَّر.
*/
import { uid, nowIso } from './store.js';

export const ASSET_TYPES = [
  'character', 'face', 'clothing', 'voice', 'location', 'prop', 'palette', 'reference_image'
];

const AR_ASSET_LABEL = {
  character: 'شخصية', face: 'وجه', clothing: 'ملابس', voice: 'صوت',
  location: 'موقع', prop: 'عنصر', palette: 'ألوان', reference_image: 'صورة مرجعية'
};
export const assetLabel = (t) => AR_ASSET_LABEL[t] || t;

const slug = (s) => String(s || '').trim().toLowerCase()
  .replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function createAssetManager(store) {
  if (!store) throw new Error('createAssetManager يحتاج backend تخزين.');

  return {
    async listAssets() {
      const all = await store.listAssets();
      return all.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    },

    /* إنشاء/تحديث أصل. المعرّف الثابت يُبنى تلقائياً إن لم يُعطَ. */
    async upsertAsset(input) {
      if (!input || !input.name || !String(input.name).trim()) throw new Error('اسم الأصل مطلوب.');
      if (!input.asset_type || !ASSET_TYPES.includes(input.asset_type)) {
        throw new Error(`نوع الأصل غير مدعوم. المدعوم: ${ASSET_TYPES.join(', ')}`);
      }
      const exists = input.id ? (await store.listAssets()).find((a) => a.id === input.id) : null;
      const prefix = input.asset_type.slice(0, 3);
      const asset_key = input.asset_key || (exists && exists.asset_key) || `${prefix}-${slug(input.name) || uid().slice(0, 6)}`;
      const asset = {
        id: input.id || uid(),
        name: String(input.name).trim(),
        asset_key,
        asset_type: input.asset_type,
        description: String(input.description || '').trim(),
        attributes: input.attributes || {},
        image_path: input.image_path || null,
        tags: Array.isArray(input.tags) ? input.tags : [],
        created_at: (exists && exists.created_at) || nowIso(),
        updated_at: nowIso()
      };
      const saved = await store.saveAsset(asset);
      return saved;
    },

    async deleteAsset(id) { await store.deleteAsset(id); },

    async getByKey(assetKey) {
      return (await store.listAssets()).find((a) => a.asset_key === assetKey) || null;
    },

    /* الأصول الجاهزة للتمرير إلى محرك الإخراج */
    async resolveAssets(ids = []) {
      const all = await store.listAssets();
      return ids.map((id) => all.find((a) => a.id === id)).filter(Boolean);
    }
  };
}
