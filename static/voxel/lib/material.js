// The voxel shader: three's MeshStandard/MeshPhysical lighting (shadows, env, point lights) with the
// voxel bits injected — packed attributes, palette-texture materials, per-voxel color variation,
// fake bevels, vertex + ray AO, baked emissive light, flicker, wind sway, water ripples.
//
// All tunables are uniforms shared by every voxel material of a Stage (stage.uniforms / look), so a
// look change or the debug panel never recompiles. Pieces can inject GLSL with `hooks`:
//
//   stage.add(grid, { hooks: {
//     uniforms: { uPulse: { value: 0 } },
//     fragmentPars: 'uniform float uPulse;',
//     color: 'col *= 1.0 + 0.3 * uPulse * step(20.0, cell.y);',        // after per-voxel color
//     emissive: 'emis += vec3(1, .2, .1) * uPulse * mc.x;',            // mc = material custom vec4
//     vertex: 'transformed.y += sin(uTime + transformed.x) * 0.1 * mc.y;',
//     fragment: 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1), 0.1);', // end of color setup
//     light: 'reflectedLight.directDiffuse = ...;',   // after all lighting + AO (cel shading, rim light…)
//     output: 'gl_FragColor.rgb *= 1.0;',              // final linear HDR color before post
//   }})
//
// GLSL available in hooks: cell (vec3 voxel coords), nObj (object normal), vObj (object pos), mid
// (int material id), m0..m3 (material texels: color+kind, rough/metal/emissive/sway, emissive
// color+flicker, jitter/bevel/grid/ao), mc (material custom vec4), h (per-voxel hash), uTime, col.
import * as THREE from './three.js';
import { hashString } from './random.js';

export const GLSL_COMMON = /* glsl */ `
uniform sampler2D uMat;
uniform float uTime;
vec4 matT(int id, int t) { return texelFetch(uMat, ivec2((id % 256) * 16 + t, id / 256), 0); }
vec3 dirNormal(int d) {
  int a = d >> 1; float s = (d & 1) == 1 ? -1.0 : 1.0;
  return a == 0 ? vec3(s, 0, 0) : a == 1 ? vec3(0, s, 0) : vec3(0, 0, s);
}
vec3 dirU(int d) { int a = (d >> 1); return a == 0 ? vec3(0, 1, 0) : a == 1 ? vec3(0, 0, 1) : vec3(1, 0, 0); }
vec3 dirV(int d) { int a = (d >> 1); return a == 0 ? vec3(0, 0, 1) : a == 1 ? vec3(1, 0, 0) : vec3(0, 1, 0); }
float vhash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 vhash33(vec3 p3) { p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(vhash13(i), vhash13(i + vec3(1, 0, 0)), f.x), mix(vhash13(i + vec3(0, 1, 0)), vhash13(i + vec3(1, 1, 0)), f.x), f.y);
  float b = mix(mix(vhash13(i + vec3(0, 0, 1)), vhash13(i + vec3(1, 0, 1)), f.x), mix(vhash13(i + vec3(0, 1, 1)), vhash13(i + vec3(1, 1, 1)), f.x), f.y);
  return mix(a, b, f.z);
}
float vfbm3(vec3 p) { return vnoise3(p) * 0.57 + vnoise3(p * 2.03 + 7.1) * 0.29 + vnoise3(p * 4.01 - 3.3) * 0.14; }
`;

const VERT_PARS = /* glsl */ `
${GLSL_COMMON}
attribute float aFace;
attribute vec4 aInfo;
attribute vec4 aEdge;
#ifdef VOXEL_LIGHT
attribute vec4 aLight;
varying vec3 vVLight;
#endif
uniform vec4 uWind; // dir.xz, strength, speed
uniform float uSeed;
flat varying int vMid;
flat varying int vFace;
varying vec3 vObj;
varying vec4 vEdge;
varying vec2 vOcc;
flat varying vec3 vTU;
flat varying vec3 vTV;
`;

