// Shared layout constants (CPU side and shader side must agree).
export const CHUNK_BITS = 5;
export const CHUNK = 1 << CHUNK_BITS; // 32³ voxels per storage/mesh chunk
export const MAT_TEXELS = 16; // texels per material in the palette texture
export const MAT_PER_ROW = 256; // materials per texture row
