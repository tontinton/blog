// Minimal page chrome shared by all pieces: loader, title card, back link, interaction hint, and the
// ?debug panel (lil-gui) for live look tweaking. Everything is optional via `ui` options:
//   ui: { title, subtitle, credit, back: '/' | url | false, backLabel: '← tontinton', hint: true | 'custom text' | false,
//         loader: true | false, theme: 'auto' | 'light' | 'dark', css: 'extra css' }
// In ?shot mode nothing is shown.
import { luminance, rgb } from './color.js';
import { LOOKS, merge, DEFAULT_LOOK } from './looks.js';

const CSS = `
.vx-ui { position: fixed; inset: 0; pointer-events: none; z-index: 5; font: 500 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--vx-fg); -webkit-font-smoothing: antialiased; }
.vx-ui a { pointer-events: auto; color: inherit; text-decoration: none; }
.vx-back { position: absolute; left: max(16px, env(safe-area-inset-left)); top: max(14px, env(safe-area-inset-top)); opacity: .55; letter-spacing: .04em; transition: opacity .2s; }
.vx-back:hover { opacity: 1; }
.vx-title { position: absolute; left: max(18px, env(safe-area-inset-left)); bottom: max(16px, env(safe-area-inset-bottom)); max-width: min(520px, 70vw); }
.vx-title h1 { margin: 0; font: 600 clamp(18px, 2.4vw, 26px)/1.15 ui-serif, Georgia, "Iowan Old Style", serif; letter-spacing: .01em; }
.vx-title p { margin: 4px 0 0; opacity: .7; }
.vx-title small { display: block; margin-top: 6px; opacity: .45; font-size: 11.5px; }
.vx-hint { position: absolute; right: max(18px, env(safe-area-inset-right)); bottom: max(18px, env(safe-area-inset-bottom)); opacity: .5; font-size: 12px; letter-spacing: .03em; transition: opacity 1.2s; }
.vx-hint.gone { opacity: 0; }
.vx-loader { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: var(--vx-bg); color: var(--vx-fg);
  transition: opacity .9s cubic-bezier(.4,0,.2,1), visibility 0s .9s; font: 500 12px/1.4 ui-sans-serif, system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; }
.vx-loader.done { opacity: 0; visibility: hidden; pointer-events: none; }
.vx-loader .vx-l { display: grid; justify-items: center; gap: 14px; }
.vx-loader h2 { margin: 0; font: 600 clamp(22px, 4vw, 40px)/1.1 ui-serif, Georgia, serif; letter-spacing: .02em; text-transform: none; }
.vx-bar { width: 160px; height: 2px; background: color-mix(in srgb, var(--vx-fg) 18%, transparent); overflow: hidden; }
.vx-bar i { display: block; height: 100%; width: 100%; background: var(--vx-fg); transform-origin: left; transform: scaleX(0); transition: transform .35s; }
.vx-cube { width: 18px; height: 18px; background: var(--vx-fg); opacity: .8; animation: vx-spin 1.6s cubic-bezier(.6,0,.4,1) infinite; }
@keyframes vx-spin { 0% { transform: rotate(0) scale(.8); } 50% { transform: rotate(90deg) scale(1); } 100% { transform: rotate(180deg) scale(.8); } }
@media (prefers-reduced-motion: reduce) { .vx-cube { animation: none; } }
@media (max-width: 520px) { .vx-hint { display: none; } }
.lil-gui { --width: 280px; }
.lil-gui.root { pointer-events: auto; }
`;