// Rigged instancing (actors): every vertex carries its part index; per instance, each part's rig-space
// matrix (3×4 rows) lives in a float texture → a whole multi-part creature is ONE instanced draw call.
const RIG_PARS = /* glsl */ `
#ifdef VOXEL_RIG
attribute float aPart;
uniform highp sampler2D uRig;
uniform int uRigStride;
vec4 vxRigTexel(int i) { return texelFetch(uRig, ivec2(i % 1024, i / 1024), 0); }
mat4 vxRigMatrix() {
  int i = gl_InstanceID * uRigStride + int(aPart + 0.5) * 3;
  vec4 a = vxRigTexel(i), b = vxRigTexel(i + 1), c = vxRigTexel(i + 2);
  return mat4(a.x, b.x, c.x, 0.0, a.y, b.y, c.y, 0.0, a.z, b.z, c.z, 0.0, a.w, b.w, c.w, 1.0);
}
#endif
`;

// shared by the color and depth materials: decode + sway
const VERT_BEGIN = /* glsl */ `
int fbits = int(aFace + 0.5);
int fdir = fbits & 7;
int mid = int(aInfo.x + 0.5) + int(aInfo.y + 0.5) * 256;
vec3 objectNormal = dirNormal(fdir);
vec4 m1v = matT(mid, 1);
vec4 mcv = matT(mid, 12);
#ifdef VOXEL_RIG
mat4 vxRig = vxRigMatrix();
objectNormal = mat3(vxRig) * objectNormal;
#endif
`;
const VERT_SWAY = /* glsl */ `
vec3 transformed = vec3(position);
#ifdef VOXEL_RIG
transformed = (vxRig * vec4(transformed, 1.0)).xyz;
#endif
if (m1v.w > 0.0 && uWind.z > 0.0) {
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  float ph = wp.x * 0.11 + wp.z * 0.07;
  float tt = uTime * uWind.w;
  float gust = 0.65 + 0.35 * sin(tt * 0.31 + wp.x * 0.013 - wp.z * 0.02);
  float sw = sin(tt * 1.7 + ph) * gust + 0.35 * sin(tt * 3.1 + ph * 2.3 + wp.y * 0.4);
  transformed.xz += normalize(uWind.xy + 1e-5) * sw * m1v.w * uWind.z * 0.09;
  transformed.y += sin(tt * 2.3 + ph * 1.7) * m1v.w * uWind.z * 0.02;
}
`;

const FRAG_PARS = /* glsl */ `
${GLSL_COMMON}
uniform vec4 uAO;     // vertex AO strength, ray AO strength, AO on direct light, AO gamma
uniform vec4 uBevel;  // width (voxels), normal strength, edge lighten(+)/darken(-), grid line width
uniform vec4 uLook;   // emissive mult, baked light mult, jitter mult, saturation
uniform vec4 uWater;  // ripple scale, ripple speed, ripple strength, scattering glow
uniform float uSeed;
flat varying int vMid;
flat varying int vFace;
varying vec3 vObj;
varying vec4 vEdge;
varying vec2 vOcc;
flat varying vec3 vTU;
flat varying vec3 vTV;
#ifdef VOXEL_LIGHT
varying vec3 vVLight;
#endif
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
`;

