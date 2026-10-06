// GPU particles: positions are a pure function of (seed, time) in the vertex shader, so thousands
// cost nothing on the CPU and freeze/resume perfectly with ?t=.
//
//   stage.particles({ preset: 'fireflies' })                          // fills the model bounds
//   stage.particles({ preset: 'snow', count: 2000 })
//   stage.particles({ preset: 'smoke', box: [[10, 30, 4], [12, 44, 6]], colors: ['#ddd'] })
//   stage.particles({ preset: 'cubes', colors: ['#ffd9e0', '#e0f0ff'], size: 0.5 })
//
// Options (preset values are defaults you can override):
//   count, box [[x0,y0,z0],[x1,y1,z1]] world space (default: scene bounds, padded)
//   motion  'drift' | 'fall' | 'rise' | 'float' | 'plume'   speed, turbulence, sway
//   shape   'soft' (glowing round sprite) | 'square' (pixel sprite) | 'cube' (instanced 3D cube)
//   lit     cubes only: true = sun/shadow-lit (petals, toy cubes), false = unlit glow
//   color | colors [up to 4], size, sizeJitter, glow (HDR multiplier → bloom), opacity
//   blink 0..1 (fireflies), blinkSpeed, spin (cubes), flat (cube y scale, petals/leaves), stretch (rain)
//   fade (fade-in/out near box ends, 0..0.5), seed
import * as THREE from './three.js';
import { rgb, srgbToLinear } from './color.js';
import { rng } from './random.js';

export const PARTICLE_PRESETS = {
  fireflies: { count: 90, motion: 'drift', shape: 'soft', colors: ['#d9ff7a', '#fff2a0', '#b6ff9a'], size: 0.45, glow: 6, blink: 0.85, blinkSpeed: 1.4, speed: 0.25, turbulence: 1, opacity: 1 },
  dust: { count: 260, motion: 'drift', shape: 'soft', colors: ['#fff6e0'], size: 0.18, sizeJitter: 0.6, glow: 1.4, speed: 0.08, turbulence: 0.6, opacity: 0.55 },
  sparkles: { count: 120, motion: 'drift', shape: 'soft', colors: ['#ffffff', '#fff1c0'], size: 0.3, glow: 8, blink: 1, blinkSpeed: 3, speed: 0.05, opacity: 1 },
  snow: { count: 1500, motion: 'fall', shape: 'soft', colors: ['#ffffff'], size: 0.28, sizeJitter: 0.5, glow: 1.1, speed: 0.5, sway: 1, opacity: 0.95 },
  rain: { count: 1800, motion: 'fall', shape: 'cube', lit: false, colors: ['#b8d4ff'], size: 0.06, stretch: 14, glow: 0.9, speed: 4, sway: 0, opacity: 0.5 },
  embers: { count: 120, motion: 'rise', shape: 'soft', colors: ['#ffb347', '#ff7a2a', '#ffd27a'], size: 0.22, glow: 9, blink: 0.6, blinkSpeed: 3, speed: 0.6, sway: 0.6, turbulence: 0.6, opacity: 1 },
  bubbles: { count: 80, motion: 'rise', shape: 'soft', colors: ['#d8f6ff'], size: 0.3, glow: 1.5, speed: 0.4, sway: 0.5, opacity: 0.5 },
  petals: { count: 160, motion: 'fall', shape: 'cube', lit: true, colors: ['#ffc4d6', '#ff9fbf', '#fff0f4'], size: 0.4, flat: 0.15, spin: 2, speed: 0.35, sway: 2, opacity: 1 },
  leaves: { count: 120, motion: 'fall', shape: 'cube', lit: true, colors: ['#e0a040', '#c8642a', '#9ab040'], size: 0.45, flat: 0.15, spin: 1.5, speed: 0.35, sway: 2, opacity: 1 },
  cubes: { count: 40, motion: 'float', shape: 'cube', lit: true, colors: ['#ffe6c4', '#ffd0d8', '#fff3d6'], size: 0.6, sizeJitter: 0.4, spin: 0.3, speed: 0.4, turbulence: 0.6, opacity: 1, glow: 0.35 },
  mist: { count: 70, motion: 'plume', shape: 'soft', colors: ['#ffffff', '#e8f4ff'], size: 1.6, sizeJitter: 0.5, glow: 1.1, speed: 0.08, sway: 1.5, turbulence: 0.8, opacity: 0.35, fade: 0.5 },
  smoke: { count: 60, motion: 'plume', shape: 'soft', colors: ['#d9d9d9', '#bfbfbf'], size: 2.2, sizeJitter: 0.4, glow: 0.9, speed: 0.15, sway: 1, turbulence: 0.5, opacity: 0.55, fade: 0.5 },
};

