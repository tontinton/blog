// Palette: named voxel materials. A grid stores small integer ids; everything visual about an id
// (colors, per-voxel variation, roughness, glow, sway, water...) lives here and is uploaded to the
// GPU as a texture, so palette edits re-color a model live without re-meshing.
//
//   const P = new Palette({
//     grass: { color: '#7cba4a', jitter: 0.08, noise: { color: '#5d9a3a', scale: 0.12 } },
//     leaf:  { colors: ['#4f8f3a', '#5fa044', '#6db34d'], sway: 0.7 },
//     lamp:  { color: '#ffd28a', emissive: 4, light: { radius: 7 } },
//     water: { color: '#4fb6c2', kind: 'water' },
//   });
//   grid.set(x, y, z, P.grass)      // ids are plain properties
//   grid.set(x, y, z, 'grass')      // names work too
//   P.update('grass', { color: '#9c4' })   // live edit (texture refresh, no remesh)
//
// Material definition fields (all optional except a color):
//   color       base color                         colors   [c1..c4] random pick per voxel
//   jitter      per-voxel brightness noise (0.04)  hueJitter per-voxel hue noise in degrees (0)
//   noise       { color, scale=0.15, amount=1, contrast=1, offset=0 }  smooth 3D noise blend to color
//   gradient    { color, axis='y', from, to, amount=1 }  blend toward color along a grid axis
//   roughness   0.85        metalness 0
//   emissive    glow intensity (0)   emissiveColor (defaults to color)
//   flicker     0..1 glow flicker (fire, candles)   flickerSpeed (1)
//   light       true | radius | { color, intensity=1, radius=6 }  bake colored light onto nearby voxels
//   sway        wind sway amount (leaves ~0.5, grass ~1)
//   bevel       multiplier on the look's bevel (1). 0 = razor sharp edges for this material
//   grid        0..1 dark lines on every voxel edge, even inside merged faces (tiles, bricks)
//   ao          multiplier on how much AO darkens it (1)
//   kind        'solid' (default) | 'water' | 'glass'  (transparent kinds get their own mesh)
//   opacity     for water/glass: 0 = fully clear, 1 = opaque color (0.35)
//   ior         index of refraction (water 1.33, glass 1.5)
//   wave        water surface wave amount (1)
//   shadow      cast shadows (true)
//   custom      [a, b, c, d] free slots readable in custom shader hooks (material.custom)
import { MAT_TEXELS, MAT_PER_ROW as PER_ROW } from './constants.js';
import { rgb, srgbToLinear, hex } from './color.js';
import * as THREE from './three.js';

const KIND = { solid: 0, water: 1, glass: 2 };


export class Palette {
  constructor(defs = {}) {
    this.defs = [null]; // id 0 = empty
    this.names = new Map();
    this.version = 0;
    this._tex = null;
    this._colorCache = new Map();
    for (const [name, def] of Object.entries(defs)) this.add(name, def);
  }

  /** Add a named material, returns its id. Also exposed as `palette[name]`. */
  add(name, def) {
    if (typeof name === 'object') { def = name; name = null; }
    if (name && this.names.has(name)) return this.update(name, def), this.names.get(name);
    const id = this.defs.length;
    if (id > 65535) throw new Error('palette full (65535 materials)');
    this.defs.push(normalize(def, name));
    if (name) {
      this.names.set(name, id);
      if (!(name in this)) Object.defineProperty(this, name, { value: id, enumerable: true });
    }
    this.version++;
    return id;
  }

  /** id for a name (or passes ids through). */
  id(m) {
    if (typeof m === 'number') return m;
    if (m == null || m === false) return 0;
    const id = this.names.get(m);
    if (id === undefined) throw new Error(`unknown material "${m}"`);
    return id;
  }

  def(m) { return this.defs[this.id(m)]; }
  has(name) { return this.names.has(name); }

  /** Change properties of an existing material (live). */
  update(m, props) {
    const id = this.id(m);
    this.defs[id] = normalize({ ...this.defs[id].src, ...props }, this.defs[id].name);
    this.version++;
    return id;
  }

  /** A new material that copies `base` with overrides. `name` optional. */
  variant(base, props, name) {
    return this.add(name ?? null, { ...this.def(base).src, ...props });
  }

  /** Material for an arbitrary color (deduped), inheriting other props from `base`. */
  color(c, base) {
    const key = hex(c) + '|' + (base ?? '');
    let id = this._colorCache.get(key);
    if (id === undefined) {
      const src = base ? { ...this.def(base).src, colors: undefined } : {};
      id = this.add(null, { ...src, color: c });
      this._colorCache.set(key, id);
    }
    return id;
  }

  /** Merge another palette's materials into this one. Returns Map(otherId → thisId). */
  merge(other) {
    const map = new Map([[0, 0]]);
    if (other === this) { for (let i = 1; i < this.defs.length; i++) map.set(i, i); return map; }
    for (let i = 1; i < other.defs.length; i++) {
      const d = other.defs[i];
      const id = d.name && this.names.has(d.name) ? this.names.get(d.name) : this.add(d.name, d.src);
      map.set(i, id);
    }
    return map;
  }

  get size() { return this.defs.length; }
  isTransparent(id) { return this.defs[id]?.kind > 0; }