const FRAG_COLOR = /* glsl */ `
int mid = vMid;
int fdir = vFace & 7;
int fmask = vFace >> 3;
vec3 nObj = dirNormal(fdir);
vec3 cell = floor(vObj - nObj * 0.5 + 1e-3 * nObj);
vec4 m0 = matT(mid, 0), m1 = matT(mid, 1), m2 = matT(mid, 2), m3 = matT(mid, 3);
vec4 mc = matT(mid, 12);
vec3 hv = vhash33(cell + uSeed * 17.0 + 0.5);
float h = hv.x;
vec3 col = m0.rgb;
// random pick among up to 4 colors
vec4 p1 = matT(mid, 4);
if (p1.w > 1.5) {
  float k = floor(hv.y * p1.w);
  col = k < 0.5 ? m0.rgb : k < 1.5 ? p1.rgb : k < 2.5 ? matT(mid, 5).rgb : matT(mid, 6).rgb;
}
// smooth noise blend
vec4 nz = matT(mid, 7);
if (nz.w > 0.0) {
  vec4 np = matT(mid, 8);
  float n = vfbm3(cell * np.x + uSeed * 3.1 + 11.0);
  n = clamp((n - 0.5 + np.z) * np.y + 0.5, 0.0, 1.0);
  col = mix(col, nz.rgb, n * nz.w);
}
// axis gradient
vec4 gz = matT(mid, 9);
if (gz.w > 0.0) {
  vec4 gp = matT(mid, 10);
  float ax = gp.x < 0.5 ? cell.x : gp.x < 1.5 ? cell.y : cell.z;
  col = mix(col, gz.rgb, clamp((ax - gp.y) / max(gp.z - gp.y, 1e-3), 0.0, 1.0) * gz.w);
}
// per-voxel brightness + hue jitter
float jit = m3.x * uLook.z;
col *= 1.0 + (h - 0.5) * 2.0 * jit;
vec4 m11 = matT(mid, 11);
if (m11.w > 0.0) { vec3 hsv = rgb2hsv(col); hsv.x = fract(hsv.x + (hv.z - 0.5) * m11.w / 180.0); col = hsv2rgb(hsv); }
if (uLook.w != 1.0) { float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = max(mix(vec3(l), col, uLook.w), 0.0); }
// voxel grid lines (even across merged faces)
if (m3.z > 0.0 && uBevel.w > 0.0) {
  vec3 U = dirU(fdir), V = dirV(fdir);
  vec2 q = vec2(dot(vObj, U), dot(vObj, V));
  vec2 fq = abs(fract(q) - 0.5);
  vec2 fw = fwidth(q);
  vec2 ln = smoothstep(0.5 - uBevel.w - fw, 0.5 - uBevel.w + fw, fq);
  col *= 1.0 - m3.z * max(ln.x, ln.y);
}
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
col *= vColor.rgb; // per-instance tint (InstancedMesh.setColorAt) — actor color variety
#endif
/*VOXEL_COLOR_HOOK*/
vec4 diffuseColor = vec4(col * diffuse, opacity);
`;

const FRAG_BEVEL = /* glsl */ `
float edgeK = 0.0;
{
  float bw = uBevel.x * m3.y;
  if (bw > 0.0 && fmask != 0) {
    vec3 b = vec3(0.0);
    float e;
    if ((fmask & 1) != 0) { e = 1.0 - smoothstep(0.0, bw, vEdge.x); b -= vTU * e; edgeK = max(edgeK, e); }
    if ((fmask & 2) != 0) { e = 1.0 - smoothstep(0.0, bw, vEdge.y); b += vTU * e; edgeK = max(edgeK, e); }
    if ((fmask & 4) != 0) { e = 1.0 - smoothstep(0.0, bw, vEdge.z); b -= vTV * e; edgeK = max(edgeK, e); }
    if ((fmask & 8) != 0) { e = 1.0 - smoothstep(0.0, bw, vEdge.w); b += vTV * e; edgeK = max(edgeK, e); }
    normal = normalize(normal + b * uBevel.y);
  }
}
#ifdef VOXEL_WATER
if (m0.w > 0.5 && m0.w < 1.5 && fdir == 2) {
  vec2 p = vObj.xz * uWater.x;
  float t = uTime * uWater.y;
  vec2 g = vec2(cos(p.x * 1.3 + t) * 1.3 + cos((p.x + p.y) * 0.9 + t * 0.8) * 0.9 + cos(p.x * 3.1 - p.y * 1.7 + t * 1.9) * 0.5,
                cos(p.y * 1.7 - t * 1.2) * 1.7 + cos((p.x + p.y) * 0.9 + t * 0.8) * 0.9 - cos(p.x * 3.1 - p.y * 1.7 + t * 1.9) * 0.3);
  normal = normalize(normal - (vTV * g.x + vTU * g.y) * 0.06 * uWater.z * matT(mid, 11).z);
}
#endif
diffuseColor.rgb *= 1.0 + uBevel.z * edgeK;
`;

const FRAG_EMISSIVE = /* glsl */ `
vec3 emis = vec3(0.0);
if (m1.z > 0.0) {
  float fl = 1.0;
  if (m2.w > 0.0) {
    float sp = matT(mid, 10).w;
    float ph = vhash13(floor(cell / 2.0) + 3.7) * 6.2831;
    float tt = uTime * sp;
    float n = 0.5 + 0.5 * sin(tt * 7.3 + ph) * sin(tt * 4.1 + ph * 1.7 + 1.0) + 0.25 * sin(tt * 17.0 + ph * 3.0);
    fl = 1.0 - m2.w * clamp(n, 0.0, 1.0);
  }
  emis = m2.rgb * m1.z * fl * uLook.x * (1.0 + (h - 0.5) * 2.0 * jit);
}
#ifdef VOXEL_WATER
if (m0.w > 0.5 && m0.w < 1.5) emis += m0.rgb * uWater.w * (1.0 - 0.5 * matT(mid, 11).x); // in-scattering: water keeps its color in shade
#endif
/*VOXEL_EMISSIVE_HOOK*/
totalEmissiveRadiance += emis;
`;

