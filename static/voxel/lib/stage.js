// Stage: renderer + camera + lights + post + loop for one voxel piece.
//
//   const stage = new Stage({ look: 'daylight', camera: { yaw: 45, pitch: 30 }, ui: { title: 'Cottage' } });
//   const model = stage.add(grid, { bake: { ao: true, light: true } });
//   stage.particles({ preset: 'fireflies', box: [[-20, 2, -20], [20, 18, 20]] });
//   stage.onUpdate((t, dt) => { windmill.rotation.z = t; });
//   stage.start();
//
// URL params (handy while iterating): ?look=neon ?yaw=30 ?pitch=20 ?zoom=1.3 ?t=4 (freeze time)
//   ?debug (live tweak panel + stats) ?shot (no UI, deterministic; used by voxel/tools/shot.mjs) ?dpr=1
//   ?nocache (redraw everything every frame) ?bench (log frame costs, see bench())
//
// Rendering is incremental (cache.js): frames where nothing changed cost nothing, small changes redraw
// only their screen rectangles, flickering lights are composited layers, and the loop sleeps entirely when
// nothing can animate. Changed something the stage can't see (your own uniform/material)? stage.invalidate().
import * as THREE from './three.js';
import { buildMesh, geometryFromArrays } from './mesher.js';
import { clusterChunks, clusterInputs } from './cluster.js';
import { chunkKey, VoxelGrid } from './grid.js';
import { getPool } from './pool.js';
import { Palette } from './palette.js';
import { runRegion, runAssets, mergeInto, loadPaletteDefs } from './world.js';
import { combineHooks } from './registry.js';
import { createVoxelUniforms, createVoxelMaterial, createVoxelDepthMaterial } from './material.js';
import { Post } from './post.js';
import { SunShadows } from './shadows.js';
import { RenderCache, PARTICLE_LAYER, GRAD_STEP } from './cache.js';
import { faceMask, setFaceGroups } from './cull.js';
import { IblTable } from './ibl.js';
import { resolveLook, merge } from './looks.js';
import { rgb, srgbToLinear } from './color.js';
import { Particles } from './particles.js';
import { Actors } from './actors.js';
import './gen/creatures.js'; // registers the built-in creatures
import { createUI } from './ui.js';

const DEG = Math.PI / 180;
const stableKey = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

patchShadowChunk();

