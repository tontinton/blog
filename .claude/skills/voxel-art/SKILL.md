---
name: voxel-art
description: Create, edit or restyle 3D voxel art pieces (isometric dioramas, cutaway rooms, floating islands, toy characters, neon cities) for the blog's /voxel section, using the shared library in static/voxel/lib, and hand back a live preview link (tontinton.com short link /v/<short>, previewed on the branch's Cloudflare Pages URL). Use for any request to make a voxel artwork or scene, change how a piece looks (lighting, bloom, DOF, colors), or extend the voxel renderer, generators or tooling.
---

# Voxel art pieces

Everything lives in two places:
- `static/voxel/lib/` — the published no-build ES-module library (three.js r186 vendored). Pieces import `../lib/index.js`.
- `voxel/` (repo root, unpublished) — `README.md` (start here), `docs/{api,looks,cookbook,animation,big-scenes,extending,tools}.md`, `template/`, `lab/` (worked examples / tests), `tools/` (`new.mjs`, `shot.mjs`, `serve.mjs`, `test.mjs`, `check.mjs`, `links.mjs`, `preview.mjs`).

**The deliverable is a link.** Every piece gets a short name (`static/voxel/pieces.json` → `short`) and is
served at `/v/<short>/`. Cloudflare Pages builds every pushed branch, so the session ends with a pushed
commit and a direct link to the piece on the branch preview, e.g.
`https://<branch-alias>.blog-3t8.pages.dev/v/<short>/` (and `https://tontinton.com/v/<short>/` once merged).

## Workflow

1. Read `voxel/README.md` (mental model + gotchas). Load `docs/api.md` for exact signatures, `docs/looks.md`
   for lighting/mood, `docs/cookbook.md` for technique recipes. Skim the closest lab scene
   (`voxel/lab/forest.js` toy tile, `loft.js` interiors, `bigisland.js` big nature, `neon.js` night city,
   `bunny.js` characters + DOF, `village.js`/`harbor.js` people/boats/waterfalls, `features.js`
   hooks/instances/pivots/picking, `cat.js` animals/walkers/birds + windmill, `bigworld.js` parallel
   region world) and the demo `static/voxel/cottage/scene.js`. Browse what exists:
   `node shot.mjs /voxel/_lab/ --query 'scene=catalog' --page` (`&kind=creature`, `&kind=shading`).
   Missing a generator/shading/creature? **Extend the lib first** (`docs/extending.md`: implement,
   register with an example, check in the catalog, `node test.mjs`), then make the art.
   Big scene (city, landscape, > ~1M voxels) or several authors? `docs/big-scenes.md`: `stage.world()`
   with one region module per subagent, a shared `layout.js`/`palette.js`/`assets.js`.
2. Scaffold: `cd voxel/tools && node new.mjs <slug> "Title" "Description." <look> --short <name>` →
   `static/voxel/<slug>/` + its short link `/v/<name>/`. Pick a short, memorable name (2–6 letters or a
   word: `cot`, `lh`, `neon`); if the user named one, use it. Without `--short` it takes the first free
   letters of the slug. Rename later: edit `short` in `pieces.json`, `node links.mjs`.
3. Build in `scene.js`: palette (`{ ...NATURE, ...BUILD, ...own }`) → grid → shapes/generators →
   `stage.add(g, { bake: { ao: true, light: true } })` → particles → life (`stage.actors({ creature: 'cat' })`,
   `stage.animate(blades, { spin })`, `docs/animation.md`) → `stage.start()`.
4. Look at it, every iteration: `node shot.mjs /voxel/<slug>/ --views 4 --size 640x480`, then Read the PNG.
   Fix form first (`--query look=clay`), then palette, then look (`--query 'lookjson={...}'` for A/B).
   Page errors and shader errors print to the console and fail the shot. Close-ups:
   `--query 'target=x,y,z' --zoom 4`; animated scenes: `--t 5` (actors replay deterministically to t).
5. Finish:
   - `node shot.mjs /voxel/<slug>/ --size 1200x630 --out ../../static/voxel/<slug>/preview.jpg`
   - fill in `static/voxel/pieces.json` (title, description, tags; `short` is already set)
   - `node links.mjs` (regenerates `/v/<short>/` and re-stamps the content-hash import map that busts
     browser/CDN caches; required after ANY edit to a piece's files or the lib, even a one-line color change,
     before every commit — `node test.mjs` fails when stale), `node shot.mjs /v/<short>/` renders identically
   - commit and push the branch (`git push -u origin <branch>`)
   - `node preview.mjs <short>` — waits for the Cloudflare Pages build of the pushed commit (~1–3 min) and
     prints the branch preview URL, the per-commit URL and the direct piece link.
6. Reply to the user with the direct link first — `https://<branch-alias>.blog-3t8.pages.dev/v/<short>/` from
   `preview.mjs` — plus the commit-pinned link and the production link after merge
   (`https://tontinton.com/v/<short>/`). If the build failed, `preview.mjs` prints the Cloudflare log URL:
   fix and push again. If the container can't reach the GitHub API, read the "Cloudflare Pages" check run
   on the commit with the GitHub tools; its summary has "Branch Preview URL". (The sandbox usually can't
   open `pages.dev` itself, so verify with local shots, not the preview.)

## Rules of thumb
- Deterministic only: `rng(seed)`, `noise(seed)`, `hash3()`; no `Math.random()`.
- Y up, inclusive box ranges, grid coords = world coords (particles/lights use the same space).
- Shapes are grid methods (`g.sphere`), generators are functions (`oak(g, p, opts)`).
- 2–4 shades per material + jitter/noise; emissive 3–8 with `light: { radius }` for lamps; bloom threshold ≥ 1.4.
- Keep pieces ≤ ~1.5M voxels / ~300k quads (`stats()` is printed by shot.mjs).
- If the lib lacks something, extend the lib (and its docs) rather than hacking it into one piece; after
  lib changes run `node test.mjs` (unit + registry coverage, ~1 s) and `node check.mjs` (renders every scene, read `out/check/_sheet.png`).
