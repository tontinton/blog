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
import { resolveLook, merge } from './looks.js';
import { rgb, srgbToLinear } from './color.js';
import { Particles } from './particles.js';
import { createUI } from './ui.js';

const DEG = Math.PI / 180;
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
    const coarse = window.matchMedia?.('(pointer: coarse)').matches; // phones/tablets: cap a bit lower
    this.maxDpr = Number(params.get('dpr')) || opts.pixelRatio || Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
    this.dpr = this.maxDpr;

    this.scene = new THREE.Scene();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = [];
    this.updaters = [];
    this.particleSystems = [];
    this.time = 0;
    this.fixedTime = params.has('t') ? Number(params.get('t')) : this.shot ? opts.shotTime ?? 0 : null;
    this.post = new Post(this.renderer, { samples: opts.msaa ?? 4 });

    // shared voxel uniforms (a model gets its own copy of uMat, the palette texture)
    this.uniforms = createVoxelUniforms({ texture: () => null });

    // camera
    const cam = (this.camOpts = merge({ type: 'ortho', fov: 28, yaw: 45, pitch: 32, zoom: 1, margin: 1.06, fit: 'view', target: null, controls: true, autoRotate: 0, idleRotate: 0, minPitch: 4, maxPitch: 88, minZoom: 0.6, maxZoom: 5, pan: false, damping: 0.08, offset: [0, 0] }, opts.camera ?? {}));
    if (params.has('yaw')) cam.yaw = Number(params.get('yaw'));
    if (params.has('pitch')) cam.pitch = Number(params.get('pitch'));
    if (params.has('zoom')) cam.zoom *= Number(params.get('zoom'));
    this.camera = cam.type === 'persp' ? new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 5000) : new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, {
      enableDamping: !this.shot, dampingFactor: cam.damping, enablePan: cam.pan, enabled: cam.controls && !this.shot,
      minPolarAngle: (90 - cam.maxPitch) * DEG, maxPolarAngle: (90 - cam.minPitch) * DEG, rotateSpeed: 0.6, zoomSpeed: 0.9,
    });
    this.controls.addEventListener('start', () => { this._interacted = performance.now(); this.ui?.interacted(); });
    this.controls.addEventListener('change', () => { this._dirty = true; });

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight(0xffffff, 0);
    this.scene.add(this.fill, this.fill.target);
    this.ambient = new THREE.AmbientLight(0xffffff, 0);
    this.scene.add(this.ambient);
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
   * ?region=a,b (URL) builds only those regions — test one region in isolation.
   * Resolves to { group, grid, palette, assets: { name: group }, extras, stats }.
   */
  async world(spec) {
    const t0 = performance.now();
    const abs = (u) => new URL(u, location.href).href;
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
    const group = await this.addAsync(grid, {
      bake: spec.bake ?? { ao: true, light: true }, cluster: spec.cluster, workers: pool ? undefined : 0,
      keepGrid: spec.keepGrid, ...(spec.model ?? {}), palette: P,
      onProgress: (f) => step('Meshing', 0.55 + 0.35 * f),
    });
    // instanced assets
    const assets = {};
    if (instances.size) {
      if (!spec.assets) throw new Error('regions used ctx.instance() but stage.world() got no `assets` module');
      await step('Assets', 0.92);
      const names = [...instances.keys()];
      const built = pool ? await pool.run({ type: 'assets', url: abs(spec.assets), names, palette: P.serialize() }) : await runAssets(abs(spec.assets), names, P.serialize());
      for (const name of names) {
        const ag = new VoxelGrid(P);
        mergeInto(ag, P, built[name]);
        assets[name] = await this.addAsync(ag, { bake: spec.assetBake ?? { ao: true }, palette: P, name, workers: pool ? undefined : 0, instances: instances.get(name), cluster: 0 });
      }
    }
    // extras: particles, lights, actors, custom
    for (const e of extras) {
      if (e.kind === 'particles') this.particles(e.data);
      else if (e.kind === 'light') this.light(e.data);
      else if (e.kind === 'actors' && this.actors) this.actors(e.data);
      else spec.onExtra?.(e);
    }
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
    const model = { group, inner, grid, palette, opts, meshes: [], uniforms: { ...this.uniforms, uMat: { value: palette.texture() } } };
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
    this._shadowDirty = true;
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
      transparent: results.some((r) => r.transparent) ? createVoxelMaterial({ uniforms, light, transparent: true, transmission: this.look.water.transmission, hooks }) : null,
    };
    model.materials = mats;
    const make = (geo, mat) => {
      if (!inst) return new THREE.Mesh(geo, mat);
      const m = new THREE.InstancedMesh(geo, mat, inst.length);
      inst.forEach((M, i) => m.setMatrixAt(i, M));
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingBox(); m.computeBoundingSphere();
      return m;
    };
    const cull = results.length > 1 || !!inst;
    const stats = { quads: 0, triangles: 0, bakeMs: 0, lights: 0, clusters: results.length };
    for (const r of results) {
      if (r.solid) {
        const mesh = make(r.solid, mats.solid);
        mesh.customDepthMaterial = mats.depth;
        mesh.customDistanceMaterial = mats.distance;
        mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = opts.receive !== false;
        mesh.frustumCulled = cull;
        inner.add(mesh);
        model.meshes.push(mesh);
      }
      if (r.transparent) {
        const mesh = make(r.transparent, mats.transparent);
        mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = cull;
        mesh.renderOrder = 1;
        inner.add(mesh);
        model.meshes.push(mesh);
      }
      stats.quads += r.stats.quads; stats.triangles += r.stats.triangles; stats.bakeMs += r.stats.bakeMs; stats.lights = Math.max(stats.lights, r.stats.lights);
    }
    model.solid = model.meshes.find((m) => m.material === mats.solid) ?? null;
    model.transparent = model.meshes.find((m) => m.material === mats.transparent) ?? null;
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
    this._shadowDirty = true;
    return group;
  }

  remove(group) {
    const m = group.userData.model;
    this.models = this.models.filter((x) => x !== m);
    group.removeFromParent();
    if (m) this._clearMeshes(m);
    else group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    this._layoutDirty = true;
    this._shadowDirty = true;
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
    const owner = new Map();
    for (const m of this.models) for (const mesh of m.meshes) owner.set(mesh, m);
    const hit = ray.intersectObjects([...owner.keys()], false)[0];
    if (!hit) return null;
    const model = owner.get(hit.object);
    const M = hit.object.matrixWorld.clone();
    if (hit.instanceId != null) M.multiply(model.instances[hit.instanceId]);
    const local = hit.point.clone().applyMatrix4(M.invert());
    const n = hit.face.normal;
    const voxel = [Math.floor(local.x - n.x * 0.5), Math.floor(local.y - n.y * 0.5), Math.floor(local.z - n.z * 0.5)];
    const info = hit.object.geometry.attributes.aInfo;
    const id = model.grid ? model.grid.get(...voxel) : info.getX(hit.face.a) + info.getY(hit.face.a) * 256;
    return { model, group: model.group, voxel, id, name: model.palette.defs[id]?.name ?? null, normal: [n.x, n.y, n.z], point: hit.point, instance: hit.instanceId ?? null };
  }

  /** Add any THREE.Object3D (opts.fit: include in camera fit, default false). */
  addObject(obj, opts = {}) {
    this.root.add(obj);
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
    this.root.add(L);
    return L;
  }

  /** Particle system (see particles.js). */
  particles(opts) {
    const p = new Particles(this, opts);
    this.particleSystems.push(p);
    this.root.add(p.object);
    return p;
  }

  /** Update the loader text/bar and yield a frame so it paints. `await` it between heavy build steps. */
  async progress(text, fraction) { await this.ui?.progress(text, fraction); }

  /** fn(t, dt) every frame (t = seconds since start, frozen with ?t=). */
  onUpdate(fn) { this.updaters.push(fn); return this; }

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
    this.sun.shadow.radius = L.sun.softness;
    this.sun.shadow.bias = L.sun.bias; this.sun.shadow.normalBias = L.sun.normalBias;
    setLin(this.fill.color, L.fill.color); this.fill.intensity = L.fill.intensity;
    setLin(this.ambient.color, L.ambient.color); this.ambient.intensity = L.ambient.intensity;
    this._makeEnv();
    this.post.applyLook(L);
    this._shadowDirty = true;
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
    this._shadowDirty = true;
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
    this._shadowDirty = true;
    const L = this.look.sun, R = this.radius * 1.05, c = this.bounds.getCenter(new THREE.Vector3());
    const d = sunDir(L.azimuth, L.elevation);
    if (L.follow) d.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.controls.getAzimuthalAngle() - this.camOpts.yaw * DEG);
    this.sun.position.copy(c).addScaledVector(d, R * 3);
    this.sun.target.position.copy(c);
    const s = this.sun.shadow.camera;
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
          const loop = () => { this._raf = requestAnimationFrame(loop); this.frame(); };
          this._raf = requestAnimationFrame(loop);
        }
        requestAnimationFrame(() => { window.VOXEL.ready = true; ok(this); });
      };
      requestAnimationFrame(first);
    });
  }

  stop() { cancelAnimationFrame(this._raf); }

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
    const reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!this.shot && !reduce && (c.autoRotate || (c.idleRotate && idle > 6))) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = (c.autoRotate || c.idleRotate) / 6; // deg/s → OrbitControls units
    } else this.controls.autoRotate = false;
    this.controls.update(dt);
    if (this.look.sun.follow) this._fitShadow();
    this.uniforms.uTime.value = t;
    // shadow map refresh: 'always' | 'static' (only when something changed) | N (every N frames)
    const su = this.look.sun.update ?? 'always';
    this.renderer.shadowMap.autoUpdate = false;
    this._frameNo = (this._frameNo ?? 0) + 1;
    if (su === 'always' || this._shadowDirty || (typeof su === 'number' && this._frameNo % Math.max(1, su) === 0)) {
      this.renderer.shadowMap.needsUpdate = true;
      this._shadowDirty = false;
    }
    for (const m of this.models) m.uniforms.uMat.value = m.palette.texture();
    for (const p of this.particleSystems) p.update(t, dt);
    for (const fn of this.updaters) fn(t, dt);
    this._render(t);
    this.ui?.frame(dt);
    this._adapt(dt);
  }

  // Drop the render resolution in 0.25 steps (never below 1, or 0.75 on 1x screens) when frames are slow.
  _adapt(dt) {
    if (this.shot || this.opts.adaptive === false || params.has('dpr')) return;
    this._ft = (this._ft ?? []); this._ft.push(dt);
    if (this._ft.length < 90) return;
    const avg = this._ft.reduce((a, b) => a + b, 0) / this._ft.length;
    this._ft = [];
    const floor = this.maxDpr > 1 ? 1 : 0.75;
    if (avg > 1 / 38 && this.dpr > floor) { this.dpr = Math.max(floor, this.dpr - 0.25); this.resize(); }
  }

  _render(t) {
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
    this._renderReflection();
    this.post.render(this.scene, this.camera, { time: t, fog, dof, radius: R });
  }

  _renderReflection() {
    const G = this.look.ground, gu = this.ground.material.userData.uniforms;
    if (!(G.reflect > 0) || G.type === 'none') { gu.uReflect.value.x = 0; return; }
    const w = Math.max(1, Math.round((this.w * this.dpr) / 2)), h = Math.max(1, Math.round((this.h * this.dpr) / 2));
    if (!this._reflRT) this._reflRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 2 });
    if (this._reflRT.width !== w || this._reflRT.height !== h) this._reflRT.setSize(w, h);
    const cam = this.camera, y = this.ground.position.y;
    const vc = (this._reflCam ??= cam.clone());
    vc.copy(cam);
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
    r.render(this.scene, vc);
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
      this._render(this.time);
      ctx.drawImage(this.renderer.domElement, (i % cols) * W, Math.floor(i / cols) * H);
    }
    // restore the original view
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSphericalCoords(dist, pol, az0));
    this.camera.lookAt(this.controls.target);
    if (this.look.sun.follow) this._fitShadow();
    return jpeg ? out.toDataURL('image/jpeg', 0.88) : out.toDataURL('image/png');
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
    };
  }
}