export class Stage {
  constructor(opts = {}) {
    this.opts = opts;
    this.shot = params.has('shot');
    this.debug = params.has('debug');
    window.VOXEL = Object.assign(window.VOXEL || {}, { stage: this, ready: false });
    window.addEventListener('error', (e) => { window.VOXEL.error = e.message || String(e); });
    window.addEventListener('unhandledrejection', (e) => { window.VOXEL.error = String(e.reason?.stack || e.reason); });

    // container + renderer
    let el = opts.container ?? document.getElementById('app');
    if (!el) { el = document.createElement('div'); el.id = 'app'; document.body.appendChild(el); }
    if (el === document.body || getComputedStyle(el).position === 'static') Object.assign(el.style, { position: 'fixed', inset: '0' });
    this.el = el;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    el.appendChild(this.renderer.domElement);
    // voxel meshes drop their JS arrays once uploaded (releaseArrays): after a lost context, re-mesh from the grids
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      for (const m of this.models) if (m.grid) this._mesh(m);
      this.shadows.dispose(); this.invalidate();
    });
    const coarse = window.matchMedia?.('(pointer: coarse)').matches; // phones/tablets: cap a bit lower
    this.maxDpr = Number(params.get('dpr')) || opts.pixelRatio || Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    this.dpr = this.maxDpr;

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = false; // once per frame in _render, not once per render call (shadow, layers, rects…)
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = [];
    this.updaters = [];
    this.particleSystems = [];
    this.actorSystems = [];
    this.time = 0;
    this.fixedTime = params.has('t') ? Number(params.get('t')) : this.shot ? opts.shotTime ?? 0 : null;
    // 2 MSAA samples are plenty on hi-dpi screens (the pixels are already tiny), 4 on 1x screens
    this.post = new Post(this.renderer, { samples: opts.msaa ?? (this.maxDpr >= 2 ? 2 : 4) });
    // frame pacing: never faster than fps.max (a 120 Hz screen would otherwise render twice as often), and
    // fps.idle once nobody has touched the camera for fps.idleAfter seconds — ambient animation (flicker,
    // tails, particles) looks the same at 30 fps and the laptop stays cool. ?fps=N forces a rate.
    this.fps = { max: 60, idle: 30, idleAfter: 3, ...(opts.fps ?? {}) };
    if (params.has('fps')) this.fps.max = this.fps.idle = Number(params.get('fps'));

    // shared voxel uniforms (a model gets its own copy of uMat, the palette texture)
    this.uniforms = createVoxelUniforms({ texture: () => null });
    this.shadows = new SunShadows(this);
    this.ibl = new IblTable(this.renderer);
    this.renderCache = new RenderCache(this);
    this.cache = opts.cache !== false && !params.has('nocache');
    this._sceneDirty = true;
    this._reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

    // camera
    const cam = (this.camOpts = merge({ type: 'ortho', fov: 28, yaw: 45, pitch: 32, zoom: 1, margin: 1.06, fit: 'view', target: null, controls: true, autoRotate: 0, idleRotate: 0, minPitch: 4, maxPitch: 88, minZoom: 0.6, maxZoom: 5, pan: false, damping: 0.08, offset: [0, 0] }, opts.camera ?? {}));
    if (params.has('yaw')) cam.yaw = Number(params.get('yaw'));
    if (params.has('pitch')) cam.pitch = Number(params.get('pitch'));
    if (params.has('zoom')) cam.zoom *= Number(params.get('zoom'));
    if (params.has('target')) cam.target = params.get('target').split(',').map(Number); // ?target=x,y,z&zoom=4 → close-up
    this.camera = cam.type === 'persp' ? new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 5000) : new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: !this.shot, dampingFactor: cam.damping, enablePan: cam.pan, enabled: cam.controls && !this.shot,
      minPolarAngle: (90 - cam.maxPitch) * DEG, maxPolarAngle: (90 - cam.minPitch) * DEG, rotateSpeed: 0.6, zoomSpeed: 0.9,
    });
    this.controls.addEventListener('start', () => { this._interacted = performance.now(); this.ui?.interacted(); this.wake(); });
    this.controls.addEventListener('change', () => { this._active = performance.now(); });
    this.controls.addEventListener('change', () => { this._dirty = true; this.wake(); });

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0xffffff, 0);
    this.scene.add(this.fill, this.fill.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0);
    this.scene.add(this.ambient);
    for (const l of [this.sun, this.fill, this.ambient]) l.layers.enable(PARTICLE_LAYER); // lit particles
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    // ground (shadow catcher + contact shadow)
    this.ground = makeGround();
    this.scene.add(this.ground);

    this.bounds = new THREE.Box3();
    this.look = null;
    // ?look=name layers a preset on top; ?lookjson={...} layers raw overrides (handy for A/B shots)
    const extra = [params.get('look'), params.get('lookjson') && JSON.parse(params.get('lookjson'))].filter(Boolean);
    this.setLook(extra.length ? [...(Array.isArray(opts.look) ? opts.look : [opts.look]), ...extra] : opts.look);

    this.ui = createUI(this, opts.ui ?? {});
    this._resize = () => this.resize();
    window.addEventListener('resize', this._resize);
    this.resize();
  }

  // ---- content -------------------------------------------------------------------------------

  /**
   * Mesh a VoxelGrid and add it. Returns a THREE.Group (move/rotate/animate it freely).
   * opts: palette, position [x,y,z], rotation (deg around Y) | [x,y,z] deg, scale,
   *       center (false) — by default grid coords ARE world coords (particles boxes, lights, picks all line up).
   *               'bottom' | 'center' moves the group origin to the grid's bottom-center / center (handy for turntables);
   *       pivot [x,y,z] (grid coords) — group origin at this voxel (rotate a windmill blade around its hub),
   *       instances [[x, y, z, rotYdeg?, scale?] | { position, rotation, scale }] — draw many copies in one call,
   *       bake { ao: true | { radius, rays }, light: true }, ao (vertex AO, true), greedy (true),
   *       cluster (4): mesh as columns of N×N chunks (frustum-culled, rebuilt independently); 0 = one mesh,
   *       hooks (custom GLSL, see material.js), shading ('cel' | ['cel', 'rim'] — registered hook bundles),
   *       shadow (cast, true), receive (true), fit (include in camera fit, true),
   *       contact (contribute to ground contact shadow, true), keepGrid (true; false frees voxel memory after meshing), name
   */
  add(grid, opts = {}) {
    const model = this._newModel(grid, opts);
    this._mesh(model);
    return this._attach(model);
  }

  /**
   * Like add() but meshes clusters in parallel Web Workers (keeps the page responsive; much faster for big
   * grids). Resolves to the group. opts as add() plus workers (0 = main thread), onProgress(fraction).
   */
  async addAsync(grid, opts = {}) {
    const model = this._newModel(grid, opts);
    const pool = opts.workers === 0 ? null : getPool(opts.workers);
    if (pool) await this._meshParallel(model, pool, opts.onProgress);
    else this._mesh(model);
    return this._attach(model);
  }

  /**
   * Build a big scene from region modules in parallel workers, then mesh it in parallel. See world.js for the
   * region/palette/assets module contracts. spec:
   *   palette: './palette.js' (module URL, default export = defs) | defs object | Palette
   *   regions: [{ module: './regions/a.js', name, box: [[x0,y0,z0],[x1,y1,z1]], seed, options }]
   *   assets: './assets.js'  (instanced models referenced by ctx.instance(name, ...))
   *   bake ({ ao: true, light: true }), cluster (4), workers ('auto' | n | 0), keepGrid (true), model: {...add() opts}
   *   assetBake ({ ao: true }), onExtra(extra) for custom ctx.emit kinds
   * Built-in ctx.emit kinds: 'particles' (stage.particles opts), 'light' (stage.light opts), 'actors'
   * (stage.actors opts; creature by name), 'prop' ({ asset, position, rotation, pivot, animate: { spin, bob,
   * sway } } — an animated copy of an asset: windmill blades, water wheels, a bobbing boat).
   * ?region=a,b (URL) builds only those regions — test one region in isolation.
   * Resolves to { group, grid, palette, assets: { name: group }, extras, stats }.
   */
  async world(spec) {
    const t0 = performance.now();
    const abs = (u) => new URL(u, document.baseURI).href; // baseURI: pieces are also served from /v/<short>/ with <base href>
    const P = spec.palette instanceof Palette ? spec.palette
      : new Palette(typeof spec.palette === 'string' ? await loadPaletteDefs(abs(spec.palette)) : spec.palette ?? {});
    const only = (params.get('region') ?? spec.only ?? '').toString().split(',').filter(Boolean);
    const regions = spec.regions
      .map((r) => ({ ...r, module: abs(r.module), name: r.name ?? r.module.split('/').pop().replace(/\.js$/, '') }))
      .filter((r) => !only.length || only.includes(r.name));
    if (!regions.length) throw new Error(`stage.world: no regions${only.length ? ` match ?region=${only}` : ''}`);
    const pool = spec.workers === 0 ? null : getPool(spec.workers === 'auto' ? undefined : spec.workers);
    const list = P.serialize();
    let done = 0;
    const step = (label, f) => this.progress(label, f);
    await step(`Building ${regions.length} regions`, 0.05);
    const results = await Promise.all(regions.map((r) => (pool ? pool.run({ type: 'region', region: r, palette: list }) : runRegion(r, list))
      .then(async (res) => { await step(`Built ${res.name}`, 0.05 + 0.45 * (++done / regions.length)); return res; })));
    const grid = new VoxelGrid(P);
    const extras = [], instances = new Map(), timing = {};
    for (const res of results) {
      mergeInto(grid, P, res);
      extras.push(...res.extras);
      timing[res.name] = res.ms;
      if (res.dropped) console.warn(`voxel: region "${res.name}" wrote ${res.dropped} voxels outside its box (dropped)`);
      for (const [asset, ...it] of res.instances) { if (!instances.has(asset)) instances.set(asset, []); instances.get(asset).push(it); }
    }
    const tGen = performance.now() - t0;
    await step('Meshing', 0.55);
    // actors need the voxels (terrain height field): free the grid only after they're placed
    const free = (spec.model?.keepGrid ?? spec.keepGrid) === false;
    const group = await this.addAsync(grid, {
      bake: spec.bake ?? { ao: true, light: true }, cluster: spec.cluster, workers: pool ? undefined : 0,
      ...(spec.model ?? {}), keepGrid: true, palette: P,
      onProgress: (f) => step('Meshing', 0.55 + 0.35 * f),
    });
    // instanced assets (+ animated props, which are separate copies of an asset)
    const assets = {}, assetGrids = {};
    const props = extras.filter((e) => e.kind === 'prop');
    const names = [...new Set([...instances.keys(), ...props.map((e) => e.data.asset)])];
    if (names.length) {
      if (!spec.assets) throw new Error('regions used ctx.instance() / prop but stage.world() got no `assets` module');
      await step('Assets', 0.92);
      const built = pool ? await pool.run({ type: 'assets', url: abs(spec.assets), names, palette: P.serialize() }) : await runAssets(abs(spec.assets), names, P.serialize());
      for (const name of names) {
        const ag = (assetGrids[name] = new VoxelGrid(P));
        mergeInto(ag, P, built[name]);
        if (instances.has(name)) assets[name] = await this.addAsync(ag, { bake: spec.assetBake ?? { ao: true }, palette: P, name, workers: pool ? undefined : 0, instances: instances.get(name), cluster: 0 });
      }
    }
    // extras: particles, lights, actors, props, custom. Actors that differ only in area/path/center/radius/
    // count/seed (e.g. walkers emitted by every district) merge into one system: one draw call per variant.
    const merged = new Map();
    for (const e of extras) {
      if (e.kind !== 'actors' || !(e.data.area || e.data.path || e.data.center)) continue;
      const { area, path, center, radius, count, seed, ...rest } = e.data;
      const key = stableKey(rest); // key order doesn't matter
      if (!merged.has(key)) { merged.set(key, { ...rest, seed, groups: [] }); e.merged = merged.get(key); }
      else e.skip = true;
      merged.get(key).groups.push({ area, path, center, radius, count: count ?? 1 });
    }
    for (const e of extras) {
      if (e.skip) continue;
      const d = e.data;
      if (e.kind === 'particles') this.particles(d);
      else if (e.kind === 'light') this.light(d);
      else if (e.kind === 'actors') this.actors({ ...(e.merged ?? d), ground: d.ground ?? 'auto' });
      else if (e.kind === 'prop') {
        const g = this.add(assetGrids[d.asset], { palette: P, name: d.asset, bake: spec.assetBake ?? { ao: true }, cluster: 0, position: d.position, rotation: d.rotation, pivot: d.pivot, fit: false });
        if (d.animate) this.animate(g, d.animate);
      } else spec.onExtra?.(e);
    }
    if (free) { const m = group.userData.model; this._fitGroundFor(m); m.grid = null; }
    const stats = { regions: regions.length, generateMs: Math.round(tGen), totalMs: Math.round(performance.now() - t0), workers: pool?.size ?? 0, perRegionMs: timing, ...group.userData.model.stats };
    console.log('voxel world', JSON.stringify(stats));
    return { group, grid: group.userData.model.grid, palette: P, assets, extras, stats };
  }

  _newModel(grid, opts) {
    const palette = opts.palette ?? grid.palette;
    if (!palette) throw new Error('stage.add: grid has no palette (new VoxelGrid(palette) or opts.palette)');
    if (!grid.palette) grid.palette = palette;
    const group = new THREE.Group();
    group.name = opts.name ?? 'voxels';
    const inner = new THREE.Group();
    group.add(inner);
    const model = { group, inner, grid, palette, opts, meshes: [], uniforms: { ...this.uniforms, uMat: { value: palette.texture() }, ...this.ibl.uniformsFor(palette) } };
    group.userData.model = model;
    return model;
  }

  _attach(model) {
    const { group, opts } = model;
    if (opts.position) group.position.set(...opts.position);
    if (opts.rotation != null) Array.isArray(opts.rotation) ? group.rotation.set(...opts.rotation.map((d) => d * DEG)) : (group.rotation.y = opts.rotation * DEG);
    if (opts.scale != null) Array.isArray(opts.scale) ? group.scale.set(...opts.scale) : group.scale.setScalar(opts.scale);
    this.root.add(group);
    this.models.push(model);
    this._layoutDirty = true;
    this.invalidate();
    this.shadows?.invalidate();
    if (opts.keepGrid === false) { this._fitGroundFor(model); model.grid = null; }
    return group;
  }

  _meshOpts(model) { const o = model.opts; return { bake: o.bake, ao: o.ao, greedy: o.greedy }; }

  _clusters(model) {
    const size = model.opts.cluster ?? 4;
    const all = [...model.grid.chunks.values()];
    if (!size) return [{ chunks: all, min: null, max: null, whole: true }];
    const cl = clusterChunks(model.grid, size);
    if (cl.length <= 1) return [{ chunks: all, min: null, max: null, whole: true }];
    return cl;
  }

  _mesh(model) {
    const t0 = performance.now();
    const results = this._clusters(model).map((cl) => buildMesh(model.grid, model.palette, { ...this._meshOpts(model), chunks: cl.chunks, bounds: cl.whole ? undefined : { min: cl.min, max: cl.max } }));
    this._buildMeshes(model, results, t0);
  }

  async _meshParallel(model, pool, onProgress) {
    const t0 = performance.now();
    const { grid, palette } = model;
    const list = palette.serialize();
    const clusters = this._clusters(model);
    let done = 0;
    const results = await Promise.all(clusters.map((cl) => {
      const inputs = cl.whole ? cl.chunks : clusterInputs(grid, cl, 1);
      return pool.run({
        type: 'mesh', palette: list, opts: this._meshOpts(model),
        chunks: inputs.map((c) => ({ cx: c.cx, cy: c.cy, cz: c.cz, data: c.data })),
        emit: cl.chunks.map((c) => chunkKey(c.cx, c.cy, c.cz)),
        bounds: cl.whole ? undefined : { min: cl.min, max: cl.max },
      }).then((r) => { onProgress?.(++done / clusters.length); return r; });
    }));
    this._buildMeshes(model, results.map((r) => ({ ...r, solid: geometryFromArrays(r.solid), transparent: geometryFromArrays(r.transparent) })), t0);
  }

  _buildMeshes(model, results, t0) {
    const { grid, opts, inner, uniforms } = model;
    this._clearMeshes(model);
    const light = results.some((r) => r.solid?.attributes.aLight || r.transparent?.attributes.aLight);
    const hooks = combineHooks(opts.hooks, opts.shading);
    const b = grid.bounds();
    if (opts.pivot) inner.position.set(-opts.pivot[0], -opts.pivot[1], -opts.pivot[2]);
    else if (b && opts.center) {
      const c = opts.center;
      inner.position.set(-(b.min[0] + b.size[0] / 2), c === 'center' ? -(b.min[1] + b.size[1] / 2) : -b.min[1], -(b.min[2] + b.size[2] / 2));
    } else inner.position.set(0, 0, 0);
    const inst = opts.instances?.map(instanceMatrix);
    // one set of materials per model, shared by all of its cluster meshes
    const mats = {
      solid: createVoxelMaterial({ uniforms, light, hooks }),
      depth: createVoxelDepthMaterial({ uniforms, hooks }),
      distance: createVoxelDepthMaterial({ uniforms, hooks, distance: true }),
      transparent: results.some((r) => r.transparent) ? createVoxelMaterial({ uniforms, light, transparent: true, transmission: this.look.water.transmission, refraction: this.post.refr, hooks }) : null,
    };
    model.materials = mats;
    // the GPU has the geometry after its first draw; while the model keeps its grid (picking walks the
    // voxels, a lost GL context re-meshes from it) the JS copies of the vertex/index arrays can go
    for (const res of results) for (const geo of [res.solid, res.transparent]) if (geo) releaseArrays(geo, model);
    // [material]: three draws geometry.groups, which face culling (cull.js) points at the visible directions
    // instances are drawn in rotation classes (0/90/180/270° about Y): within a class every copy's faces
    // point the same way, so face culling works for instances too (cull.js). Any other rotation → 'free'.
    const classes = inst ? rotationClasses(inst) : null;
    const make = (geo, mat) => {
      if (!inst) { const m = new THREE.Mesh(geo, [mat]); m.userData.voxelModel = model; setFaceGroups(m); return [m]; }
      return classes.map((c, k) => {
        const m = new THREE.InstancedMesh(k ? shareGeometry(geo) : geo, [mat], c.index.length);
        m.userData.voxelModel = model;
        m.userData.instIndex = c.index;
        if (c.rot) m.userData.instRot = c.rot;
        setFaceGroups(m);
        c.index.forEach((j, i) => m.setMatrixAt(i, inst[j]));
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingBox(); m.computeBoundingSphere();
        return m;
      });
    };
    const cull = results.length > 1 || !!inst;
    const stats = { quads: 0, triangles: 0, bakeMs: 0, lights: 0, clusters: results.length };
    for (const r of results) {
      if (r.solid) for (const mesh of make(r.solid, mats.solid)) {
        mesh.customDepthMaterial = mats.depth;
        mesh.customDistanceMaterial = mats.distance;
        mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = opts.receive !== false;
        mesh.frustumCulled = cull;
        mesh.userData.kind = 'solid';
        inner.add(mesh);
        model.meshes.push(mesh);
      }
      if (r.transparent) for (const mesh of make(r.transparent, mats.transparent)) {
        mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = cull;
        mesh.renderOrder = 1;
        mesh.userData.kind = 'transparent';
        inner.add(mesh);
        model.meshes.push(mesh);
      }
      stats.quads += r.stats.quads; stats.triangles += r.stats.triangles; stats.bakeMs += r.stats.bakeMs; stats.lights = Math.max(stats.lights, r.stats.lights);
    }
    model.solid = model.meshes.find((m) => m.userData.kind === 'solid') ?? null;
    model.transparent = model.meshes.find((m) => m.userData.kind === 'transparent') ?? null;
    // vertex hooks may move geometry every frame: keep the model out of the static shadow cache
    model.moving = !!hooks?.vertex;
    // render cache: hooks that read uTime / custom uniforms can change any frame (redraw the model's bounds);
    // hooks that add light or rework the output make lighting non-linear (no light layers)
    const glsl = hooks ? ['vertex', 'vertexPars', 'color', 'emissive', 'fragment', 'fragmentPars', 'light', 'output'].map((k) => hooks[k] ?? '').join('\n') : '';
    model.timeHooks = /\buTime\b/.test(glsl) || Object.keys(hooks?.uniforms ?? {}).length > 0;
    model.nonLinear = !!(hooks?.light || hooks?.output || hooks?.emissive);
    model.group.userData.solid = model.solid;
    model.group.userData.transparent = model.transparent;
    model.instances = inst ?? null;
    model.stats = { ...stats, voxels: grid.count() * (inst?.length ?? 1), ms: Math.round(performance.now() - t0) };
  }

  _clearMeshes(model) {
    for (const c of [...model.inner.children]) { model.inner.remove(c); c.geometry?.dispose(); }
    if (model.materials) for (const m of Object.values(model.materials)) m?.dispose();
    model.meshes = [];
  }

  /** Re-mesh a model after editing its grid (or its opts, e.g. group.userData.model.opts.bake). */
  rebuild(group) {
    const m = group.userData.model;
    if (!m.grid) throw new Error('stage.rebuild: model was added with keepGrid: false');
    this._mesh(m);
    this._layoutDirty = true;
    this.invalidate();
    this.shadows?.invalidate();
    return group;
  }

  remove(group) {
    const m = group.userData.model;
    this.models = this.models.filter((x) => x !== m);
    group.removeFromParent();
    this.invalidate();
    if (m) this._clearMeshes(m);
    else group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this._layoutDirty = true;
    this.shadows?.invalidate();
  }

  /**
   * Voxel under a screen point (client px). Returns { model, group, voxel: [x,y,z] (grid coords), id, name,
   * normal: [x,y,z] (face, grid space), point (world THREE.Vector3), instance } or null.
   */
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    let best = null;
    // models with their grid: walk the voxels (the meshes drop their CPU-side arrays once on the GPU)
    for (const model of this.models) {
      if (!model.grid || !isShown(model.group)) continue;
      const base = model.inner.matrixWorld;
      (model.instances ?? [null]).forEach((im, instance) => {
        const inv = (im ? base.clone().multiply(im) : base.clone()).invert();
        const o = ray.ray.origin.clone().applyMatrix4(inv);
        const d = ray.ray.origin.clone().add(ray.ray.direction).applyMatrix4(inv).sub(o); // local units per world unit
        const hit = voxelRay(model.grid, o, d);
        if (hit && (!best || hit.t < best.t)) best = { ...hit, model, instance: im ? instance : null };
      });
    }
    // grid freed (keepGrid: false): raycast those meshes (they keep their arrays)
    const owner = new Map();
    for (const m of this.models) if (!m.grid) for (const mesh of m.meshes) owner.set(mesh, m);
    const hit = owner.size ? ray.intersectObjects([...owner.keys()], false)[0] : null;
    if (best && (!hit || best.t <= hit.distance)) {
      const { model, voxel, normal, t, instance } = best;
      const id = model.grid.get(...voxel);
      return { model, group: model.group, voxel, id, name: model.palette.defs[id]?.name ?? null, normal, point: ray.ray.at(t, new THREE.Vector3()), instance };
    }
    if (!hit) return null;
    const model = owner.get(hit.object);
    const M = hit.object.matrixWorld.clone();
    const instance = hit.instanceId == null ? null : hit.object.userData.instIndex?.[hit.instanceId] ?? hit.instanceId;
    if (instance != null) M.multiply(model.instances[instance]);
    const local = hit.point.clone().applyMatrix4(M.invert());
    const n = hit.face.normal;
    const voxel = [Math.floor(local.x - n.x * 0.5), Math.floor(local.y - n.y * 0.5), Math.floor(local.z - n.z * 0.5)];
    const info = hit.object.geometry.attributes.aInfo;
    const id = info.getX(hit.face.a) + info.getY(hit.face.a) * 256;
    return { model, group: model.group, voxel, id, name: model.palette.defs[id]?.name ?? null, normal: [n.x, n.y, n.z], point: hit.point, instance };
  }

  /** Add any THREE.Object3D (opts.fit: include in camera fit, default false). */
  addObject(obj, opts = {}) {
    this.root.add(obj);
    this.invalidate();
    if (opts.fit) { obj.userData.fit = true; this._layoutDirty = true; }
    return obj;
  }

  /** A real (dynamic) light: { type: 'point'|'spot', position, color, intensity, distance, decay, shadow }. */
  light(o = {}) {
    const color = new THREE.Color().setRGB(...srgbToLinear(o.color ?? '#ffd9a0'));
    const L = o.type === 'spot' ? new THREE.SpotLight(color, o.intensity ?? 20, o.distance ?? 30, (o.angle ?? 40) * DEG, o.penumbra ?? 0.6, o.decay ?? 1.6)
      : new THREE.PointLight(color, o.intensity ?? 20, o.distance ?? 30, o.decay ?? 1.6);
    if (o.position) L.position.set(...o.position);
    if (o.shadow) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.002; L.shadow.radius = 3; }
    if (o.target && L.target) { L.target.position.set(...o.target); this.root.add(L.target); }
    L.layers.enable(PARTICLE_LAYER);
    this.root.add(L);
    this.invalidate();
    return L;
  }

  /** Particle system (see particles.js). */
  particles(opts) {
    const p = new Particles(this, opts);
    this.particleSystems.push(p);
    // particles are drawn in their own layer over the cached scene (post.renderParticles)
    p.object.traverse((o) => o.layers.set(PARTICLE_LAYER));
    this.root.add(p.object);
    this.invalidate();
    return p;
  }

  /**
   * Animated creatures — cats, walkers, birds, ducks… (see actors.js for all options). Returns the Actors
   * system; its .agents ({ x, y, z, heading, speed }) are live, e.g. to attach a light to a walker.
   *   stage.actors({ creature: 'cat', count: 3 });   stage.actors({ creature: 'walker', behavior: 'path', path })
   */
  actors(opts) {
    const a = new Actors(this, opts);
    this.actorSystems.push(a);
    this.root.add(a.object);
    this.invalidate();
    return a;
  }

  /**
   * Procedural motion for any object (a group from add(), a light…): { spin: [x,y,z] rad/s, bob: voxels,
   * sway: radians, speed (1), phase }. stage.animate(blades, { spin: [0, 0, 0.8] }); stage.animate(boat, { bob: 0.2, sway: 0.04 })
   * (Under look.sun.update 'static' the shadow map won't follow; use sun.update: 2 or the object's shadow: false.)
   */
  animate(obj, a = {}) {
    const p0 = obj.position.clone(), r0 = obj.rotation.clone(), sp = a.speed ?? 1, ph = a.phase ?? 0, s = a.spin ?? [0, 0, 0];
    this.onUpdate((t) => {
      const T = t * sp + ph;
      obj.rotation.set(r0.x + s[0] * t * sp + (a.sway ? Math.sin(T * 0.9) * a.sway * 0.6 : 0), r0.y + s[1] * t * sp, r0.z + s[2] * t * sp + (a.sway ? Math.sin(T * 1.1 + 1) * a.sway : 0));
      if (a.bob) obj.position.y = p0.y + Math.sin(T * 1.3) * a.bob;
    });
    return obj;
  }

  _stepActors(t, dt) {
    const sys = this.actorSystems;
    if (!sys.length) return;
    if (this.fixedTime == null) { for (const a of sys) { a.step(dt, t); a.pose(t); } return; }
    // frozen clock (?t=, shots): replay from spawn in lockstep at 30 Hz, once — deterministic, and followers see their leaders move
    const todo = sys.filter((a) => a._simT !== this.fixedTime);
    if (!todo.length) return;
    const steps = Math.min(1800, Math.round(this.fixedTime * 30));
    for (let k = 0; k < steps; k++) for (const a of todo) a.step(1 / 30, k / 30);
    for (const a of todo) { a._simT = this.fixedTime; a.pose(this.fixedTime); }
  }

  /** Update the loader text/bar and yield a frame so it paints. `await` it between heavy build steps. */
  async progress(text, fraction) { await this.ui?.progress(text, fraction); }

  /** fn(t, dt) every frame (t = seconds since start, frozen with ?t=). */
  onUpdate(fn) { this.updaters.push(fn); this.wake(); return this; }

  /** Redraw everything next frame (after changing something the render cache can't see, e.g. a uniform). */
  invalidate() { this._sceneDirty = true; this.wake(); }

  // ---- look -----------------------------------------------------------------------------------

  setLook(spec) {
    this.lookSpec = spec;
    this.look = resolveLook(spec);
    this._applyLook();
  }
  /** Deep-merge a patch into the current look (live). */
  updateLook(patch) {
    this.look = merge(this.look, patch);
    this._applyLook();
  }

  _applyLook() {
    const L = this.look, u = this.uniforms;
    const v = L.voxel;
    u.uAO.value.set(v.ao, v.rayAO, v.aoDirect, v.aoGamma);
    u.uBevel.value.set(v.bevel, v.bevelStrength, v.edge, v.gridLine);
    u.uLook.value.set(v.emissive, v.bakedLight, v.jitter, v.saturation);
    u.uWind.value.set(L.wind.direction[0], L.wind.direction[1], L.wind.strength, L.wind.speed);
    u.uWater.value.set(L.water.scale, L.water.speed, L.water.strength, L.water.glow);
    setLin(this.sun.color, L.sun.color); this.sun.intensity = L.sun.intensity;
    this.sun.castShadow = !!L.sun.shadow;
    this.sun.shadow.mapSize.set(L.sun.mapSize, L.sun.mapSize);
    this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    this.shadows.dispose();
    this.sun.shadow.radius = L.sun.softness;
    this.sun.shadow.bias = L.sun.bias; this.sun.shadow.normalBias = L.sun.normalBias;
    setLin(this.fill.color, L.fill.color); this.fill.intensity = L.fill.intensity;
    setLin(this.ambient.color, L.ambient.color); this.ambient.intensity = L.ambient.intensity;
    // a light at 0 still costs a full BRDF evaluation per pixel: take it out of the shaders
    this.fill.visible = L.fill.intensity > 0;
    this.ambient.visible = L.ambient.intensity > 0;
    this._makeEnv();
    this.post.applyLook(L);
    this.shadows?.invalidate();
    this._sceneDirty = true;
    this.wake?.();
    const g = this.ground.material;
    g.visible = L.ground.type !== 'none';
    this.ground.visible = L.ground.type !== 'none';
    setLin(g.color, L.ground.color);
    g.opacity = L.ground.opacity;
    g.userData.uniforms.uContactStrength.value = L.ground.contact;
    if (this._contactKey !== `${L.ground.contactRadius}|${L.ground.contactHeight}`) this._layoutDirty = true;
    this._dirty = true;
    this.ui?.lookChanged?.();
  }

  _makeEnv() {
    const s = this.look.sky, sun = this.look.sun;
    const key = JSON.stringify([s, sun.azimuth, sun.elevation, sun.color]);
    if (key === this._envKey) { this.scene.environmentIntensity = s.intensity; return; }
    this._envKey = key;
    const envScene = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color().setRGB(...srgbToLinear(s.top)) },
        uHor: { value: new THREE.Color().setRGB(...srgbToLinear(s.horizon)) },
        uBot: { value: new THREE.Color().setRGB(...srgbToLinear(s.bottom)) },
        uSun: { value: new THREE.Color().setRGB(...srgbToLinear(sun.color)).multiplyScalar(s.sunGlow) },
        uSunDir: { value: sunDir(sun.azimuth, sun.elevation) },
      },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop, uHor, uBot, uSun, uSunDir; varying vec3 vD;
        void main(){ float y = vD.y; vec3 c = y > 0.0 ? mix(uHor, uTop, pow(y, 0.6)) : mix(uHor, uBot, pow(-y, 0.45));
          float g = max(dot(normalize(vD), uSunDir), 0.0); c += uSun * (pow(g, 8.0) * 0.6 + pow(g, 64.0) * 4.0);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
    const rt = this.pmrem.fromScene(envScene, 0.02);
    this.scene.environment?.dispose();
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = s.intensity;
    mat.dispose();
  }

  // ---- camera / layout --------------------------------------------------------------------------

  /** Change the view: { yaw, pitch, zoom, target } (degrees). */
  setView(v = {}) {
    Object.assign(this.camOpts, v);
    this._layoutDirty = true;
    this._layout(true);
  }

  _layout(force = false) {
    if (!this._layoutDirty && !force) return;
    this._layoutDirty = false;
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const m of this.models) if (m.opts.fit !== false) box.expandByObject(m.group);
    this.root.traverse((o) => { if (o.userData.fit) box.expandByObject(o); });
    if (box.isEmpty()) box.set(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 8, 8));
    this.bounds.copy(box);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const R = Math.max(1, size.length() / 2);
    this.radius = R;
    const c = this.camOpts;
    const target = c.target ? new THREE.Vector3(...c.target) : center.clone();
    // tightest frame that holds the bounds at this pitch for every yaw (so orbiting never clips)
    const pitch = c.pitch * DEG;
    let hw = 0, hh = 0;
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(target));
    // fit: 'view' (default) frames the current yaw tightly; 'orbit' frames every yaw so orbiting never clips
    const yaws = c.fit === 'orbit' ? Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2) : [c.yaw * DEG];
    for (const yaw of yaws) {
      const f = new THREE.Vector3(-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
      const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(r, f);
      for (const p of corners) { hw = Math.max(hw, Math.abs(p.dot(r))); hh = Math.max(hh, Math.abs(p.dot(up))); }
    }
    this._frame = { hw, hh, target, R };
    const cam = this.camera;
    // once running, refits (models added, look changes) keep the viewer's current orbit + zoom
    const keep = this._started && !force && this.camDist;
    const dir = keep ? cam.position.clone().sub(this.controls.target).normalize()
      : new THREE.Vector3(Math.cos(pitch) * Math.sin(c.yaw * DEG), Math.sin(pitch), Math.cos(pitch) * Math.cos(c.yaw * DEG));
    if (cam.isOrthographicCamera) {
      this.camDist = R * 4;
      cam.position.copy(target).addScaledVector(dir, this.camDist);
      cam.near = 0.1; cam.far = this.camDist + R * 6;
      if (!keep) cam.zoom = c.zoom;
    } else {
      const ratio = keep ? cam.position.distanceTo(this.controls.target) / this.camDist : 1 / c.zoom;
      const t = Math.tan((c.fov * DEG) / 2);
      const aspect = this.w / this.h;
      this.camDist = (Math.max(hh, hw / aspect) * c.margin) / t + R * 0.35;
      cam.position.copy(target).addScaledVector(dir, this.camDist * ratio);
      cam.near = Math.max(0.05, this.camDist * 0.02); cam.far = this.camDist * 4 + R * 4;
    }
    this.controls.target.copy(target);
    this.controls.minZoom = c.minZoom; this.controls.maxZoom = c.maxZoom;
    this.controls.minDistance = this.camDist / c.maxZoom; this.controls.maxDistance = this.camDist / c.minZoom;
    this.controls.update();
    this._frameCamera();
    this._fitShadow();
    this._fitGround();
    this.shadows?.invalidate();
  }

  _frameCamera() {
    const cam = this.camera, f = this._frame;
    if (!f) return;
    const aspect = this.w / this.h, c = this.camOpts;
    if (cam.isOrthographicCamera) {
      const halfH = Math.max(f.hh, f.hw / aspect) * c.margin;
      const ox = c.offset[0] * halfH * 2, oy = c.offset[1] * halfH * 2;
      cam.left = -halfH * aspect - ox; cam.right = halfH * aspect - ox; cam.top = halfH - oy; cam.bottom = -halfH - oy;
    } else {
      cam.aspect = aspect;
    }
    cam.updateProjectionMatrix();
  }

  _fitShadow() {
    const L = this.look.sun, R = this.radius * 1.05, c = this.bounds.getCenter(new THREE.Vector3());
    const d = sunDir(L.azimuth, L.elevation);
    if (L.follow) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.controls.getAzimuthalAngle() - this.camOpts.yaw * DEG);
    const p = c.clone().addScaledVector(d, R * 3);
    const s = this.sun.shadow.camera;
    if (!p.equals(this.sun.position) || !c.equals(this.sun.target.position) || s.right !== R) this.shadows.invalidate();
    this.sun.position.copy(p);
    this.sun.target.position.copy(c);
    s.left = -R; s.right = R; s.top = R; s.bottom = -R; s.near = R * 0.5; s.far = R * 6;
    s.updateProjectionMatrix();
    const fd = sunDir(this.look.fill.azimuth, this.look.fill.elevation);
    this.fill.position.copy(c).addScaledVector(fd, R * 3);
    this.fill.target.position.copy(c);
  }

  _fitGround() {
    const box = this.bounds;
    const y = box.min.y;
    this.ground.position.set((box.min.x + box.max.x) / 2, y - 0.002, (box.min.z + box.max.z) / 2);
    this.ground.scale.setScalar(this.radius * 12);
    // contact shadow texture from model footprints
    const G = this.look.ground;
    this._contactKey = `${G.contactRadius}|${G.contactHeight}`;
    const pad = Math.ceil(G.contactRadius * 3) + 2;
    const x0 = Math.floor(box.min.x) - pad, z0 = Math.floor(box.min.z) - pad;
    const W = Math.ceil(box.max.x) + pad - x0, D = Math.ceil(box.max.z) + pad - z0;
    if (W * D > 4096 * 4096 || W <= 0 || D <= 0) return;
    const occ = new Float32Array(W * D);
    const ch = G.contactHeight;
    for (const m of this.models) {
      if (m.opts.contact === false) continue;
      const mk = m.inner.matrixWorld.elements.join(',') + '|' + ch;
      if (m.grid && m.contactKey !== mk) this._fitGroundFor(m);
      const pts = m.contact;
      if (!pts) continue;
      for (let i = 0; i < pts.length; i += 3) {
        const h = pts[i + 1] - y;
        if (h > ch) continue;
        const ix = Math.floor(pts[i]) - x0, iz = Math.floor(pts[i + 2]) - z0;
        if (ix < 0 || iz < 0 || ix >= W || iz >= D) continue;
        const k = 1 - h / (ch + 1);
        if (k > occ[ix + iz * W]) occ[ix + iz * W] = k;
      }
    }
    const r = Math.max(1, Math.round(G.contactRadius));
    boxBlur(occ, W, D, r); boxBlur(occ, W, D, r); boxBlur(occ, W, D, r);
    const data = new Uint8Array(W * D);
    for (let i = 0; i < data.length; i++) data[i] = Math.min(255, Math.round(occ[i] * 255));
    const tex = new THREE.DataTexture(data, W, D, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const gu = this.ground.material.userData.uniforms;
    gu.uContact.value?.dispose?.();
    gu.uContact.value = tex;
    gu.uContactBox.value.set(x0, z0, W, D);
  }

  /** Cache the world positions of a model's lowest voxels (the only ones that can touch the ground). */
  _fitGroundFor(m) {
    m.contact = null;
    if (!m.grid || m.opts.contact === false) return;
    const b = m.grid.bounds();
    if (!b) return;
    this.root.updateMatrixWorld(true);
    const band = this.look.ground.contactHeight + 1;
    const base = m.inner.matrixWorld;
    const pts = [];
    for (const im of m.instances ?? [null]) {
      const mat = im ? base.clone().multiply(im) : base.clone();
      const e = mat.elements;
      const plain = e[0] === 1 && e[5] === 1 && e[10] === 1 && !e[1] && !e[2] && !e[4] && !e[6] && !e[8] && !e[9];
      if (plain) {
        const tx = e[12], ty = e[13], tz = e[14];
        m.grid.forEachIn(b.min, [b.max[0], b.min[1] + band, b.max[2]], (x, y, z) => pts.push(x + 0.5 + tx, y + 0.5 + ty, z + 0.5 + tz));
      } else {
        const v = new THREE.Vector3(), tmp = [];
        let minY = Infinity;
        m.grid.forEach((x, y, z) => { v.set(x + 0.5, y + 0.5, z + 0.5).applyMatrix4(mat); tmp.push(v.x, v.y, v.z); if (v.y < minY) minY = v.y; });
        const lim = band * Math.max(new THREE.Vector3().setFromMatrixScale(mat).y, 1e-3);
        for (let i = 0; i < tmp.length; i += 3) if (tmp[i + 1] - minY <= lim) pts.push(tmp[i], tmp[i + 1], tmp[i + 2]);
      }
    }
    m.contact = Float32Array.from(pts);
    m.contactKey = m.inner.matrixWorld.elements.join(',') + '|' + this.look.ground.contactHeight;
  }

  resize() {
    const w = this.el.clientWidth || window.innerWidth, h = this.el.clientHeight || window.innerHeight;
    this.w = w; this.h = h;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w * this.dpr, h * this.dpr);
    if (this._frame) this._frameCamera(); else this._layoutDirty = true; // don't reset the orbit on resize
    this._dirty = true;
    this.wake?.();
  }

  // ---- loop -----------------------------------------------------------------------------------

  /** Start rendering (hides the loader). Returns a promise resolved after the first frame. */
  start() {
    this._layout(true);
    this._started = true;
    this._last = performance.now();
    this._t0 = this._last;
    return new Promise((ok) => {
      const first = () => {
        this.frame();
        this.ui?.ready();
        if (!this.shot) {
          const loop = (now) => {
            this._raf = requestAnimationFrame(loop);
            const f = this.fps, active = this._active && (now - this._active) / 1000 < f.idleAfter;
            const target = (this._target = active ? f.max : f.idle);
            // time accumulator (keeps the phase, so rAF jitter doesn't halve the rate): render once a target
            // interval has built up; 1 ms slack
            const iv = target > 0 ? 1000 / target : 0;
            this._acc = (this._acc ?? iv) + (now - (this._prevRaf ?? now));
            this._prevRaf = now;
            if (this._acc < iv - 1) return;
            this._acc = Math.min(this._acc - iv, iv);
            const drew = this.frame();
            // nothing changed for a few frames and nothing can change by itself → stop the loop entirely
            // (no wakeups at all) until input / resize / a look or scene change calls wake()
            this._quiet = drew ? 0 : (this._quiet ?? 0) + 1;
            if ((this._quiet > 2 && !this._mayAnimate()) || this._offscreen) { cancelAnimationFrame(this._raf); this._raf = null; }
          };
          this._loop = loop;
          this._raf = requestAnimationFrame(loop);
          // a piece scrolled out of view (embedded in a page) stops rendering
          if (typeof IntersectionObserver !== 'undefined') {
            this._io = new IntersectionObserver(([e]) => { this._offscreen = !e.isIntersecting; if (!this._offscreen) this.wake(); });
            this._io.observe(this.renderer.domElement);
          }
        }
        requestAnimationFrame(() => { window.VOXEL.ready = true; ok(this); });
        // ?bench: log what a frame costs here (at rest, then orbiting) — real-GPU numbers for bench.mjs
        if (params.has('bench') && !this.shot) setTimeout(() => { this.bench({ frames: 120 }); this.bench({ frames: 120, moving: true }); }, 1500);
      };
      requestAnimationFrame(first);
    });
  }

  // OrbitControls damping decays geometrically and only stops at ~1e-6 rad: end it once the motion left is
  // under a tenth of a pixel, so the cache isn't fed seconds of invisible camera changes after each drag
  _settleDamping() {
    const c = this.controls, d = c._sphericalDelta, p = c._panOffset;
    if (!c.enableDamping || !d || !p) return;
    const cam = this.camera, H = this.h * this.dpr;
    const ppu = cam.isOrthographicCamera ? (H / (cam.top - cam.bottom)) * cam.zoom : H / (2 * Math.tan((cam.fov * DEG) / 2) * cam.position.distanceTo(c.target));
    const left = (Math.abs(d.theta) + Math.abs(d.phi)) * cam.position.distanceTo(c.target) * ppu + p.length() * ppu;
    if (left > 0 && left < 0.1) { d.set(0, 0, 0); p.set(0, 0, 0); }
  }

  stop() { cancelAnimationFrame(this._raf); this._raf = null; this._loop = null; }

  /** Restart a sleeping render loop (input, resize, look/scene changes call this). */
  wake() {
    if (!this._loop || this._raf || this._offscreen) return;
    this._quiet = 0; this._prevRaf = null; this._acc = null;
    this._last = performance.now(); // no time jump for the frame after a long sleep
    this._raf = requestAnimationFrame(this._loop);
  }

  // can the scene change without input? (actors, particles, user updaters, animated materials, rotation…)
  _mayAnimate() {
    const c = this.camOpts;
    if (this.updaters.length || this.actorSystems.length || this.particleSystems.length || c.autoRotate || c.idleRotate) return true;
    const L = this.look, st = L.background.stars;
    if (st && (typeof st === 'object' ? st.amount : st)) return true;
    const wind = L.wind.strength > 0 && L.wind.speed > 0, water = L.water.strength > 0 && L.water.speed > 0;
    return this.models.some((m) => m.timeHooks || m.meshes.some((x) => { const b = x.geometry.userData.boxes; return b && (b.flicker || (wind && b.sway) || (water && b.water)); }));
  }

  frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;
    if (this.fixedTime != null) this.time = this.fixedTime;
    else this.time += dt;
    const t = this.time;
    this._layout();
    const c = this.camOpts;
    const idle = this._interacted ? (now - this._interacted) / 1000 : Infinity;
    const reduce = this._reduceMotion?.matches;
    if (!this.shot && !reduce && (c.autoRotate || (c.idleRotate && idle > 6))) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = (c.autoRotate || c.idleRotate) / 6; // deg/s → OrbitControls units
    } else this.controls.autoRotate = false;
    this._settleDamping();
    this.controls.update(dt);
    if (this.look.sun.follow) this._fitShadow();
    this.uniforms.uTime.value = t;
    for (const m of this.models) m.uniforms.uMat.value = m.palette.texture();
    for (const p of this.particleSystems) p.update(t, dt);
    this._stepActors(t, dt);
    for (const fn of this.updaters) fn(t, dt);
    const drew = this._render(t);
    this.ui?.frame(dt, drew);
    if (drew) this._adapt(dt);
    return drew;
  }

  // Drop the render resolution in 0.25 steps (never below 1, or 0.75 on 1x screens) when frames are slow.
  _adapt(dt) {
    if (this.shot || this.opts.adaptive === false || params.has('dpr')) return;
    this._ft = (this._ft ?? []); this._ft.push(dt);
    if (this._ft.length < 90) return;
    const avg = this._ft.reduce((a, b) => a + b, 0) / this._ft.length;
    this._ft = [];
    const floor = this.maxDpr > 1 ? 1 : 0.75;
    const slow = Math.max(1 / 38, 1.25 / Math.max(1, this._target || 60)); // frames slower than the pacing allows
    if (avg > slow && this.dpr > floor) { this.dpr = Math.max(floor, this.dpr - 0.25); this.resize(); }
  }

  // models whose transform changed since the last frame are "moving" from then on (out of the static shadow cache)
  _trackMotion() {
    for (const m of this.models) {
      const e = m.inner.matrixWorld.elements, prev = m._mw;
      if (prev) { if (!m.moving) for (let i = 0; i < 16; i++) if (prev[i] !== e[i]) { m.moving = true; break; } prev.set(e); }
      else m._mw = Float64Array.from(e);
    }
  }

  // draw only the face directions of each voxel mesh that can face this camera (cull.js)
  _cullFaces(camera) {
    camera.updateMatrixWorld();
    const view = camera.isOrthographicCamera ? { dir: camera.getWorldDirection(_view) } : { pos: _view.setFromMatrixPosition(camera.matrixWorld) };
    for (const m of this.models) for (const mesh of m.meshes) setFaceGroups(mesh, faceMask(mesh, view));
  }

  /**
   * Draw a frame: plan what changed (cache.js), then shadows → reflection → scene (all / rects / not at all,
   * + light layers) → particle layer → post. Returns false when nothing needed drawing.
   */
  _render(t, force = false) {
    this.scene.updateMatrixWorld();
    this._trackMotion();
    const rc = this.renderCache;
    // the floor reflection is drawn with every light at its real intensity: no light layers with it; nor
    // with refracting water (its refraction source holds one layer at a time)
    const split = this._split();
    rc.noLayers = this.models.some((m) => m.nonLinear) || (this.look.ground.reflect > 0 && this.look.ground.type !== 'none') || !!split;
    const plan = rc.plan();
    if (force && plan.mode !== 'full') { plan.mode = 'full'; plan.seed = rc.layered.length > 0; plan.rects = null; }
    if (plan.mode === 'skip') return false;
    this._benchHook?.(plan);
    this.shadows.pending = true; // runs inside the first scene render call below (shadows.js)
    const L = this.look, R = this.radius ?? 10;
    const toTarget = this.camera.position.distanceTo(this.controls.target);
    let fog = null, dof = null;
    if (L.fog.amount > 0) fog = { near: toTarget + L.fog.near * R, far: toTarget + L.fog.far * R, amount: L.fog.amount };
    if (L.dof.enabled) {
      const scale = (this.h * this.dpr) / 1080;
      if (L.dof.mode === 'depth') {
        const focus = L.dof.focus === 'auto' || L.dof.focus == null ? toTarget : toTarget + L.dof.focus * R;
        dof = { mode: 1, focus, band: L.dof.band * R, range: L.dof.range * R, maxBlur: L.dof.maxBlur * scale, bokeh: L.dof.bokeh };
      } else {
        dof = { mode: 2, focus: L.dof.focus, band: L.dof.band, range: L.dof.range, maxBlur: L.dof.maxBlur * scale, angle: (L.dof.angle ?? 0) * DEG, bokeh: L.dof.bokeh };
      }
    }
    this._updateIbl(this.camera);
    this._renderReflection(split);
    this._cullFaces(this.camera);
    // plain full frames draw particles in the scene pass; cached frames composite them as their own layer
    const plain = plan.mode === 'full' && !plan.seed, layered = plain ? [] : rc.layered;
    const parts = this.particleSystems.some((p) => p.object.visible);
    if (plain) this.camera.layers.enable(PARTICLE_LAYER);
    try {
      if (plan.mode === 'full' || plan.mode === 'partial') this._drawScene(plan.mode === 'full' ? null : plan.rects, layered, split);
    } finally { this.camera.layers.disable(PARTICLE_LAYER); }
    // light layer weights: each layer was drawn at intensity 1 in white (+ d/dposition layers × offset)
    const K = this.post.su.uLayerK.value;
    let n = 0;
    for (const e of layered) {
      const l = e.light, k = K[n++].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.intensity);
      if (e.layers === 4) for (let a = 0; a < 3; a++) K[n++].copy(k).multiplyScalar(l.position.getComponent(a) - e.p0.getComponent(a));
    }
    this.post.layers = n;
    if (parts && !plain) this.post.renderParticles(this.scene, this.camera, PARTICLE_LAYER);
    this.post.particles = parts && !plain;
    this.post.finish(this.camera, { time: t, fog, dof, radius: R });
    rc.drawn(plan);
    return true;
  }

  // refracting water/glass in view → draw opaque objects, copy them (the refraction source), then the
  // transparent objects (post.renderScene); null when there's none
  _split() {
    const water = this.models.some((m) => m.transparent?.material[0].defines?.USE_TRANSMISSION !== undefined && isShown(m.transparent));
    if (!water) return null;
    const opaque = [], transparent = [];
    this.scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      (mats.some((m) => m.transparent || m.transmission > 0) ? transparent : opaque).push(o);
    });
    const show = (list, v) => { for (const o of list) o.visible = v; };
    return { opaque: () => show(transparent, false), transparent: () => { show(transparent, true); show(opaque, false); }, restore: () => { show(opaque, true); show(transparent, true); } };
  }

  // flat-face IBL tables (ibl.js) for every palette in use, for this camera
  _updateIbl(camera) {
    const pals = new Set(this.models.map((m) => m.palette));
    for (const a of this.actorSystems) for (const set of a.sets) pals.add(set.rig.palette);
    this.ibl.update(this.scene.environment, camera, pals);
  }

  // scene pass(es) into the persistent scene target: rects null = everything. With light layers: each layer
  // (only that light, at intensity 1) is drawn and copied out, then the scene without the layered lights.
  _drawScene(rects, layered, split = null) {
    const post = this.post, draw = (r) => post.renderScene(this.scene, this.camera, r, split);
    if (!layered.length) return draw(rects);
    const geo = rects ? rects.filter((r) => !r.emissive) : null; // flickering voxels only change the base layer
    if (!rects || geo.length) {
      let i = 0;
      for (const e of layered) {
        const l = e.light, pos = l.position.clone();
        if (e.layers === 4 && (!rects || !e.p0)) e.p0 = pos.clone(); // (re)seed: gradients around here
        try {
          if (e.layers === 4) { l.position.copy(e.p0); l.updateMatrixWorld(); }
          this._lightOnly(l, () => draw(geo));
          post.copyLayer(i, geo);
          if (e.layers === 4) for (let a = 0; a < 3; a++) {
            l.position.copy(e.p0).setComponent(a, e.p0.getComponent(a) + GRAD_STEP);
            l.updateMatrixWorld();
            this._lightOnly(l, () => draw(geo));
            post.diffLayer(i + 1 + a, i, GRAD_STEP, geo);
          }
        } finally { l.position.copy(pos); l.updateMatrixWorld(); }
        i += e.layers;
      }
    }
    const saved = layered.map((e) => e.light.intensity);
    layered.forEach((e) => { e.light.intensity = 0; });
    try { draw(rects); } finally { layered.forEach((e, i) => { e.light.intensity = saved[i]; }); }
  }

  // run fn with `light` as the only light source (intensity 1, white): no other lights, sky, emissive,
  // baked light, water glow or shadow-catcher ground — what that light alone adds to the image
  _lightOnly(light, fn) {
    const lights = [], u = this.uniforms;
    this.scene.traverse((o) => { if (o.isLight) lights.push([o, o.intensity]); });
    const color = light.color.clone(), env = this.scene.environmentIntensity, look = u.uLook.value.clone(), glow = u.uWater.value.w, ground = this.ground.visible;
    for (const [o] of lights) o.intensity = 0;
    light.intensity = 1; light.color.setRGB(1, 1, 1);
    this.scene.environmentIntensity = 0;
    u.uLook.value.x = 0; u.uLook.value.y = 0; u.uWater.value.w = 0;
    this.ground.visible = false;
    try { fn(); } finally {
      for (const [o, i] of lights) o.intensity = i;
      light.color.copy(color);
      this.scene.environmentIntensity = env;
      u.uLook.value.copy(look); u.uWater.value.w = glow;
      this.ground.visible = ground;
    }
  }

  _renderReflection(split = null) {
    const G = this.look.ground, gu = this.ground.material.userData.uniforms;
    if (!(G.reflect > 0) || G.type === 'none') { gu.uReflect.value.x = 0; return; }
    const w = Math.max(1, Math.round((this.w * this.dpr) / 2)), h = Math.max(1, Math.round((this.h * this.dpr) / 2));
    if (!this._reflRT) this._reflRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 2 });
    if (this._reflRT.width !== w || this._reflRT.height !== h) this._reflRT.setSize(w, h);
    const cam = this.camera, y = this.ground.position.y;
    const vc = (this._reflCam ??= cam.clone());
    vc.copy(cam);
    vc.layers.enable(PARTICLE_LAYER); // particles show in the reflection
    const tgt = this.controls.target.clone();
    vc.position.y = 2 * y - cam.position.y;
    tgt.y = 2 * y - tgt.y;
    vc.up.set(0, -1, 0);
    vc.lookAt(tgt);
    vc.updateMatrixWorld();
    // the mirrored view flips screen x, so an off-center (camera.offset) ortho frustum must flip too
    if (cam.isOrthographicCamera) { vc.left = -cam.right; vc.right = -cam.left; vc.updateProjectionMatrix(); }
    else vc.projectionMatrix.copy(cam.projectionMatrix);
    gu.uReflMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    const r = this.renderer;
    this.ground.visible = false;
    const prevAlpha = r.getClearAlpha(), prevColor = r.getClearColor(new THREE.Color());
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this._reflRT);
    r.clear(true, true, true);
    this._cullFaces(vc);
    const ibl = this.ibl.on.y;
    this.ibl.on.y = 0; // the radiance table is for the main camera's view direction
    try {
      // (classified again: the ground is hidden for this pass and must stay hidden)
      if (split) this.post.splitDraw(this._split(), () => { r.setRenderTarget(this._reflRT); r.render(this.scene, vc); }, this._reflRT, null, 'reflection');
      else r.render(this.scene, vc);
    } finally { this.ibl.on.y = ibl; }
    r.setClearColor(prevColor, prevAlpha);
    this.ground.visible = true;
    gu.uRefl.value = this._reflRT.texture;
    const c = this.bounds.getCenter(new THREE.Vector3());
    gu.uReflCenter.value.set(c.x, c.z);
    gu.uReflect.value.set(G.reflect, G.blur ?? 0.4, (this.radius ?? 10) * (G.reflectFade ?? 1.3), 0);
  }

  // ---- capture / stats ---------------------------------------------------------------------------

  /** Render n views (yaw rotated) tiled into one image; returns a PNG data URL. */
  captureViews(n = 1, jpeg = false) {
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    const W = this.renderer.domElement.width, H = this.renderer.domElement.height;
    const out = document.createElement('canvas');
    out.width = W * cols; out.height = H * rows;
    const ctx = out.getContext('2d');
    const az0 = this.controls.getAzimuthalAngle();
    const pol = this.controls.getPolarAngle();
    const dist = this.camera.position.distanceTo(this.controls.target);
    for (let i = 0; i < n; i++) {
      const az = az0 + (i / n) * Math.PI * 2;
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSphericalCoords(dist, pol, az));
      this.camera.lookAt(this.controls.target);
      if (this.look.sun.follow) this._fitShadow();
      this._render(this.time, true);
      ctx.drawImage(this.renderer.domElement, (i % cols) * W, Math.floor(i / cols) * H);
    }
    // restore the original view
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSphericalCoords(dist, pol, az0));
    this.camera.lookAt(this.controls.target);
    if (this.look.sun.follow) this._fitShadow();
    return jpeg ? out.toDataURL('image/jpeg', 0.88) : out.toDataURL('image/png');
  }

  /**
   * Frame-cost benchmark (voxel/tools/bench.mjs, or ?bench in a real browser): `frames` uncapped, GPU-synced
   * frames with the clock running at 60 Hz. Returns medians in ms: frame (what the loop pays per frame),
   * cpu (JS part of it), scene (main pass without shadow update), shadow (one shadow-map update), post.
   * moving: orbit the camera 0.5°/frame (nothing can be reused between frames).
   */
  bench({ frames = 30, moving = false } = {}) {
    const loop = this._loop;
    this.stop();
    const r = this.renderer, gl = r.getContext(), px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[s.length >> 1] * 100) / 100; };
    const fixed = this.fixedTime;
    this.fixedTime = null;
    const orbit = () => {
      if (!moving) return;
      const o = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5 * DEG);
      this.camera.position.copy(this.controls.target).add(o);
      this.controls.update();
    };
    const time = (fn, cpu) => {
      const t = [];
      for (let i = 0; i < frames + 3; i++) {
        orbit();
        const t0 = performance.now();
        fn();
        const t1 = performance.now();
        sync();
        if (i >= 3) { t.push(performance.now() - t0); cpu?.push(t1 - t0); }
      }
      return med(t);
    };
    const modes = { full: 0, partial: 0, post: 0, skip: 0 };
    let coverage = 0, measuring = false;
    this._benchHook = (plan) => { if (measuring) coverage += plan.mode === 'partial' ? this.renderCache.stats.coverage : plan.mode === 'full' ? 1 : 0; };
    const cpu = [];
    let k = 0;
    const frame = time(() => {
      measuring = ++k > 3;
      this._last = performance.now() - 1000 / 60;
      const drew = this.frame();
      if (measuring) modes[drew ? this.renderCache.stats.mode : 'skip']++;
    }, cpu);
    this._benchHook = null;
    const pass = (shadow) => () => {
      if (shadow) { this.shadows.invalidate(); this.shadows.pending = true; }
      this._cullFaces(this.camera);
      r.setRenderTarget(this.post.scene);
      r.render(this.scene, this.camera);
    };
    const scene = time(pass(false)), withShadow = time(pass(true));
    r.setRenderTarget(null);
    this.invalidate();
    this.fixedTime = fixed;
    const info = this.stats();
    const res = {
      frame, cpu: med(cpu), scene, shadow: Math.max(0, Math.round((withShadow - scene) * 100) / 100),
      post: Math.max(0, Math.round((frame - withShadow) * 100) / 100),
      draws: info.drawCalls, triangles: info.triangles, quads: info.quads, voxels: info.voxels, frames,
      modes, coverage: Math.round((coverage / frames) * 1000) / 1000, layers: this.renderCache.layered.length,
      size: info.size,
    };
    console.log('voxel bench', JSON.stringify(res));
    if (loop) { this._loop = loop; this.wake(); }
    return res;
  }

  stats() {
    const info = { render: this.post.sceneInfo ?? this.renderer.info.render };
    return {
      models: this.models.length,
      voxels: this.models.reduce((a, m) => a + m.stats.voxels, 0),
      quads: this.models.reduce((a, m) => a + m.stats.quads, 0),
      clusters: this.models.reduce((a, m) => a + (m.stats.clusters ?? 1), 0),
      meshMs: this.models.reduce((a, m) => a + m.stats.ms, 0),
      bakeMs: this.models.reduce((a, m) => a + (m.stats.bakeMs ?? 0), 0),
      lightGroups: this.models.reduce((a, m) => a + (m.stats.lights ?? 0), 0),
      particles: this.particleSystems.reduce((a, p) => a + p.count, 0),
      drawCalls: info.render.calls, triangles: info.render.triangles, // main scene pass (shadows/reflection excluded)
      bounds: { min: this.bounds.min.toArray().map(Math.round), max: this.bounds.max.toArray().map(Math.round) },
      size: [this.w, this.h, this.dpr],
      cache: { ...this.renderCache.stats, reason: this.renderCache.reason },
    };
  }
}

