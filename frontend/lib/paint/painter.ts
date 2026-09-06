// Surface painting for the 3D body studio.
//
// Ported from the standalone `daub` prototype. The pipeline and every one of its
// non-obvious constraints are documented inline — most of them cost real
// debugging to find and are silent when broken.
import * as THREE from 'three';

type Layer = {
  rt: THREE.WebGLRenderTarget;
  mask: THREE.WebGLRenderTarget;
  uniformSets: Array<Record<string, { value: any }>>;
  size: number;
  offset: THREE.Vector2;
  scale: THREE.Vector2;
  dirty?: boolean;
};

export type StrokeOptions = {
  color: THREE.Color;
  radius: number;
  softness: number;
  flow: number;
  erase: boolean;
  eye: THREE.Vector3;
};

/**
 * Paints into a per-mesh RGBA "paint layer" that is composited over the mesh's
 * original material at shading time. Keeping paint in its own layer (rather than
 * writing into a copy of the base texture) buys three things:
 *   - the original texture is never destroyed, so erase reveals it again
 *   - alpha genuinely means "painted here", which is what the dilation pass needs
 *     to know which texels to pad outward across UV seams
 *   - meshes with no texture at all work the same way as textured ones
 */

const WHITE = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

const QUAD = new THREE.PlaneGeometry(2, 2);
const FLAT_CAM = new THREE.Camera(); // paint/dilate shaders write clip space directly

// sRGB -> linear, written out by hand so we don't depend on three's internal
// colorspace function names, which have been renamed across releases.
const TO_LINEAR = `
vec3 daubToLinear(vec3 c){
  return mix(pow((c + 0.055) / 1.055, vec3(2.4)), c / 12.92, step(c, vec3(0.04045)));
}`;

/* ------------------------------------------------------------------ *
 * Brush pass: rasterise the mesh in UV space, shade by 3D distance
 * ------------------------------------------------------------------ */
const brushMaterial = () => new THREE.ShaderMaterial({
  uniforms: {
    uUvOffset: { value: new THREE.Vector2() }, // model UVs are rarely 0..1
    uUvScale: { value: new THREE.Vector2(1, 1) },
    uA: { value: new THREE.Vector3() },      // stroke segment start (world)
    uB: { value: new THREE.Vector3() },      // stroke segment end (world)
    uEye: { value: new THREE.Vector3() },    // camera position (world)
    uColor: { value: new THREE.Color() },
    uRadius: { value: 1 },
    uSoft: { value: 0.5 },
    uFlow: { value: 0.85 },
  },
  vertexShader: `
    uniform vec2 uUvOffset, uUvScale;
    varying vec3 vWorld;
    varying vec3 vNormalW;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      // The whole trick: place the vertex at its UV coordinate in clip space, so
      // rasterising this mesh fills exactly the texels it occupies in the atlas.
      // Model UVs are usually NOT 0..1 — tiled floors run to 22, atlases sit off
      // centre — so each mesh's UV bounds are normalised into the unit square
      // first. Without this the rasteriser clips everything outside 0..1 away.
      vec2 paintUv = (uv - uUvOffset) * uUvScale;
      gl_Position = vec4(paintUv * 2.0 - 1.0, 0.0, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uA, uB, uEye, uColor;
    uniform float uRadius, uSoft, uFlow;
    varying vec3 vWorld;
    varying vec3 vNormalW;

    // distance from this surface point to the swept brush segment, so fast
    // pointer movement lays down a continuous stroke instead of dotted stamps
    float distToSegment(vec3 p, vec3 a, vec3 b){
      vec3 ab = b - a;
      float len2 = dot(ab, ab);
      float t = len2 > 0.0 ? clamp(dot(p - a, ab) / len2, 0.0, 1.0) : 0.0;
      return distance(p, a + ab * t);
    }

    void main(){
      // Don't paint through the model onto surfaces facing away from the camera.
      if (dot(vNormalW, normalize(uEye - vWorld)) <= 0.0) discard;

      float d = distToSegment(vWorld, uA, uB);
      if (d > uRadius) discard;

      float inner = uRadius * (1.0 - uSoft);
      float a = 1.0 - smoothstep(inner, uRadius, d);
      if (a <= 0.0) discard;

      gl_FragColor = vec4(uColor, a * uFlow);
    }`,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
});

/* ------------------------------------------------------------------ *
 * Dilation pass: bleed painted texels outward past UV island edges.
 * Without this, bilinear filtering samples unpainted texels just outside an
 * island and every seam shows up as a hairline crack through the stroke.
 * ------------------------------------------------------------------ */
