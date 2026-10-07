// Sun shadow map with a static cache. The 4096² shadow pass re-rasterized the whole scene every frame;
// now still geometry is rendered into a cached depth map only when it changes (models added/moved for
// the first time, look/sun/layout changes), and each frame the cache is blitted into the live map and only
// the moving casters (actors, animated models, swaying leaves) are drawn on top — and only inside their
// texel rectangle (plus last update's, to erase where they were), so a walking cat restores a few
// thousand texels instead of the whole 4096² map. Face-direction culling
// draws only faces pointing away from the sun (what three renders into shadow maps).
//
// sun.update (look): 'always' (default) — moving casters every frame; N — every N frames;
// 'static' — swaying leaves keep their rest shadow (cheapest for big forests), other movers still update.
//
// three only renders shadow maps inside renderer.render(), so this hooks renderer.shadowMap.render: the
// stage sets `pending` once per frame and the first render call of the frame (reflection or main pass)
// runs update() in place of three's own shadow pass.
import * as THREE from './three.js';
import { faceMask, setFaceGroups, useFaceGroups, bucketQuads } from './cull.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _box = new THREE.Box3(), _tmp = new THREE.Box3(), _v4 = new THREE.Vector4();

export class SunShadows {
  constructor(stage) {
    this.stage = stage;
    this.cache = null;
    this.dirty = true;
    this.pending = false;
    this.changed = false;
    this.key = 0;
    this.n = 0;
    this.stats = { still: 0, moving: 0, renders: 0 };
    const sm = stage.renderer.shadowMap, orig = sm.render.bind(sm);
    this._orig = orig;
    sm.autoUpdate = false;
    // shadow casters are picked by camera layers: every layer (particles live on their own)
    this.layersCam = new THREE.Camera();
    this.layersCam.layers.enableAll();
    sm.render = (lights, scene) => {
      if (!this.pending || scene !== stage.scene) return;
      this.pending = false;
      this.changed = this.update(this.layersCam);
    };
  }

  invalidate() { this.dirty = true; }

  dispose() {
    this.cache?.dispose();
    this.cache = null;
    this.dirty = true;
  }

  /** Bring the shadow maps up to date for this frame. Returns true if any map changed. */
  update(camera) {
    const s = this.stage, r = s.renderer, sm = r.shadowMap, sun = s.sun;
    if (!sm.enabled) return false;
    this.camera = camera;
    const U = s.look.sun.update ?? 'always';
    const wind = U !== 'static' && s.uniforms.uWind.value.z > 0 && s.uniforms.uWind.value.w > 0;
    const still = [], moving = [], others = [];
    let key = wind ? 1 : 2;
    s.scene.traverseVisible((o) => {
      if (o.isLight) { if (o.castShadow && o !== sun) others.push(o); return; }
      if (!o.castShadow || !(o.isMesh || o.isPoints || o.isLine)) return;
      const model = o.userData.voxelModel, geo = o.geometry;
      if (model && geo.userData.ranges && !model.moving) {
        const sway = wind && (geo.userData.swayQuads ??= bucketQuads(geo, 'sway')) > 0;
        still.push(o, sway ? 'still' : 'all');
        if (sway) moving.push(o, 'sway');
        key = (Math.imul(key, 31) + o.id * 2 + (sway ? 1 : 0)) | 0;
      } else moving.push(o, model ? 'all' : null);
    });
    if (key !== this.key) { this.key = key; this.dirty = true; }
    let changed = false;
    if (sun.castShadow && sun.visible) {
      _a.setFromMatrixPosition(sun.matrixWorld);
      _b.setFromMatrixPosition(sun.target.matrixWorld);
      const dir = _b.sub(_a).normalize();
      const groups = (list) => { for (let i = 0; i < list.length; i += 2) if (list[i + 1]) setFaceGroups(list[i], faceMask(list[i], { dir, back: true }), list[i + 1], 'shadow'); };
      const due = moving.length && (typeof U === 'number' ? this.n++ % Math.max(1, Math.round(U)) === 0 : true);
      if (!moving.length) {
        this.cache?.dispose(); this.cache = null;
        if (this.dirty) { groups(still); this._draw([sun], still); changed = true; }
      } else {
        const fresh = this.dirty;
        if (fresh) {
          const size = sun.shadow.mapSize;
          if (!this.cache || this.cache.width !== size.x || this.cache.height !== size.y) { this.cache?.dispose(); this.cache = depthTarget(size.x, size.y); }
          groups(still);
          const live = sun.shadow.map;
          sun.shadow.map = this.cache;
          try { this._draw([sun], still); } finally { sun.shadow.map = live; }
        }
        if (due || fresh) {
          // only the texels the movers cover now or covered last time need restoring + redrawing
          const now = this._region(moving);
          const rect = fresh || !now || !this.prev ? null : unionRect(now, this.prev);
          this.prev = now;
          groups(moving);
          this._draw([sun], moving, this.cache, rect);
          changed = true;
        }
      }
      this.stats = { still: still.length / 2, moving: moving.length / 2, renders: this.stats.renders + (changed ? 1 : 0) };
    }
    // point/spot light shadows: no cache, whole scene, all faces (rare in pieces)
    if (others.length && (this.dirty || moving.length)) {
      for (let i = 0; i < still.length; i += 2) setFaceGroups(still[i], undefined, 'all', 'shadow');
      for (let i = 0; i < moving.length; i += 2) if (moving[i + 1]) setFaceGroups(moving[i], undefined, 'all', 'shadow');
      sm.needsUpdate = true;
      this._orig(others, s.scene, camera);
      changed = true;
    }
    // back to the camera's draw groups (picking raycasts use geometry.groups)
    for (let i = 0; i < still.length; i += 2) useFaceGroups(still[i]);
    for (let i = 0; i < moving.length; i += 2) useFaceGroups(moving[i]);
    this.dirty = false;
    sm.needsUpdate = false;
    return changed;
  }

