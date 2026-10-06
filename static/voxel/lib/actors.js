// Actors: animated voxel creatures (cats, people, birds, ducks…) that wander, follow paths, circle, flock or
// follow each other, walking on the terrain. A creature is a *rig*: a few small voxel grids (parts) with
// joints. All parts are merged into one geometry (vertices tagged with their part) and drawn as ONE
// InstancedMesh per variant; each agent's joint matrices go into a small float texture the vertex shader
// reads — 1 or 500 cats cost one draw call (+1 in the shadow pass); per frame only matrices are written.
//
//   stage.actors({ creature: 'cat', count: 3, area: [[-20, -20], [20, 20]] });          // wander, terrain-aware
//   stage.actors({ creature: 'walker', count: 12, variants: 4, behavior: 'path', path: [[0, 0], [30, 0], [30, 20]] });
//   stage.actors({ creature: 'bird', count: 9, behavior: 'flock', center: [0, 40, 0], radius: 25 });
//   const mom = stage.actors({ creature: 'duck', on: 'water' });
//   stage.actors({ creature: 'duck', options: { baby: true }, count: 4, behavior: 'follow', target: mom });
//   stage.actors({ creature: 'cat', behavior: (ag, dt, t, actors) => { ag.x = …; ag.z = …; ag.heading = …; ag.speed = …; } });
//
// Options: creature (registered name | rig | factory(opts) → rig), options (creature opts, or an array =
// one variant each), variants (n rigs from different seeds — e.g. walkers with varied clothes; n × parts
// draw calls), count, behavior ('wander' | 'path' | 'circle' | 'flock' | 'follow' | 'still' | fn),
// area [[x0,z0],[x1,z1]] (wander/spawn region; default: the ground's bounds), groups [{ area, count }] (one
// system over several areas/paths/circles: [{ area | path | center + radius, count }]), path [[x,z] | [x,y,z], …],
// loop (true), spread (path lane jitter), center [x,y,z] + radius (circle/flock), target (follow: Actors |
// agent | Object3D | [x,z] | t → [x,z]), spacing (follow gap), ground ('auto' = every model | VoxelGrid |
// group | number), on ('ground' | 'water'), maxStep (1, climbable step), region ('main' = stay in the largest
// connected walkable area of `area` — streets, not roofs | 'any'), speed [min,max] voxels/s, scale,
// tints [colors] (per-instance multiply), idle [min,max] s, sprint (chance a wander leg is run at 2×),
// shadow ('auto' | true | 'blob' | false — 'auto' = real shadows, or blobs when look.sun.update isn't
// 'always', so big static-shadow worlds stay cheap), seed.
//
// Agents are plain objects ({ x, y, z, heading, speed, … }) in actors.agents — read them to attach lights
// or cameras, or write them from a custom behavior.
//
// Rig format (see gen/creatures.js, or build your own with rig()):
//   { palette, parts: [{ name, role, side, pair, grid, pivot: [x,y,z], animate? }], center, size, stride, speed, anim, scale, lift, fly, swim }
//   Rig space: feet at y = 0, facing +z, x across. Roles drive the procedural animation:
//   'body' (bob), 'head' (nod / look around), 'tail' (sway), 'leg' (swing; side ±1, pair 0 front | 1 back),
//   'arm' (swing opposite the legs), 'wing' (flap; side ±1), 'fin' (wiggle), 'static'.
//   part.animate({ t, agent, moving, phase }) → { rx, ry, rz } overrides the role's rotation (radians).
import * as THREE from './three.js';
import { buildMesh, geometryFromArrays } from './mesher.js';
import { createVoxelMaterial, createVoxelDepthMaterial } from './material.js';
import { rng } from './random.js';
import { srgbToLinear } from './color.js';
import { lookup, list } from './registry.js';

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _o = new THREE.Matrix4(), _t = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

/**
 * Build a rig from parts: [{ name, role, side, pair, grid, pivot }], all grids sharing one palette.
 * o: center, stride (rig voxels per gait cycle), speed [min,max] (world voxels/s), anim {...}, scale (default
 * size), lift (rig-space y offset on water; negative sinks), idle [min,max] s, sprint (chance), fly, swim.
 */
