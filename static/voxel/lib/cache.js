// Render cache: draw only what changed. Most of the time a piece just sits there with a cat walking, a fire
// flickering and some fireflies, so redrawing every pixel of the scene 60 times a second is wasted work.
// Each frame the stage asks plan() what changed since the last one:
//
//   'skip'    nothing (or nothing visible) → no GPU work at all; the canvas keeps the last frame
//   'post'    only composited layers changed (particles move, a light's brightness/color flickers, stars
//             twinkle) → particle layer + bloom + composite, no scene pass
//   'partial' small things moved → the scene target is redrawn only inside screen rectangles around them
//             (and around their sun shadows), each through a sub-frustum camera that culls everything else
//   'full'    the camera moved / the scene changed structurally / too much changed → everything
//
// What counts as a change: camera/projection/size, models added/removed/moved (old + new bounds), actors,
// swaying (wind) / flickering / rippling voxels (their bounds come from the mesher), time-dependent GLSL
// hooks, shadow-casting particles, palette edits, look changes, any other object whose transform or
// visibility changed, and lights. A light whose only change is intensity/color becomes a "light layer":
// the scene is rendered once with only that light (at intensity 1) and the composite adds it back scaled
// by its current color × intensity — lighting is linear, so a flickering fire costs no scene redraw.
// A shadowless point/spot light that also jiggles in place (a fire's dancing light) gets 3 more layers:
// d(image)/d(position) along x, y, z (finite differences), so the composite adds the first-order change
// for its current offset — exact to well under a percent for jitters of a voxel or so. A light that wanders
// further than JITTER from where its layers were drawn is "roaming": plain full redraws from then on.
// Anything this can't see (a uniform or material changed by your own code): call stage.invalidate().
import * as THREE from './three.js';
import { MAX_LIGHT_LAYERS } from './post.js';

export const PARTICLE_LAYER = 1;
export const JITTER = 1.5;   // max light offset (voxels) the gradient layers cover
export const GRAD_STEP = 0.5; // finite-difference step (voxels)

const _v = new THREE.Vector3(), _box = new THREE.Box3(), _b2 = new THREE.Box3(), _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _sun = new THREE.Vector3();
const CORNERS = 8;

export class RenderCache {
  constructor(stage) {
    this.stage = stage;
    this.valid = false;     // the scene target (+ light layers) hold the current cached scene
    this.layered = [];      // light layers: { light, layers: 1 | 4 (+ position gradient), p0 (local position they were drawn at) }
    this.roaming = new Set(); // lights that move too much to be layered
    this.factors = [];      // last composited layer factors (THREE.Color per layer)
    this.lights = new Map(); // light → state snapshot
    this.items = new Map(); // key → { box: Box3 (last world bounds), sig }
    this.cam = new Float64Array(34);
    this.size = [0, 0];
    this.stats = { mode: 'full', rects: 0, coverage: 1, layers: 0 };
    this.noLayers = false;  // a model's GLSL hooks make lighting non-linear (cel shading…)
  }

  /** Forget everything: the next frame is drawn in full. */
  invalidate() { this.valid = false; }

