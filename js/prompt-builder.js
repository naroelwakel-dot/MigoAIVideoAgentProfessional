/* js/prompt-builder.js
   وحدة بناء البرومبتات (منطق نقي، بلا DOM أو شبكة).
   قابلة للاستيراد في Node للاختبارات الآلية.
*/

export const NEGATIVE_PROMPT = [
  'subtitles', 'captions', 'text overlays', 'logos', 'watermarks',
  'distorted faces', 'deformed hands', 'extra fingers', 'extra limbs',
  'duplicate characters', 'warped proportions',
  'flicker', 'frame jumps', 'abrupt identity change',
  'low resolution', 'blurry', 'oversaturated', 'overexposed'
].join(', ');

/* بلوك الاستمرارية البصرية + تذكير بإرفاق المرجع.
   مهم: ذكر اسم الأصل لا يمنح أداة التوليد وصولاً إلى ملفه. */
export function buildContinuityBlock(assets = []) {
  const lines = [
    'Continuity rules (must hold across every scene): keep identical face, age, hairstyle, facial hair, eye color, and distinguishing marks for each character; keep wardrobe, colors, and accessories unchanged; keep location, time of day, props, and lighting direction consistent; match the previous and next scene; do not introduce unrelated characters or props.'
  ];
  if (assets.length) {
    lines.push('Referenced assets (names are identifiers only, not files):');
    for (const a of assets) {
      const key = a.assetKey ?? a.asset_key ?? a.id ?? 'asset';
      const type = a.assetType ?? a.asset_type ?? 'asset';
      lines.push(`- ${a.name} [${key}] (${type}): ${a.description}`);
    }
    lines.push('IMPORTANT: naming an asset does not give the generator access to its image. Re-attach the reference image with each scene prompt whenever the external tool requires an image reference.');
  }
  return lines.join('\n');
}

function assetBlock(scene) {
  if (!scene.assets || !scene.assets.length) return null;
  return buildContinuityBlock(scene.assets);
}

/* برومبت مستقل ودقيق لكل مشهد. */
export function buildScenePrompt(scene, plan = {}) {
  const L = [];
  L.push(`Create a ${plan.style || 'cinematic'} video scene.`);
  L.push(`Aspect ratio: ${plan.aspect || '16:9'}. Scene ${scene.number} of ${plan.totalScenes || '?'} (${scene.role}).`);
  L.push(`Target duration: about ${scene.durationSeconds} seconds (timeline ${scene.startSeconds}s to ${scene.endSeconds}s).`);
  if (plan.title) L.push(`Project: ${plan.title}.`);
  if (plan.idea) L.push(`Story: ${plan.idea}.`);
  if (plan.objective) L.push(`Objective: ${plan.objective}.`);
  if (plan.audience) L.push(`Audience: ${plan.audience}.`);
  L.push(`Action for this scene: ${scene.beat}.`);
  if (scene.dialogue) L.push(`Possible line (draft, adapt freely): "${scene.dialogue}".`);
  L.push(`Shot: ${scene.shotType}; camera movement: ${scene.cameraMovement}; angle: ${scene.cameraAngle}.`);
  L.push(`Optics: ${scene.lens}, ${scene.depthOfField}.`);
  L.push(`Lighting: ${scene.lighting}. Color palette: ${scene.colorPalette}.`);
  L.push(`Sound: ${scene.audio}. Transition out: ${scene.transition}.`);
  const ab = assetBlock(scene);
  if (ab) L.push(ab);
  L.push('Style notes: photorealistic detail where the chosen style allows, coherent character identity, natural body motion, motivated camera movement, realistic physics, cinematic composition.');
  return L.join('\n');
}

/* البرومبت الرئيسي للمشروع كاملاً. */
export function buildMasterPrompt(plan, scenes = []) {
  const L = [];
  L.push(`MASTER PROMPT - ${plan.title || 'Untitled'}`);
  L.push(`A ${plan.style} video, ${plan.aspect}, total ${plan.duration} seconds split into ${scenes.length} scenes.`);
  if (plan.idea) L.push(`Concept: ${plan.idea}`);
  if (plan.objective || plan.audience) L.push(`Objective: ${plan.objective || '-'} | Audience: ${plan.audience || '-'}`);
  L.push(`Cinematic treatment: ${plan.treatment}`);
  L.push('');
  L.push('Scene list:');
  for (const s of scenes) {
    L.push(`Scene ${s.number} (${s.startSeconds}s-${s.endSeconds}s) [${s.role}]: ${s.beat}`);
  }
  L.push('');
  L.push(buildContinuityBlock(plan.assets || []));
  L.push('');
  L.push(`Negative prompt: ${NEGATIVE_PROMPT}`);
  return L.join('\n');
}