// ---- helpers -------------------------------------------------------------------------------------

// split instance matrices by rotation about Y in 90° steps (positive scale, no tilt): [{ rot, index }]
function rotationClasses(list) {
  const out = new Map();
  const c0 = new THREE.Vector3(), c1 = new THREE.Vector3(), c2 = new THREE.Vector3();
  list.forEach((M, i) => {
    M.extractBasis(c0, c1, c2);
    c0.normalize(); c1.normalize(); c2.normalize();
    let k = 'free';
    if (Math.abs(c1.y - 1) < 1e-6 && Math.abs(c0.y) < 1e-6 && c2.dot(c0.clone().cross(c1)) > 0) {
      const a = Math.round(Math.atan2(-c0.z, c0.x) / (Math.PI / 2));
      if (Math.abs(Math.atan2(-c0.z, c0.x) - a * (Math.PI / 2)) < 1e-5) k = ((a % 4) + 4) % 4;
    }
    if (!out.has(k)) out.set(k, { rot: k === 'free' ? null : new THREE.Matrix4().makeRotationY((k * Math.PI) / 2), index: [] });
    out.get(k).index.push(i);
  });
  return [...out.values()];
}

// a geometry with the same GPU buffers but its own draw groups (one per instanced rotation class)
function shareGeometry(geo) {
  const g = new THREE.BufferGeometry();
  for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  g.setIndex(geo.index);
  g.boundingBox = geo.boundingBox; g.boundingSphere = geo.boundingSphere;
  g.userData = { ranges: geo.userData.ranges, boxes: geo.userData.boxes };
  return g;
}

