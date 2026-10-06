---
name: voxel-art
description: Create, edit or restyle 3D voxel art pieces (isometric dioramas, cutaway rooms, floating islands, toy characters, neon cities) for the blog's /voxel section, using the shared library in static/voxel/lib. Use for any request to make a voxel artwork or scene, change how a piece looks (lighting, bloom, DOF, colors), or extend the voxel renderer, generators or tooling.
---

# Voxel art pieces

Everything lives in two places:
- `static/voxel/lib/` — the published no-build ES-module library (three.js r186 vendored). Pieces import `../lib/index.js`.
- `voxel/` (repo root, unpublished) — `README.md` (start here), `docs/{api,looks,cookbook,tools}.md`, `template/`, `lab/` (worked examples / tests), `tools/` (`new.mjs`, `shot.mjs`, `serve.mjs`).

## Workflow

1. Read `voxel/README.md` (mental model + gotchas). Load `docs/api.md` for exact signatures, `docs/looks.md`
   for lighting/mood, `docs/cookbook.md` for technique recipes. Skim the closest lab scene
   (`voxel/lab/forest.js` toy tile, `loft.js` interiors, `bigisland.js` big nature, `neon.js` night city,
   `bunny.js` characters + DOF, `village.js`/`harbor.js` people/boats/waterfalls, `features.js`
   hooks/instances/pivots/picking) and the demo `static/voxel/cottage/scene.js`.
2. Scaffold: `cd voxel/tools && node new.mjs <slug> "Title" "Description." <look>` → `static/voxel/<slug>/`.
3. Build in `scene.js`: palette (`{ ...NATURE, ...BUILD, ...own }`) → grid → shapes/generators →
   `stage.add(g, { bake: { ao: true, light: true } })` → particles → `stage.start()`.
4. Look at it, every iteration: `node shot.mjs /voxel/<slug>/ --views 4 --size 640x480`, then Read the PNG.
   Fix form first (`--query look=clay`), then palette, then look (`--query 'lookjson={...}'` for A/B).
   Page errors and shader errors print to the console and fail the shot.
5. Finish: `node shot.mjs /voxel/<slug>/ --size 1200x630 --out ../../static/voxel/<slug>/preview.jpg`,
   fill in `static/voxel/pieces.json` (title, description, tags), commit.

## Rules of thumb
- Deterministic only: `rng(seed)`, `noise(seed)`, `hash3()`; no `Math.random()`.
- Y up, inclusive box ranges, grid coords = world coords (particles/lights use the same space).
- Shapes are grid methods (`g.sphere`), generators are functions (`oak(g, p, opts)`).
- 2–4 shades per material + jitter/noise; emissive 3–8 with `light: { radius }` for lamps; bloom threshold ≥ 1.4.
- Keep pieces ≤ ~1.5M voxels / ~300k quads (`stats()` is printed by shot.mjs).
- If the lib lacks something, extend the lib (and its docs) rather than hacking it into one piece.
