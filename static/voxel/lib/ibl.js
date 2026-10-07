// Image-based lighting table for flat voxel faces. three's MeshStandard IBL samples the PMREM environment
// twice per pixel (irradiance + radiance, each a manual bilinear cube-UV lookup with ~60 ALU) — the single
// most expensive part of the voxel shader. But a voxel face's normal is one of 6 axis directions, and with
// the default orthographic camera the view direction is the same for every pixel, so both lookups only
// depend on (face direction, material roughness). This renders them for every material of a palette into
// a small float texture (x = material id, y = direction; row 6 = irradiance per direction) whenever the
// environment, the camera direction or the palette changes, and the voxel shader (material.js) reads one
// texel instead. Bevel edges, water ripples, rotated models and perspective radiance keep the full path.
import * as THREE from './three.js';

const ROWS = 7;

const FRAG = /* glsl */ `
#define ENVMAP_TYPE_CUBE_UV
#include <common>
#include <cube_uv_reflection_fragment>
uniform sampler2D envMap; uniform sampler2D uMat; uniform vec3 uView;
vec3 axisDir(int d) { float s = (d & 1) == 1 ? -1.0 : 1.0; int a = d >> 1; return a == 0 ? vec3(s, 0, 0) : a == 1 ? vec3(0, s, 0) : vec3(0, 0, s); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  if (p.y == 6) { gl_FragColor = vec4(p.x < 6 ? textureCubeUV(envMap, axisDir(p.x), 1.0).rgb : vec3(0.0), 1.0); return; }
  vec3 n = axisDir(p.y);
  // same roughness the voxel shader ends up with on a flat face (lights_physical_fragment, no geometry roughness)
  float r = min(max(texelFetch(uMat, ivec2((p.x % 256) * 16 + 1, p.x / 256), 0).x, 0.0525), 1.0);
  vec3 rv = normalize(mix(reflect(-uView, n), n, pow4(r)));
  gl_FragColor = vec4(textureCubeUV(envMap, rv, r).rgb, 1.0);
}`;

export class IblTable {
  constructor(renderer) {
    this.renderer = renderer;
    this.tables = new Map(); // palette → { rt, key }
    this.on = new THREE.Vector2(0, 0); // shared by every voxel material: (irradiance table valid, radiance table valid)
    this.quad = new THREE.FullScreenQuad(null);
    this.mat = null;
    this.maxWidth = Math.min(4096, renderer.capabilities.maxTextureSize);
    this.type = renderer.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
  }

  /** Uniforms a voxel material needs for `palette` (merge into its uniforms object). */
  uniformsFor(palette) {
    const t = this._table(palette);
    return { uIbl: t.uniform, uIblOn: { value: this.on } };
  }

  _table(palette) {
    let t = this.tables.get(palette);
    if (!t) this.tables.set(palette, (t = { rt: null, key: '', uniform: { value: null } }));
    return t;
  }

  /**
   * Bring every palette's table up to date for this environment + camera. env: the PMREM texture (or null).
   * Returns nothing; sets the shared `on` flags (radiance only for orthographic cameras).
   */
  update(env, camera, palettes) {
    const ok = !!env && env.mapping === THREE.CubeUVReflectionMapping && env.image?.height > 0;
    if (!ok) { this.on.set(0, 0); return; }
    const view = camera.isOrthographicCamera ? new THREE.Vector3(0, 0, 1).transformDirection(camera.matrixWorld) : null;
    const viewKey = view ? `${view.x},${view.y},${view.z}` : 'p';
    for (const P of palettes) {
      const n = Math.max(6, P.size);
      if (n > this.maxWidth) { this.on.set(0, 0); return; }
      const t = this._table(P);
      const key = `${env.uuid}|${viewKey}|${P.version}|${n}`;
      if (t.key === key) continue;
      t.key = key;
      if (!t.rt || t.rt.width < n) {
        t.rt?.dispose();
        t.rt = new THREE.WebGLRenderTarget(Math.max(n, t.rt ? t.rt.width * 2 : 64), ROWS, { type: this.type, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
        t.uniform.value = t.rt.texture;
      }
      this._render(t.rt, env, P.texture(), view ?? new THREE.Vector3(0, 0, 1));
    }
    this.on.set(1, view ? 1 : 0);
  }

  _render(rt, env, matTex, view) {
    const h = env.image.height, maxMip = Math.log2(h) - 2;
    const defines = { CUBEUV_TEXEL_WIDTH: 1 / (3 * Math.max(2 ** maxMip, 7 * 16)), CUBEUV_TEXEL_HEIGHT: 1 / h, CUBEUV_MAX_MIP: `${maxMip}.0` };
    const dk = JSON.stringify(defines);
    if (!this.mat || this.mat.userData.dk !== dk) {
      this.mat?.dispose();
      this.mat = new THREE.ShaderMaterial({
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FRAG, defines,
        uniforms: { envMap: { value: null }, uMat: { value: null }, uView: { value: new THREE.Vector3() } }, depthTest: false, depthWrite: false,
      });
      this.mat.userData.dk = dk;
    }
    const u = this.mat.uniforms;
    u.envMap.value = env; u.uMat.value = matTex; u.uView.value.copy(view);
    const r = this.renderer, prev = r.getRenderTarget();
    this.quad.material = this.mat;
    r.setRenderTarget(rt);
    this.quad.render(r);
    r.setRenderTarget(prev);
  }

  dispose() {
    for (const t of this.tables.values()) t.rt?.dispose();
    this.tables.clear();
    this.mat?.dispose();
    this.quad.dispose();
  }
}

/** GLSL: getIBLIrradiance / getIBLRadiance reading the table for axis-aligned normals (see material.js). */
export function iblChunk(chunk) {
  const renamed = chunk.replace(/getIBLIrradiance\(/g, 'vxIBLIrradiance0(').replace(/getIBLRadiance\(/g, 'vxIBLRadiance0(');
  return `${renamed}
#ifdef USE_ENVMAP
uniform sampler2D uIbl; uniform vec2 uIblOn;
int vxAxis(vec3 n) {
  vec3 a = abs(n);
  if (a.x > 0.99999) return n.x > 0.0 ? 0 : 1;
  if (a.y > 0.99999) return n.y > 0.0 ? 2 : 3;
  if (a.z > 0.99999) return n.z > 0.0 ? 4 : 5;
  return -1;
}
vec3 getIBLIrradiance( const in vec3 normal ) {
  if (uIblOn.x > 0.5) {
    int ax = vxAxis(transformNormalByInverseViewMatrix(normal, viewMatrix));
    if (ax >= 0) return PI * texelFetch(uIbl, ivec2(ax, 6), 0).rgb * envMapIntensity;
  }
  return vxIBLIrradiance0(normal);
}
vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
  if (uIblOn.y > 0.5 && roughness == min(max(matT(vMid, 1).x * roughness, 0.0525), 1.0)) {
    int ax = vxAxis(transformNormalByInverseViewMatrix(normal, viewMatrix));
    if (ax >= 0) return texelFetch(uIbl, ivec2(vMid, ax), 0).rgb * envMapIntensity;
  }
  return vxIBLRadiance0(viewDir, normal, roughness);
}
#endif
`;
}