const MOTION = { drift: 0, fall: 1, rise: 2, float: 3, plume: 4 };

const MOTION_GLSL = /* glsl */ `
uniform float uTime; uniform vec3 uBoxMin; uniform vec3 uBoxSize;
uniform vec4 uMove; // motion, speed, turbulence, sway
uniform vec4 uLife; // blink, blinkSpeed, fade, spin
attribute vec4 aSeed; // base (0..1)^3, seed
attribute vec3 aCol;
varying vec3 vCol; varying float vAlpha;
float life = 0.0; // 0..1 along fall/rise
vec3 particlePos(out float alphaMul) {
  vec3 b = aSeed.xyz; float s = aSeed.w;
  float sp = uMove.y * (0.7 + 0.6 * fract(s * 7.31));
  float t = uTime * sp + s * 100.0;
  int m = int(uMove.x + 0.5);
  vec3 p = b;
  alphaMul = 1.0;
  vec3 wob = vec3(sin(t * 1.31 + s * 11.0) + 0.5 * sin(t * 2.7 + s * 5.0), sin(t * 0.93 + s * 23.0), cos(t * 1.13 + s * 31.0) + 0.5 * cos(t * 2.3 + s * 3.0));
  if (m == 0) { // drift: wander inside the box
    p += wob * 0.06 * uMove.z;
    p = 1.0 - abs(1.0 - mod(p, 2.0)); // mirror-wrap keeps it in [0,1]
  } else if (m == 1 || m == 2 || m == 4) { // fall / rise / plume: wrap along y
    float h = uTime * sp / max(uBoxSize.y, 1.0) * 2.0;
    life = fract(b.y + (m == 1 ? -h : h));
    p.y = m == 1 ? life : life;
    if (m == 1) life = 1.0 - life;
    float sw = uMove.w / max(uBoxSize.x, 1.0);
    p.x += sin(t * 0.9 + p.y * 6.0) * sw * 0.8 + wob.x * 0.02 * uMove.z;
    p.z += cos(t * 0.7 + p.y * 5.0) * sw * 0.8 + wob.z * 0.02 * uMove.z;
    if (m == 4) { // plume: starts narrow at the bottom, spreads with height
      vec2 c = vec2(0.5);
      p.xz = c + (p.xz - c) * (0.15 + 0.85 * life) + vec2(sin(life * 3.0 + s * 9.0), cos(life * 2.0 + s * 7.0)) * 0.08 * life * uMove.w;
    }
    p.xz = fract(p.xz);
    float f = max(uLife.z, 1e-3);
    alphaMul = smoothstep(0.0, f, life) * (1.0 - smoothstep(1.0 - f, 1.0, life));
  } else { // float: bob around the base point
    p += wob * vec3(0.012, 0.03, 0.012) * uMove.z;
  }
  if (uLife.x > 0.0) {
    float bl = 0.5 + 0.5 * sin(uTime * uLife.y * (0.6 + fract(s * 3.7)) + s * 40.0);
    alphaMul *= mix(1.0, smoothstep(0.25, 1.0, bl), uLife.x);
  }
  return uBoxMin + p * uBoxSize;
}
`;

