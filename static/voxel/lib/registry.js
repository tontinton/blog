// Extension registry. Everything a piece can ask for by name lives here, so extending the lib is:
// write the thing, register it with an `example`, and it is automatically unit-tested (tools/test.mjs),
// shown in the catalog (lab ?scene=catalog&kind=…) and listed in docs (tools/docs.mjs).
//
//   defineGenerator(myBridge, { category: 'build', summary: 'rope bridge', example: (g) => myBridge(g, [0, 1, 0]) });
//   defineShading('toonRim', { light: '...', uniforms: {...} });           // stage.add(g, { shading: 'toonRim' })
//   defineLook('sunrise', { sun: { elevation: 8 }, ... });                 // new Stage({ look: 'sunrise' })
//   defineParticles('ash', { motion: 'fall', colors: ['#666'], ... });    // stage.particles({ preset: 'ash' })
//   defineCreature('frog', (opts) => rig, { example: ... });              // stage.actors({ creature: 'frog' })
import { LOOKS } from './looks.js';
import { PARTICLE_PRESETS } from './particles.js';

const maps = { generator: new Map(), shading: new Map(), creature: new Map(), look: new Map(), particles: new Map() };

export function register(kind, name, value, meta = {}) {
  if (!maps[kind]) maps[kind] = new Map();
  maps[kind].set(name, { name, value, ...meta });
  return value;
}
/** All entries of a kind: [{ name, value, category, summary, example, ... }]. */
export const list = (kind) => [...(maps[kind]?.values() ?? [])];
export const lookup = (kind, name) => maps[kind]?.get(name);

/** A procedural generator (g, position, opts) → g. meta: { category, summary, example: (g) => void, materials } */
export function defineGenerator(fn, meta = {}) {
  return register('generator', meta.name ?? fn.name, fn, meta);
}
/** A named bundle of GLSL hooks (see material.js) — composable: stage.add(g, { shading: ['cel', 'rim'] }). */
export function defineShading(name, hooks, meta = {}) { return register('shading', name, hooks, meta); }
/** A look preset (partial look object, merged over DEFAULT_LOOK). */
export function defineLook(name, look, meta = {}) { LOOKS[name] = look; return register('look', name, look, meta); }
/** A particle preset (defaults for stage.particles). */
export function defineParticles(name, preset, meta = {}) { PARTICLE_PRESETS[name] = preset; return register('particles', name, preset, meta); }
/** A creature: factory(opts) → rig (see actors.js). meta.example: (stage) => actors. */
export function defineCreature(name, factory, meta = {}) { return register('creature', name, factory, meta); }

for (const [k, v] of Object.entries(LOOKS)) register('look', k, v, { builtin: true });
for (const [k, v] of Object.entries(PARTICLE_PRESETS)) register('particles', k, v, { builtin: true });

const STR_HOOKS = ['vertexPars', 'fragmentPars', 'vertex', 'color', 'emissive', 'fragment', 'light', 'output'];

/** Merge explicit hooks with named/inline shading bundles (strings concatenate in order, uniforms merge). */
export function combineHooks(hooks, shading) {
  const parts = [];
  for (const s of shading == null ? [] : Array.isArray(shading) ? shading : [shading]) {
    if (typeof s === 'string') {
      const e = lookup('shading', s);
      if (!e) throw new Error(`unknown shading "${s}" (have: ${list('shading').map((x) => x.name).join(', ')})`);
      parts.push(e.value);
    } else parts.push(s);
  }
  if (hooks) parts.push(hooks);
  if (!parts.length) return undefined;
  if (parts.length === 1) return parts[0];
  const out = { uniforms: {} };
  for (const p of parts) {
    Object.assign(out.uniforms, p.uniforms ?? {});
    for (const k of STR_HOOKS) if (p[k]) out[k] = (out[k] ? out[k] + '\n' : '') + p[k];
  }
  return out;
}

// ---- built-in shadings ------------------------------------------------------------------------------

defineShading('cel', {
  light: `{
    float celL = dot(reflectedLight.directDiffuse, vec3(0.333)) / max(dot(diffuseColor.rgb, vec3(0.333)), 1e-3);
    reflectedLight.directDiffuse = diffuseColor.rgb * (celL > 0.6 ? 1.0 : celL > 0.2 ? 0.55 : 0.2) * 2.2;
  }`,
}, { summary: '3-band toon lighting (pair with look "toon")' });

defineShading('rim', {
  uniforms: { uRim: { value: 0.6 } }, fragmentPars: 'uniform float uRim;',
  light: 'reflectedLight.indirectDiffuse += diffuseColor.rgb * pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0) * uRim;',
}, { summary: 'soft rim light on silhouettes (uniform uRim)' });

defineShading('posterize', {
  uniforms: { uPosterize: { value: 6 } }, fragmentPars: 'uniform float uPosterize;',
  output: 'gl_FragColor.rgb = floor(gl_FragColor.rgb * uPosterize + 0.5) / uPosterize;',
}, { summary: 'quantized color steps (uniform uPosterize)' });

defineShading('pulse', {
  emissive: 'emis += m0.rgb * mc.x * (0.5 + 0.5 * sin(uTime * (mc.y > 0.0 ? mc.y : 2.0) + cell.y * 0.4 + cell.x * 0.13));',
}, { summary: 'glow pulses on materials with custom: [strength, speed] (runes, screens, beacons)' });

defineShading('height-tint', {
  uniforms: { uTintLow: { value: [0.85, 0.9, 1.05] }, uTintRange: { value: [0, 40] } },
  fragmentPars: 'uniform vec3 uTintLow; uniform vec2 uTintRange;',
  color: 'col *= mix(uTintLow, vec3(1.0), clamp((cell.y - uTintRange.x) / max(uTintRange.y - uTintRange.x, 1.0), 0.0, 1.0));',
}, { summary: 'cool/dark tint toward the bottom (depth in tall scenes)' });