export function rig(parts, o = {}) {
  const palette = o.palette ?? parts[0].grid.palette;
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  parts = parts.filter((p) => p.grid.bounds());
  for (const p of parts) { const b = p.grid.bounds(); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.min[k]); mx[k] = Math.max(mx[k], b.max[k] + 1); } }
  return {
    palette, parts,
    center: o.center ?? [(mn[0] + mx[0]) / 2, 0, (mn[2] + mx[2]) / 2],
    size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]],
    stride: o.stride ?? Math.max(1, (mx[2] - mn[2]) * 0.6),
    speed: o.speed ?? [2, 4],
    anim: { legSwing: 0.7, armSwing: 0.6, bob: 0.25, tailSway: 0.35, headNod: 0.08, flapSpeed: 9, flap: 0.9, glide: 0, ...(o.anim ?? {}) },
    scale: o.scale ?? 1, lift: o.lift ?? 0, sprint: o.sprint ?? 0, idle: o.idle ?? [0.5, 3],
    fly: !!o.fly, swim: !!o.swim,
  };
}

/** Resolve creature → factory(opts) → rig. */
function factoryFor(c) {
  if (typeof c === 'string') {
    const e = lookup('creature', c);
    if (!e) throw new Error(`unknown creature "${c}" (have: ${list('creature').map((x) => x.name).join(', ')})`);
    return e.value;
  }
  if (typeof c === 'function') return c;
  if (c?.parts) return () => c;
  throw new Error('stage.actors: pass { creature: name | rig | factory }');
}

// ---- terrain ----------------------------------------------------------------------------------------

function groundSources(stage, ground) {
  if (ground != null && ground !== 'auto' && typeof ground !== 'number') {
    if (ground.isObject3D) { const m = ground.userData.model; return m?.grid ? [{ grid: m.grid, off: offsetOf(stage, m) }] : []; }
    return [{ grid: ground, off: [0, 0, 0] }];
  }
  return stage.models.filter((m) => m.grid && !m.opts.instances && m.opts.fit !== false).map((m) => ({ grid: m.grid, off: offsetOf(stage, m) }));
}
function offsetOf(stage, m) {
  stage.root.updateMatrixWorld(true);
  m.inner.getWorldPosition(_v);
  return [_v.x, _v.y, _v.z]; // translation only (rotated/scaled models aren't walkable ground)
}
function areaOf(src) {
  let a = null;
  for (const { grid, off } of src) {
    const b = grid.bounds();
    if (!b) continue;
    const r = [[b.min[0] + off[0], b.min[2] + off[2]], [b.max[0] + 1 + off[0], b.max[2] + 1 + off[2]]];
    a = a ? [[Math.min(a[0][0], r[0][0]), Math.min(a[0][1], r[0][1])], [Math.max(a[1][0], r[1][0]), Math.max(a[1][1], r[1][1])]] : r;
  }
  return a;
}

/**
 * Walkable height field over `area`: at(x, z) → feet y, ok(x, z) → can stand here (solid ground, or water
 * when on = 'water'). Swaying tufts (≤ 2 voxels) are walked through and anything with ≥ `clear` voxels of
 * headroom beneath it (canopies, awnings, arches, bunting, bridges) is walked under; bushes, walls, stall
 * counters are obstacles. region()/mainRegion() label connected walkable areas so creatures stay off roofs.
 */