  /**
   * What to draw this frame → { mode: 'full' | 'partial' | 'post' | 'skip', rects, seed, layers }.
   * mode 'full' with seed: draw the light layers + cached scene from scratch (camera at rest).
   */
  plan() {
    const s = this.stage;
    const cameraMoved = this._cameraChanged();
    const lights = this._lightChanges();
    const dirty = s._sceneDirty || s.cache === false;
    s._sceneDirty = false;
    let structural = cameraMoved || dirty || lights.structural;
    this.reason = cameraMoved ? 'camera' : dirty ? 'dirty' : lights.structural ? 'lights' : '';
    // lights whose intensity/color (and maybe position, a little) animate become light layers — promoted
    // only on otherwise quiet frames, so a one-off look change doesn't turn the sun into a layer
    for (const [l, moved] of [...lights.factor.map((l) => [l, false]), ...lights.move.map((l) => [l, true])]) {
      const e = this.layered.find((x) => x.light === l);
      if (e && moved && e.p0 && l.position.distanceTo(e.p0) > JITTER) { this.roaming.add(l); this.layered.splice(this.layered.indexOf(e), 1); this.valid = false; structural = true; this.reason = 'roaming light'; continue; }
      if (e && (!moved || e.layers === 4)) continue; // the composite handles it
      structural = true;
      const ok = !cameraMoved && !dirty && !this.noLayers && !this.roaming.has(l) && !l.isHemisphereLight && (!moved || ((l.isPointLight || l.isSpotLight) && !l.castShadow));
      const need = moved ? 4 : 1, used = this.layerCount() - (e?.layers ?? 0);
      if (!ok || used + need > MAX_LIGHT_LAYERS) { if (moved && !cameraMoved && !dirty) this.roaming.add(l); continue; }
      if (e) e.layers = 4; else this.layered.push({ light: l, layers: need, p0: null });
      this.valid = false;
      this.reason = 'new light layer';
    }
    // what changed on screen (always tracked, so item bounds stay current)
    const rects = cameraMoved || dirty ? null : this._rects();
    const W = s.post.w, H = s.post.h;
    let area = 0;
    for (const r of rects ?? []) area += r.w * r.h;
    const coverage = rects ? area / (W * H) : 1;
    // cost of a partial frame relative to a full one: light layers multiply every redrawn pixel. Smoothed,
    // to decide whether (re)seeding the cache will pay off
    const cost = coverage * (1 + this.layerCount());
    if (rects) this.cost = this.cost == null ? cost : this.cost * 0.7 + cost * 0.3;
    const worth = (this.cost ?? 0) < 0.6;
    // full frames: 'plain' (one pass with everything — particles and every light baked in, nothing cached)
    // while the camera moves or when too much changes anyway; at rest a 'seed' (light layers + base scene
    // without particles) that the next frames redraw partially
    let mode, seed = false;
    if (cameraMoved || !worth || (!structural && this.valid && cost > 0.6)) {
      mode = 'full';
      if (!cameraMoved && this.reason === '') this.reason = 'too much changed';
    } else if (structural || !this.valid) {
      mode = 'full'; seed = true;
      if (!this.reason) this.reason = 'invalid';
    } else mode = rects.length ? 'partial' : 'post';
    if (mode === 'post' && !this._postNeeded(lights.factor.length + lights.move.length > 0)) mode = 'skip';
    this.stats = { mode, rects: rects?.length ?? 0, coverage: Math.round(coverage * 1000) / 1000, layers: this.layerCount(), seed, cost: Math.round((this.cost ?? 0) * 100) / 100 };
    return { mode, rects: mode === 'partial' ? rects : null, seed, cameraMoved };
  }

  layerCount() { return this.layered.reduce((n, x) => n + x.layers, 0); }

  /** After drawing: only a seed leaves a cache that partial frames can build on. */
  drawn(plan) {
    if (plan.mode === 'full') this.valid = plan.seed;
  }

  // composited-only animation: particles, layer factors, twinkling stars
  _postNeeded(factorChanged) {
    const s = this.stage;
    if (factorChanged) return true;
    if (s.particleSystems.some((p) => p.object.visible)) return true;
    const st = s.look.background.stars;
    return !!(st && (typeof st === 'object' ? st.amount : st));
  }

  // ---- change detection ----------------------------------------------------------------------------