// ---- helpers -------------------------------------------------------------------------------------

function instanceMatrix(it) {
  if (it.isMatrix4) return it;
  const o = Array.isArray(it) ? { position: it.slice(0, 3), rotation: it[3] ?? 0, scale: it[4] ?? 1 } : it;
  const rot = Array.isArray(o.rotation) ? new THREE.Euler(...o.rotation.map((d) => d * DEG)) : new THREE.Euler(0, (o.rotation ?? 0) * DEG, 0);
  const sc = Array.isArray(o.scale) ? new THREE.Vector3(...o.scale) : new THREE.Vector3().setScalar(o.scale ?? 1);
  return new THREE.Matrix4().compose(new THREE.Vector3(...(o.position ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(rot), sc);
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

/** More PCF taps than three's default 5 (soft sun shadows without the noise). */
function patchShadowChunk() {
  const C = THREE.ShaderChunk;
  if (C.shadowmap_pars_fragment.includes('VOXEL_SHADOW_SAMPLES')) return;
  const re = /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \)[\s\S]*?\) \* 0\.2;/;
  if (!re.test(C.shadowmap_pars_fragment)) { console.warn('voxel: shadow chunk patch failed (three version changed?)'); return; }
  C.shadowmap_pars_fragment = '#ifndef VOXEL_SHADOW_SAMPLES\n#define VOXEL_SHADOW_SAMPLES 16\n#endif\n' + C.shadowmap_pars_fragment.replace(re,
    `shadow = 0.0;
				for ( int i = 0; i < VOXEL_SHADOW_SAMPLES; i ++ ) shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, VOXEL_SHADOW_SAMPLES, phi ) * radius, shadowCoord.z ) );
				shadow /= float( VOXEL_SHADOW_SAMPLES );`);
}
