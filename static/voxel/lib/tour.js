// Points-of-interest tour: a compact "‹ ✦ Explore ›" bar (top-right) and a grouped panel; each stop glides the
// camera (orbit target, zoom and optionally yaw) to a point of interest. Keyboard: ← / → step, Esc closes.
//
//   stage.flyTo([x, y, z], { zoom: 6, yaw: 30, pitch: 14 })          // any time (omitted yaw / pitch are kept)
//   const { pois } = await stage.world({ … });                        // regions: ctx.emit('poi', { label, icon, target, zoom, yaw })
//   stage.tour(pois, { order: ['trail', 'river'], groups: { trail: 'Forest trail' }, home: 'Whole valley', yaw: 20 });
//
// pois: [{ label, icon?, target: [x, y, z], zoom? (6), yaw? / pitch? (deg; omitted = the tour's defaults), group? }]
// (stage.world() sets `group` to the emitting region). In ?shot mode the tour builds no UI (flyTo still works).
import * as THREE from './three.js';

/** Glide the camera to `target` (orbit target) with o.zoom and, if given, o.yaw / o.pitch (deg); o.dur (s, auto);
 *  o.hop (1): how much a long flight zooms out on the way. */
export function flyTo(stage, target, o = {}) {
  const c = stage.controls, cam = stage.camera;
  const off = cam.position.clone().sub(c.target);
  const a0 = Math.atan2(off.x, off.z);
  let da = o.yaw == null ? 0 : (o.yaw * Math.PI) / 180 - a0;
  da = Math.atan2(Math.sin(da), Math.cos(da));                                          // shortest way round
  const e0 = Math.atan2(off.y, Math.hypot(off.x, off.z)), de = o.pitch == null ? 0 : (o.pitch * Math.PI) / 180 - e0;
  const t1 = new THREE.Vector3(...target);
  stage._fly = { start: performance.now(), dur: o.dur ?? (Math.abs(da) + Math.abs(de) > 0.2 ? 2.4 : 1.8), t0: c.target.clone(), t1, z0: cam.zoom, z1: o.zoom ?? cam.zoom, a0, da, e0, de, dist: c.target.distanceTo(t1), hop: o.hop ?? 1 };
  if (!stage._flyHooked) {
    stage._flyHooked = true;
    stage.onUpdate(() => {
      const f = stage._fly;
      if (!f) return;
      const k = Math.min(1, (performance.now() - f.start) / 1000 / f.dur);              // wall clock: smooth even when frames are slow
      const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;                       // ease in-out cubic
      const off2 = cam.position.clone().sub(c.target);
      if (f.da || f.de) {                                                               // swing around (yaw) and up/down (pitch)
        const L = off2.length(), a = f.a0 + f.da * e, el = f.e0 + f.de * e;
        off2.set(Math.sin(a) * Math.cos(el) * L, Math.sin(el) * L, Math.cos(a) * Math.cos(el) * L);
      }
      c.target.lerpVectors(f.t0, f.t1, e);
      cam.position.copy(c.target).add(off2);
      const hop = Math.min(1, f.dist / 120) * 0.9 * f.hop * Math.sin(Math.PI * e);       // zoom out a little mid-flight
      if (cam.isOrthographicCamera) cam.zoom = Math.exp(Math.log(f.z0) * (1 - e) + Math.log(f.z1) * e - hop);
      cam.updateProjectionMatrix();
      c.update();
      if (k >= 1) stage._fly = null;
    });
    stage.renderer.domElement.addEventListener('pointerdown', () => { stage._fly = null; });   // the viewer takes over
  }
  return stage;
}

const CSS = `
.vx-tour { position: absolute; right: max(16px, env(safe-area-inset-right)); top: max(12px, env(safe-area-inset-top)); pointer-events: auto;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px; max-width: calc(100vw - 32px); }
.vx-tour button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
.vx-tour-bar { display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 999px; max-width: 100%;
  background: color-mix(in srgb, var(--vx-tour-bg) 78%, transparent); border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 2px 14px #0000001a; }
.vx-tour-bar button { padding: 5px 10px; border-radius: 999px; transition: background .2s; }
.vx-tour-bar button:hover { background: color-mix(in srgb, currentColor 9%, transparent); }
.vx-tour-head { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(320px, calc(100vw - 130px)); }
.vx-tour-head small { opacity: .5; margin-left: 6px; font-size: 11px; font-variant-numeric: tabular-nums; }
.vx-tour-step { font-size: 17px; line-height: 1; padding: 4px 9px !important; opacity: .75; }
.vx-tour-panel { display: none; width: min(290px, calc(100vw - 32px)); max-height: min(68vh, 600px); overflow-y: auto; padding: 6px; border-radius: 16px;
  background: color-mix(in srgb, var(--vx-tour-bg) 86%, transparent); border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); box-shadow: 0 6px 28px #00000024; overscroll-behavior: contain; }
.vx-tour.open .vx-tour-panel { display: block; }
.vx-tour-panel h3 { margin: 10px 8px 3px; font: 600 10.5px/1.2 ui-sans-serif, system-ui, sans-serif; letter-spacing: .12em; text-transform: uppercase; opacity: .5; }
.vx-tour-item { display: block; width: 100%; text-align: left; padding: 5px 9px !important; border-radius: 9px; font-size: 13px; line-height: 1.3; }
.vx-tour-item:hover { background: color-mix(in srgb, currentColor 8%, transparent) !important; }
.vx-tour-item.on { background: color-mix(in srgb, var(--vx-tour-accent) 55%, transparent) !important; }
@media (max-width: 520px) { .vx-tour-panel { max-height: 55vh; } }`;

