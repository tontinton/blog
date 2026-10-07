# Tools, testing and debugging

All tools live in `voxel/tools/` and run with plain Node (≥ 18). `shot.mjs` needs Playwright: it uses a
local `node_modules/playwright` if present, else the global install (preinstalled in the cloud container,
with Chromium at `/opt/pw-browsers`). Rendering is software WebGL (SwiftShader): slow but faithful.

## Scaffold a piece
```sh
node new.mjs <slug> "Title" "One-line description." [look] [--short <name>]
```
Copies `voxel/template/` to `static/voxel/<slug>/`, appends to `static/voxel/pieces.json` and creates its
short link (`--short`, or the first free 3+ letters of the slug).

## Short links (`tontinton.com/v/<short>`)
Every piece with a `short` in `pieces.json` is also served at `/v/<short>/` — a generated copy of its
`index.html` with `<base href="/voxel/<slug>/">` (so the address bar stays short and all relative paths
still resolve) and a canonical link to the real page. Plain static files: no host redirects needed.
```sh
node links.mjs            # regenerate static/v/ + module hashes (after ANY .js/index.html/lib edit or a short rename)
node links.mjs --check    # stale? (test.mjs runs this)
node shot.mjs /v/cot/     # renders exactly like /voxel/cottage/
```
Short names: `[a-z0-9-]`, ≤ 16 chars, unique; pick something memorable (`cot`, `lh`, `neon`). Renaming
removes the old generated page. Pieces must resolve URLs against `document.baseURI` (the lib does), never
`location.href`.

## Live preview links (Cloudflare Pages)
Cloudflare Pages builds every pushed branch of the repo and reports the URLs on the commit (a
"Cloudflare Pages" check run): a per-commit URL (`https://<hash>.blog-3t8.pages.dev`) and a branch URL
that always serves the branch's latest push (`https://<branch-alias>.blog-3t8.pages.dev`, the alias is the
branch name lowercased with non-alphanumerics → `-`, cut to 28 chars). After `git push`:
```sh
node preview.mjs                 # waits for the build, prints both URLs + links to the pieces changed vs main
node preview.mjs cot             # just this piece (short name or slug); --wait 600, --sha <commit>
```
Production (`https://tontinton.com/...`) updates when the branch is merged.

