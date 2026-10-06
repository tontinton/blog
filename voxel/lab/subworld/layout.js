// Shared contract for the "subworld" lab town: 3 regions in a row along x, each owned by a different
// author (subagent). Regions import this so the seams line up.
export const SIZE = 64;                       // each region is 64 × 64 voxels (x × z)
export const GROUND = 0;                      // the ground's top voxel is y = 0 → build objects from y = 1
export const Z0 = -32, Z1 = 31;               // every region spans z = -32..31
export const ROAD = { z0: -3, z1: 2, m: 'cobble' }; // east–west road through all regions (top voxel y = 0)
export const SHORE_X = 64;                    // docks: x ≥ 64 is sea
export const SEA = { top: -1, bottom: -4, m: 'sea', bed: 'sand' }; // water voxels y -4..-1 (surface 1 below land)
export const REGIONS = [
  { name: 'orchard', x0: -96, x1: -33 },
  { name: 'market', x0: -32, x1: 31 },
  { name: 'docks', x0: 32, x1: 95 },
].map((r) => ({ ...r, box: [[r.x0, -8, Z0], [r.x1, 60, Z1]] }));