/**
 * Build the tour UI. o: order (group names, in visiting order; others follow), groups ({ group: heading }),
 * label ('✦ Explore'), home (label of the "back to the overview" entry, or false), yaw / pitch (defaults of stops without
 * one: the stage's camera yaw / pitch), homeZoom (1), bg ('#f6f1e8'), accent ('#ffc98a'), dimTitle (0.3: the title card's
 * opacity while a stop is shown).
 * Returns { show(i), next(), prev(), home(), pois, el } (null in ?shot mode or without pois).
 */
export function createTour(stage, pois, o = {}) {
  if (stage.shot || !pois?.length) return null;
  const order = o.order ?? [];
  const rank = (g) => (order.indexOf(g) < 0 ? order.length : order.indexOf(g));
  pois = pois.map((p, i) => ({ ...p, _i: i })).sort((a, b) => rank(a.group) - rank(b.group) || a._i - b._i);
  const yaw0 = o.yaw ?? stage.camOpts.yaw, pitch0 = o.pitch ?? stage.camOpts.pitch;
  const title = () => document.querySelector('.vx-title');
  const dim = (v) => { const t = title(); if (t) { t.style.transition = 'opacity .6s'; t.style.opacity = v ? String(o.dimTitle ?? 0.3) : ''; } };
  if (!document.getElementById('vx-tour-css')) {
    const css = document.createElement('style');
    css.id = 'vx-tour-css'; css.textContent = CSS;
    document.head.appendChild(css);
  }
  const box = document.createElement('div');
  box.className = 'vx-tour';
  box.style.setProperty('--vx-tour-bg', o.bg ?? '#f6f1e8');
  box.style.setProperty('--vx-tour-accent', o.accent ?? '#ffc98a');
  const label = o.label ?? '✦ Explore';
  box.innerHTML = '<div class="vx-tour-bar"><button class="vx-tour-step vx-tour-prev" aria-label="Previous place">‹</button><button class="vx-tour-head" aria-expanded="false"></button><button class="vx-tour-step vx-tour-next" aria-label="Next place">›</button></div><div class="vx-tour-panel" role="menu"></div>';
  const head = box.querySelector('.vx-tour-head'), panel = box.querySelector('.vx-tour-panel');
  head.textContent = label;
  const open = (v) => { box.classList.toggle('open', v); head.setAttribute('aria-expanded', String(v)); };
  head.onclick = () => open(!box.classList.contains('open'));
  let cur = -1;
  const items = [];
  const show = (i) => {
    cur = (i + pois.length) % pois.length;
    const p = pois[cur];
    items.forEach((b, k) => b.classList.toggle('on', k === cur));
    head.textContent = `${p.icon ? p.icon + ' ' : ''}${p.label}`;
    const n = document.createElement('small'); n.textContent = `${cur + 1}/${pois.length}`; head.appendChild(n);
    flyTo(stage, p.target, { zoom: p.zoom ?? 6, yaw: p.yaw ?? yaw0, pitch: p.pitch ?? pitch0 });
    dim(true);
  };
  const home = () => {
    cur = -1; items.forEach((b) => b.classList.remove('on')); head.textContent = label; open(false);
    flyTo(stage, stage._frame?.target?.toArray?.() ?? [0, 0, 0], { zoom: o.homeZoom ?? stage.camOpts.zoom ?? 1, yaw: yaw0, pitch: pitch0 });
    dim(false);
  };
  if (o.home !== false) {
    const b = document.createElement('button');
    b.className = 'vx-tour-item'; b.textContent = `⌂ ${o.home ?? 'Overview'}`; b.onclick = home;
    panel.appendChild(b);
  }
  let group;
  pois.forEach((p, i) => {
    if (p.group != null && p.group !== group) { group = p.group; const h = document.createElement('h3'); h.textContent = o.groups?.[group] ?? group; panel.appendChild(h); }
    const b = document.createElement('button');
    b.className = 'vx-tour-item'; b.setAttribute('role', 'menuitem');
    b.textContent = `${p.icon ? p.icon + ' ' : ''}${p.label}`;
    b.onclick = () => { open(false); show(i); };
    items.push(b); panel.appendChild(b);
  });
  const next = () => show(cur + 1), prev = () => show(cur < 0 ? pois.length - 1 : cur - 1);
  box.querySelector('.vx-tour-prev').onclick = prev;
  box.querySelector('.vx-tour-next').onclick = next;
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight' || e.key === ']') next();
    else if (e.key === 'ArrowLeft' || e.key === '[') prev();
    else if (e.key === 'Escape') open(false);
  });
  stage.renderer.domElement.addEventListener('pointerdown', () => open(false));
  (document.querySelector('.vx-ui') ?? document.body).appendChild(box);
  return (stage._tour = { show, next, prev, home, pois, el: box }); // nav.js: R / Home → home()
}
