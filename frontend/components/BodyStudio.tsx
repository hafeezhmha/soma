'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PaintSystem } from '@/lib/paint/painter';
import './body-studio.css';

export type StudioResult = { region: string; color: string };
/** How much has been drawn on each region so far, and in what colour. */
export type StudioRegions = Record<string, { weight: number; color: string }>;

type BodyStudioProps = {
  /** Colour the sensation is being drawn in. */
  color?: string;
  /** Region to focus when opening, if a mark already exists. */
  focusRegion?: string;
  onClose: () => void;
  onDone: (result: StudioResult | null) => void;
  /** Fires as the drawing changes, so the 2D body map keeps up with it live. */
  onRegionsChange?: (regions: StudioRegions) => void;
};

const FIGURES = [
  { id: 'feminine', label: 'Woman', src: '/models/body-feminine.glb' },
  { id: 'masculine', label: 'Man', src: '/models/body-masculine.glb' },
] as const;

const SENSATION_COLORS = [
  { hex: '#c4623f', name: 'Warm' },
  { hex: '#c9a227', name: 'Buzzing' },
  { hex: '#6f9668', name: 'Settled' },
  { hex: '#4a7fa5', name: 'Cool' },
  { hex: '#7b6aa3', name: 'Heavy' },
  { hex: '#a34f6d', name: 'Tight' },
];

