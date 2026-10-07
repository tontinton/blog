// Post pipeline. The scene renders into an HDR, multisampled target cleared to transparent, so the
// alpha channel is "geometry coverage". Everything else happens here:
//
//   scene (HDR, MSAA, depth) → [DOF / tilt-shift] → bloom mip chain → composite → screen
//
// The scene target persists between frames, so the stage can redraw just the pixels that changed
// (renderScene with rects). Two extra layers are composited on read (sceneTex() in the shaders):
//   light layers  — the scene lit by one flickering light only, at intensity 1; the composite adds
//                   factor × layer, so a light whose brightness/color animates costs no scene redraw
//   particles     — GPU particles drawn over a copy of the scene depth into their own target each frame
//
// The composite draws the background (solid / gradient / radial, in display sRGB so the colors you
// pick are the colors you get), tone-maps the geometry, adds bloom (HDR inside geometry, screen-blended
// over the background), depth fog that fades into the background, color grading, vignette, chromatic
// aberration, grain and dithering.
import * as THREE from './three.js';
import { rgb as parseColor, mixColor } from './color.js';

const FSQ_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

function fsMaterial(fragmentShader, uniforms, defines = {}) {
  return new THREE.ShaderMaterial({ vertexShader: FSQ_VERT, fragmentShader, uniforms, defines, depthTest: false, depthWrite: false, toneMapped: false });
}