const FRAG_AO = /* glsl */ `
{
  float ao = pow(vOcc.x, uAO.w);
  float vao = mix(1.0, ao, uAO.x * m3.w);
  float rao = mix(1.0, vOcc.y, uAO.y * m3.w);
  float occ = vao * rao;
  reflectedLight.indirectDiffuse *= occ;
  reflectedLight.indirectSpecular *= occ;
  reflectedLight.directDiffuse *= mix(1.0, occ, uAO.z);
  reflectedLight.directSpecular *= mix(1.0, occ, uAO.z);
  #ifdef VOXEL_LIGHT
  reflectedLight.indirectDiffuse += vVLight * 4.0 * uLook.y * diffuseColor.rgb * mix(1.0, vao, 0.6);
  #endif
}
/*VOXEL_LIGHT_HOOK*/
`;

/** Default values for the shared voxel uniforms (a Stage owns one set; looks write into it). */
export function createVoxelUniforms(palette) {
  return {
    uMat: { value: palette.texture() },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector4(1, 0.4, 1, 1) },
    uSeed: { value: 0 },
    uAO: { value: new THREE.Vector4(0.75, 0.8, 0.35, 1) },
    uBevel: { value: new THREE.Vector4(0.12, 0.6, 0.06, 0.035) },
    uLook: { value: new THREE.Vector4(1, 1, 1, 1) },
    uWater: { value: new THREE.Vector4(0.9, 1, 1, 0.25) },
  };
}

function hookKey(hooks) {
  if (!hooks) return 0;
  const txt = ['vertexPars', 'fragmentPars', 'vertex', 'color', 'emissive', 'fragment', 'light', 'output'].map((k) => hooks[k] ?? '').join('|') + Object.keys(hooks.uniforms ?? {}).join(',');
  return hashString(txt);
}

function applyHooks(shader, hooks = {}) {
  if (hooks.uniforms) Object.assign(shader.uniforms, hooks.uniforms);
  if (hooks.vertexPars) shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${hooks.vertexPars}`);
  if (hooks.fragmentPars) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${hooks.fragmentPars}`);
  if (hooks.vertex) shader.vertexShader = shader.vertexShader.replace('/*VOXEL_VERTEX_HOOK*/', hooks.vertex);
  shader.fragmentShader = shader.fragmentShader
    .replace('/*VOXEL_COLOR_HOOK*/', hooks.color ?? '')
    .replace('/*VOXEL_EMISSIVE_HOOK*/', hooks.emissive ?? '')
    .replace('/*VOXEL_FRAGMENT_HOOK*/', hooks.fragment ?? '')
    .replace('/*VOXEL_LIGHT_HOOK*/', hooks.light ?? '')
    .replace('/*VOXEL_OUTPUT_HOOK*/', hooks.output ?? '');
}

const VERT_MAIN_TAIL = /* glsl */ `
vMid = mid;
vFace = fbits;
vObj = position;
vEdge = aEdge;
vOcc = vec2(aInfo.z / 255.0, aInfo.w / 255.0);
vec3 tU = dirU(fdir), tV = dirV(fdir);
#ifdef VOXEL_RIG
tU = mat3(vxRig) * tU; tV = mat3(vxRig) * tV;
#endif
#ifdef USE_INSTANCING
tU = mat3(instanceMatrix) * tU; tV = mat3(instanceMatrix) * tV;
#endif
vTU = normalize(normalMatrix * tU);
vTV = normalize(normalMatrix * tV);
#ifdef VOXEL_LIGHT
vVLight = aLight.rgb;
#endif
`;

/**
 * Create the voxel material. opts:
 *   uniforms   shared uniform object (from createVoxelUniforms) — required
 *   light      true if the geometry has baked light (aLight)
 *   transparent  water/glass pass (MeshPhysical + transmission)
 *   transmission true → refraction (renders an extra opaque pass); false → alpha blend
 *   hooks      GLSL injections (see top of file)
 *   rig        true for rigged instanced geometry (aPart + uRig/uRigStride uniforms, see actors.js)
 */
