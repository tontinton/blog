// Moving around a big scene, not just orbiting it: camera: { pan: true } (stage.js calls setupNav).
//   mouse    drag: rotate · right-drag (or ⇧ / ctrl / ⌘ + drag): move · wheel: zoom toward the cursor · double-click: glide there
//   touch    one finger: rotate · two fingers: move + pinch zoom (toward the fingers) · double-tap: glide there
//   keys     W A S D: move (⇧ faster) · Q / E: turn · + / −: zoom · R / Home: the whole scene  (← / → stay with the tour)
// Panning slides the orbit target over a horizontal plane and "grabs the ground": vertical drags are scaled by the
// view's foreshortening, so the land under the finger stays under it. The target is kept inside the scene bounds
// (+ clamp, world units), so the world can't be lost off-screen.
//   pan: true | { keys: true, dblclick: true, clamp: 0, speed: 1 }
import * as THREE from './three.js';
import { flyTo } from './tour.js';

const MOVE = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
const TURN = { KeyQ: -1, KeyE: 1 };
const ZOOM = { Equal: 1, NumpadAdd: 1, Minus: -1, NumpadSubtract: -1 };

export function setupNav(stage, opts = true) {
  const o = { keys: true, dblclick: true, clamp: 0, speed: 1, ...(typeof opts === 'object' ? opts : {}) };
  const c = stage.controls, cam = stage.camera, el = stage.renderer.domElement;
  Object.assign(c, { enablePan: true, screenSpacePanning: false, zoomToCursor: true });
  // grab the ground: a vertical drag of d screen units is d / sin(elevation) units along the ground
  const panUp = c._panUp.bind(c);
  c._panUp = (d, m) => panUp(d / Math.max(0.35, Math.cos(c.getPolarAngle())), m);

  const held = new Set();
  const vel = new THREE.Vector2(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _d = new THREE.Vector3();
  let turn = 0, zoom = 0;
  const touch = () => { stage._fly = null; stage._interacted = stage._active = performance.now(); stage.ui?.interacted(); stage.wake(); };

  if (o.keys && !stage.shot) {
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyR' || e.code === 'Home') { // back to the whole scene
        touch();
        if (stage._tour) stage._tour.home();
        else flyTo(stage, stage._frame?.target?.toArray() ?? [0, 0, 0], { zoom: stage.camOpts.zoom ?? 1, yaw: stage.camOpts.yaw, pitch: stage.camOpts.pitch });
        return;
      }
      if (!(e.code in MOVE || e.code in TURN || e.code in ZOOM || e.code.startsWith('Shift'))) return;
      held.add(e.code);
      if (!e.code.startsWith('Shift')) touch();
    });
    addEventListener('keyup', (e) => held.delete(e.code));
    addEventListener('blur', () => held.clear());
  }

  // double-click / double-tap: glide to the voxel under the pointer (and a little closer)
  if (o.dblclick && !stage.shot) {
    let down = null, last = null;
    const active = new Set();
    el.addEventListener('pointerdown', (e) => {
      if (e.isPrimary) active.clear(); // the first finger / the mouse: nothing else can be down
      active.add(e.pointerId);
      down = active.size === 1 && e.button === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0 } : null;
    });
    el.addEventListener('pointermove', (e) => { if (down?.id === e.pointerId) down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y)); });
    const up = (e) => {
      active.delete(e.pointerId);
      const tap = down?.id === e.pointerId && e.type === 'pointerup' && e.timeStamp - down.t < 300 && down.moved < 10 ? { x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
      down = null;
      if (!tap) { last = null; return; }
      if (last && tap.t - last.t < 380 && Math.hypot(tap.x - last.x, tap.y - last.y) < 32) {
        last = null;
        const hit = stage.pick(tap.x, tap.y);
        if (hit) flyTo(stage, hit.point.toArray(), { zoom: Math.min(c.maxZoom, cam.zoom * 1.8), dur: 1.1, hop: 0.2 });
      } else last = tap;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  return {
    /** Before controls.update: keyboard movement (smoothed), in ground units per second ∝ the visible area. */
    before(dt) {
      if (!held.size && !vel.lengthSq() && !turn && !zoom) return;
      const fast = held.has('ShiftLeft') || held.has('ShiftRight') ? 2.2 : 1;
      let mx = 0, my = 0, tr = 0, zm = 0;
      for (const k of held) { if (MOVE[k]) { mx += MOVE[k][0]; my += MOVE[k][1]; } tr += TURN[k] ?? 0; zm += ZOOM[k] ?? 0; }
      const k = 1 - Math.exp(-dt * 9);
      const view = cam.isOrthographicCamera ? (cam.top - cam.bottom) / cam.zoom : 2 * Math.tan((cam.fov * Math.PI) / 360) * cam.position.distanceTo(c.target);
      const sp = view * 0.55 * o.speed * fast, len = Math.hypot(mx, my) || 1;
      vel.x += ((mx / len) * sp - vel.x) * k; vel.y += ((my / len) * sp - vel.y) * k;
      turn += (tr * 1.4 * fast - turn) * k; zoom += (zm * 1.3 - zoom) * k;
      if (!held.size && vel.length() < view * 0.002 && Math.abs(turn) < 1e-3 && Math.abs(zoom) < 1e-3) { vel.set(0, 0); turn = zoom = 0; return; }
      cam.getWorldDirection(_f); _f.y = 0;
      if (_f.lengthSq() < 1e-8) _f.set(0, 0, -1).applyQuaternion(cam.quaternion).setY(0);
      _f.normalize(); _r.crossVectors(_f, cam.up).normalize();
      _d.copy(_r).multiplyScalar(vel.x * dt).addScaledVector(_f, vel.y * dt);
      c.target.add(_d); cam.position.add(_d);
      if (turn) cam.position.sub(c.target).applyAxisAngle(cam.up, -turn * dt).add(c.target);
      if (zoom) {
        if (cam.isOrthographicCamera) { cam.zoom = THREE.MathUtils.clamp(cam.zoom * Math.exp(zoom * dt), c.minZoom, c.maxZoom); cam.updateProjectionMatrix(); }
        else { _d.subVectors(cam.position, c.target); _d.setLength(THREE.MathUtils.clamp(_d.length() * Math.exp(-zoom * dt), c.minDistance, c.maxDistance)); cam.position.copy(c.target).add(_d); }
      }
      stage._active = performance.now(); stage._dirty = true;
    },
    /** After controls.update: keep the target over the scene, and an ortho camera at its fitted distance. */
    after() {
      const b = stage.bounds, t = c.target, m = o.clamp;
      if (b.isEmpty()) return;
      const x = THREE.MathUtils.clamp(t.x, b.min.x - m, b.max.x + m), z = THREE.MathUtils.clamp(t.z, b.min.z - m, b.max.z + m);
      if (x !== t.x || z !== t.z) {
        _d.set(x - t.x, 0, z - t.z); t.add(_d); cam.position.add(_d);
        c._panOffset?.set(0, 0, 0);
      }
      // zoom-to-cursor moves an ortho camera sideways, which drifts its distance to the target: put it back
      // (the picture doesn't change; near/far clipping would)
      if (cam.isOrthographicCamera && stage.camDist) {
        _d.subVectors(cam.position, t);
        const L = _d.length();
        if (L > 0 && Math.abs(L - stage.camDist) > stage.camDist * 1e-4) cam.position.copy(t).addScaledVector(_d, stage.camDist / L);
      }
    },
  };
}