export function heightField(src, area, on = 'ground', clear = 4, maxStep = 1) {
  const [x0, z0] = area[0].map(Math.floor), [x1, z1] = area[1].map(Math.ceil);
  const W = x1 - x0 + 1, D = z1 - z0 + 1;
  const hf = new Float32Array(W * D).fill(-Infinity), kind = new Uint8Array(W * D); // 0 none, 1 solid, 2 water
  for (const { grid: g, off } of src) {
    const defs = g.palette?.defs ?? [];
    const ox = Math.round(off[0]), oz = Math.round(off[2]), oy = off[1];
    const T = g.tops(x0 - ox, z0 - oz, x1 - ox, z1 - oz);
    for (let i = 0; i < W * D; i++) {
      let y = T.y[i], id = T.id[i];
      if (y === -2147483648) continue;
      [y, id] = surface(g, defs, T.x0 + (i % W), T.z0 + Math.floor(i / W), y, clear);
      if (y === -Infinity) continue;
      const h = y + 1 + oy;
      if (h > hf[i]) { hf[i] = h; kind[i] = defs[id]?.kind > 0 ? 2 : 1; }
    }
  }
  const idx = (x, z) => { const ix = Math.floor(x) - x0, iz = Math.floor(z) - z0; return ix < 0 || iz < 0 || ix >= W || iz >= D ? -1 : ix + iz * W; };
  const want = on === 'water' ? 2 : 1;
  let comp = null;
  const hfo = {
    area: [[x0, z0], [x1, z1]],
    at: (x, z) => { const i = idx(x, z); return i < 0 ? -Infinity : hf[i]; },
    ok: (x, z) => { const i = idx(x, z); return i >= 0 && kind[i] === want; },
    /** Connected walkable regions (steps ≤ maxStep): region id at (x, z), 0 = not walkable. Rooftops are their own regions. */
    region: (x, z) => { const i = idx(x, z); return i < 0 ? 0 : (comp ??= label(hf, kind, want, W, D, maxStep))[i]; },
    /** The largest walkable region inside [[x0,z0],[x1,z1]] (where to spawn/wander: the streets, not the roofs). */
    mainRegion(a) {
      comp ??= label(hf, kind, want, W, D, maxStep);
      const n = new Map();
      for (let z = Math.max(z0, Math.floor(a[0][1])); z <= Math.min(z1, Math.floor(a[1][1])); z++) for (let x = Math.max(x0, Math.floor(a[0][0])); x <= Math.min(x1, Math.floor(a[1][0])); x++) {
        const c = comp[x - x0 + (z - z0) * W];
        if (c) n.set(c, (n.get(c) ?? 0) + 1);
      }
      let best = 0, bn = 0;
      for (const [c, k] of n) if (k > bn) { best = c; bn = k; }
      return best;
    },
  };
  return hfo;
}
function label(hf, kind, want, W, D, maxStep) {
  const comp = new Int32Array(W * D), stack = [];
  let id = 0;
  for (let s = 0; s < W * D; s++) {
    if (comp[s] || kind[s] !== want) continue;
    comp[s] = ++id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(), x = i % W, h = hf[i];
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < W * (D - 1) ? i + W : -1]) {
        if (j < 0 || comp[j] || kind[j] !== want || Math.abs(hf[j] - h) > maxStep + 0.01) continue;
        comp[j] = id; stack.push(j);
      }
    }
  }
  return comp;
}
// The walkable surface of column (x, z), starting from its top voxel y. Swaying tufts/flower stems (≤ 2 voxels
// on solid ground) are walked through, and any overhang — tree canopy, awning, arch, bunting, bridge, roof
// over a porch — with ≥ `clear` voxels of air beneath it is walked under. Everything else is the surface.
function surface(g, defs, x, z, y, clear) {
  for (let guard = 0; guard < 16; guard++) {
    let s = 0;
    while (s < 3 && defs[g.get(x, y - s, z)]?.sway > 0) s++;
    const base = g.get(x, y - s, z);
    if (s > 0 && s <= 2 && base && !(defs[base]?.sway > 0)) { y -= s; continue; } // tuft on the ground
    let lo = y; // bottom of the solid run containing y
    while (g.get(x, lo - 1, z)) lo--;
    const below = g.top(x, z, lo - 1);
    if (below !== -Infinity && lo - below - 1 >= clear) { y = below; continue; } // headroom: walk under
    break;
  }
  return [y, g.get(x, y, z)];
}

// ---- actors -----------------------------------------------------------------------------------------