Cache busting: tontinton.com sits behind Cloudflare's edge cache, which can keep serving an old `.js` after a
deploy (a hard refresh doesn't help). `links.mjs` therefore stamps each piece's `index.html` with an import
map giving every module (piece files + `static/voxel/lib/**`) a content-hash query (`./people.js?v=3f2a…`)
and loads `./scene.js?v=…`: a changed file gets a new URL, unchanged ones stay cached. Rerun
`node links.mjs` after any edit (test.mjs fails when a hash is stale). (Module workers — `stage.world` — don't see import maps.) `voxel/lab/` scenes are not
published — only `static/` is.

## Screenshots (the main feedback loop)
```sh
node shot.mjs /voxel/<slug>/                               # → out/<slug>.png (960×720)
node shot.mjs /voxel/<slug>/ --views 4                     # 2×2 grid, camera yawed 0/90/180/270° — check all sides
node shot.mjs /voxel/<slug>/ --size 640x480 --yaw 20 --pitch 15 --zoom 1.5
node shot.mjs /voxel/<slug>/ --t 3.5                        # freeze time at 3.5 s (particles, sway, flicker)
node shot.mjs /voxel/<slug>/ --query 'look=clay'            # any URL params (look, lookjson, debug…)
node shot.mjs /voxel/<slug>/ --query 'lookjson={"dof":{"enabled":true}}'
node shot.mjs /voxel/<slug>/ --ui --wait 1500 --out out/ui.png   # real page: title, loader, ?debug panel
node shot.mjs /voxel/<slug>/ --size 1200x630 --out ../../static/voxel/<slug>/preview.jpg   # og:image
node shot.mjs /voxel/_lab/ --query scene=loft               # unpublished lab scenes (voxel/lab/*.js)
node shot.mjs /voxel/<slug>/ --query 'target=12,4,-3' --zoom 4      # close-up on a point (check details)
node shot.mjs /voxel/<slug>/ --query region=market --views 4        # big world: only that region
node shot.mjs /voxel/_lab/ --query 'scene=catalog&kind=creature' --page --t 4   # registry catalog (labels need --page)
```
It prints page console output, page errors (exit code 1) and `stage.stats()`:
`{ voxels, quads, meshMs, bakeMs, lightGroups, particles, bounds, ... }`. Then **read the PNG** and judge.
A typical shot takes 4–10 s; 750k voxels ~15 s.

Shot mode (`?shot`) hides all UI, disables damping/auto-rotate, freezes time at `t=0` (or `--t`), and the
canvas is captured directly, so images are deterministic.

## Unit tests (no browser, ~1 s)
```sh
node test.mjs                     # grid/shapes/palette layout/mesher invariants (winding, AO, merge, bakes)/vox,
                                  # every registered generator/creature (from its example), actors simulation
```
Generators exported from `gen/*.js` but not registered fail the test — register them (extending.md).

## Catalog (see what the lib can do)
`/voxel/_lab/?scene=catalog` renders every registered generator, one labelled cell each;
`&kind=creature` (animated), `&kind=shading`, `&category=nature|terrain|build`, `&only=oak,pine`.

## Smoke test (run after changing the lib)
```sh
node check.mjs                    # every piece + every lab scene at 480×360 → out/check/*.png + _sheet.png
node check.mjs --only cottage,lab-loft
```
Prints ok/FAIL, time, voxels, quads and mesh time per scene; exit code 1 on any failure. Look at
`out/check/_sheet.png` to catch visual regressions.

## Live preview
```sh
node serve.mjs            # http://127.0.0.1:8737/voxel/<slug>/?debug
```
`?debug` shows fps/voxel/quad stats and a lil-gui panel for every look field; "copy look JSON" puts the
diff vs the default look on the clipboard (and console) — paste it into the piece's `look` overrides.
"save PNG (2x)" downloads a high-res still. Other params: `?look=neon`, `?lookjson={...}`, `?yaw=`,
`?pitch=`, `?zoom=`, `?t=`, `?dpr=`.

Zola also serves `static/` as-is (`zola serve` → `/voxel/<slug>/`), but lab scenes only exist on serve.mjs.

## Debugging
- **Shader compile errors** print as `THREE.WebGLProgram: Shader Error … ERROR: 0:<line>: …` followed by
  the offending source lines. Hooks are spliced into three's MeshStandard/Physical shaders — use the
  variable names listed in api.md, and GLSL ES 3.0 (`texture`, ints need explicit casts).
- A piece that throws sets `window.VOXEL.error`; shot.mjs prints it and fails fast instead of timing out.
- Inspect in the browser console: `VOXEL.stage` (`.scene`, `.look`, `.stats()`, `.models[0].grid`).
- "Everything is black": no light reaches (sun behind walls → move `sun.azimuth`; raise `sky.intensity`).
- "Colors look washed out": `toneMapping: 'agx'` desaturates — the default `'neutral'` keeps palette colors;
  also check `grade.lift` and fog.
- "Glow everywhere": lower `bloom.strength` or raise `bloom.threshold` (≥ 1.4 for daylight).
- "Particles/lights in the wrong place": boxes/positions are world coords = grid coords unless the model
  was added with `center`/`pivot`/`position`.
- "Shadow acne/peter-panning": tweak `sun.bias` (-0.0002) / `sun.normalBias` (0.04).

## Performance checks
`stats()` in shot output, or `?debug` fps in a real browser. Mesh time ≈ 2 ms per 32³ chunk + bakes.
Node can mesh too (no WebGL needed) for quick profiling:
```js
import { VoxelGrid, Palette, buildMesh } from '/abs/path/static/voxel/lib/index.js';
const r = buildMesh(grid, palette, { bake: { ao: true, light: true } }); console.log(r.stats);
```

## Checking the real site build
Zola copies `static/` verbatim, so pieces need no build step. To verify the whole blog still builds in a
cloud container (no zola, theme submodule uses SSH):
```sh
S=$(mktemp -d); cd $S
curl -sSL https://github.com/getzola/zola/releases/download/v0.22.1/zola-v0.22.1-x86_64-unknown-linux-gnu.tar.gz | tar xz
git clone -q https://github.com/tontinton/apollo.git apollo
git -C apollo checkout -q $(git -C /path/to/blog ls-files -s themes/apollo | cut -d' ' -f2)
cp -r /path/to/blog site && rm -rf site/themes/apollo && cp -r apollo site/themes/apollo
cd site && ../zola build && ls public/voxel
```
Only `static/voxel/**` is published; `voxel/` (docs, tools, lab) and `.claude/` are not.

## Updating three.js / adding addons
`voxel/tools/vendor/three-entry.js` lists what's bundled. Add an addon export there, then
`cd voxel/tools && npm i && npm run vendor` → rewrites `static/voxel/lib/vendor/three.module.min.js`.
`stage.js` patches three's PCF shadow chunk (more taps) and `material.js` splices into
MeshStandard/Physical chunks by string — if you bump three, run a lab shot and watch for
`voxel: shadow chunk patch failed` or shader errors.

## Architecture notes (for changing the lib)
- `mesher.js`: per 32³ chunk, a padded copy, 6 directions × 32 slices, greedy merge of faces whose
  4 corners carry identical (material, AO, bake) values. Packed vertex format is documented at the top.
- `material.js`: material properties come from the palette texture (`matT(id, texel)`, 16 texels per
  material, layout in `palette.js writeTexels`). Per-voxel variation is computed in the fragment shader
  from `cell = floor(vObj - n * 0.5)`, so it survives greedy merging.
- `post.js`: scene → HDR MSAA target cleared to alpha 0 → DOF → bloom chain → composite (background,
  fog, tone map, grade, vignette, grain) in display space. Alpha = geometry coverage; the ground plane
  writes only shadow/contact/reflection alpha.
- `stage.js`: camera fit (`_layout`), shadow camera fit, ground contact texture (CPU footprint blur),
  reflection pass, loop, capture.
