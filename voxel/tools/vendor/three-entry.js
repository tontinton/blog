// Entry for the vendored three.js bundle at static/voxel/lib/vendor/three.module.min.js.
// Everything from 'three' plus the few addons the voxel lib (or a piece) needs.
// Need another addon in a piece? Add it here and run `npm run vendor` in voxel/tools.
export * from 'three';
export { OrbitControls } from 'three/addons/controls/OrbitControls.js';
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
export { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
export { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