export function createUI(stage, o = {}) {
  if (stage.shot) return { ready() {}, frame() {}, interacted() {}, progress() {}, lookChanged() {} };
  const style = document.createElement('style');
  style.textContent = CSS + (o.css ?? '');
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'vx-ui';
  document.body.appendChild(root);

  const theme = () => {
    const bg = stage.look.background;
    const c = (bg.color ? [bg.color] : bg.colors)[0];
    const dark = o.theme === 'dark' || (o.theme !== 'light' && luminance(c) < 0.35);
    const set = (el) => {
      el.style.setProperty('--vx-fg', dark ? '#f4efe6' : '#1d1a16');
      const cols = (bg.color ? [bg.color] : bg.colors).map((x) => `rgb(${rgb(x).map((v) => Math.round(v * 255)).join(',')})`);
      el.style.setProperty('--vx-bg', cols.length > 1 ? (bg.type === 'radial' ? `radial-gradient(circle at 50% 50%, ${cols.join(',')})` : `linear-gradient(${180 + (bg.angle ?? 0)}deg, ${cols.join(',')})`) : cols[0]);
    };
    set(root);
    if (loader) set(loader);
  };

  let loader = null, bar = null, label = null;
  if (o.loader !== false) {
    loader = document.createElement('div');
    loader.className = 'vx-loader';
    loader.innerHTML = `<div class="vx-l"><div class="vx-cube"></div>${o.title ? `<h2></h2>` : ''}<div class="vx-bar"><i></i></div><div class="vx-lbl">Loading</div></div>`;
    if (o.title) loader.querySelector('h2').textContent = o.title;
    bar = loader.querySelector('.vx-bar i');
    label = loader.querySelector('.vx-lbl');
    document.body.appendChild(loader);
  }
  if (o.back !== false) {
    const a = document.createElement('a');
    // TODO(gallery): once /voxel/ exists, default to { back: '/voxel/', backLabel: '← voxel' }
    a.className = 'vx-back'; a.href = o.back ?? '/'; a.textContent = o.backLabel ?? '← tontinton';
    root.appendChild(a);
  }
  if (o.title) {
    const t = document.createElement('div');
    t.className = 'vx-title';
    t.innerHTML = '<h1></h1>' + (o.subtitle ? '<p></p>' : '') + (o.credit ? '<small></small>' : '');
    t.querySelector('h1').textContent = o.title;
    if (o.subtitle) t.querySelector('p').textContent = o.subtitle;
    if (o.credit) t.querySelector('small').textContent = o.credit;
    root.appendChild(t);
  }
  let hint = null;
  if (o.hint !== false) {
    hint = document.createElement('div');
    hint.className = 'vx-hint';
    hint.textContent = typeof o.hint === 'string' ? o.hint : 'drag to rotate · scroll to zoom';
    root.appendChild(hint);
  }
  theme();
  const cv = stage.renderer.domElement;
  cv.setAttribute('role', 'img');
  cv.setAttribute('aria-label', [o.title, o.subtitle].filter(Boolean).join(' — ') || 'Voxel art');

  let gui = null, statsEl = null, acc = 0, frames = 0;
  if (stage.debug) {
    import('./vendor/lil-gui.module.min.js').then(({ GUI }) => {
      gui = buildGui(GUI, stage);
      statsEl = document.createElement('pre');
      Object.assign(statsEl.style, { position: 'fixed', left: '12px', top: '40px', zIndex: 6, margin: 0, padding: '6px 8px', font: '11px/1.35 ui-monospace, monospace', color: '#dfe', background: 'rgba(0,0,0,.45)', borderRadius: '4px', pointerEvents: 'none' });
      document.body.appendChild(statsEl);
    });
  }

  return {
    async progress(text, f) {
      if (label && text) label.textContent = text;
      if (bar && f != null) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    },
    ready() {
      if (bar) bar.style.transform = 'scaleX(1)';
      if (loader) setTimeout(() => loader.classList.add('done'), 60);
      if (hint) setTimeout(() => hint.classList.add('gone'), 7000);
    },
    interacted() { hint?.classList.add('gone'); },
    lookChanged() { theme(); },
    frame(dt) {
      if (!statsEl) return;
      acc += dt; frames++;
      if (acc > 0.5) {
        const s = stage.stats();
        statsEl.textContent = `${Math.round(frames / acc)} fps  dpr ${stage.dpr}\n${s.voxels.toLocaleString()} voxels  ${s.quads.toLocaleString()} quads\n${s.drawCalls} draws  ${s.triangles.toLocaleString()} tris\nmesh ${s.meshMs}ms  bake ${s.bakeMs}ms  lights ${s.lightGroups}`;
        acc = 0; frames = 0;
      }
    },
  };
}