  // texel rect [x0, y0, x1, y1] of the sun shadow map covering the moving casters, or null (unknown bounds)
  _region(moving) {
    const s = this.stage, sh = s.sun.shadow, cam = sh.camera, size = sh.mapSize;
    sh.updateMatrices(s.sun);
    _box.makeEmpty();
    for (let i = 0; i < moving.length; i += 2) {
      const o = moving[i], part = moving[i + 1];
      if (part === 'sway' && !o.isInstancedMesh) {
        const b = o.geometry.userData.boxes?.sway;
        if (!b) return null;
        for (let k = 0; k < b.length; k += 6) {
          _tmp.min.set(b[k], b[k + 1], b[k + 2]); _tmp.max.set(b[k + 3], b[k + 4], b[k + 5]);
          _box.union(_tmp.expandByScalar(0.5).applyMatrix4(o.matrixWorld));
        }
        continue;
      }
      const ps = s.particleSystems.find((p) => p.object === o);
      if (ps) {
        const u = ps.uniforms, pad = (u.uSize.value ?? 0.5) * 2 + 1;
        _tmp.min.copy(u.uBoxMin.value); _tmp.max.copy(u.uBoxMin.value).add(u.uBoxSize.value);
        _box.union(_tmp.expandByScalar(pad));
        continue;
      }
      if (o.isInstancedMesh) o.computeBoundingBox();
      const bb = o.isInstancedMesh ? o.boundingBox : (o.geometry.boundingBox ?? (o.geometry.computeBoundingBox(), o.geometry.boundingBox));
      if (!bb || bb.isEmpty() || !o.isMesh) return null;
      _box.union(_tmp.copy(bb).applyMatrix4(o.matrixWorld).expandByScalar(1)); // legs, tails, vertex hooks
    }
    if (_box.isEmpty()) return [0, 0, 0, 0];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      _a.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).project(cam);
      const x = (_a.x * 0.5 + 0.5) * size.x, y = (_a.y * 0.5 + 0.5) * size.y;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return [Math.max(0, Math.floor(x0) - 2), Math.max(0, Math.floor(y0) - 2), Math.min(size.x, Math.ceil(x1) + 2), Math.min(size.y, Math.ceil(y1) + 2)];
  }

  // render `lights`' shadow maps with only the casters in `list` (pairs [object, part]); `base`: a depth
  // target blitted into the map instead of clearing it
  _draw(lights, list, base = null, rect = null) {
    const s = this.stage, r = s.renderer, sm = r.shadowMap;
    const keep = new Set();
    for (let i = 0; i < list.length; i += 2) keep.add(list[i]);
    const off = [];
    s.scene.traverse((o) => { if (o.castShadow && !o.isLight && !keep.has(o)) { o.castShadow = false; off.push(o); } });
    const clear = r.clear;
    if (base) r.clear = function (...args) {
      if (r.getRenderTarget() !== lights[0].shadow.map) return clear.apply(this, args);
      blitDepth(r, base, lights[0].shadow.map, rect);
      // three resets the scissor when it leaves the shadow pass (setRenderTarget)
      if (rect) { r.state.setScissorTest(true); r.state.scissor(_v4.set(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1])); }
    };
    try {
      sm.needsUpdate = true;
      this._orig(lights, s.scene, this.camera);
    } finally {
      if (base) r.clear = clear;
      for (const o of off) o.castShadow = true;
      sm.needsUpdate = false;
    }
  }
}

// same layout three gives a PCF shadow map (so depth blits between them are format-compatible)
function depthTarget(w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h);
  rt.depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
  rt.depthTexture.format = THREE.DepthFormat;
  rt.depthTexture.compareFunction = THREE.LessEqualCompare;
  rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.LinearFilter;
  return rt;
}

function blitDepth(r, src, dst, rect = null) {
  const gl = r.getContext(), st = r.state, P = r.properties;
  const [x0, y0, x1, y1] = rect ?? [0, 0, src.width, src.height];
  st.bindFramebuffer(gl.READ_FRAMEBUFFER, P.get(src).__webglFramebuffer);
  st.bindFramebuffer(gl.DRAW_FRAMEBUFFER, P.get(dst).__webglFramebuffer);
  st.buffers.depth.setMask(true);
  gl.blitFramebuffer(x0, y0, x1, y1, x0, y0, x1, y1, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  st.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
}

const unionRect = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