  /** Material table as a float texture (16 texels per material). Rebuilt when the palette changes. */
  texture() {
    const n = this.defs.length;
    const rows = Math.max(1, Math.ceil(n / PER_ROW));
    if (!this._tex || this._tex.image.height < rows) {
      this._tex?.dispose();
      const data = new Float32Array(PER_ROW * MAT_TEXELS * rows * 4);
      this._tex = new THREE.DataTexture(data, PER_ROW * MAT_TEXELS, rows, THREE.RGBAFormat, THREE.FloatType);
      this._tex.magFilter = this._tex.minFilter = THREE.NearestFilter;
      this._tex.generateMipmaps = false;
      this._texVersion = -1;
    }
    if (this._texVersion !== this.version) {
      const d = this._tex.image.data;
      for (let id = 1; id < n; id++) writeTexels(d, id, this.defs[id]);
      this._tex.needsUpdate = true;
      this._texVersion = this.version;
    }
    return this._tex;
  }

  /** Plain-object dump (handy for the debug panel / copying a palette out). */
  toJSON() {
    const out = {};
    this.defs.forEach((d, i) => { if (d) out[d.name ?? `#${i}`] = d.src; });
    return out;
  }
}

function lightDef(l, color, emissive) {
  if (!l) return null;
  if (l === true) l = {};
  if (typeof l === 'number') l = { radius: l };
  return {
    color: srgbToLinear(l.color ?? color),
    intensity: l.intensity ?? 1,
    radius: l.radius ?? 6,
    key: hex(l.color ?? color),
  };
}

function normalize(def, name) {
  if (typeof def === 'string' || typeof def === 'number' || Array.isArray(def)) def = { color: def };
  const colors = def.colors?.length ? def.colors.slice(0, 4) : null;
  const base = def.color ?? colors?.[0] ?? '#ff00ff';
  const kind = KIND[def.kind ?? 'solid'];
  if (kind === undefined) throw new Error(`unknown material kind "${def.kind}"`);
  const noise = def.noise ? { color: def.noise.color ?? base, scale: def.noise.scale ?? 0.15, amount: def.noise.amount ?? 1, contrast: def.noise.contrast ?? 1, offset: def.noise.offset ?? 0 } : null;
  const grad = def.gradient ? { color: def.gradient.color ?? base, axis: { x: 0, y: 1, z: 2 }[def.gradient.axis ?? 'y'] ?? 1, from: def.gradient.from ?? 0, to: def.gradient.to ?? 16, amount: def.gradient.amount ?? 1 } : null;
  return {
    name, src: { ...def }, kind,
    color: rgb(base),
    colors: colors?.map(rgb) ?? null,
    jitter: def.jitter ?? 0.04,
    hueJitter: def.hueJitter ?? 0,
    noise, grad,
    roughness: def.roughness ?? (kind ? 0.06 : 0.85),
    metalness: def.metalness ?? 0,
    emissive: def.emissive ?? 0,
    emissiveColor: rgb(def.emissiveColor ?? base),
    flicker: def.flicker ?? 0,
    flickerSpeed: def.flickerSpeed ?? 1,
    light: lightDef(def.light, def.emissiveColor ?? base, def.emissive),
    sway: def.sway ?? 0,
    bevel: def.bevel ?? 1,
    grid: def.grid ?? 0,
    ao: def.ao ?? 1,
    opacity: def.opacity ?? 0.35,
    ior: def.ior ?? (def.kind === 'glass' ? 1.5 : 1.33),
    wave: def.wave ?? 1,
    shadow: def.shadow ?? kind === 0,
    custom: def.custom ?? [0, 0, 0, 0],
  };
}

function writeTexels(d, id, m) {
  const base = ((Math.floor(id / PER_ROW) * PER_ROW * MAT_TEXELS) + (id % PER_ROW) * MAT_TEXELS) * 4;
  const put = (t, a, b, c, e) => { const o = base + t * 4; d[o] = a; d[o + 1] = b; d[o + 2] = c; d[o + 3] = e; };
  const lin = (c) => srgbToLinear(c);
  const c0 = lin(m.color);
  put(0, c0[0], c0[1], c0[2], m.kind);
  put(1, m.roughness, m.metalness, m.emissive, m.sway);
  const e = lin(m.emissiveColor);
  put(2, e[0], e[1], e[2], m.flicker);
  put(3, m.jitter, m.bevel, m.grid, m.ao);
  const picks = m.colors ?? [m.color];
  for (let i = 1; i < 4; i++) { const p = lin(picks[i] ?? picks[0]); put(3 + i, p[0], p[1], p[2], i === 1 ? picks.length : 0); }
  if (m.noise) { const n = lin(m.noise.color); put(7, n[0], n[1], n[2], m.noise.amount); put(8, m.noise.scale, m.noise.contrast, m.noise.offset, 0); }
  else { put(7, 0, 0, 0, 0); put(8, 0, 1, 0, 0); }
  if (m.grad) { const g = lin(m.grad.color); put(9, g[0], g[1], g[2], m.grad.amount); put(10, m.grad.axis, m.grad.from, m.grad.to, m.flickerSpeed); }
  else { put(9, 0, 0, 0, 0); put(10, 1, 0, 1, m.flickerSpeed); }
  put(11, m.opacity, m.ior, m.wave, m.hueJitter);
  put(12, m.custom[0], m.custom[1], m.custom[2], m.custom[3]);
  put(13, m.shadow ? 0 : 1, 0, 0, 0); put(14, 0, 0, 0, 0); put(15, 0, 0, 0, 0);
}

/** Shorthand: `palette({ ... })` === `new Palette({ ... })`. */
export const palette = (defs) => new Palette(defs);