function buildGui(GUI, stage) {
  const gui = new GUI({ title: 'voxel look' });
  const L = stage.look;
  const apply = () => stage.updateLook({});
  const presets = { preset: typeof stage.lookSpec === 'string' ? stage.lookSpec : 'custom' };
  gui.add(presets, 'preset', ['custom', ...Object.keys(LOOKS)]).onChange((v) => { if (v !== 'custom') { stage.setLook(v); gui.destroy(); buildGui(GUI, stage); } });
  const f = (name, obj, keys, open = false) => {
    const fo = gui.addFolder(name);
    for (const [k, a, b, s] of keys) {
      if (typeof obj[k] === 'string' && obj[k].startsWith('#')) fo.addColor(obj, k).onChange(apply);
      else if (typeof obj[k] === 'boolean') fo.add(obj, k).onChange(apply);
      else if (Array.isArray(a)) fo.add(obj, k, a).onChange(apply);
      else fo.add(obj, k, a, b, s).onChange(apply);
    }
    if (!open) fo.close();
    return fo;
  };
  f('exposure', L, [['exposure', 0.2, 3, 0.01], ['toneMapping', ['neutral', 'agx', 'aces', 'reinhard', 'cineon', 'none']]], true);
  // background: proxy the color array as individual color pickers
  const bg = L.background;
  if (bg.color) { bg.colors = [bg.color]; delete bg.color; }
  const bgp = { type: bg.type ?? 'linear' };
  bg.colors.forEach((c, i) => { bgp['color ' + (i + 1)] = c; });
  const bf = gui.addFolder('background');
  bf.add(bgp, 'type', ['solid', 'linear', 'radial']).onChange((v) => { bg.type = v; apply(); });
  bg.colors.forEach((_, i) => bf.addColor(bgp, 'color ' + (i + 1)).onChange((v) => { bg.colors[i] = v; apply(); }));
  bf.add(bg, 'stars', 0, 2, 0.01).onChange(apply);
  bf.close();
  f('sun', L.sun, [['color'], ['intensity', 0, 8, 0.01], ['azimuth', -180, 360, 1], ['elevation', 1, 90, 1], ['softness', 0, 8, 0.1], ['shadow']], true);
  f('sky / ambient', L.sky, [['top'], ['horizon'], ['bottom'], ['intensity', 0, 4, 0.01], ['sunGlow', 0, 3, 0.01]]);
  f('fill light', L.fill, [['color'], ['intensity', 0, 4, 0.01], ['azimuth', -180, 360, 1], ['elevation', -30, 90, 1]]);
  f('voxel', L.voxel, [['ao', 0, 1, 0.01], ['aoGamma', 0.3, 3, 0.01], ['rayAO', 0, 1, 0.01], ['aoDirect', 0, 1, 0.01], ['bevel', 0, 0.5, 0.005], ['bevelStrength', 0, 2, 0.01], ['edge', -0.5, 0.5, 0.005], ['jitter', 0, 3, 0.01], ['saturation', 0, 2, 0.01], ['emissive', 0, 5, 0.01], ['bakedLight', 0, 5, 0.01]], true);
  f('bloom', L.bloom, [['enabled'], ['strength', 0, 3, 0.01], ['radius', 0, 1.5, 0.01], ['threshold', 0, 4, 0.01], ['knee', 0, 2, 0.01]]);
  f('dof', L.dof, [['enabled'], ['mode', ['tiltshift', 'depth']], ['focus', -1, 1, 0.01], ['band', 0, 1, 0.01], ['range', 0.01, 2, 0.01], ['maxBlur', 0, 30, 0.1]]);
  f('fog', L.fog, [['amount', 0, 1, 0.01], ['near', -1, 2, 0.01], ['far', -1, 3, 0.01]]);
  f('grade', L.grade, [['contrast', 0.5, 1.6, 0.01], ['saturation', 0, 2, 0.01], ['vibrance', -1, 1, 0.01], ['temperature', -1, 1, 0.01], ['tint', -1, 1, 0.01], ['hue', -180, 180, 1], ['black', 0, 0.2, 0.001], ['background']]);
  f('vignette / grain', L.vignette, [['amount', 0, 1, 0.01], ['softness', 0, 1.5, 0.01], ['color']]);
  f('ground', L.ground, [['opacity', 0, 1, 0.01], ['color'], ['contact', 0, 1, 0.01]]);
  f('wind', L.wind, [['strength', 0, 4, 0.01], ['speed', 0, 4, 0.01]]);
  f('water', L.water, [['glow', 0, 2, 0.01], ['strength', 0, 4, 0.01], ['speed', 0, 4, 0.01], ['scale', 0.1, 4, 0.01]]);
  const tools = {
    'copy look JSON': () => {
      const txt = JSON.stringify(diff(merge({}, DEFAULT_LOOK), stage.look), null, 2);
      navigator.clipboard?.writeText(txt);
      console.log(txt);
    },
    'save PNG (2x)': () => {
      const prev = stage.dpr;
      stage.dpr = prev * 2; stage.resize(); stage.frame();
      const a = document.createElement('a');
      a.download = 'voxel.png'; a.href = stage.captureViews(1); a.click();
      stage.dpr = prev; stage.resize();
    },
  };
  gui.add(tools, 'copy look JSON');
  gui.add(tools, 'save PNG (2x)');
  return gui;
}

/** keys of `b` that differ from `a` (for copying a compact look override). */
function diff(a, b) {
  const out = {};
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { const d = diff(a?.[k] ?? {}, b[k]); if (Object.keys(d).length) out[k] = d; }
    else if (JSON.stringify(a?.[k]) !== JSON.stringify(b[k])) out[k] = b[k];
  }
  return out;
}
