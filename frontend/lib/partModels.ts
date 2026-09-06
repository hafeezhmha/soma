// SOMA part-character 3D models (GLB), served from /public/models.
//
// To change which model represents which part:
//   - Reorder PART_MODELS (sets the automatic, deterministic assignment), or
//   - Add an entry to MODEL_BY_NAME to pin a specific part name to a model.
// MODEL_BY_NAME always wins over the automatic pick.

export const PART_MODELS = [
  '/models/1780479164879-at5znjqq.glb',
  '/models/1780478484545-7a62p15v.glb',
  '/models/1780582789484-p0k9d1v3.glb',
  '/models/1780580323487-m0j62ssc.glb',
  '/models/1780946527536-idugmccv.glb',
  '/models/1780428678593-vqadlkf7.glb',
];

export const MODEL_BY_NAME: Record<string, string> = {
  'The presenter': PART_MODELS[0],
  'The careful one': PART_MODELS[1],
};

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function modelForPart(part: { id?: string; name?: string }): string {
  if (part.name && MODEL_BY_NAME[part.name]) return MODEL_BY_NAME[part.name];
  const key = part.id || part.name || '';
  return PART_MODELS[hash(key) % PART_MODELS.length];
}