export function createVoxelMaterial(opts) {
  const { uniforms, light, transparent, hooks } = opts;
  const transmission = transparent && opts.transmission !== false;
  const mat = transparent
    ? new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 0, transmission: transmission ? 1 : 0, thickness: 1.5, ior: 1.33, transparent: !transmission, opacity: 1, depthWrite: true, specularIntensity: 1 })
    : new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
  mat.metalness = transparent ? 0 : 1; // per-voxel metalness multiplies this
  mat.defines = { ...(mat.defines ?? {}), VOXEL: 1 };
  if (light) mat.defines.VOXEL_LIGHT = 1;
  if (transparent) mat.defines.VOXEL_WATER = 1;
  if (opts.rig) mat.defines.VOXEL_RIG = 1;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}\n${RIG_PARS}`)
      .replace('#include <beginnormal_vertex>', VERT_BEGIN)
      .replace('#include <begin_vertex>', `${VERT_SWAY}\n/*VOXEL_VERTEX_HOOK*/`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>\n${VERT_MAIN_TAIL}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', FRAG_COLOR)
      .replace('#include <color_fragment>', '/*VOXEL_FRAGMENT_HOOK*/')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = m1.x * roughness;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = m1.y * metalness;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAG_BEVEL}`)
      .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE)
      .replace('#include <aomap_fragment>', FRAG_AO)
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n/*VOXEL_OUTPUT_HOOK*/');
    if (transparent) {
      // per-material clarity (opacity 0 → fully refractive, 1 → solid color) and ior. Both assignments live
      // inside included chunks, so splice in patched copies of the chunks.
      const C = THREE.ShaderChunk;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <transmission_fragment>', C.transmission_fragment.replace('material.transmission = transmission;', 'material.transmission = transmission * (1.0 - matT(mid, 11).x);'))
        .replace('#include <lights_physical_fragment>', C.lights_physical_fragment.replace('material.ior = ior;', 'material.ior = matT(mid, 11).y;'))
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n#ifndef USE_TRANSMISSION\ngl_FragColor.a = mix(0.25, 1.0, matT(mid, 11).x);\n#endif`);
      if (!shader.fragmentShader.includes('matT(mid, 11).y')) console.warn('voxel: ior patch failed (three version changed?)');
    }
    applyHooks(shader, hooks);
    mat.userData.shader = shader;
  };
  const hk = hookKey(hooks);
  mat.customProgramCacheKey = () => `voxel-${transparent ? (transmission ? 't' : 'a') : 's'}-${light ? 1 : 0}-${opts.rig ? 'r' : ''}-${hk}`;
  return mat;
}

/**
 * Shadow material that follows sway and skips materials with `shadow: false`.
 * Directional/spot shadows use the depth variant; point-light shadows need `distance: true`.
 */
export function createVoxelDepthMaterial(opts) {
  const { uniforms, hooks } = opts;
  const mat = opts.distance ? new THREE.MeshDistanceMaterial() : new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  if (opts.rig) mat.defines = { ...(mat.defines ?? {}), VOXEL_RIG: 1 };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\n${RIG_PARS}\nattribute float aFace;\nattribute vec4 aInfo;\nuniform vec4 uWind;\nflat varying int vMid;`)
      .replace('#include <begin_vertex>', `${VERT_BEGIN}\n${VERT_SWAY}\n/*VOXEL_VERTEX_HOOK*/\nvMid = mid;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}\nflat varying int vMid;`)
      .replace('vec4 diffuseColor = vec4( 1.0 );', 'vec4 diffuseColor = vec4( 1.0 );\nif (matT(vMid, 13).x > 0.5) discard;');
    if (hooks?.uniforms) Object.assign(shader.uniforms, hooks.uniforms);
    if (hooks?.vertexPars) shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${hooks.vertexPars}`);
    shader.vertexShader = shader.vertexShader.replace('/*VOXEL_VERTEX_HOOK*/', hooks?.vertex ?? '');
  };
  const hk = hookKey(hooks);
  mat.customProgramCacheKey = () => `voxel-${opts.distance ? 'distance' : 'depth'}-${opts.rig ? 'r' : ''}-${hk}`;
  return mat;
}
