// Looks: everything about how a piece is lit and graded, as plain data. A look is deep-merged:
// DEFAULT ← preset ← your overrides. Swap presets live with stage.setLook(), tweak with ?debug.
//
//   new Stage({ look: 'pastel' })
//   new Stage({ look: ['neon', { bloom: { strength: 1.2 }, background: { colors: ['#0b1030', '#1d2560'] } }] })
//   new Stage({ look: { sun: { azimuth: 120 }, grade: { saturation: 1.2 } } })   // DEFAULT ← overrides
//
// Colors are CSS-ish strings. Angles are degrees. Distances in `fog`/`dof.range` are multiples of the
// camera→target distance, so looks work at any model size.

export const DEFAULT_LOOK = {
  background: {
    type: 'linear',          // 'solid' | 'linear' | 'radial'
    colors: ['#e9e4dc', '#d9d2c7'], // 2 or 3 colors: [top/center, (mid), bottom/edge]
    angle: 0,                // linear: 0 = top→bottom, 90 = left→right
    center: [0.5, 0.55], radius: 0.8, // radial
    power: 1, mid: 0.5,      // gradient curve, position of the middle color
    noise: 0.006,            // dithering noise to avoid banding
  },
  sun: {
    color: '#fff3e2', intensity: 2.4,
    azimuth: 40,             // degrees around Y (0 = from +z, 90 = from +x)
    elevation: 52,           // degrees above the horizon
    shadow: true, softness: 1.6, mapSize: 4096, bias: -0.0002, normalBias: 0.04,
    follow: false,           // true: sun stays fixed relative to the camera (lighting never changes as you orbit)
  },
  fill: { color: '#c8d8ff', intensity: 0, azimuth: 220, elevation: 25 }, // shadowless second light (rim / bounce)
  sky: {                     // image-based ambient + reflections (generated gradient environment)
    top: '#cfe0ff', horizon: '#f4ece2', bottom: '#8a7a68', intensity: 0.9,
    sunGlow: 0.6,            // how much the sun shows up in reflections
  },
  ambient: { color: '#ffffff', intensity: 0 },
  voxel: {
    ao: 0.7,                 // classic per-vertex AO strength (0..1)
    aoGamma: 1,              // >1 = tighter, darker creases
    rayAO: 0.85,             // baked ray-traced AO strength (needs bake.ao on the model)
    aoDirect: 0.3,           // how much AO also darkens direct sunlight (0 = physically "correct")
    bevel: 0.14,             // bevel width in voxels on convex edges (0 = sharp cubes)
    bevelStrength: 0.65,     // how far the normal tilts on the bevel
    edge: 0.05,              // brighten (+) / darken (-) convex edges
    gridLine: 0.035,         // width of per-voxel grid lines (for materials with `grid`)
    jitter: 1,               // global multiplier on material jitter
    saturation: 1,           // albedo saturation (0 = clay render)
    emissive: 1,             // global multiplier on emissive materials
    bakedLight: 1,           // global multiplier on baked emissive light
  },
  wind: { strength: 1, speed: 1, direction: [1, 0.35] },
  water: { scale: 0.9, speed: 1, strength: 1, transmission: true },
  exposure: 1,
  toneMapping: 'neutral',    // 'neutral' (keeps palette colors) | 'agx' (filmic, desaturates highlights) | 'aces' | 'reinhard' | 'cineon' | 'none'
  bloom: { enabled: true, strength: 0.35, radius: 0.85, threshold: 1.6, knee: 0.6, levels: 6, tint: '#ffffff' },
  dof: {
    enabled: false,
    mode: 'tiltshift',       // 'tiltshift' (screen band, miniature look) | 'depth' (camera focus)
    focus: 0.5,              // tiltshift: screen y of the sharp band (0 bottom..1 top); depth: 'auto' or distance multiple
    band: 0.12,              // tiltshift: half-height of the sharp band; depth: sharp range (multiple)
    range: 0.35,             // falloff distance to max blur (screen fraction | distance multiple)
    maxBlur: 7,              // px at 1080p (scaled with resolution)
    angle: 0, bokeh: 0.6,
  },
  fog: { amount: 0, near: 0.9, far: 1.6, color: null }, // color null = fade into the background
  grade: {
    contrast: 1.04, saturation: 1.05, vibrance: 0.1, temperature: 0, tint: 0, hue: 0,
    lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], black: 0, background: false,
  },
  vignette: { amount: 0.18, softness: 0.7, roundness: 1, color: '#000000' },
  grain: { amount: 0.02, size: 1 },
  chromatic: 0,
  dither: 1,
  ground: {
    type: 'shadow',          // 'shadow' (shadow catcher over the background) | 'none'
    opacity: 0.32,           // shadow darkness
    color: '#2a1d10',        // shadow tint
    contact: 0.45,           // soft contact shadow under the model footprint
    contactRadius: 3,        // blur radius in voxels
    contactHeight: 4,        // voxels above the ground that still darken it
    reflect: 0,              // glossy floor reflection strength (0..1, renders the scene twice)
    blur: 0.4,               // reflection blur
    reflectFade: 1.3,        // reflection fades out this many model radii from the center
  },
};