export class Particles {
  constructor(stage, opts = {}) {
    const preset = PARTICLE_PRESETS[opts.preset] ?? {};
    const o = (this.opts = { count: 100, motion: 'drift', shape: 'soft', colors: ['#ffffff'], size: 0.3, sizeJitter: 0.3, glow: 1, opacity: 1, blink: 0, blinkSpeed: 1, speed: 0.3, turbulence: 1, sway: 0, spin: 0, flat: 1, stretch: 1, fade: 0.12, seed: 1, ...preset, ...opts });
    if (o.color) o.colors = [o.color];
    this.stage = stage;
    this.count = o.count;
    const R = rng(o.seed);
    // box: explicit or the stage bounds (resolved lazily since models may be added later)
    this.uniforms = {
      uTime: stage.uniforms.uTime,
      uBoxMin: { value: new THREE.Vector3() }, uBoxSize: { value: new THREE.Vector3(1, 1, 1) },
      uMove: { value: new THREE.Vector4(MOTION[o.motion] ?? 0, o.speed, o.turbulence, o.sway) },
      uLife: { value: new THREE.Vector4(o.blink, o.blinkSpeed, o.fade, o.spin) },
      uSize: { value: o.size }, uGlow: { value: o.glow }, uOpacity: { value: o.opacity },
      uPx: { value: 1 }, uFlat: { value: o.flat }, uStretch: { value: o.stretch },
    };
    const seeds = new Float32Array(o.count * 4), cols = new Float32Array(o.count * 3), sizes = new Float32Array(o.count);
    const palette = o.colors.map((c) => srgbToLinear(c));
    for (let i = 0; i < o.count; i++) {
      seeds.set([R(), R(), R(), R()], i * 4);
      cols.set(palette[i % palette.length], i * 3);
      sizes[i] = 1 + (R() * 2 - 1) * o.sizeJitter;
    }
    if (o.shape === 'cube') this.object = this._cubes(seeds, cols, sizes, o);
    else this.object = this._points(seeds, cols, sizes, o);
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
  }