export class Actors {
  constructor(stage, o = {}) {
    this.stage = stage;
    if (o.groups) o = { ...o, count: o.groups.reduce((n, gr) => n + (gr.count ?? 1), 0) };
    this.o = { count: 1, loop: true, maxStep: 1, shadow: 'auto', seed: 1, spread: 0, variants: 1, ...o };
    const R = (this.R = rng(this.o.seed));
    const make = factoryFor(o.rig ?? o.creature);
    const optList = Array.isArray(o.options) ? o.options : null;
    const nv = Math.max(1, Math.min(optList?.length ?? this.o.variants, this.o.count));
    this.rigs = [];
    for (let v = 0; v < nv; v++) this.rigs.push(make({ seed: this.o.seed * 7919 + v * 104729, ...((optList ? optList[v] : o.options) ?? {}) }));
    const r = (this.rig = this.rigs[0]);
    const beh = (this.o.behavior ??= r.fly ? 'flock' : 'wander');
    this.scale = this.o.scale ?? r.scale;
    const on = this.o.on ?? (r.swim ? 'water' : 'ground');
    this.lift = on === 'water' ? r.lift : 0;
    this.idle = this.o.idle ?? r.idle;
    const needsGround = beh !== 'flock' && beh !== 'circle' && typeof this.o.ground !== 'number';
    const src = needsGround ? groundSources(stage, this.o.ground) : [];
    const b = stage.bounds;
    // groups: [{ area | path, count }] — one system (one draw call per part) spread over many areas or paths
    // (stage.world merges the actors regions emit this way)
    this.groupOf = [];
    for (const gr of this.o.groups ?? []) {
      const g2 = { ...gr, area: gr.area ?? (gr.path ? pathBox(gr.path) : null) };
      for (let k = 0; k < (gr.count ?? 1); k++) this.groupOf.push({ ...g2, k, n: gr.count ?? 1 });
    }
    const ga = this.groupOf.map((gr) => gr.area).filter(Boolean);
    if (this.o.path && !this.o.area) ga.push(pathBox(this.o.path));
    const union = (u, a) => [[Math.min(u[0][0], a[0][0]), Math.min(u[0][1], a[0][1])], [Math.max(u[1][0], a[1][0]), Math.max(u[1][1], a[1][1])]];
    this.area = this.o.area ?? (ga?.length ? ga.reduce(union) : null) ?? areaOf(src) ?? (b.isEmpty() ? [[-16, -16], [16, 16]] : [[b.min.x, b.min.z], [b.max.x, b.max.z]]);
    this.ground = typeof this.o.ground === 'number' ? { at: () => this.o.ground, ok: () => true }
      : needsGround && src.length ? heightField(src, this.area, on, Math.ceil(r.size[1] * this.scale) + 1, this.o.maxStep) : null;
    let shadow = this.o.shadow;
    if (shadow === 'auto') shadow = (stage.look?.sun?.update ?? 'always') === 'always' ? true : r.fly ? false : 'blob';
    this.shadow = shadow;

    this.object = new THREE.Group();
    this.object.name = 'actors';
    const n = this.o.count;
    // agents are dealt round-robin to the variants; each variant has its own instanced part meshes
    this.sets = this.rigs.map((rg, v) => {
      const cap = Math.max(1, Math.ceil((n - v) / nv));
      const stride = rg.parts.length * 3; // texels per agent (3×4 matrix per part)
      const rows = Math.ceil((cap * stride) / 1024);
      const rigTex = new THREE.DataTexture(new Float32Array(1024 * rows * 4), 1024, rows, THREE.RGBAFormat, THREE.FloatType);
      rigTex.magFilter = rigTex.minFilter = THREE.NearestFilter;
      const uniforms = { ...stage.uniforms, uMat: { value: rg.palette.texture() }, uRig: { value: rigTex }, uRigStride: { value: stride } };
      const mat = createVoxelMaterial({ uniforms, rig: true }), depth = createVoxelDepthMaterial({ uniforms, rig: true });
      const m = new THREE.InstancedMesh(mergeParts(rg), mat, cap);
      m.count = Math.ceil((n - v) / nv);
      m.customDepthMaterial = depth;
      m.castShadow = shadow === true; m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.name = `${this.o.creature ?? 'actor'}-${v}`;
      this.object.add(m);
      return { rig: rg, uniforms, meshes: [m], mesh: m, mat, depth, rigTex, stride };
    });
    if (this.o.tints) {
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        c.setRGB(...srgbToLinear(this.o.tints[i % this.o.tints.length]), THREE.LinearSRGBColorSpace);
        this.sets[i % nv].mesh.setColorAt(Math.floor(i / nv), c);
      }
    }
    if (shadow === 'blob') this.blob = makeBlobs(n);
    if (this.blob) this.object.add(this.blob);
    this.agents = [];
    for (let i = 0; i < n; i++) this.agents.push(this._spawn(i, nv));
    this.count = n;
    this._simT = null;
    for (const ag of this.agents) this._pose(ag, 0);
  }

  _spawn(i, nv) {
    const R = this.R, o = this.o, gr = this.groupOf[i], area = gr?.area ?? this.area, [a0, a1] = area, rg = this.rigs[i % nv];
    const sp = o.speed ?? rg.speed;
    const [s0, s1] = Array.isArray(sp) ? sp : [sp, sp];
    const ag = {
      i, set: i % nv, li: Math.floor(i / nv), area, path: gr?.path ?? o.path, x: 0, y: 0, z: 0, heading: R() * Math.PI * 2, speed: 0, maxSpeed: R.range(s0, s1),
      phase: R() * 6.28, idle: R.range(0, 1), target: null, s: R(), scale: this.scale * R.range(0.92, 1.08), u: 0, lane: R.range(-1, 1) * o.spread, state: {},
    };
    ag.baseSpeed = ag.maxSpeed;
    const beh = o.behavior;
    if (beh === 'path' && ag.path) {
      ag.u = (gr ? gr.k / gr.n : i / o.count) * this._pathLen(ag.path);
      const [x, z, hd, py] = this._pathAt(ag.path, ag.u);
      Object.assign(ag, { x, z, heading: hd, y: py ?? this._h(x, z, 0) });
    } else if (beh === 'circle' || beh === 'flock') {
      ag.center = gr?.center ?? o.center ?? [0, 30, 0];
      ag.radius = (gr?.radius ?? o.radius ?? 20) * R.range(0.7, 1.15); ag.alt = ag.center[1] + R.range(-4, 4); ag.ang = R() * Math.PI * 2; ag.dir = beh === 'flock' ? 1 : R.sign();
      this._step(ag, 0, 0);
    } else if (beh === 'follow') {
      const [tx, tz] = this._targetPos(0) ?? [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
      const gap = this._gap() * (i + 1);
      ag.x = tx - Math.sin(ag.heading) * gap; ag.z = tz - Math.cos(ag.heading) * gap;
      ag.y = this._h(ag.x, ag.z, 0);
    } else {
      const g = this.ground;
      if (g && !rg.fly && o.region !== 'any') ag.region = this._mainRegion(area);
      for (let k = 0; k < 200; k++) {
        ag.x = R.range(a0[0], a1[0]); ag.z = R.range(a0[1], a1[1]);
        if (this._walkable(ag, ag.x, ag.z)) break;
      }
      ag.y = this._h(ag.x, ag.z, 0);
    }
    if (rg.fly && beh !== 'flock' && beh !== 'circle') { const al = o.altitude ?? [3, 8]; ag.alt = R.range(al[0], al[1]); ag.y += ag.alt; }
    return ag;
  }

  _mainRegion(area) {
    const k = area.flat().join();
    this._regions ??= new Map();
    if (!this._regions.has(k)) this._regions.set(k, this.ground.mainRegion(area));
    return this._regions.get(k);
  }
  // can this agent stand at (x, z)? (inside its connected region when it has one)
  _walkable(ag, x, z) {
    const g = this.ground;
    if (!g || this.rigs[ag.set].fly) return true;
    return ag.region ? g.region(x, z) === ag.region : g.ok(x, z);
  }
  _h(x, z, fallback) { const h = this.ground?.at(x, z); return h == null || h === -Infinity ? fallback : h; }
  _gap() { return this.o.spacing ?? Math.max(1.5, this.rig.size[2] * this.scale * 1.15); }
  _targetPos(t) {
    const tg = this.o.target;
    if (!tg) return null;
    if (typeof tg === 'function') return tg(t);
    if (Array.isArray(tg)) return tg;
    if (tg instanceof Actors) return [tg.agents[0].x, tg.agents[0].z];
    if (tg.isObject3D) { tg.getWorldPosition(_v); return [_v.x, _v.z]; }
    return [tg.x, tg.z];
  }

  _pathLen(p) {
    this._plen ??= new Map();
    if (this._plen.has(p)) return this._plen.get(p);
    let L = 0;
    for (let i = 0; i < p.length - (this.o.loop ? 0 : 1); i++) { const a = p[i], b = p[(i + 1) % p.length]; L += Math.hypot(b[0] - a[0], zOf(b) - zOf(a)); }
    this._plen.set(p, L);
    return L;
  }
  _pathAt(p, u) {
    const L = this._pathLen(p), loop = this.o.loop;
    let d = loop ? ((u % L) + L) % L : Math.min(Math.max(u, 0), L);
    const segs = p.length - (loop ? 0 : 1);
    for (let i = 0; i < segs; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const s = Math.hypot(b[0] - a[0], zOf(b) - zOf(a));
      if (d <= s || i === segs - 1) {
        const t = s ? Math.min(1, d / s) : 0;
        return [a[0] + (b[0] - a[0]) * t, zOf(a) + (zOf(b) - zOf(a)) * t, Math.atan2(b[0] - a[0], zOf(b) - zOf(a)), a.length > 2 ? a[1] + (b[1] - a[1]) * t : null];
      }
      d -= s;
    }
    return [p[0][0], zOf(p[0]), 0, null];
  }

  _step(ag, dt, t) {
    const o = this.o, g = this.ground, R = this.R, rg = this.rigs[ag.set];
    const beh = o.behavior;
    if (typeof beh === 'function') { beh(ag, dt, t, this); return; }
    if (beh === 'still') { ag.speed = 0; return; }
    if (beh === 'path') {
      ag.speed = ag.maxSpeed; ag.u += ag.speed * dt;
      const [x, z, hd, py] = this._pathAt(ag.path, ag.u);
      ag.heading = turn(ag.heading, hd, dt * 8);
      ag.x = x + Math.cos(hd) * ag.lane; ag.z = z - Math.sin(hd) * ag.lane;
      ag.y = py ?? damp(ag.y, this._h(ag.x, ag.z, ag.y), dt * 12);
      return;
    }
    if (beh === 'circle' || beh === 'flock') {
      const c = ag.center;
      ag.speed = ag.maxSpeed;
      ag.ang += (ag.dir * ag.speed * dt) / ag.radius;
      const wob = Math.sin(t * 0.7 + ag.s * 20) * (beh === 'flock' ? 3 : 0.5);
      ag.x = c[0] + Math.cos(ag.ang) * (ag.radius + wob); ag.z = c[2] + Math.sin(ag.ang) * (ag.radius + wob);
      ag.y = ag.alt + Math.sin(t * 1.3 + ag.s * 9) * 1.5;
      ag.heading = Math.atan2(-Math.sin(ag.ang) * ag.dir, Math.cos(ag.ang) * ag.dir);
      return;
    }
    if (beh === 'follow') {
      const lead = ag.i === 0 ? this._targetPos(t) : [this.agents[ag.i - 1].x, this.agents[ag.i - 1].z];
      if (!lead) { ag.speed = 0; return; }
      const dx = lead[0] - ag.x, dz = lead[1] - ag.z, d = Math.hypot(dx, dz), gap = this._gap();
      if (d > gap) ag.heading = turn(ag.heading, Math.atan2(dx, dz), dt * 6);
      ag.speed = damp(ag.speed, d > gap ? Math.min(ag.maxSpeed * 2.5, (d - gap) * 3) : 0, dt * 6);
      this._move(ag, dt, false, t);
      return;
    }
    // wander
    if (ag.idle > 0) { ag.idle -= dt; ag.speed = damp(ag.speed, 0, dt * 8); return; }
    const [a0, a1] = ag.area;
    if (!ag.target) {
      for (let k = 0; k < 12; k++) {
        const tx = R.range(a0[0], a1[0]), tz = R.range(a0[1], a1[1]);
        if (Math.hypot(tx - ag.x, tz - ag.z) > 40 && k < 8) continue; // prefer nearby targets
        if (this._walkable(ag, tx, tz)) { ag.target = [tx, tz]; break; }
      }
      if (!ag.target) { ag.idle = 1; return; }
      ag.maxSpeed = ag.baseSpeed * (R.chance(o.sprint ?? rg.sprint) ? 2.2 : 1);
    }
    const dx = ag.target[0] - ag.x, dz = ag.target[1] - ag.z, dist = Math.hypot(dx, dz);
    if (dist < 0.8) { ag.target = null; ag.idle = R.range(this.idle[0], this.idle[1]); return; }
    ag.heading = turn(ag.heading, Math.atan2(dx, dz), dt * 5);
    ag.speed = damp(ag.speed, ag.maxSpeed * Math.min(1, dist / 2), dt * 4);
    if (!this._move(ag, dt, !rg.fly, t)) { ag.target = null; ag.heading += Math.PI * R.range(0.5, 1.5); }
  }

  // move along heading; blocked by cliffs/water/walls → false
  _move(ag, dt, block, t) {
    const g = this.ground;
    const nx = ag.x + Math.sin(ag.heading) * ag.speed * dt, nz = ag.z + Math.cos(ag.heading) * ag.speed * dt;
    if (this.rigs[ag.set].fly) { // hover ag.alt above the ground, gently bobbing
      const h = this._h(nx, nz, 0);
      ag.y = damp(ag.y, Math.max(h, 0) + ag.alt + Math.sin(t * 2.3 + ag.s * 17) * 0.8, dt * 3);
    } else if (g) {
      const h = g.at(nx, nz);
      if (block && (!this._walkable(ag, nx, nz) || Math.abs(h - g.at(ag.x, ag.z)) > this.o.maxStep + 0.01)) return false;
      if (h !== -Infinity) ag.y = damp(ag.y, h, dt * 14);
    }
    ag.x = nx; ag.z = nz;
    return true;
  }

  /** Advance the simulation by dt (the stage calls this; under a frozen clock it replays deterministically). */
  step(dt, t) {
    for (const ag of this.agents) {
      this._step(ag, dt, t);
      ag.phase += (ag.speed * dt * Math.PI * 2) / (this.rigs[ag.set].stride * ag.scale);
    }
  }

  /** Write instance matrices for time t. */
  pose(t) {
    for (const ag of this.agents) this._pose(ag, t);
    for (const s of this.sets) { s.mesh.instanceMatrix.needsUpdate = true; s.rigTex.needsUpdate = true; s.uniforms.uMat.value = s.rig.palette.texture(); }
    if (this.blob) this.blob.instanceMatrix.needsUpdate = true;
    if (this.shadow === true && (this.stage.look?.sun?.update ?? 'always') !== 'always') this.stage._shadowDirty = true;
  }

  _pose(ag, t) {
    const set = this.sets[ag.set], r = set.rig, A = r.anim, c = r.center;
    const moving = Math.min(1, ag.speed / Math.max(ag.baseSpeed * 0.5, 0.01));
    const sw = Math.sin(ag.phase);
    const bob = r.fly ? 0 : r.swim ? Math.sin(t * 2 + ag.s * 9) * 0.08 : Math.abs(sw) * A.bob * moving;
    _m.compose(_v.set(ag.x, ag.y + (this.lift + bob) * ag.scale, ag.z), _q.setFromAxisAngle(_y, ag.heading), _s.setScalar(ag.scale));
    _m.multiply(_t.makeTranslation(-c[0], 0, -c[2]));
    set.mesh.setMatrixAt(ag.li, _m);
    const D = set.rigTex.image.data, base = ag.li * set.stride * 4;
    const flap = r.fly ? Math.sin(t * A.flapSpeed + ag.s * 6) * (A.glide ? Math.max(0, Math.sin(t * 0.8 + ag.s * 13) * (1 + A.glide) - A.glide) : 1) : 0;
    for (let pi = 0; pi < r.parts.length; pi++) {
      const part = r.parts[pi];
      let rx = 0, ry = 0, rz = 0;
      const role = part.role ?? 'static', side = part.side ?? 1;
      if (role === 'leg') rx = sw * A.legSwing * moving * (part.pair ? -1 : 1) * side;
      else if (role === 'arm') rx = -sw * A.armSwing * moving * side;
      else if (role === 'tail') { ry = Math.sin(t * (A.tailSpeed ?? 2.2) + ag.s * 10) * A.tailSway * (1 - 0.4 * moving); rx = (A.tailLift ?? -0.15) * moving; }
      else if (role === 'head') {
        rx = Math.sin(ag.phase * 2) * A.headNod * moving + (A.graze ?? 0) * (1 - moving) * (0.75 + 0.25 * Math.sin(t * 0.9 + ag.s * 5));
        ry = (1 - moving) * Math.sin(t * 0.6 + ag.s * 30) * 0.5 * (A.graze ? 0.4 : 1);
      }
      else if (role === 'wing') rz = flap * A.flap * side;
      else if (role === 'fin') ry = Math.sin(t * 6 + ag.s * 6) * 0.4 * (0.4 + 0.6 * moving);
      if (part.animate) ({ rx = rx, ry = ry, rz = rz } = part.animate({ t, agent: ag, moving, phase: ag.phase, rx, ry, rz }) ?? {});
      if (rx || ry || rz) {
        // rotate about the pivot: R with translation pv - R·pv
        const pv = part.pivot ?? [0, 0, 0];
        _r.makeRotationFromEuler(_e.set(rx, ry, rz));
        _v.set(pv[0], pv[1], pv[2]).applyMatrix4(_r);
        _r.setPosition(pv[0] - _v.x, pv[1] - _v.y, pv[2] - _v.z);
      } else _r.identity();
      // rows of the rig-space part matrix → 3 texels (the vertex shader rebuilds it, see material.js RIG_PARS)
      const e = _r.elements, o = base + pi * 12;
      D[o] = e[0]; D[o + 1] = e[4]; D[o + 2] = e[8]; D[o + 3] = e[12];
      D[o + 4] = e[1]; D[o + 5] = e[5]; D[o + 6] = e[9]; D[o + 7] = e[13];
      D[o + 8] = e[2]; D[o + 9] = e[6]; D[o + 10] = e[10]; D[o + 11] = e[14];
    }
    if (this.blob) {
      const w = Math.max(r.size[0], r.size[2] * 0.7) * ag.scale * 0.75;
      _o.compose(_v.set(ag.x, (this.ground ? this._h(ag.x, ag.z, ag.y) : ag.y) + 0.04, ag.z), _q.setFromAxisAngle(_y, ag.heading), _s.set(w * (r.size[0] / Math.max(r.size[0], r.size[2])) + 0.4, 1, r.size[2] * ag.scale * 0.6 + 0.4));
      this.blob.setMatrixAt(ag.i, _o);
    }
  }

  dispose() {
    this.object.removeFromParent();
    for (const s of this.sets) { s.mesh.geometry.dispose(); s.mat.dispose(); s.depth.dispose(); s.rigTex.dispose(); }
    if (this.blob) { this.blob.geometry.dispose(); this.blob.material.dispose(); }
    const list = this.stage.actorSystems;
    if (list) list.splice(list.indexOf(this), 1);
  }
}

