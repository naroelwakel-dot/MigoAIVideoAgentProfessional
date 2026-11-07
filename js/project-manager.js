/* js/project-manager.js
   إدارة المشاريع والمشاهد. لا تعرف شيئاً عن localStorage أو Supabase؛
   تعمل عبر backend مُمرَّر (انظر js/store.js)، لذلك قابلة للاختبار آلياً.
*/
import { planProject } from './director-engine.js';
import { uid, nowIso } from './store.js';

const byCreatedDesc = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));

export function createProjectManager(store) {
  if (!store) throw new Error('createProjectManager يحتاج backend تخزين.');

  return {
    /* قائمة المشاريع (الأحدث أولاً) */
    async listProjects() {
      const all = await store.listProjects();
      return all.sort(byCreatedDesc);
    },

    /* إنشاء مشروع من مدخلات المستخدم: يبني الخطة والمشاهد ثم يحفظها */
    async createProject(input, assets = []) {
      const { plan, scenes } = planProject({ ...input, assets });
      const project = {
        id: uid(),
        title: plan.title,
        idea: plan.idea,
        objective: plan.objective,
        audience: plan.audience,
        duration_seconds: plan.duration,
        aspect_ratio: plan.aspect,
        visual_style: plan.style,
        treatment: plan.treatment,
        master_prompt: plan.masterPrompt,
        plan,
        status: 'draft',
        created_at: nowIso(),
        updated_at: nowIso()
      };
      const saved = await store.saveProject(project);
      const sceneRows = scenes.map((s) => ({
        id: uid(),
        project_id: saved.id,
        scene_number: s.number,
        start_seconds: s.startSeconds,
        end_seconds: s.endSeconds,
        duration_seconds: s.durationSeconds,
        role: s.role,
        beat: s.beat,
        shot_type: s.shotType,
        camera_angle: s.cameraAngle,
        camera_movement: s.cameraMovement,
        lens: s.lens,
        depth_of_field: s.depthOfField,
        lighting: s.lighting,
        color_palette: s.colorPalette,
        audio: s.audio,
        transition: s.transition,
        dialogue: s.dialogue || '',
        prompt: s.prompt,
        negative_prompt: s.negativePrompt,
        continuity_notes: plan.continuity,
        asset_ids: (s.assets || []).map((a) => a.id).filter(Boolean),
        created_at: nowIso()
      }));
      await store.saveScenes(saved.id, sceneRows);
      return { project: saved, scenes: sceneRows };
    },

    /* مشروع واحد مع مشاهده */
    async getProject(id) {
      const project = await store.getProject(id);
      if (!project) return null;
      const scenes = await store.listScenes(id);
      return { project, scenes: scenes.sort((a, b) => a.scene_number - b.scene_number) };
    },

    async deleteProject(id) { await store.deleteProject(id); },

    /* تحديث حقول بسيطة (العنوان/الحالة/الملاحظات) */
    async updateProject(id, patch) {
      const cur = await store.getProject(id);
      if (!cur) throw new Error('المشروع غير موجود.');
      const next = { ...cur, ...patch, id, updated_at: nowIso() };
      return store.saveProject(next);
    }
  };
}