  _cameraChanged() {
    const s = this.stage, c = s.camera, a = this.cam;
    c.updateMatrixWorld();
    let changed = this.size[0] !== s.post.w || this.size[1] !== s.post.h;
    this.size[0] = s.post.w; this.size[1] = s.post.h;
    const e1 = c.matrixWorld.elements, e2 = c.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) { if (a[i] !== e1[i]) { changed = true; a[i] = e1[i]; } if (a[16 + i] !== e2[i]) { changed = true; a[16 + i] = e2[i]; } }
    const env = s.scene.environmentIntensity, envId = s.scene.environment?.id ?? -1;
    if (a[32] !== env || a[33] !== envId) { changed = true; a[32] = env; a[33] = envId; }
    // shared voxel uniforms (pieces may animate e.g. uLook.x, the emissive multiplier, directly)
    const u = s.uniforms, us = (this.uni ??= new Float64Array(24));
    let k = 0;
    for (const name of ['uAO', 'uBevel', 'uLook', 'uWind', 'uWater']) { const v = u[name].value; for (const c of ['x', 'y', 'z', 'w']) { if (us[k] !== v[c]) { changed = true; us[k] = v[c]; } k++; } }
    if (us[k] !== u.uSeed.value) { changed = true; us[k] = u.uSeed.value; }
    return changed;
  }

  _lightChanges() {
    const s = this.stage, seen = new Set(), factor = [], move = [];
    let structural = false;
    s.scene.traverseVisible((l) => {
      if (!l.isLight) return;
      seen.add(l);
      const st = lightState(l), prev = this.lights.get(l);
      this.lights.set(l, st);
      l.layers.enable(PARTICLE_LAYER); // lit particles see every light
      if (!prev) { structural = true; return; }
      for (let i = 7; i < st.length; i++) if (st[i] !== prev[i]) { structural = true; return; }
      if (st[4] !== prev[4] || st[5] !== prev[5] || st[6] !== prev[6]) move.push(l);
      else if (st[0] !== prev[0] || st[1] !== prev[1] || st[2] !== prev[2] || st[3] !== prev[3]) factor.push(l);
    });
    for (const l of [...this.lights.keys()]) if (!seen.has(l)) { this.lights.delete(l); structural = true; }
    for (const e of [...this.layered]) if (!seen.has(e.light)) { this.layered.splice(this.layered.indexOf(e), 1); structural = true; }
    return { structural, factor, move };
  }

  /** Screen rectangles (render-target pixels, bottom-left origin) covering everything that changed. */
  _rects() {
    const s = this.stage, out = [], seen = new Set();
    const sunCasts = s.sun.visible && s.sun.castShadow && s.renderer.shadowMap.enabled;
    _a.setFromMatrixPosition(s.sun.matrixWorld); _b.setFromMatrixPosition(s.sun.target.matrixWorld);
    const sun = _sun.subVectors(_b, _a).normalize();
    const U = s.look.sun.update ?? 'always';
    const wind = s.uniforms.uWind.value.z > 0 && s.uniforms.uWind.value.w > 0;
    const water = s.uniforms.uWater.value.z > 0 && s.uniforms.uWater.value.y > 0;
    const why = (this.why = []); // debugging: [source, rect]
    let src = '';
    const add = (box, shadow, emissiveOnly = false) => { const r = this._project(box, shadow && sunCasts ? sun : null); if (r) { r.emissive = emissiveOnly; out.push(r); why.push([src, r.w * r.h]); } };
    const track = (key, box, sig, shadow) => {
      // an item that moved: redraw where it was and where it is
      seen.add(key);
      const it = this.items.get(key);
      if (!it) { this.items.set(key, { box: box.clone(), sig }); return; }
      if (it.sig === sig) return;
      _b2.copy(it.box).union(box);
      add(_b2, shadow);
      it.box.copy(box); it.sig = sig;
    };
    // voxel models
    for (const m of s.models) {
      if (m.palette.version !== m._palVersion) { if (m._palVersion != null) s._sceneDirty = true; m._palVersion = m.palette.version; }
      const visible = m.group.visible && isVisible(m.group);
      const casts = m.meshes.some((x) => x.castShadow);
      _box.setFromObject(m.group);
      src = `model ${m.group.name}`;
      track(`m${m.group.id}`, _box, visible ? matrixSig(m.inner.matrixWorld) : 'hidden', casts);
      if (!visible) continue;
      if (m.timeHooks) add(_box, casts && m.moving);
      for (const mesh of m.meshes) {
        const bx = mesh.geometry.userData.boxes;
        if (!bx) continue;
        src = `anim ${m.group.name}`;
        if (wind && bx.sway) addBoxes(bx.sway, mesh.matrixWorld, 0.5, (b) => add(b, mesh.castShadow && U !== 'static'));
        if (bx.flicker) addBoxes(bx.flicker, mesh.matrixWorld, 0.05, (b) => add(b, false, true));
        if (water && bx.water) addBoxes(bx.water, mesh.matrixWorld, 0.05, (b) => add(b, false));
      }
    }
    // actors: every agent, every frame (legs, tails, heads move even when standing)
    for (const a of s.actorSystems) {
      if (!isVisible(a.object)) continue;
      const casts = a.sets.some((x) => x.mesh.castShadow);
      src = `actors ${a.object.name}`;
      for (const ag of a.agents) {
        const r = a.rigs[ag.set], sc = ag.scale, half = Math.max(r.size[0], r.size[2]) * sc * 0.75 + 1, top = (r.size[1] + 1.5) * sc + (a.lift ?? 0) + 1;
        _box.min.set(ag.x - half, ag.y - 1, ag.z - half); _box.max.set(ag.x + half, ag.y + top, ag.z + half);
        const key = `a${a.object.id}:${ag.i}`, it = this.items.get(key);
        if (it) { _b2.copy(it.box).union(_box); add(_b2, casts); it.box.copy(_box); } else this.items.set(key, { box: _box.clone() });
        seen.add(key);
      }
    }
    // particles live in their own layer; only their shadows touch the scene
    for (const p of s.particleSystems) {
      if (!p.object.castShadow || !isVisible(p.object)) continue;
      const u = p.uniforms, pad = (u.uSize.value ?? 0.5) * 2;
      src = 'particle shadows';
      _box.min.copy(u.uBoxMin.value).subScalar(pad); _box.max.copy(u.uBoxMin.value).add(u.uBoxSize.value).addScalar(pad);
      add(_box, true);
    }
    // anything else (addObject, stage.light targets…): transform / visibility changes
    const skip = new Set([...s.models.map((m) => m.group), ...s.particleSystems.map((p) => p.object), ...s.actorSystems.map((a) => a.object)]);
    for (const o of s.root.children) {
      if (skip.has(o) || o.isLight) continue;
      let sig = '', casts = false;
      o.traverse((c) => { sig += (c.visible ? '' : 'h') + matrixSig(c.matrixWorld) + ';'; casts ||= c.castShadow; });
      _box.setFromObject(o);
      src = `object ${o.name || o.type}`;
      if (_box.isEmpty()) _box.setFromCenterAndSize(_v.setFromMatrixPosition(o.matrixWorld), _a.set(1, 1, 1));
      track(`o${o.id}`, _box, sig, casts);
    }
    for (const k of [...this.items.keys()]) if (!seen.has(k)) { const it = this.items.get(k); this.items.delete(k); add(it.box, true); }
    // a glossy floor reflects everything (particles included): redraw it whenever anything moves
    const G = s.look.ground;
    if (G.reflect > 0 && G.type !== 'none' && (out.length || s.particleSystems.some((p) => p.object.visible && isVisible(p.object)))) {
      src = 'reflection';
      const c = s.ground.position, rr = (s.radius ?? 10) * (G.reflectFade ?? 1.3);
      _box.min.set(c.x - rr, c.y - 0.01, c.z - rr); _box.max.set(c.x + rr, c.y + 0.01, c.z + rr);
      add(_box, false);
    }
    // debugging: true union area of the raw rects (8px grid)
    if (this.debug) {
      const G = 8, gw = Math.ceil(s.post.w / G), gh = Math.ceil(s.post.h / G), m = new Uint8Array(gw * gh);
      for (const r of out) for (let y = Math.floor(r.y / G); y < Math.ceil((r.y + r.h) / G); y++) for (let x = Math.floor(r.x / G); x < Math.ceil((r.x + r.w) / G); x++) m[y * gw + x] = 1;
      this.union = m.reduce((a, b) => a + b, 0) / (gw * gh);
    }
    return mergeRects(out, s.post.w, s.post.h);
  }

  // world box (optionally swept along the sun direction down to the floor: where its shadow can fall) →
  // pixel rect, or null when off screen
  _project(box, sun) {
    const s = this.stage, cam = s.camera, W = s.post.w, H = s.post.h;
    if (box.isEmpty()) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let T = 0;
    if (sun) {
      const floor = s.bounds.min.y;
      T = sun.y < -0.05 ? Math.min((box.max.y - floor) / -sun.y, (s.radius ?? 10) * 6) : (s.radius ?? 10) * 6;
    }
    for (let k = 0; k < (sun ? 2 : 1); k++) for (let i = 0; i < CORNERS; i++) {
      _v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      if (k) _v.addScaledVector(sun, T);
      if (cam.isPerspectiveCamera) {
        _a.copy(_v).applyMatrix4(cam.matrixWorldInverse);
        if (_a.z > -cam.near) return { x: 0, y: 0, w: W, h: H }; // crosses the camera plane
      }
      _v.project(cam);
      const px = (_v.x * 0.5 + 0.5) * W, py = (_v.y * 0.5 + 0.5) * H;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2);
    x1 = Math.min(W, Math.ceil(x1) + 2); y1 = Math.min(H, Math.ceil(y1) + 2);
    if (x1 <= x0 || y1 <= y0) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
}