const dilateMaterial = () => new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, tMask: { value: null }, uTexel: { value: new THREE.Vector2() } },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tSrc;
    uniform sampler2D tMask;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tSrc, vUv);
      if (c.a > 0.0) { gl_FragColor = c; return; }
      // On the mesh's own surface, empty means the user erased it (or never
      // painted it). Only pad texels the UV layout doesn't cover.
      if (texture2D(tMask, vUv).r > 0.5) { gl_FragColor = c; return; }
      // Copy the strongest painted neighbour verbatim rather than blending the
      // ring. Averaging colour across neighbours while taking the maximum alpha
      // pairs a washed-out colour with a strong alpha, which rings every stroke
      // in a dark halo.
      vec4 best = vec4(0.0);
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec4 s = texture2D(tSrc, vUv + vec2(float(x), float(y)) * uTexel);
          if (s.a > best.a) best = s;
        }
      }
      gl_FragColor = best;
    }`,
  depthTest: false,
  depthWrite: false,
  // NoBlending is essential: the layer holds premultiplied colour, so letting
  // the default alpha blend run would multiply rgb by alpha again on every
  // pass. Across 8 dilation passes that is colour * alpha^8, which darkens
  // every stroke and turns its soft edge into a black ring.
  blending: THREE.NoBlending,
});

/**
 * Marks every texel the mesh's UV layout covers. The dilation pass needs this to
 * tell "unpainted because it lies outside a UV island" (pad it, or seams crack)
 * from "unpainted because the user erased it" (leave it alone). Without it,
 * dilation floods paint straight back into whatever you just erased.
 */
const maskMaterial = () => new THREE.ShaderMaterial({
  uniforms: {
    uUvOffset: { value: new THREE.Vector2() },
    uUvScale: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    uniform vec2 uUvOffset, uUvScale;
    void main(){
      gl_Position = vec4(((uv - uUvOffset) * uUvScale) * 2.0 - 1.0, 0.0, 1.0);
    }`,
  fragmentShader: `void main(){ gl_FragColor = vec4(1.0); }`,
  depthTest: false,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.NoBlending,
});

/** Drops padding outside the UV islands so it can be rebuilt from current paint. */
const resetPadMaterial = () => new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, tMask: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tSrc;
    uniform sampler2D tMask;
    varying vec2 vUv;
    void main(){
      // The eraser can only touch texels the UV layout covers, so old padding
      // survives it. Left alone it shows up as a coloured hairline along seams
      // next to anything you erased.
      gl_FragColor = texture2D(tMask, vUv).r > 0.5 ? texture2D(tSrc, vUv) : vec4(0.0);
    }`,
  depthTest: false,
  depthWrite: false,
  blending: THREE.NoBlending,
});

const newMask = (size: number) => {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RedFormat,          // one byte per texel, not four
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  rt.texture.generateMipmaps = false;
  return rt;
};

const newTarget = (size: number) => {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
  // Paint is stored as raw sRGB bytes and converted to linear in the composite,
  // so strokes blend the way they look rather than the way they're lit.
  rt.texture.colorSpace = THREE.NoColorSpace;
  rt.texture.generateMipmaps = false;
  return rt;
};


const copyMaterial = () => new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tSrc;
    varying vec2 vUv;
    void main(){ gl_FragColor = texture2D(tSrc, vUv); }`,
  depthTest: false,
  depthWrite: false,
  blending: THREE.NoBlending,
});

export class PaintSystem {
  renderer: THREE.WebGLRenderer;
  resolution: number;
  layers: Map<THREE.Mesh, Layer>;
  scratch: THREE.WebGLRenderTarget | null;
  claimedGeometries: Set<THREE.BufferGeometry>;
  brush: THREE.ShaderMaterial;
  maskMat: THREE.ShaderMaterial;
  resetPadMat: THREE.ShaderMaterial;
  dilateMat: THREE.ShaderMaterial;
  copyMat: THREE.ShaderMaterial;
  proxy: THREE.Mesh;
  quad: THREE.Mesh;
  strokeBefore: Map<THREE.Mesh, THREE.WebGLRenderTarget>;
  history: Array<Map<THREE.Mesh, THREE.WebGLRenderTarget>>;
  historyLimit: number;
  pool: THREE.WebGLRenderTarget[];
  snapshotBytes: number;
  snapshotBudget: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.resolution = 1024;
    this.layers = new Map();          // THREE.Mesh -> layer record
    this.scratch = null;              // one shared dilation buffer, not one per mesh
    this.claimedGeometries = new Set(); // geometry reuse across meshes must be broken