function instanceMatrix(it) {
  if (it.isMatrix4) return it;
  const o = Array.isArray(it) ? { position: it.slice(0, 3), rotation: it[3] ?? 0, scale: it[4] ?? 1 } : it;
  const rot = Array.isArray(o.rotation) ? new THREE.Euler(...o.rotation.map((d) => d * DEG)) : new THREE.Euler(0, (o.rotation ?? 0) * DEG, 0);
  const sc = Array.isArray(o.scale) ? new THREE.Vector3(...o.scale) : new THREE.Vector3().setScalar(o.scale ?? 1);
  return new THREE.Matrix4().compose(new THREE.Vector3(...(o.position ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(rot), sc);
}

const _view = new THREE.Vector3();

// first filled voxel along o + t·d (grid coords; t in the caller's units) → { voxel, normal, t } | null
function voxelRay(grid, o, d) {
  const b = grid.bounds();
  if (!b) return null;
  let t0 = 0, t1 = Infinity, enter = -1;
  for (let a = 0; a < 3; a++) {
    const lo = b.min[a], hi = b.max[a] + 1, oa = o.getComponent(a), da = d.getComponent(a);
    if (Math.abs(da) < 1e-12) { if (oa < lo || oa > hi) return null; continue; }
    let ta = (lo - oa) / da, tb = (hi - oa) / da;
    if (ta > tb) [ta, tb] = [tb, ta];
    if (ta > t0) { t0 = ta; enter = a; }
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  // Amanatides–Woo grid walk
  const cell = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDelta = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const da = d.getComponent(a), pa = o.getComponent(a);
    cell[a] = Math.min(b.max[a], Math.max(b.min[a], Math.floor(pa + da * (t0 + 1e-7))));
    step[a] = da > 0 ? 1 : da < 0 ? -1 : 0;
    tDelta[a] = step[a] ? Math.abs(1 / da) : Infinity;
    tMax[a] = step[a] ? ((da > 0 ? cell[a] + 1 : cell[a]) - pa) / da : Infinity;
  }
  let normal = [0, 0, 0], t = t0;
  if (enter >= 0) normal[enter] = -step[enter];
  for (let i = 0, n = b.size[0] + b.size[1] + b.size[2] + 3; i < n; i++) {
    if (grid.get(cell[0], cell[1], cell[2])) return { voxel: [...cell], normal, t };
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
    t = tMax[a];
    if (t > t1) return null;
    cell[a] += step[a]; tMax[a] += tDelta[a];
    normal = [0, 0, 0]; normal[a] = -step[a];
  }
  return null;
}

// drop a geometry's JS-side arrays after upload, while the model still has its grid at that point
function releaseArrays(geo, model) {
  const done = new Set();
  for (const attr of [...Object.values(geo.attributes), geo.index]) {
    const buf = attr?.isInterleavedBufferAttribute ? attr.data : attr;
    if (!buf || done.has(buf)) continue;
    done.add(buf);
    buf.onUpload(function () { if (model.grid) this.array = null; });
  }
}

function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function sunDir(az, el) {
  return new THREE.Vector3(Math.cos(el * DEG) * Math.sin(az * DEG), Math.sin(el * DEG), Math.cos(el * DEG) * Math.cos(az * DEG)).normalize();
}
function setLin(color, c) { color.setRGB(...srgbToLinear(c), THREE.LinearSRGBColorSpace); return color; }

function boxBlur(a, w, h, r) {
  const tmp = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / (2 * r + 1);
      s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      a[y * w + x] = s / (2 * r + 1);
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

function makeGround() {
  const mat = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.3, transparent: true, depthWrite: false });
  const uniforms = {
    uContact: { value: null }, uContactBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uContactStrength: { value: 0.4 },
    uRefl: { value: null }, uReflMatrix: { value: new THREE.Matrix4() }, uReflect: { value: new THREE.Vector4(0, 0.4, 0, 0) }, // strength, blur, fade radius, -
    uReflCenter: { value: new THREE.Vector2() },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vGW;
      uniform sampler2D uContact; uniform vec4 uContactBox; uniform float uContactStrength;
      uniform sampler2D uRefl; uniform mat4 uReflMatrix; uniform vec4 uReflect; uniform vec2 uReflCenter;`)
      .replace('gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );', `
        vec2 cuv = (vGW.xz - uContactBox.xy) / uContactBox.zw;
        float ca = 0.0;
        if (cuv.x > 0.0 && cuv.y > 0.0 && cuv.x < 1.0 && cuv.y < 1.0) ca = texture2D(uContact, cuv).r * uContactStrength;
        float sa = opacity * (1.0 - getShadowMask());
        sa = 1.0 - (1.0 - sa) * (1.0 - ca);
        vec4 refl = vec4(0.0);
        if (uReflect.x > 0.0) {
          vec4 rc = uReflMatrix * vec4(vGW, 1.0);
          vec2 ruv = rc.xy / rc.w;
          float fade = 1.0 - smoothstep(uReflect.z * 0.45, uReflect.z, length(vGW.xz - uReflCenter));
          float br = uReflect.y * 0.012;
          const float GA = 2.39996323;
          for (int i = 0; i < 12; i++) {
            float r = sqrt((float(i) + 0.5) / 12.0);
            refl += texture2D(uRefl, ruv + vec2(cos(float(i) * GA), sin(float(i) * GA)) * r * br);
          }
          refl *= uReflect.x * fade / 12.0;
        }
        float a = refl.a + (1.0 - refl.a) * sa;
        vec3 pm = refl.rgb + color * sa * (1.0 - refl.a);
        gl_FragColor = vec4(pm / max(a, 1e-4), a);`);
  };
  const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  g.renderOrder = -1;
  return g;
}

/**
 * 16 PCF taps instead of three's 5 (soft sun shadows without the noise) — but 4 of them first: when those
 * agree the pixel is fully lit or fully shadowed (almost every pixel; the penumbra is ~2 shadow texels) and
 * the other 12 are skipped. Penumbra pixels get exactly the same 16-tap average as before.
 */
function patchShadowChunk() {
  const C = THREE.ShaderChunk;
  if (C.shadowmap_pars_fragment.includes('VOXEL_SHADOW_SAMPLES')) return;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(C.shadowmap_pars_fragment)) { console.warn('voxel: shadow chunk patch failed (three version changed?)'); return; }
  C.shadowmap_pars_fragment = '#ifndef VOXEL_SHADOW_SAMPLES\n#define VOXEL_SHADOW_SAMPLES 16\n#endif\n' + C.shadowmap_pars_fragment.replace(re,
    `shadow = 0.0;
				for ( int i = 3; i < VOXEL_SHADOW_SAMPLES; i += 4 ) shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, VOXEL_SHADOW_SAMPLES, phi ) * radius, shadowCoord.z ) );
				if ( shadow > 0.0 && shadow < float( VOXEL_SHADOW_SAMPLES / 4 ) ) {
					for ( int i = 0; i < VOXEL_SHADOW_SAMPLES; i ++ ) if ( ( i & 3 ) != 3 ) shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, VOXEL_SHADOW_SAMPLES, phi ) * radius, shadowCoord.z ) );
					shadow /= float( VOXEL_SHADOW_SAMPLES );
				} else shadow /= float( VOXEL_SHADOW_SAMPLES / 4 );`);
}
