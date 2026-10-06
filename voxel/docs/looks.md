# Looks: lighting, mood and post

A look is plain data, deep-merged `DEFAULT_LOOK ← preset(s) ← overrides` (`static/voxel/lib/looks.js`).

```js
new Stage({ look: 'neon' })
new Stage({ look: ['neon', { bloom: { strength: 0.8 }, background: { colors: ['#0b1030', '#1d2560'] } }] })
stage.updateLook({ sun: { azimuth: 120 } })       // live
```

Iterate without editing code: `?debug` (panel + "copy look JSON" → paste as overrides), `?look=clay`
(layer a preset), `?lookjson={"grade":{"saturation":1.3}}` (layer raw overrides; shot.mjs: `--query`).

## Presets

| preset | for | key traits |
|---|---|---|
| `studio` (default) | anything | warm grey gradient, soft sun from front-left, neutral grade |
| `daylight` | sunny dioramas, forest tiles | green radial bg, strong warm sun, cool sky ambient |
| `pastel` | toys, characters (bunny) | beige radial bg, big soft shadows, chunky bevels, **depth of field** |
| `golden` | sunsets, cottages | low orange sun, long shadows, blue fill light, warm grade |
| `dreamy` | floating islands, fairy tales | pink haze, soft light, glow, **fog** into the background |
| `neon` | night cities, cyberpunk | navy bg, lavender moonlight, pink fill, strong bloom, emissive boost |
| `cozy` | lamp-lit interiors | dark surround, warm baked light, glow, vignette, **glossy floor reflection** |
| `clay` | checking form | everything desaturated, no bloom |
| `winter` | snow scenes | cold bright light, blue shadows |
| `night` | moonlit villages | deep blue gradient with **stars**, cool moon, warm emissives |
| `rainy` | overcast/rain | soft shadowless light, grey-blue haze, wet reflective ground (add `rain` particles) |
| `spooky` | haunted scenes | purple dusk, green moonlight, ground fog, stars |
| `desert` | sand/noon | hot high sun, hard shadows, warm haze |
| `toon` | graphic/cartoon | **ink outlines**, no bevels, flat bright background |

Combine: `['golden', 'clay']`, `['neon', { fog: { amount: 0.3 } }]`.

## Every field

**background** — composited after tone mapping, so these are exactly the colors you see.
`type: 'solid' | 'linear' | 'radial'`, `colors: [a, b]` or `[a, mid, b]` (linear: top→bottom; radial:
center→edge), `angle` (linear, deg), `center: [x, y]` + `radius` (radial, screen units), `power` (curve),
`mid` (position of the middle color), `noise` (dither, keep ~0.006), `stars` (brightness 0.6–1.2, or
`{ amount, density: 0.05, size: 1, horizon: 0.25 }` — twinkling, fading toward the bottom), `disc` (a sun/moon:
`{ at: [0.82, 0.82] (screen), radius: 0.045 (of screen height), color, glow }`). Make the page `<body>` background
match `colors.at(-1)` so there's no flash (new.mjs does).

**sun** — the shadow-casting directional light. `color`, `intensity` (daylight ~2.5–3, night ~0.5–1.5),
`azimuth` (0 = from +z i.e. the default camera side, 90 = from +x), `elevation` (deg; low = long shadows),
`shadow`, `softness` (PCF radius in texels, 1–4), `mapSize` (4096), `bias`, `normalBias`,
`follow: true` keeps it fixed relative to the camera (lighting never changes while orbiting).
Tip: put the sun roughly behind the camera's shoulder (azimuth within ±60° of camera yaw) so the
visible faces get light; side-light (±90°) is more dramatic.

**fill** — shadowless second directional light (rim/bounce): `color, intensity (0), azimuth, elevation`.

**sky** — generates the environment map: ambient light + reflections. `top, horizon, bottom` colors,
`intensity` (≈ ambient strength; 0.3 night, 1.0 day, 1.3 pastel), `sunGlow` (sun hotspot in reflections).
Changing sky colors recolors every shadow. Blue sky + warm sun = classic daylight; same hue for both = flat.

**ambient** — flat extra light `{ color, intensity }` (usually 0; use sky).

**voxel** — shading of voxel surfaces (uniforms, all live):
`ao` (vertex AO 0..1, 0.6–0.8), `aoGamma` (>1 tighter creases), `rayAO` (strength of baked ray AO; needs
`bake.ao`), `aoDirect` (how much AO also darkens sunlight), `bevel` (width in voxels: 0 sharp, 0.1 subtle,
0.2+ toy-like), `bevelStrength` (normal tilt), `edge` (+ brightens / − darkens convex edges — negative
gives an inked look), `gridLine` (line width for `grid` materials), `jitter` (× material jitter),
`saturation` (albedo saturation; 0 = clay), `emissive` (× glow), `bakedLight` (× baked light).