    this.brush = brushMaterial();
    this.maskMat = maskMaterial();
    this.resetPadMat = resetPadMaterial();
    this.dilateMat = dilateMaterial();
    this.copyMat = copyMaterial();

    this.proxy = new THREE.Mesh(undefined as any, this.brush);
    this.proxy.matrixAutoUpdate = false;
    this.proxy.frustumCulled = false;

    this.quad = new THREE.Mesh(QUAD, this.dilateMat);
    this.quad.frustumCulled = false;

    this.strokeBefore = new Map();    // mesh -> pre-stroke snapshot target
    this.history = [];
    this.historyLimit = 20;
    this.pool = [];                   // recycled snapshot targets
    this.snapshotBytes = 0;
    this.snapshotBudget = 192 * 1024 * 1024;
  }

  isReady(mesh: THREE.Mesh) { return this.layers.has(mesh); }

  /**
   * Give `mesh` a paint layer. Safe to call repeatedly; concurrent calls share
   * one promise. The body models are authored with cylindrical UVs per part, so
   * nothing needs unwrapping at runtime.
   */
  async ensure(mesh: THREE.Mesh): Promise<Layer> {
    if (this.layers.has(mesh)) return this.layers.get(mesh)!;
    if (mesh.userData.somaPaintPending) return mesh.userData.somaPaintPending as Promise<Layer>;

    const task = (async () => {
      const geo = mesh.geometry;

      // Two meshes sharing one geometry would otherwise share one paint layer,
      // and painting one would smear paint onto the other.
      if (this.claimedGeometries.has(geo)) mesh.geometry = geo.clone();
      this.claimedGeometries.add(mesh.geometry);

      if (!mesh.geometry.attributes.uv) throw new Error(`${mesh.name || 'mesh'} has no UVs`);

      const layer = this._createLayer(mesh);
      this.layers.set(mesh, layer);
      delete mesh.userData.somaPaintPending;
      return layer;
    })();

    mesh.userData.somaPaintPending = task;
    task.catch(() => { delete mesh.userData.somaPaintPending; });
    return task;
  }

  _createLayer(mesh: THREE.Mesh): Layer {
    const size = this.resolution;
    const rt = newTarget(size);
    this._wipe(rt);
    if (!this.scratch || this.scratch.width !== size) {
      this.scratch?.dispose();
      this.scratch = newTarget(size);
    }

    // Paint gets its own normalised UV space so it is unaffected by whatever the
    // model does with its own coordinates (tiling, offsets, atlas packing).
    const uvAttr = mesh.geometry.attributes.uv;
    const box = new THREE.Box2(new THREE.Vector2(Infinity, Infinity), new THREE.Vector2(-Infinity, -Infinity));
    for (let i = 0; i < uvAttr.count; i++) box.expandByPoint(new THREE.Vector2(uvAttr.getX(i), uvAttr.getY(i)));
    const span = box.getSize(new THREE.Vector2());
    const offset = box.min.clone();
    const scale = new THREE.Vector2(span.x > 1e-6 ? 1 / span.x : 1, span.y > 1e-6 ? 1 / span.y : 1);

    const mask = newMask(size);
    this._renderMask(mesh, mask, offset, scale);

    const material: any = Array.isArray(mesh.material)
      ? mesh.material.map(m => m.clone())
      : mesh.material.clone();
    const mats = Array.isArray(material) ? material : [material];
    const uniformSets: Array<Record<string, { value: any }>> = [];

    for (const m of mats) {
      // Guarantee a base map so the composite has something to sit on top of and
      // so untextured meshes take the same code path as textured ones.
      if (!m.map) { m.map = WHITE; m.map.colorSpace = THREE.SRGBColorSpace; }
      const uniforms = {
        uPaint: { value: rt.texture },
        uDaubOffset: { value: offset },
        uDaubScale: { value: scale },
      };
      uniformSets.push(uniforms);

      m.onBeforeCompile = (shader: any) => {
        shader.uniforms.uPaint = uniforms.uPaint;
        shader.uniforms.uDaubOffset = uniforms.uDaubOffset;
        shader.uniforms.uDaubScale = uniforms.uDaubScale;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>',
            '#include <common>\nvarying vec2 vDaubUv;\nuniform vec2 uDaubOffset;\nuniform vec2 uDaubScale;')
          .replace('#include <uv_vertex>',
            '#include <uv_vertex>\nvDaubUv = (uv - uDaubOffset) * uDaubScale;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>',
            `#include <common>\nuniform sampler2D uPaint;\nvarying vec2 vDaubUv;${TO_LINEAR}`)
          .replace('#include <map_fragment>',
            `#include <map_fragment>
             {
               vec4 daubPaint = texture2D(uPaint, vDaubUv);
               if (daubPaint.a > 0.0019) {
                 // The layer holds premultiplied colour, so undo the multiply
                 // before mixing or partly-transparent paint reads as grey.
                 vec3 daubStraight = daubPaint.rgb / daubPaint.a;
                 diffuseColor.rgb = mix(diffuseColor.rgb, daubToLinear(daubStraight), daubPaint.a);
               }
             }`);
      };
      m.customProgramCacheKey = () => 'daub';
      m.needsUpdate = true;
    }

    mesh.userData.somaOriginalMaterial = mesh.material;
    mesh.material = material;
    return { rt, mask, uniformSets, size, offset, scale };
  }

  _renderMask(mesh: THREE.Mesh, target: THREE.WebGLRenderTarget, offset: THREE.Vector2, scale: THREE.Vector2) {
    this.maskMat.uniforms.uUvOffset.value.copy(offset);
    this.maskMat.uniforms.uUvScale.value.copy(scale);
    this.proxy.geometry = mesh.geometry;
    this.proxy.matrixWorld.copy(mesh.matrixWorld);
    this.proxy.material = this.maskMat;
    const prev = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.proxy, FLAT_CAM);
    this.renderer.autoClear = prevAutoClear;
    this.renderer.setRenderTarget(prev);
    this.proxy.material = this.brush;
    this.proxy.geometry = undefined as any;
  }

  _wipe(rt: THREE.WebGLRenderTarget) {
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear(true, false, false);
    this.renderer.setRenderTarget(prev);
  }

  /** Lay one stroke segment onto every prepared mesh the brush sphere touches. */
  stroke(meshes: THREE.Mesh[], a: THREE.Vector3, b: THREE.Vector3,
         { color, radius, softness, flow, erase, eye }: StrokeOptions) {
    const u = this.brush.uniforms;
    u.uA.value.copy(a);
    u.uB.value.copy(b);
    u.uEye.value.copy(eye);
    // THREE.Color holds linear-sRGB working values, but the paint layer stores
    // sRGB bytes (better 8-bit distribution, and the composite converts back).
    // Uploading the linear value here double-converted every stroke and made
    // soft edges read as grey.
    u.uColor.value.copy(color).convertLinearToSRGB();
    u.uRadius.value = radius;
    u.uSoft.value = softness;
    u.uFlow.value = flow;

    // Erasing multiplies the destination down by (1 - src alpha), which removes
    // paint and lets the mesh's original texture show through again.
    this.brush.blendSrc = erase ? THREE.ZeroFactor : THREE.SrcAlphaFactor;
    this.brush.blendSrcAlpha = erase ? THREE.ZeroFactor : THREE.OneFactor;
    // No needsUpdate here: blend factors are render state, not shader source.
    // Setting it recompiled the brush program on every stroke.

    const prevTarget = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;

    let painted = 0;
    for (const mesh of meshes) {
      const layer = this.layers.get(mesh);
      if (!layer) continue;
      this._captureForUndo(mesh, layer);

      u.uUvOffset.value.copy(layer.offset);
      u.uUvScale.value.copy(layer.scale);
      this.proxy.geometry = mesh.geometry;
      this.proxy.matrixWorld.copy(mesh.matrixWorld);
      this.renderer.setRenderTarget(layer.rt);
      this.renderer.render(this.proxy, FLAT_CAM);
      layer.dirty = true;
      painted++;
    }

    this.renderer.autoClear = prevAutoClear;
    this.renderer.setRenderTarget(prevTarget);
    this.proxy.geometry = undefined as any;
    return painted;
  }

  /**
   * Snapshot a layer before the stroke touches it. This copies target-to-target
   * on the GPU rather than reading the pixels back to JS: readRenderTargetPixels
   * has to flush the whole pipeline and measured ~21ms per 512px mesh, which is
   * a stall you feel at the start of every single stroke.
   */
  _captureForUndo(mesh: THREE.Mesh, layer: Layer) {
    if (this.strokeBefore.has(mesh)) return;
    const idx = this.pool.findIndex(rt => rt.width === layer.size);
    const snap = idx >= 0 ? this.pool.splice(idx, 1)[0] : newTarget(layer.size);
    this._copy(layer.rt.texture, snap);
    this.strokeBefore.set(mesh, snap);
    this.snapshotBytes += layer.size * layer.size * 4;
  }

  _recycle(snap: THREE.WebGLRenderTarget) {
    this.snapshotBytes -= snap.width * snap.height * 4;
    this.pool.push(snap);
  }

  _dropOldestHistory() {
    const entry = this.history.shift();
    if (entry) for (const snap of entry.values()) this._recycle(snap);
  }

  /** Pad UV islands on everything touched, then bank the stroke for undo. */
  endStroke() {
    for (const [mesh, layer] of this.layers) {
      if (layer.dirty) { this._dilate(layer); layer.dirty = false; }
    }
    if (this.strokeBefore.size) {
      this.history.push(this.strokeBefore);
      this.strokeBefore = new Map();
      // Snapshots are full textures, so history is bounded by bytes rather than
      // by a step count; one stroke over many meshes costs more than one step.
      while (this.history.length > 1 &&
             (this.history.length > this.historyLimit || this.snapshotBytes > this.snapshotBudget)) {
        this._dropOldestHistory();
      }
    }
  }

  _dilate(layer: Layer, passes = 4) {
    const prev = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;

    const pass = (material: THREE.ShaderMaterial, from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget) => {
      material.uniforms.tSrc.value = from.texture;
      this.quad.material = material;
      this.renderer.setRenderTarget(to);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, false, false);
      this.renderer.render(this.quad, FLAT_CAM);
    };

    this.resetPadMat.uniforms.tMask.value = layer.mask.texture;
    this.dilateMat.uniforms.tMask.value = layer.mask.texture;
    this.dilateMat.uniforms.uTexel.value.set(1 / layer.size, 1 / layer.size);

    // Strip last stroke's padding first, then rebuild it from what's actually
    // painted now. Each pair of passes bounces through one shared scratch buffer
    // and lands back in the layer's own target, so a mesh needs one target, not
    // two, and the material never has to be repointed.
    const scratch = this.scratch!;
    pass(this.resetPadMat, layer.rt, scratch);
    pass(this.dilateMat, scratch, layer.rt);
    for (let i = 0; i < passes; i++) {
      pass(this.dilateMat, layer.rt, scratch);
      pass(this.dilateMat, scratch, layer.rt);
    }

    this.renderer.autoClear = prevAutoClear;
    this.renderer.setRenderTarget(prev);
  }

  _copy(srcTexture: THREE.Texture, dstTarget: THREE.WebGLRenderTarget) {
    const prev = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.quad.material = this.copyMat;
    this.copyMat.uniforms.tSrc.value = srcTexture;
    this.renderer.setRenderTarget(dstTarget);
    this.renderer.render(this.quad, FLAT_CAM);
    this.renderer.autoClear = prevAutoClear;
    this.renderer.setRenderTarget(prev);
  }

  undo() {
    const entry = this.history.pop();
    if (!entry) return false;
    for (const [mesh, snap] of entry) {
      const layer = this.layers.get(mesh);
      if (layer) this._copy(snap.texture, layer.rt);
      this._recycle(snap);
    }
    return true;
  }

  /**
   * Release every paint layer and hand each mesh its original material back.
   * Blanking the pixels but keeping the allocations would mean that once the
   * layer budget filled up, clearing could never free it again and the brush
   * would silently stop working on untouched meshes.
   */
  clear() {
    for (const [mesh, layer] of this.layers) {
      layer.rt.dispose();
      layer.mask.dispose();
      if (mesh.userData.somaOriginalMaterial) {
        mesh.material = mesh.userData.somaOriginalMaterial;
        delete mesh.userData.somaOriginalMaterial;
      }
    }
    this.layers.clear();
    this.claimedGeometries.clear();
    while (this.history.length) this._dropOldestHistory();
    for (const snap of this.strokeBefore.values()) this._recycle(snap);
    this.strokeBefore.clear();
    for (const rt of this.pool) rt.dispose();
    this.pool.length = 0;
    this.snapshotBytes = 0;
  }

  /** How many layers fit in the VRAM budget at the current texture size. */
  get maxLayers() {
    const bytesEach = this.resolution * this.resolution * 5; // rgba paint + r8 mask
    return Math.max(8, Math.min(128, Math.floor(256 * 1024 * 1024 / bytesEach)));
  }

  canUndo() { return this.history.length > 0; }

  /** Rebuild every layer at a new texture size. Discards paint and history. */
  setResolution(size: number) {
    if (size === this.resolution) return;
    const meshes = [...this.layers.keys()];
    this.clear();
    this.resolution = size;
    this.scratch?.dispose();
    this.scratch = null;
    for (const mesh of meshes.slice(0, this.maxLayers)) {
      this.claimedGeometries.add(mesh.geometry);
      this.layers.set(mesh, this._createLayer(mesh));
    }
  }

  dispose() {
    this.clear();
    this.scratch?.dispose();
    this.scratch = null;
  }
}