export const LOOKS = {
  /** neutral warm-grey studio, soft sun. The default. */
  studio: {},

  /** sunny cartoon diorama (cottage / forest tile). */
  daylight: {
    background: { type: 'radial', colors: ['#5aa05a', '#2f6e3a'], center: [0.5, 0.5], radius: 0.95 },
    sun: { color: '#fff1d6', intensity: 2.8, azimuth: 35, elevation: 55, softness: 1.4 },
    sky: { top: '#bfe0ff', horizon: '#eaf6e6', bottom: '#4f7a3a', intensity: 1.0 },
    voxel: { ao: 0.7, bevel: 0.1, edge: 0.06 },
    grade: { contrast: 1.05, saturation: 0.98, vibrance: 0.05 },
    ground: { opacity: 0.35, color: '#0b2a12', contact: 0.4 },
  },

  /** pastel toy look (bunny): soft, bright, low contrast, chunky bevels, shallow depth of field. */
  pastel: {
    background: { type: 'radial', colors: ['#f1d9b6', '#d9b88f'], center: [0.5, 0.6], radius: 1.0 },
    sun: { color: '#fff0dc', intensity: 2.2, azimuth: 55, elevation: 48, softness: 2.6 },
    sky: { top: '#ffe9d6', horizon: '#fff5ea', bottom: '#c99a7a', intensity: 1.0 },
    voxel: { ao: 0.6, rayAO: 0.6, bevel: 0.22, bevelStrength: 0.8, edge: 0.06, aoDirect: 0.2 },
    exposure: 0.92,
    bloom: { strength: 0.25, threshold: 2 },
    dof: { enabled: true, mode: 'depth', focus: 'auto', band: 0.08, range: 0.35, maxBlur: 9 },
    grade: { contrast: 1.02, saturation: 1.08, vibrance: 0.12, temperature: 0.1 },
    vignette: { amount: 0.12 },
    ground: { opacity: 0.22, color: '#5a3010', contact: 0.35 },
  },

  /** low warm sun, long shadows. */
  golden: {
    background: { type: 'linear', colors: ['#f6c58a', '#e39a6a', '#8d5a6e'], mid: 0.55 },
    sun: { color: '#ffb46b', intensity: 3.2, azimuth: 70, elevation: 18, softness: 2.2 },
    fill: { color: '#7d8cff', intensity: 0.35, azimuth: 250, elevation: 30 },
    sky: { top: '#7f9be0', horizon: '#ffcf9a', bottom: '#6a4a3a', intensity: 0.75 },
    bloom: { strength: 0.4, threshold: 1.4 },
    grade: { contrast: 1.08, saturation: 1.12, temperature: 0.25, gamma: [1, 0.98, 0.95] },
    vignette: { amount: 0.25 },
    ground: { opacity: 0.4, color: '#3a1808' },
  },

  /** dreamy pink haze (floating island): soft light, glow, gentle fog. */
  dreamy: {
    background: { type: 'radial', colors: ['#f7dcd6', '#e9b9b4'], center: [0.5, 0.45], radius: 0.9 },
    sun: { color: '#fff1e8', intensity: 2.2, azimuth: 30, elevation: 58, softness: 2.4 },
    fill: { color: '#ffd1e0', intensity: 0.4, azimuth: 210, elevation: 20 },
    sky: { top: '#ffe3ea', horizon: '#fff3ee', bottom: '#d49a96', intensity: 1.25 },
    voxel: { ao: 0.6, rayAO: 0.75 },
    bloom: { strength: 0.45, radius: 0.9, threshold: 1.4 },
    fog: { amount: 0.25, near: 0.95, far: 1.5 },
    grade: { contrast: 0.97, saturation: 1.08, vibrance: 0.15, lift: [0.04, 0.02, 0.03] },
    vignette: { amount: 0.12, color: '#6a2a3a' },
    ground: { opacity: 0.25, color: '#7a2a3a', contact: 0.35 },
  },

  /** night city with neon (shipyard): navy dusk, lavender moonlight, strong bloom on emissives. */
  neon: {
    background: { type: 'radial', colors: ['#25317a', '#0e1540'], center: [0.5, 0.5], radius: 0.9 },
    sun: { color: '#b3b8ff', intensity: 1.5, azimuth: 210, elevation: 48, softness: 2 },
    fill: { color: '#ff7ac8', intensity: 0.35, azimuth: 40, elevation: 25 },
    sky: { top: '#6c74d8', horizon: '#7a5aa8', bottom: '#2a2050', intensity: 1.1, sunGlow: 0.2 },
    voxel: { emissive: 1, bakedLight: 1.2, ao: 0.75, edge: 0.04 },
    exposure: 1,
    bloom: { strength: 0.5, radius: 0.8, threshold: 1.5, knee: 0.6 },
    grade: { contrast: 1.06, saturation: 1.1, temperature: -0.1, vibrance: 0.15 },
    vignette: { amount: 0.3, color: '#05061a' },
    ground: { opacity: 0.3, color: '#02030f', contact: 0.5 },
  },

  /** cozy candle-lit interior (loft room): warm point light vibe, dark surround, glow. */
  cozy: {
    background: { type: 'radial', colors: ['#2a2420', '#0d0a08'], center: [0.5, 0.5], radius: 0.85 },
    sun: { color: '#9fb4ff', intensity: 0.45, azimuth: 200, elevation: 55, softness: 2 },
    sky: { top: '#3a3550', horizon: '#3a2a20', bottom: '#120c08', intensity: 0.35, sunGlow: 0.1 },
    voxel: { emissive: 1.2, bakedLight: 1.6, ao: 0.8, rayAO: 0.9, aoDirect: 0.4 },
    exposure: 1.05,
    bloom: { strength: 0.45, radius: 0.8, threshold: 1.4 },
    grade: { contrast: 1.1, saturation: 1.1, temperature: 0.2, lift: [0.02, 0.01, 0.0] },
    vignette: { amount: 0.4, softness: 0.8 },
    ground: { opacity: 0.6, color: '#000000', contact: 0.6, reflect: 0.35, blur: 0.5 },
  },

  /** monochrome clay render — shows form only. */
  clay: {
    background: { type: 'radial', colors: ['#d8d4cf', '#a9a49d'], radius: 1 },
    sun: { color: '#ffffff', intensity: 2.6, softness: 2.5 },
    sky: { top: '#ffffff', horizon: '#f0f0f0', bottom: '#9a9a9a', intensity: 1.1 },
    voxel: { saturation: 0, jitter: 0.4, bevel: 0.15 },
    bloom: { enabled: false },
    grade: { contrast: 1.05, saturation: 1 },
  },

  /** snow day: cold, bright, blue shadows. */
  winter: {
    background: { type: 'linear', colors: ['#dfe9f3', '#b8c9db'] },
    sun: { color: '#fff6ec', intensity: 2.6, azimuth: 25, elevation: 30, softness: 2 },
    sky: { top: '#a9c6ff', horizon: '#eef4ff', bottom: '#9fb2c8', intensity: 1.2 },
    grade: { temperature: -0.2, contrast: 1.04, saturation: 0.95 },
    ground: { color: '#203a6a', opacity: 0.3 },
  },
};

export function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

/** deep merge (arrays and non-objects replace) */
export function merge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = isObj(base?.[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k];
  return out;
}

/** look spec → full look object. Spec: name | object | [name, overrides] | [name, name2, overrides...] */
export function resolveLook(spec) {
  let out = merge({}, DEFAULT_LOOK);
  const parts = Array.isArray(spec) ? spec : [spec];
  for (const p of parts) {
    if (!p) continue;
    if (typeof p === 'string') {
      if (!LOOKS[p]) throw new Error(`unknown look "${p}" (have: ${Object.keys(LOOKS).join(', ')})`);
      out = merge(out, LOOKS[p]);
    } else out = merge(out, p);
  }
  return out;
}