export default function BodyStudio({ color = '#c4623f', focusRegion, onClose, onDone, onRegionsChange }: BodyStudioProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const engine = useRef<any>(null);
  const [figure, setFigure] = useState<(typeof FIGURES)[number]['id']>('feminine');
  const [brushColor, setBrushColor] = useState(color);
  const [size, setSize] = useState(9);
  const [erase, setErase] = useState(false);
  const [ready, setReady] = useState(false);
  const [touched, setTouched] = useState<StudioRegions>({});

  // Latest control values, read inside the pointer handlers without re-binding them.
  const settings = useRef({ brushColor, size, erase });
  settings.current = { brushColor, size, erase };

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    // The canvas is created per mount rather than held in JSX. React Strict Mode
    // runs effects twice in development, and two WebGLRenderers over one canvas
    // element share a single WebGL context — so the first teardown frees GPU
    // resources the second renderer is still drawing with, and the body arrives
    // covered in whatever was left in video memory.
    const canvas = document.createElement('canvas');
    canvas.className = 'studio-canvas';
    holder.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f6f4ef');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.1;
    controls.maxDistance = 6;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 4, 3);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.5));

    const painter = new PaintSystem(renderer);
    painter.resolution = 512;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.55, depthTest: false, side: THREE.DoubleSide }),
    );
    cursor.renderOrder = 999;
    cursor.visible = false;
    scene.add(cursor);

    const state = {
      root: null as THREE.Object3D | null,
      meshes: [] as THREE.Mesh[],
      radius: 1,
      painting: false,
      last: null as THREE.Vector3 | null,
      pending: [] as THREE.Vector3[],
      finishAfterFlush: false,
      altOrbit: false,
      disposed: false,
      // The tap that opens the studio finishes over the canvas, which mounts
      // underneath the pointer mid-gesture. Without this the opening tap slides
      // straight into a stroke and the body arrives already painted on.
      openedAt: performance.now(),
    };

    const regionOf = (mesh: THREE.Object3D): string =>
      (mesh.userData?.region as string) || (mesh.parent?.userData?.region as string) || '';

    const brushRadius = () => state.radius * (settings.current.size / 100);

    const pick = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(state.meshes, false);
      return hits.length ? hits[0] : null;
    };

    const preparing = new Set<THREE.Mesh>();
    const prepare = (mesh: THREE.Mesh) => {
      if (painter.isReady(mesh) || preparing.has(mesh)) return;
      preparing.add(mesh);
      painter.ensure(mesh).then(flushPending).catch((err) => console.warn('paint layer failed', err))
        .finally(() => preparing.delete(mesh));
    };

    const nearby = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      const out: THREE.Mesh[] = [];
      const probe = new THREE.Vector3();
      for (const mesh of state.meshes) {
        if (!painter.isReady(mesh)) continue;
        const box = mesh.userData.somaBox as THREE.Box3;
        let best = Infinity;
        for (let i = 0; i <= 5; i++) {
          probe.lerpVectors(a, b, i / 5);
          best = Math.min(best, box.distanceToPoint(probe));
          if (best === 0) break;
        }
        if (best <= radius) out.push(mesh);
      }
      return out;
    };

    function paintAt(point: THREE.Vector3, hit: THREE.Mesh | null) {
      if (hit && !painter.isReady(hit)) {
        prepare(hit);
        state.pending.push(point.clone());
        return;
      }
      const radius = brushRadius();
      const from = state.last || point;
      const targets = nearby(from, point, radius);
      painter.stroke(targets, from, point, {
        color: new THREE.Color(settings.current.brushColor),
        radius,
        softness: 0.55,
        flow: 0.8,
        erase: settings.current.erase,
        eye: camera.position,
      });
      for (const mesh of targets) {
        const region = regionOf(mesh);
        if (!region) continue;
        const paint = settings.current;
        setTouched((current) => {
          if (paint.erase) {
            const weight = (current[region]?.weight ?? 0) - 1;
            if (weight > 0) return { ...current, [region]: { ...current[region], weight } };
            const { [region]: _removed, ...rest } = current;
            return rest;
          }
          return { ...current, [region]: { weight: (current[region]?.weight ?? 0) + 1, color: paint.brushColor } };
        });
      }
      state.last = point.clone();
    }

    function flushPending() {
      if (state.pending.length) {
        const points = state.pending;
        state.pending = [];
        for (const p of points) paintAt(p, null);
      }
      if (state.finishAfterFlush) {
        state.finishAfterFlush = false;
        state.last = null;
        painter.endStroke();
      }
    }

    const onMove = (event: PointerEvent) => {
      if (!state.root) return;
      const hit = pick(event);
      if (!state.painting) {
        controls.enableRotate = state.altOrbit || !hit;
        if (hit) prepare(hit.object as THREE.Mesh);
      }
      if (hit) {
        const r = brushRadius();
        cursor.visible = true;
        cursor.position.copy(hit.point);
        const n = hit.face
          ? hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
          : new THREE.Vector3(0, 0, 1);
        cursor.lookAt(hit.point.clone().add(n));
        cursor.position.addScaledVector(n, r * 0.03);
        cursor.scale.setScalar(r);
      } else {
        cursor.visible = false;
      }
      if (state.painting) {
        if (hit) paintAt(hit.point, hit.object as THREE.Mesh);
        else state.last = null;
      }
    };

    // Registered in the capture phase (see addEventListener below). OrbitControls
    // listens on this same canvas in the bubble phase and decides whether to
    // start rotating by reading controls.enableRotate at pointerdown — so this
    // has to run first and settle that flag. Leaving it to the hover handler
    // meant a press with no preceding move turned the body instead of drawing.
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !state.root) return;
      const hit = pick(event);
      controls.enableRotate = state.altOrbit || !hit;
      if (!hit || state.altOrbit) return;
      // The tap that opened the studio can finish over the canvas, which mounts
      // under the pointer mid-gesture; don't let it slide into a stroke.
      if (performance.now() - state.openedAt < 400) return;
      state.painting = true;
      state.last = null;
      canvas.setPointerCapture(event.pointerId);
      paintAt(hit.point, hit.object as THREE.Mesh);
    };

    const onUp = () => {
      if (!state.painting) return;
      state.painting = false;
      if (state.pending.length) { state.finishAfterFlush = true; return; }
      state.last = null;
      painter.endStroke();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Alt') { state.altOrbit = true; controls.enableRotate = true; }
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === 'Alt') state.altOrbit = false; };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', () => { cursor.visible = false; });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    const loader = new GLTFLoader();
    const load = (src: string, focus?: string) => {
      loader.load(src, (gltf) => {
        if (state.disposed) return;
        if (state.root) { painter.dispose(); scene.remove(state.root); }
        const root = gltf.scene;
        state.root = root;
        scene.add(root);
        root.updateWorldMatrix(true, true);

        const meshes: THREE.Mesh[] = [];
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.computeBoundingBox();
          mesh.userData.somaBox = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
          meshes.push(mesh);
        });
        state.meshes = meshes;

        const box = new THREE.Box3().setFromObject(root);
        const sphere = box.getBoundingSphere(new THREE.Sphere());
        state.radius = sphere.radius || 1;
        camera.near = state.radius / 100;
        camera.far = state.radius * 20;
        camera.position.set(0, sphere.center.y + state.radius * 0.12, state.radius * 2.5);
        camera.updateProjectionMatrix();
        controls.target.set(0, sphere.center.y, 0);

        // If a mark already exists, look at that part of the body first.
        const target = focus && meshes.find((m) => regionOf(m) === focus);
        if (target) {
          const c = (target.userData.somaBox as THREE.Box3).getCenter(new THREE.Vector3());
          controls.target.copy(c);
          camera.position.set(0, c.y + state.radius * 0.05, state.radius * 1.5);
        }
        controls.update();
        setReady(true);
      });
    };

    engine.current = {
      painter,
      state,
      scene,
      load,
      clear: () => { painter.clear(); setTouched({}); },
      undo: () => painter.undo(),
      dispose: () => {
        state.disposed = true;
        renderer.setAnimationLoop(null);
        observer.disconnect();
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerdown', onDown, true);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKeyUp);
        painter.dispose();
        pmrem.dispose();
        controls.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      },
    };
    if (process.env.NODE_ENV !== 'production') (window as any).__soma = engine.current;
    load(FIGURES.find((f) => f.id === 'feminine')!.src, focusRegion);

    return () => engine.current?.dispose();
    // The scene is built once; figure swaps go through engine.current.load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchFigure = useCallback((id: (typeof FIGURES)[number]['id']) => {
    setFigure(id);
    setTouched({});
    setReady(false);
    engine.current?.load(FIGURES.find((f) => f.id === id)!.src, focusRegion);
  }, [focusRegion]);

  const drawnRegions = Object.keys(touched);
  const dominant = Object.entries(touched).sort((a, b) => b[1].weight - a[1].weight)[0]?.[0] ?? '';

  useEffect(() => { onRegionsChange?.(touched); }, [touched, onRegionsChange]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return (
    <div className="studio" role="dialog" aria-modal="true" aria-label="Body studio">
      <header className="studio-bar">
        <div>
          <p className="eyebrow">Body studio</p>
          <h2>Draw the sensation <em>where you feel it.</em></h2>
        </div>
        <button className="studio-close" onClick={onClose} aria-label="Close body studio">Close</button>
      </header>

      <div className="studio-stage">
        <div ref={holderRef} className="studio-canvas-holder" />
        {!ready && <p className="studio-loading">Preparing the body…</p>}
        <p className="studio-hint">Drag on the body to draw · drag beside it to turn</p>
      </div>

      <div className="studio-tools">
        <div className="studio-group" role="group" aria-label="Body">
          {FIGURES.map((f) => (
            <button key={f.id} className={`studio-chip ${figure === f.id ? 'is-on' : ''}`}
              aria-pressed={figure === f.id} onClick={() => switchFigure(f.id)}>{f.label}</button>
          ))}
        </div>

        <div className="studio-group" role="group" aria-label="Sensation colour">
          {SENSATION_COLORS.map((c) => (
            <button key={c.hex} className={`studio-swatch ${brushColor === c.hex && !erase ? 'is-on' : ''}`}
              style={{ background: c.hex }} title={c.name} aria-label={c.name}
              aria-pressed={brushColor === c.hex && !erase}
              onClick={() => { setBrushColor(c.hex); setErase(false); }} />
          ))}
        </div>

        <label className="studio-size">
          <span>Size</span>
          <input type="range" min={3} max={22} step={0.5} value={size}
            onChange={(e) => setSize(Number(e.target.value))} aria-label="Brush size" />
        </label>

        <div className="studio-group">
          <button className={`studio-chip ${erase ? 'is-on' : ''}`} aria-pressed={erase}
            onClick={() => setErase((v) => !v)}>Erase</button>
          <button className="studio-chip" onClick={() => engine.current?.undo()}>Undo</button>
          <button className="studio-chip" onClick={() => engine.current?.clear()}>Clear</button>
        </div>
      </div>

      <footer className="studio-foot">
        <p className="caption">
          {drawnRegions.length
            ? 'Your body map is following along. Close when it looks right.'
            : 'Nothing drawn yet. Anything you draw stays on this device.'}
        </p>
        <div className="studio-actions">
          <button className="button button-primary"
            onClick={() => onDone(dominant ? { region: dominant, color: brushColor } : null)}>
            Done
          </button>
        </div>
      </footer>
    </div>
  );
}
