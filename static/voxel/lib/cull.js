// Face-direction culling. The mesher sorts every voxel mesh into 12 buckets (face direction in the cyclic
// order +x +y +z -x -y -z, each split into still | swaying quads; geometry.userData.ranges). A face can only
// be seen from the side its normal points to, so for any view at most 3 of the 6 directions are visible
// (ortho camera / directional light: exactly 3) — the stage draws only those, halving vertex work in the
// main, reflection and shadow passes. Meshes carry a material array ([material]) so three draws
// geometry.groups; the stage rewrites the groups before each pass.
import * as THREE from './three.js';

const ORDER = [0, 2, 4, 1, 3, 5]; // bucket position → face direction (0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z)
const ALL = 63;
const _inv = new THREE.Matrix4(), _v = new THREE.Vector3();

/**
 * Bitmask (bit = bucket position) of the face directions of `mesh` that can face a view.
 *   dir: world direction the camera looks / the light travels (ortho camera, directional light)
 *   pos: world camera position (perspective camera)
 *   back: true → faces pointing away (three renders back faces into shadow maps)
 */
export function faceMask(mesh, { dir, pos, back = false }) {
  if (mesh.isInstancedMesh || !mesh.geometry.userData.ranges) return ALL;
  _inv.copy(mesh.matrixWorld).invert();
  let mask = 0;
  if (dir) {
    // normals transform with the inverse transpose, so n·d in world = n_local·(M⁻¹ d)
    _v.copy(dir).applyMatrix3(_m3.setFromMatrix4(_inv));
    const eps = 1e-6 * _v.length();
    for (let p = 0; p < 6; p++) {
      const d = ORDER[p], a = d >> 1, s = d & 1 ? -1 : 1, c = s * _v.getComponent(a);
      if (back ? c > -eps : c < eps) mask |= 1 << p;
    }
  } else {
    if (back) return ALL;
    _v.copy(pos).applyMatrix4(_inv);
    const b = mesh.geometry.boundingBox;
    for (let p = 0; p < 6; p++) {
      const d = ORDER[p], a = d >> 1;
      if (d & 1 ? _v.getComponent(a) < b.max.getComponent(a) + 1e-3 : _v.getComponent(a) > b.min.getComponent(a) - 1e-3) mask |= 1 << p;
    }
  }
  return mask;
}
const _m3 = new THREE.Matrix3();

/**
 * Point the mesh's draw groups at the buckets in `mask`. part: 'all' (still + swaying), 'still', 'sway'.
 * Adjacent buckets merge into one draw. `set` names an independent group list ('cam', 'shadow'): three
 * keeps references to the group objects of a pass it has already sorted, so the shadow pass (which runs
 * inside the camera's render call) must not rewrite the camera's. Returns the number of quads drawn.
 */
export function setFaceGroups(mesh, mask = ALL, part = 'all', set = 'cam') {
  const g = mesh.geometry, r = g.userData.ranges;
  const sets = (g.userData.groupSets ??= {});
  const gs = (sets[set] ??= { list: [], pool: [] }), groups = gs.list, pool = gs.pool;
  g.groups = groups;
  groups.length = 0;
  if (!r) { groups.push(pooled(pool, 0, 0, Infinity)); return Infinity; }
  let quads = 0, n = 0;
  for (let p = 0; p < 6; p++) {
    if (!(mask & (1 << p))) continue;
    const s0 = r[p * 2], m = r[p * 2 + 1], e = r[p * 2 + 2];
    const a = part === 'sway' ? m : s0, b = part === 'still' ? m : e;
    if (b <= a) continue;
    quads += b - a;
    const last = n ? groups[n - 1] : null;
    if (last && last.start + last.count === a * 6) last.count += (b - a) * 6; // adjacent in the buffer: one draw
    else { groups.push(pooled(pool, n, a * 6, (b - a) * 6)); n++; }
  }
  return quads;
}

/** Re-select a group list set earlier (e.g. the camera's after a shadow pass). */
export function useFaceGroups(mesh, set = 'cam') {
  const l = mesh.geometry.userData.groupSets?.[set];
  if (l) mesh.geometry.groups = l.list;
}

function pooled(pool, i, start, count) {
  const o = (pool[i] ??= { start: 0, count: 0, materialIndex: 0 });
  o.start = start; o.count = count;
  return o;
}

/** Quads in a bucket subset (for stats / deciding whether a pass is worth it). */
export function bucketQuads(geometry, part = 'all') {
  const r = geometry.userData.ranges;
  if (!r) return 0;
  let n = 0;
  for (let p = 0; p < 6; p++) n += part === 'sway' ? r[p * 2 + 2] - r[p * 2 + 1] : part === 'still' ? r[p * 2 + 1] - r[p * 2] : r[p * 2 + 2] - r[p * 2];
  return n;
}