  _points(seeds, cols, sizes, o) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(o.count * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    g.setAttribute('aCol', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, toneMapped: false,
      defines: { SOFT: o.shape === 'soft' ? 1 : 0 },
      vertexShader: `${MOTION_GLSL}
        uniform float uSize; uniform float uPx; attribute float aSize;
        bool isOrtho() { return projectionMatrix[2][3] == 0.0; }
        void main() {
          float am; vec3 wp = particlePos(am);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = uSize * aSize * uPx * (isOrtho() ? 1.0 : 1.0 / -mv.z);
          ${o.motion === 'plume' ? 'px *= 0.5 + 1.2 * life;' : ''}
          gl_PointSize = max(px, 1.0);
          vCol = aCol; vAlpha = am * clamp(px, 0.0, 1.0);
        }`,
      fragmentShader: `uniform float uGlow; uniform float uOpacity; varying vec3 vCol; varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float a = SOFT == 1 ? exp(-dot(p, p) * 3.0) - 0.05 : 1.0;
          if (a <= 0.0) discard;
          float al = clamp(a * vAlpha * uOpacity, 0.0, 1.0);
          if (isnan(al) || isinf(al)) discard;
          gl_FragColor = vec4(clamp(vCol * uGlow, 0.0, 64.0), al);
        }`,
    });
    return new THREE.Points(g, mat);
  }

  _cubes(seeds, cols, sizes, o) {
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(1, 1, 1));
    g.instanceCount = o.count;
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.setAttribute('aCol', new THREE.InstancedBufferAttribute(cols, 3));
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    const vert = /* glsl */ `
      uniform float uSize; uniform float uFlat; uniform float uStretch; attribute float aSize;
      mat3 rotXYZ(vec3 a) {
        vec3 c = cos(a), s = sin(a);
        return mat3(c.y * c.z, c.y * s.z, -s.y, s.x * s.y * c.z - c.x * s.z, s.x * s.y * s.z + c.x * c.z, s.x * c.y, c.x * s.y * c.z + s.x * s.z, c.x * s.y * s.z - s.x * c.z, c.x * c.y);
      }`;
    const body = /* glsl */ `
      float am; vec3 wp = particlePos(am);
      float sz = uSize * aSize * (0.25 + 0.75 * am);
      vec3 sc = vec3(sz, sz * uFlat * uStretch, sz);
      mat3 R = rotXYZ(vec3(aSeed.w * 6.28 + uTime * uLife.w * (0.5 + aSeed.x), aSeed.y * 6.28 + uTime * uLife.w * 0.7, aSeed.z * 6.28));
      if (uStretch > 1.0) R = mat3(1.0);
      vec3 transformed = R * (position * sc) + wp;
      vCol = aCol; vAlpha = am;`;
    let mat;
    if (o.lit) {
      mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, transparent: o.opacity < 1, opacity: o.opacity });
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.uniforms);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${MOTION_GLSL}\n${vert}`)
          .replace('#include <beginnormal_vertex>', `vec3 objectNormal = vec3(normal);`)
          .replace('#include <begin_vertex>', body)
          .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>\ntransformedNormal = normalMatrix * (rotXYZ(vec3(aSeed.w * 6.28 + uTime * uLife.w * (0.5 + aSeed.x), aSeed.y * 6.28 + uTime * uLife.w * 0.7, aSeed.z * 6.28)) * objectNormal);`)
          .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCol; varying float vAlpha; uniform float uGlow;')
          .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vCol, opacity * vAlpha );')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vCol * uGlow * 0.15;');
      };
      mat.customProgramCacheKey = () => 'voxel-particles-lit';
    } else {
      mat = new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true, depthWrite: false, toneMapped: false,
        vertexShader: `${MOTION_GLSL}\n${vert}\nvoid main() {${body}\n gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0); }`,
        fragmentShader: 'uniform float uGlow; uniform float uOpacity; varying vec3 vCol; varying float vAlpha; void main() { float al = clamp(vAlpha * uOpacity, 0.0, 1.0); if (isnan(al)) discard; gl_FragColor = vec4(clamp(vCol * uGlow, 0.0, 64.0), al); }',
      });
    }
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = !!o.lit && o.shadow !== false;
    if (mesh.castShadow) {
      const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      depth.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this.uniforms);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${MOTION_GLSL}\n${vert}`).replace('#include <begin_vertex>', body)
          .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;');
      };
      mesh.customDepthMaterial = depth;
    }
    return mesh;
  }

  /** Resolve the box (lazily from stage bounds) and pixel scale. Called by the stage each frame. */
  update() {
    const o = this.opts, s = this.stage, u = this.uniforms;
    let box = o.box;
    if (!box) {
      const b = s.bounds, pad = (o.pad ?? 0.08) * (s.radius ?? 10);
      box = [[b.min.x - pad, b.min.y, b.min.z - pad], [b.max.x + pad, b.max.y + pad * (o.motion === 'fall' ? 3 : 1), b.max.z + pad]];
    }
    u.uBoxMin.value.set(...box[0]);
    u.uBoxSize.value.set(box[1][0] - box[0][0], box[1][1] - box[0][1], box[1][2] - box[0][2]);
    // pixels per world unit (ortho) / per unit at distance 1 (persp)
    const cam = s.camera, H = s.h * s.dpr;
    u.uPx.value = cam.isOrthographicCamera ? (H / (cam.top - cam.bottom)) * cam.zoom : H / (2 * Math.tan((cam.fov * Math.PI) / 360));
  }

  set(opts) {
    Object.assign(this.opts, opts);
    const o = this.opts, u = this.uniforms;
    u.uMove.value.set(MOTION[o.motion] ?? 0, o.speed, o.turbulence, o.sway);
    u.uLife.value.set(o.blink, o.blinkSpeed, o.fade, o.spin);
    u.uSize.value = o.size; u.uGlow.value = o.glow; u.uOpacity.value = o.opacity;
  }
}