**wind** `{ strength, speed, direction: [x, z] }` — sway materials. **water** `{ scale, speed, strength,
glow (in-scattering so water keeps its color in shade), transmission (refraction; false = cheap alpha) }`.

**exposure** (1) and **toneMapping**: `'neutral'` (default, Khronos PBR Neutral: palette colors stay true —
best for stylized voxel art), `'agx'` (filmic, desaturates highlights — photographic), `'aces'` (punchy,
shifts hues), `'reinhard'`, `'cineon'`, `'none'`.

**bloom** `{ enabled, strength (0.3–0.8), radius (0..1.5, glow size), threshold (HDR level that starts to
glow; 1.4–2 keeps sunlit surfaces clean so only emissives glow), knee, levels, tint }`.

**dof** — `{ enabled, mode, focus, band, range, maxBlur, angle, bokeh }`.
- `mode: 'tiltshift'` — miniature look; sharp horizontal band at screen `focus` (0 bottom..1 top) with half
  height `band`, blur ramps over `range` (screen fractions), `angle` tilts the band.
- `mode: 'depth'` — camera focus. `focus: 'auto'` = the orbit target, or a number = offset in model radii;
  `band`/`range` in model radii. `maxBlur` in px at 1080p. `bokeh` brightens out-of-focus highlights.

**fog** `{ amount (0..1), near, far, color }` — distances in model radii relative to the target depth
(0 = center plane, +1 = back of the model). `color: null` fades into the background (atmospheric).

**grade** — after tone mapping, in display space: `contrast, saturation, vibrance (boosts muted colors),
temperature (− cool / + warm), tint (− green / + magenta), hue (deg), lift/gamma/gain ([r,g,b] — lift
the shadows' color, e.g. [0.02, 0.0, 0.04] = purple shadows), black (black floor), background (also grade
the background)`.

**vignette** `{ amount, softness, roundness, color }` · **grain** `{ amount (0.02), size }` · **chromatic**
(aberration, 0..1) · **dither** (1).

**outline** `{ amount (0 = off, ~0.85 toon), color, width (px), threshold (relative depth jump, 0.015) }` —
ink lines on silhouettes and depth creases, drawn over everything.

**ground** — the infinite floor under the model, invisible except for what it catches:
`type: 'shadow' | 'none'`, `opacity` (sun shadow darkness), `color` (shadow tint — use a dark saturated
version of the background, e.g. `#5a3010` on beige), `contact` (soft contact shadow from the footprint),
`contactRadius`, `contactHeight`, `reflect` (0..1 glossy mirror floor; renders the scene twice),
`blur`, `reflectFade`.

## Recipes: the reference moods

**Forest cottage tile (green bg, bright toy diorama)** — `['daylight', { background: { type: 'solid',
colors: ['#2e7d32'] }, sun: { azimuth: 40, elevation: 55 }, voxel: { bevel: 0.08 } }]`. Ortho camera
yaw 40 pitch 30. Saturated greens with 3 shades per plant; layered tile sides.

**Pastel bunny (toy character, shallow focus)** — `pastel` as is. Perspective camera
`{ type: 'persp', fov: 30, pitch: 20, zoom: 1.5 }` so DOF blurs fore/background; floating
`stage.particles({ preset: 'cubes' })`; big flat colored boxes with bevel 0.22.

**Neon shipyard (night city)** — `neon`; buildings in lavender greys (`#7a7f9e`) so moonlight reads; windows
via `facade(..., { lit: ['pinkWin', 'yellowWin'] })` with `emissive: 3–4` and `light: { radius: 5 }`;
cyan neon trim 1 voxel wide; `bake: { light: true }` so neon spills onto pavement.

**Cozy loft room (warm interior)** — `cozy`; 2 walls + floor cutaway; lots of small `light` sources
(candles radius 6, lanterns 8, fireplace 9–10); stone walls in cool greys so warm light contrasts;
`stage.particles({ preset: 'dust' })` and `embers` above the fire; `ground.reflect` ~0.35.

**Floating island (dreamy pink)** — `dreamy`; huge foliage density; water cutaway at a corner (box of
`water` that reaches the model edge); emissive green moss in caves (`emissive: 1, light: {...}`) + fog;
`fireflies`; clouds via `cloud()` around the top; small extra models (bench, lamp) on the ground plane.

Read the worked examples in `voxel/lab/` (`loft.js`, `bigisland.js`, `neon.js`, `bunny.js`, `island.js`).