// state of a light: [intensity, r, g, b, | local position x, y, z, | structural fields…]
function lightState(l) {
  const t = l.target ? _b.setFromMatrixPosition(l.target.matrixWorld) : _b.set(0, 0, 0);
  const sh = l.shadow, pe = l.parent?.matrixWorld.elements;
  let parent = 0;
  if (pe) for (let i = 0; i < 16; i++) parent += pe[i] * (i + 1.37);
  return [l.intensity, l.color.r, l.color.g, l.color.b, l.position.x, l.position.y, l.position.z, parent, t.x, t.y, t.z,
    l.distance ?? 0, l.decay ?? 0, l.angle ?? 0, l.penumbra ?? 0, l.quaternion.x + l.quaternion.y * 3 + l.quaternion.z * 7 + l.quaternion.w * 11,
    l.castShadow ? 1 : 0, sh ? sh.bias + sh.normalBias * 7 + sh.radius * 13 + sh.mapSize.x : 0, l.groundColor ? l.groundColor.getHex() : 0];
}

function matrixSig(m) { return m.elements.join(','); }

function isVisible(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

// flat [x0,y0,z0,x1,y1,z1,…] mesh-space boxes (quad corner coordinates) → world boxes
function addBoxes(list, matrix, pad, fn) {
  for (let i = 0; i < list.length; i += 6) {
    _b2.min.set(list[i] - pad, list[i + 1] - pad, list[i + 2] - pad);
    _b2.max.set(list[i + 3] + pad, list[i + 4] + pad, list[i + 5] + pad);
    fn(_b2.applyMatrix4(matrix));
  }
}

/**
 * Merge overlapping / nearby rects (two draws cost more than one slightly bigger one) and cap the count —
 * every rect is a scene pass on the CPU side.
 */
export function mergeRects(rects, W, H, max = 6) {
  const out = rects.map((r) => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h, emissive: r.emissive }));
  const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
  const union = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), emissive: a.emissive && b.emissive });
  const slack = 64 * 64; // merging is free if it adds less than this much area
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) for (let j = i + 1; j < out.length; j++) {
      const u = union(out[i], out[j]);
      if (area(u) <= area(out[i]) + area(out[j]) + slack) { out[i] = u; out.splice(j, 1); merged = true; break; }
    }
  }
  while (out.length > max) {
    let best = null, bi = 0, bj = 1;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const u = union(out[i], out[j]), cost = area(u) - area(out[i]) - area(out[j]);
      if (!best || cost < best.cost) { best = { u, cost }; bi = i; bj = j; }
    }
    out[bi] = best.u; out.splice(bj, 1);
  }
  return out.map((r) => ({ x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0, emissive: r.emissive }));
}