export const MAX_LIGHT_LAYERS = 4;
// scene color = cached scene + Σ factor × light layer, then particles over it (premultiplied "over")
const SCENE_TEX = /* glsl */ `
uniform sampler2D tScene;
#if VX_LAYERS > 0
uniform sampler2D tLayer0; uniform vec3 uLayerK[4];
#endif
#if VX_LAYERS > 1
uniform sampler2D tLayer1;
#endif
#if VX_LAYERS > 2
uniform sampler2D tLayer2;
#endif
#if VX_LAYERS > 3
uniform sampler2D tLayer3;
#endif
#if VX_PARTICLES
uniform sampler2D tParticles;
#endif
vec4 sceneTex(vec2 uv) {
  vec4 s = texture2D(tScene, uv);
  #if VX_LAYERS > 0
  s.rgb += uLayerK[0] * texture2D(tLayer0, uv).rgb;
  #endif
  #if VX_LAYERS > 1
  s.rgb += uLayerK[1] * texture2D(tLayer1, uv).rgb;
  #endif
  #if VX_LAYERS > 2
  s.rgb += uLayerK[2] * texture2D(tLayer2, uv).rgb;
  #endif
  #if VX_LAYERS > 3
  s.rgb += uLayerK[3] * texture2D(tLayer3, uv).rgb;
  #endif
  #if VX_PARTICLES
  vec4 p = texture2D(tParticles, uv);
  s = s * (1.0 - p.a) + p;
  #endif
  return s;
}
`;
const COPY = /* glsl */ `
uniform sampler2D tSrc; varying vec2 vUv;
void main() { gl_FragColor = texture2D(tSrc, vUv); }`;
const DIFF = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tBase; uniform float uInvStep; varying vec2 vUv;
void main() { gl_FragColor = vec4((texture2D(tSrc, vUv).rgb - texture2D(tBase, vUv).rgb) * uInvStep, 0.0); }`;
const MERGE = /* glsl */ `
${SCENE_TEX}
varying vec2 vUv;
void main() { gl_FragColor = sceneTex(vUv); }`;
const DEPTH_COPY = /* glsl */ `
uniform sampler2D tDepth; varying vec2 vUv;
void main() { gl_FragDepth = texture2D(tDepth, vUv).r; }`;

const BLOOM_DOWN = /* glsl */ `
uniform vec2 uTexel; uniform vec4 uThresh; // threshold, knee, prefilter on, clamp
#if VX_SCENE
${SCENE_TEX}
#define SRC(uv) sceneTex(uv)
#else
uniform sampler2D tSrc;
#define SRC(uv) texture2D(tSrc, uv)
#endif
varying vec2 vUv;
vec3 tap(vec2 o) {
  vec3 c = SRC(vUv + o * uTexel).rgb;
  return any(isnan(c)) || any(isinf(c)) ? vec3(0.0) : clamp(c, 0.0, 1024.0); // a NaN/Inf texel would spread through every mip
}
float karis(vec3 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }
void main() {
  // 13-tap downsample (Jimenez 2014)
  vec3 a = tap(vec2(-2, 2)), b = tap(vec2(0, 2)), c = tap(vec2(2, 2));
  vec3 d = tap(vec2(-2, 0)), e = tap(vec2(0, 0)), f = tap(vec2(2, 0));
  vec3 g = tap(vec2(-2, -2)), h = tap(vec2(0, -2)), i = tap(vec2(2, -2));
  vec3 j = tap(vec2(-1, 1)), k = tap(vec2(1, 1)), l = tap(vec2(-1, -1)), m = tap(vec2(1, -1));
  vec3 col;
  if (uThresh.z > 0.5) {
    // Karis average on the first pass kills fireflies
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);
    col = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
    float br = max(col.r, max(col.g, col.b));
    float soft = clamp(br - uThresh.x + uThresh.y, 0.0, 2.0 * uThresh.y);
    soft = soft * soft / (4.0 * uThresh.y + 1e-4);
    col *= max(soft, br - uThresh.x) / max(br, 1e-4);
    col = min(col, vec3(uThresh.w));
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const BLOOM_UP = /* glsl */ `
uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTexel; uniform float uRadius;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tLow, vUv + vec2(-1, 1) * uTexel).rgb + texture2D(tLow, vUv + vec2(1, 1) * uTexel).rgb
         + texture2D(tLow, vUv + vec2(-1, -1) * uTexel).rgb + texture2D(tLow, vUv + vec2(1, -1) * uTexel).rgb
         + 2.0 * (texture2D(tLow, vUv + vec2(0, 1) * uTexel).rgb + texture2D(tLow, vUv + vec2(0, -1) * uTexel).rgb
         + texture2D(tLow, vUv + vec2(1, 0) * uTexel).rgb + texture2D(tLow, vUv + vec2(-1, 0) * uTexel).rgb)
         + 4.0 * texture2D(tLow, vUv).rgb;
  gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + s / 16.0 * uRadius, 1.0);
}`;

const DEPTH_FN = /* glsl */ `
uniform vec2 uCam; // near, far
uniform float uOrtho;
float viewZ(float d) {
  if (uOrtho > 0.5) return uCam.x + d * (uCam.y - uCam.x);
  return (uCam.x * uCam.y) / ((uCam.y - uCam.x) * d - uCam.y);
}
float linDepth(float d) { return uOrtho > 0.5 ? viewZ(d) : -viewZ(d); }
`;

const DOF = /* glsl */ `
uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uRes;
uniform vec4 uDof;  // mode (1 depth, 2 tilt-shift), focus (depth units | screen y 0..1), range, max blur px
uniform vec4 uDof2; // tilt angle (rad), band (screen fraction, tilt-shift), bokeh brightness boost, -
${DEPTH_FN}
varying vec2 vUv;
float coc(vec2 uv, float d) {
  float c;
  if (uDof.x > 1.5) {
    vec2 p = uv - 0.5;
    float y = -sin(uDof2.x) * p.x + cos(uDof2.x) * p.y + 0.5;
    c = (abs(y - uDof.y) - uDof2.y) / max(uDof.z, 1e-3);
  } else {
    if (d >= 1.0) d = 0.9999999;
    c = (abs(linDepth(d) - uDof.y) - uDof2.y) / max(uDof.z, 1e-3);
  }
  return clamp(c, 0.0, 1.0) * uDof.w;
}
void main() {
  float d0 = texture2D(tDepth, vUv).r;
  float c0 = coc(vUv, d0);
  vec4 acc = vec4(0.0); float wsum = 0.0;
  const int N = DOF_SAMPLES;
  const float GA = 2.39996323;
  for (int i = 0; i < N; i++) {
    float r = sqrt((float(i) + 0.5) / float(N));
    float th = float(i) * GA;
    vec2 o = vec2(cos(th), sin(th)) * r;
    vec2 uv = vUv + o * max(c0, 0.5) / uRes;
    float ds = texture2D(tDepth, uv).r;
    float cs = coc(uv, ds);
    // a sample contributes if its own blur reaches us (scatter-as-gather); foreground bleeds over focus
    float reach = max(c0, 0.5) * r;
    float w = smoothstep(reach - 1.0, reach + 0.5, cs) + (ds < d0 ? 0.0 : step(reach, c0 + 0.5) * 0.25);
    vec4 s = texture2D(tSrc, uv);
    float lum = dot(s.rgb, vec3(0.3, 0.59, 0.11));
    w *= 1.0 + uDof2.z * smoothstep(0.8, 3.0, lum);
    acc += s * w; wsum += w;
  }
  vec4 col = wsum > 0.0 ? acc / wsum : texture2D(tSrc, vUv);
  gl_FragColor = col;
}`;

const COMPOSITE = /* glsl */ `
#include <tonemapping_pars_fragment>
${SCENE_TEX}
uniform sampler2D tBloom; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uTime;
uniform float uExposure; uniform int uTone;
uniform vec4 uBgA; // type (0 solid, 1 linear, 2 radial), angle | cx, cy, radius
uniform vec4 uBgB; // power, mid position, noise, -
uniform vec3 uBg0; uniform vec3 uBg1; uniform vec3 uBg2;
uniform vec4 uBloom; // strength, -, -, -
uniform vec3 uBloomTint;
uniform vec4 uFog; // near, far (linear depth), amount, use custom color
uniform vec3 uFogColor;
uniform vec4 uGrade; // contrast, saturation, temperature, tint
uniform vec4 uGrade2; // vibrance, hue shift (deg), black level, grade background (0/1)
uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain;
uniform vec4 uVig; // amount, softness, roundness, -
uniform vec3 uVigColor;
uniform vec4 uFx; // grain, chromatic aberration, dither, grain size
uniform vec4 uStars; // density, brightness, size (px), horizon fade
uniform vec4 uDisc; // x, y (screen 0..1), radius (fraction of height), glow
uniform vec3 uDiscColor;
uniform vec4 uOutline; // amount, model radius (ortho depth scale), width (px), threshold (depth step / radius or / depth)
uniform vec3 uOutlineColor;
${DEPTH_FN}
varying vec2 vUv;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 oetf(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 tonemap(vec3 c) {
  if (uTone == 1) return ACESFilmicToneMapping(c);
  if (uTone == 2) return AgXToneMapping(c);
  if (uTone == 3) return NeutralToneMapping(c);
  if (uTone == 4) return ReinhardToneMapping(c);
  if (uTone == 5) return CineonToneMapping(c);
  return clamp(c, 0.0, 1.0);
}
vec3 background(vec2 uv) {
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  float t;
  if (uBgA.x < 0.5) return uBg0;
  if (uBgA.x < 1.5) {
    vec2 dir = vec2(sin(uBgA.y), cos(uBgA.y));
    t = clamp(dot((uv - 0.5) * asp, dir) / (0.5 * (abs(dir.x) * asp.x + abs(dir.y))) * 0.5 + 0.5, 0.0, 1.0);
  } else {
    t = clamp(length((uv - uBgA.yz) * asp) / max(uBgA.w, 1e-3), 0.0, 1.0);
  }
  t = pow(t, uBgB.x);
  vec3 c = t < uBgB.y ? mix(uBg0, uBg2, t / max(uBgB.y, 1e-3)) : mix(uBg2, uBg1, (t - uBgB.y) / max(1.0 - uBgB.y, 1e-3));
  return c;
}
vec3 grade(vec3 c) {
  // white balance (simple warm/cool + green/magenta), in display space
  c *= vec3(1.0 + uGrade.z * 0.1 - uGrade.w * 0.02, 1.0 + uGrade.w * 0.08, 1.0 - uGrade.z * 0.1 - uGrade.w * 0.02);
  // lift / gamma / gain
  c = uGain * (c + uLift * (1.0 - c));
  c = pow(max(c, 0.0), 1.0 / max(uGamma, vec3(1e-3)));
  // contrast around mid grey
  c = (c - 0.5) * uGrade.x + 0.5;
  // saturation + vibrance
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uGrade.y);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = mix(vec3(l), c, 1.0 + uGrade2.x * (1.0 - sat));
  // hue rotation
  if (uGrade2.y != 0.0) {
    float a = radians(uGrade2.y), cs = cos(a), sn = sin(a);
    mat3 m = mat3(0.299 + 0.701 * cs + 0.168 * sn, 0.299 - 0.299 * cs - 0.328 * sn, 0.299 - 0.3 * cs + 1.25 * sn,
                  0.587 - 0.587 * cs + 0.330 * sn, 0.587 + 0.413 * cs + 0.035 * sn, 0.587 - 0.588 * cs - 1.05 * sn,
                  0.114 - 0.114 * cs - 0.497 * sn, 0.114 - 0.114 * cs + 0.292 * sn, 0.114 + 0.886 * cs - 0.203 * sn);
    c = m * c;
  }
  c = max(c, vec3(uGrade2.z));
  return clamp(c, 0.0, 1.0);
}
void main() {
  vec2 uv = vUv;
  vec4 s = sceneTex(uv);
  if (uFx.y > 0.0) {
    vec2 d = (uv - 0.5) * uFx.y * 0.01;
    s.r = sceneTex(uv - d).r; s.b = sceneTex(uv + d).b;
  }
  float a = isnan(s.a) ? 0.0 : clamp(s.a, 0.0, 1.0);
  vec3 c = a > 1e-4 ? s.rgb / a : vec3(0.0);
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  c = clamp(c, 0.0, 1024.0);
  vec3 bloom = texture2D(tBloom, uv).rgb * uBloom.x * uBloomTint;
  if (any(isnan(bloom)) || any(isinf(bloom))) bloom = vec3(0.0);
  vec3 geo = oetf(tonemap((c + bloom) * uExposure));
  geo = grade(geo);
  vec3 bg = background(uv);
  if (uStars.x > 0.0) {
    float cs = 3.0 * max(uStars.z, 0.5);
    vec2 sg = uv * uRes / cs, cid = floor(sg);
    float sh = h12(cid + 0.37);
    if (sh < uStars.x) {
      vec2 sp = vec2(h12(cid + 1.3), h12(cid + 7.1)) * 0.6 + 0.2;
      float sd = length(fract(sg) - sp) * cs;
      float tw = 0.65 + 0.35 * sin(uTime * (0.8 + 2.5 * h12(cid + 3.3)) + sh * 60.0);
      float mag = pow(1.0 - sh / uStars.x, 2.0);
      bg += vec3(0.9, 0.93, 1.0) * (1.0 - smoothstep(0.0, 0.6 + mag * uStars.z, sd)) * uStars.y * tw * (0.25 + mag) * smoothstep(0.0, max(uStars.w, 1e-3), uv.y);
    }
  }
  if (uDisc.z > 0.0) {
    float dd = length((uv - uDisc.xy) * vec2(uRes.x / uRes.y, 1.0)) / uDisc.z;
    bg = mix(bg, uDiscColor, 1.0 - smoothstep(0.92, 1.0, dd));
    bg += uDiscColor * uDisc.w * exp(-max(dd - 1.0, 0.0) * 2.5) * 0.35;
  }
  if (uBgB.z > 0.0) bg += (h12(uv * uRes) - 0.5) * uBgB.z;
  vec3 bgl = oetf(tonemap(bloom * uExposure));
  bg = 1.0 - (1.0 - bg) * (1.0 - bgl);
  if (uGrade2.w > 0.5) bg = grade(bg);
  if (uFog.z > 0.0 && a > 0.0) {
    float d = texture2D(tDepth, uv).r;
    float z = linDepth(min(d, 0.9999999));
    float f = smoothstep(uFog.x, max(uFog.y, uFog.x + 1e-3), z) * uFog.z;
    geo = mix(geo, uFog.w > 0.5 ? uFogColor : bg, f);
  }
  vec3 col = mix(bg, geo, a);
  // ink outline: second difference of linear depth (zero on planes, large at steps/creases/silhouettes)
  if (uOutline.x > 0.0) {
    vec2 px = uOutline.z / uRes;
    float dc = linDepth(min(texture2D(tDepth, uv).r, 0.9999999));
    float dl = linDepth(min(texture2D(tDepth, uv - vec2(px.x, 0.0)).r, 0.9999999));
    float dr = linDepth(min(texture2D(tDepth, uv + vec2(px.x, 0.0)).r, 0.9999999));
    float dd = linDepth(min(texture2D(tDepth, uv - vec2(0.0, px.y)).r, 0.9999999));
    float du = linDepth(min(texture2D(tDepth, uv + vec2(0.0, px.y)).r, 0.9999999));
    float e = max(abs(dl + dr - 2.0 * dc), abs(dd + du - 2.0 * dc)) / max(uOrtho > 0.5 ? uOutline.y : dc, 1e-3);
    float ow = max(uOutline.w, 1e-4);
    float edge = smoothstep(ow, ow * 2.0, e) * step(0.001, a);
    col = mix(col, uOutlineColor, edge * uOutline.x);
  }
  // vignette
  if (uVig.x > 0.0) {
    vec2 p = (uv - 0.5) * vec2(mix(1.0, uRes.x / uRes.y, uVig.z), 1.0);
    float vs = max(uVig.y, 1e-3);
    float v = smoothstep(0.8 - vs * 0.5, 0.8 + vs * 0.5, length(p) * 1.414);
    col = mix(col, uVigColor, v * uVig.x);
  }
  // film grain (luma-weighted), dithering
  if (uFx.x > 0.0) {
    vec2 gp = floor(uv * uRes / max(uFx.w, 1.0));
    float g = h12(gp + fract(uTime * 7.13) * 431.0) - 0.5;
    col += g * uFx.x * (1.0 - 0.6 * dot(col, vec3(0.333)));
  }
  col += (h12(uv * uRes + 17.0) - 0.5) * uFx.z / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const TONE = { none: 0, aces: 1, agx: 2, neutral: 3, reinhard: 4, cineon: 5 };

export class Post {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.samples = opts.samples ?? 4;
    this.quad = new THREE.FullScreenQuad(null);
    this.w = this.h = 1;
    this.levels = 6;
    this.scene = this._makeSceneTarget(1, 1);
    this.dofTarget = this._rt(1, 1);
    this.mergeTarget = null;    // composed scene for DOF (lazy)
    this.layerTargets = [];     // light layers (lazy)
    this.particleTarget = null; // lazy
    this.layers = 0;            // light layers composited this frame (stage.setComposition)
    this.particles = false;     // particle layer composited this frame
    this.down = []; this.up = [];
    for (let i = 0; i < this.levels; i++) { this.down.push(this._rt(1, 1)); this.up.push(this._rt(1, 1)); }
    // sources of sceneTex(): shared by the composite, the first bloom pass and the DOF merge
    this.su = {
      tScene: { value: null }, tParticles: { value: null },
      tLayer0: { value: null }, tLayer1: { value: null }, tLayer2: { value: null }, tLayer3: { value: null },
      uLayerK: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    };
    this.mDown = fsMaterial(BLOOM_DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: new THREE.Vector4(1, 0.5, 0, 32) } }, { VX_SCENE: 0 });
    this.mUp = fsMaterial(BLOOM_UP, { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.85 } });
    const cam = { uCam: { value: new THREE.Vector2(0.1, 100) }, uOrtho: { value: 0 } };
    this.cam = cam;
    this.mDof = fsMaterial(DOF, { tSrc: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uDof: { value: new THREE.Vector4() }, uDof2: { value: new THREE.Vector4() }, ...cam }, { DOF_SAMPLES: 48 });
    this.u = {
      ...this.su,
      tBloom: { value: null }, tDepth: { value: null }, toneMappingExposure: { value: 1 },
      uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uExposure: { value: 1 }, uTone: { value: 2 },
      uBgA: { value: new THREE.Vector4() }, uBgB: { value: new THREE.Vector4(1, 0.5, 0, 0) },
      uBg0: { value: new THREE.Color() }, uBg1: { value: new THREE.Color() }, uBg2: { value: new THREE.Color() },
      uBloom: { value: new THREE.Vector4() }, uBloomTint: { value: new THREE.Color(1, 1, 1) },
      uFog: { value: new THREE.Vector4() }, uFogColor: { value: new THREE.Color() },
      uGrade: { value: new THREE.Vector4(1, 1, 0, 0) }, uGrade2: { value: new THREE.Vector4(0, 0, 0, 0) },
      uLift: { value: new THREE.Vector3() }, uGamma: { value: new THREE.Vector3(1, 1, 1) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
      uVig: { value: new THREE.Vector4() }, uVigColor: { value: new THREE.Color() },
      uFx: { value: new THREE.Vector4(0, 0, 1, 1) },
      uStars: { value: new THREE.Vector4() }, uDisc: { value: new THREE.Vector4() }, uDiscColor: { value: new THREE.Color() }, uOutline: { value: new THREE.Vector4() }, uOutlineColor: { value: new THREE.Color() },
      ...cam,
    };
    this.variants = new Map();
    this.mCopy = fsMaterial(COPY, { tSrc: { value: null } });
    this.mDiff = fsMaterial(DIFF, { tSrc: { value: null }, tBase: { value: null }, uInvStep: { value: 1 } });
    this.mDepthCopy = new THREE.ShaderMaterial({ vertexShader: FSQ_VERT, fragmentShader: DEPTH_COPY, uniforms: { tDepth: { value: null } }, depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, colorWrite: false });
  }

  // composite / first bloom pass / DOF merge, compiled per (light layers, particles) combination
  _variant(kind, layers, particles) {
    const key = `${kind}|${layers}|${particles ? 1 : 0}`;
    let m = this.variants.get(key);
    if (!m) {
      const defines = { VX_LAYERS: layers, VX_PARTICLES: particles ? 1 : 0, VX_SCENE: 1 };
      m = kind === 'comp' ? fsMaterial(COMPOSITE, this.u, defines)
        : kind === 'down' ? fsMaterial(BLOOM_DOWN, { ...this.mDown.uniforms, ...this.su }, defines)
          : fsMaterial(MERGE, this.su, defines);
      this.variants.set(key, m);
    }
    return m;
  }

  _rt(w, h) {
    return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  }
  _makeSceneTarget(w, h) {
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    return new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.samples, depthTexture, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }

  setSize(w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    for (const t of [this.scene, this.dofTarget, this.mergeTarget, this.particleTarget, ...this.layerTargets]) t?.setSize(w, h);
    let bw = Math.max(1, w >> 1), bh = Math.max(1, h >> 1);
    for (let i = 0; i < this.levels; i++) {
      this.down[i].setSize(bw, bh); this.up[i].setSize(bw, bh);
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this.u.uRes.value.set(w, h);
    this.mDof.uniforms.uRes.value.set(w, h);
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  // run fn with target's scissor (+ viewport) limited to rect q ({ x, y, w, h }, pixels, bottom-left origin)
  _scissored(target, q, fn, viewport = false) {
    if (!q) return fn();
    target.scissorTest = true; target.scissor.set(q.x, q.y, q.w, q.h);
    if (viewport) target.viewport.set(q.x, q.y, q.w, q.h);
    try { return fn(); } finally {
      target.scissorTest = false; target.scissor.set(0, 0, target.width, target.height); target.viewport.set(0, 0, target.width, target.height);
    }
  }

  /**
   * Draw the scene into the HDR MSAA target. rects: null = the whole frame; [{ x, y, w, h }] = only those
   * pixels (everything else keeps what the target held), each through a sub-frustum camera
   * (setViewOffset) so three frustum-culls the clusters outside the rect.
   */
  renderScene(scene, camera, rects = null) {
    const r = this.renderer, rt = this.scene;
    const prevClear = r.getClearColor(_c), prevAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    if (!rects) {
      r.setRenderTarget(rt);
      r.render(scene, camera);
      this.sceneInfo = { calls: r.info.render.calls, triangles: r.info.render.triangles }; // before post passes reset it
    } else {
      for (const q of rects) this._scissored(rt, q, () => {
        camera.setViewOffset(this.w, this.h, q.x, this.h - q.y - q.h, q.w, q.h);
        try { r.setRenderTarget(rt); r.render(scene, camera); } finally { camera.clearViewOffset(); }
      }, true);
    }
    r.setClearColor(prevClear, prevAlpha);
  }

  /** Copy the scene target's (resolved) color into light layer i (rects: only those pixels). */
  copyLayer(i, rects = null) {
    const t = (this.layerTargets[i] ??= this._rt(this.w, this.h));
    this.mCopy.uniforms.tSrc.value = this.scene.texture;
    for (const q of rects ?? [null]) this._scissored(t, q, () => this._pass(this.mCopy, t));
  }

  /** Light layer i = (scene target − layer base) / step: a finite-difference derivative (moving lights). */
  diffLayer(i, base, step, rects = null) {
    const t = (this.layerTargets[i] ??= this._rt(this.w, this.h));
    const u = this.mDiff.uniforms;
    u.tSrc.value = this.scene.texture; u.tBase.value = this.layerTargets[base].texture; u.uInvStep.value = 1 / step;
    for (const q of rects ?? [null]) this._scissored(t, q, () => this._pass(this.mDiff, t));
  }

  /**
   * Draw the objects on `layer` (particles) into their own MSAA target over a copy of the scene depth, so
   * the scene underneath can stay cached. Lights must be on `layer` too.
   */
  renderParticles(scene, camera, layer) {
    const r = this.renderer;
    const t = (this.particleTarget ??= this._makeSceneTarget(this.w, this.h));
    const prevClear = r.getClearColor(_c), prevAlpha = r.getClearAlpha(), ac = r.autoClear, mask = camera.layers.mask;
    r.setClearColor(0x000000, 0);
    this.mDepthCopy.uniforms.tDepth.value = this.scene.depthTexture;
    this._pass(this.mDepthCopy, t); // clears, then writes the scene depth
    r.autoClear = false;
    camera.layers.set(layer);
    try { r.render(scene, camera); } finally { camera.layers.mask = mask; r.autoClear = ac; r.setClearColor(prevClear, prevAlpha); }
  }

  /** Apply a resolved `look` (see looks.js) to the uniforms. Cheap; call when the look changes. */  applyLook(L) {
    const u = this.u;
    u.uExposure.value = L.exposure;
    u.uTone.value = TONE[L.toneMapping] ?? 2;
    const bg = L.background;
    const type = { solid: 0, linear: 1, gradient: 1, radial: 2 }[bg.type] ?? 0;
    u.uBgA.value.set(type, type === 1 ? ((bg.angle ?? 0) * Math.PI) / 180 : bg.center?.[0] ?? 0.5, bg.center?.[1] ?? 0.5, bg.radius ?? 0.75);
    u.uBgB.value.set(bg.power ?? 1, bg.mid ?? 0.5, bg.noise ?? 0.006, 0);
    const cols = bg.color ? [bg.color] : bg.colors; // a singular `color` always wins (solid)
    const c0 = cols[0], c1 = cols[cols.length - 1], c2 = cols.length > 2 ? cols[1] : null;
    setDisplay(u.uBg0.value, c0); setDisplay(u.uBg1.value, c1); setDisplay(u.uBg2.value, c2 ?? mixHex(c0, c1));
    if (!c2) u.uBgB.value.y = 0.5;
    u.uBloom.value.set(L.bloom.enabled === false ? 0 : L.bloom.strength, 0, 0, 0);
    setDisplay(u.uBloomTint.value, L.bloom.tint ?? '#ffffff');
    this.mDown.uniforms.uThresh.value.set(L.bloom.threshold, L.bloom.knee, 0, L.bloom.clamp ?? 32);
    this.mUp.uniforms.uRadius.value = L.bloom.radius;
    const g = L.grade;
    u.uGrade.value.set(g.contrast, g.saturation, g.temperature, g.tint);
    u.uGrade2.value.set(g.vibrance, g.hue, g.black, g.background ? 1 : 0);
    u.uLift.value.set(...g.lift); u.uGamma.value.set(...g.gamma); u.uGain.value.set(...g.gain);
    u.uVig.value.set(L.vignette.amount, L.vignette.softness, L.vignette.roundness ?? 1, 0);
    setDisplay(u.uVigColor.value, L.vignette.color ?? '#000000');
    u.uFx.value.set(L.grain.amount, L.chromatic ?? 0, L.dither ?? 1, L.grain.size ?? 1);
    if (L.fog.color) setDisplay(u.uFogColor.value, L.fog.color);
    const st = bg.stars ?? 0, so = typeof st === 'object' ? st : { amount: st };
    u.uStars.value.set(so.amount ? (so.density ?? 0.05) : 0, so.amount ?? 0, so.size ?? 1, so.horizon ?? 0.25);
    const dc = bg.disc;
    u.uDisc.value.set(dc?.at?.[0] ?? 0.8, dc?.at?.[1] ?? 0.8, dc ? dc.radius ?? 0.05 : 0, dc?.glow ?? 0.6);
    setDisplay(u.uDiscColor.value, dc?.color ?? '#fff6e0');
    const ol = L.outline ?? {};
    u.uOutline.value.set(ol.amount ?? 0, this.u.uOutline.value.y || 10, ol.width ?? 1, ol.threshold ?? 0.015);
    setDisplay(u.uOutlineColor.value, ol.color ?? '#1a1410');
    this.look = L;
  }

  /** Whole pipeline in one go: the full scene, then post (no layers). */
  render(scene, camera, opts = {}) {
    this.renderScene(scene, camera);
    this.layers = 0; this.particles = false;
    this.finish(camera, opts);
  }

  /**
   * Post-process what renderScene/copyLayer/renderParticles left (this.layers light layers with factors in
   * su.uLayerK, this.particles) and draw it to the screen.
   */
  finish(camera, { time = 0, fog = null, dof = null, radius = 10 } = {}) {
    this.u.uOutline.value.y = radius;
    const L = this.look, su = this.su;
    const layers = this.layers, particles = this.particles && !!this.particleTarget;
    su.tScene.value = this.scene.texture;
    for (let i = 0; i < 4; i++) su[`tLayer${i}`].value = i < layers ? this.layerTargets[i].texture : null;
    su.tParticles.value = particles ? this.particleTarget.texture : null;
    const depth = particles ? this.particleTarget.depthTexture : this.scene.depthTexture;
    this.cam.uCam.value.set(camera.near, camera.far);
    this.cam.uOrtho.value = camera.isOrthographicCamera ? 1 : 0;
    let color = null; // null → the composed scene (sceneTex), read directly by the first bloom pass + composite
    // DOF
    if (dof) {
      let src = this.scene.texture;
      if (layers || particles) {
        this.mergeTarget ??= this._rt(this.w, this.h);
        this._pass(this._variant('merge', layers, particles), this.mergeTarget);
        src = this.mergeTarget.texture;
      }
      const m = this.mDof.uniforms;
      m.tSrc.value = src; m.tDepth.value = depth;
      m.uDof.value.set(dof.mode, dof.focus, dof.range, dof.maxBlur);
      m.uDof2.value.set(dof.angle ?? 0, dof.band ?? 0, dof.bokeh ?? 0.6, 0);
      this._pass(this.mDof, this.dofTarget);
      color = this.dofTarget.texture;
    }
    // bloom
    const bloomOn = L.bloom.enabled !== false && L.bloom.strength > 0;
    if (bloomOn) {
      let src = color;
      const levels = Math.max(1, Math.min(this.levels, L.bloom.levels ?? this.levels));
      for (let i = 0; i < levels; i++) {
        const d = this.mDown.uniforms;
        const first = i === 0;
        d.tSrc.value = src;
        const img = first ? { width: this.w, height: this.h } : this.down[i - 1];
        d.uTexel.value.set(1 / img.width, 1 / img.height);
        d.uThresh.value.z = first ? 1 : 0;
        this._pass(first && !color ? this._variant('down', layers, particles) : this.mDown, this.down[i]);
        src = this.down[i].texture;
      }
      let low = this.down[levels - 1].texture;
      for (let i = levels - 2; i >= 0; i--) {
        const uu = this.mUp.uniforms;
        uu.tLow.value = low; uu.tHigh.value = this.down[i].texture;
        uu.uTexel.value.set(1 / this.down[i + 1].width, 1 / this.down[i + 1].height);
        this._pass(this.mUp, this.up[i]);
        low = this.up[i].texture;
      }
      this.u.tBloom.value = levels > 1 ? this.up[0].texture : this.down[0].texture;
    } else {
      this.u.tBloom.value = blackTex();
    }
    // composite
    if (color) su.tScene.value = color;
    this.u.tDepth.value = depth;
    this.u.uTime.value = time;
    if (fog) this.u.uFog.value.set(fog.near, fog.far, fog.amount, L.fog.color ? 1 : 0);
    else this.u.uFog.value.z = 0;
    this._pass(color ? this._variant('comp', 0, false) : this._variant('comp', layers, particles), null);
  }

  dispose() {
    [this.scene, this.dofTarget, this.mergeTarget, this.particleTarget, ...this.layerTargets, ...this.down, ...this.up].forEach((t) => t?.dispose());
    [this.mDown, this.mUp, this.mDof, this.mCopy, this.mDiff, this.mDepthCopy, ...this.variants.values()].forEach((m) => m.dispose());
    this.quad.dispose();
  }
}

const _c = new THREE.Color();
let _black = null;
function blackTex() {
  if (!_black) { _black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); _black.needsUpdate = true; }
  return _black;
}

// Colors handed to the composite are display-referred sRGB: store the raw values (no color management).
function setDisplay(target, c) {
  const [r, g, b] = parseColor(c);
  return target.setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}
const mixHex = (a, b) => mixColor(a, b, 0.5);