// all parts of a rig → one geometry with a per-vertex part index (aPart)
function mergeParts(rg) {
  const arrs = rg.parts.map((p) => buildMesh(p.grid, rg.palette, { greedy: true, arrays: true }).solid);
  let nv = 0, ni = 0;
  for (const a of arrs) if (a) { nv += a.pos.length / 4; ni += a.index.length; }
  const pos = new Int16Array(nv * 4), info = new Uint8Array(nv * 4), edge = new Uint8Array(nv * 4), part = new Uint8Array(nv);
  const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let v = 0, k = 0;
  arrs.forEach((a, pi) => {
    if (!a) return;
    const n = a.pos.length / 4;
    pos.set(a.pos, v * 4); info.set(a.info, v * 4); edge.set(a.edge, v * 4); part.fill(pi, v, v + n);
    for (let i = 0; i < a.index.length; i++) index[k + i] = a.index[i] + v;
    v += n; k += a.index.length;
  });
  const geo = geometryFromArrays({ pos, info, edge, index, light: null });
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  return geo;
}

// soft contact shadow blob (cheap alternative to shadow-map shadows)
let blobTex = null;
function makeBlobs(n) {
  if (!blobTex) {
    const S = 32, d = new Uint8Array(S * S * 4);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = Math.hypot((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5) * 2;
      const a = Math.max(0, 1 - r) ** 1.6;
      d.set([0, 0, 0, Math.round(a * 255)], (y * S + x) * 4);
    }
    blobTex = new THREE.DataTexture(d, S, S);
    blobTex.magFilter = blobTex.minFilter = THREE.LinearFilter;
    blobTex.needsUpdate = true;
  }
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.45, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false; m.renderOrder = 1; m.name = 'blob-shadows';
  return m;
}

const zOf = (p) => (p.length > 2 ? p[2] : p[1]);
function pathBox(p) {
  const xs = p.map((q) => q[0]), zs = p.map(zOf);
  return [[Math.min(...xs) - 3, Math.min(...zs) - 3], [Math.max(...xs) + 3, Math.max(...zs) + 3]];
}
const damp = (a, b, k) => a + (b - a) * Math.min(1, k);
function turn(a, b, k) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, k);
}
