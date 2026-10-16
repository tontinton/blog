// Khao Sok — morning mist over Cheow Lan lake: limestone karsts, ancient rainforest and the animals of Khao Sok.
//
// A stage.world() of 9 region modules (regions/*.js, one author each) sharing layout.js (the seam contract),
// base.js (the global ground: slab, lake, river), palette.js and assets.js. Regions emit points of interest
// (ctx.emit('poi', { label, icon, target, zoom, yaw? })) that become the "Explore" tour (camera fly-to).
// Dev: ?region=falls,cave builds only those regions (one region: the camera frames it); voxel/docs/big-scenes.md.
import { Stage } from '../lib/index.js';
import { REGIONS, CAMERA, FOCUS } from './layout.js';

const q = new URLSearchParams(location.search);
const solo = (q.get('region') ?? '').split(',').filter(Boolean);
const focus = solo.length === 1 ? FOCUS[solo[0]] : null;

const stage = new Stage({
  look: ['golden', {
    background: { type: 'linear', colors: ['#8fb3c6', '#efe0c4', '#b9cdd8'], mid: 0.5 },   // cool sky: the sunlit limestone separates by temperature
    sun: { color: '#ffd9a8', intensity: 2.7, azimuth: 42, elevation: 38, softness: 2.5, update: 'static' },   // ~22° right of the camera: karst faces get modelling (≤ 45 or the front darkens)
    fill: { color: '#9cc0e8', intensity: 0.5, azimuth: 160, elevation: 35 },
    sky: { top: '#8fb8dc', horizon: '#f0d8b8', bottom: '#5a6a48', intensity: 1.0 },
    fog: { amount: 0.65, near: 0.05, far: 1.05, color: null },
    bloom: { strength: 0.35, threshold: 1.5 },
    grade: { saturation: 1.0, vibrance: 0.08, temperature: 0.05, contrast: 1.06 },
    vignette: { amount: 0.25 },
    ground: { opacity: 0.05, contact: 0.5, color: '#2a3a30' },
  }],
  camera: { yaw: CAMERA.yaw, pitch: CAMERA.pitch, pan: true, maxZoom: 14, margin: 1.1, offset: [0, 0.012], ...(focus ? { target: focus, zoom: 2.2 } : {}) },
  ui: { title: 'Khao Sok', subtitle: 'Morning mist over Cheow Lan lake, Thailand' },
});

const { pois } = await stage.world({
  palette: './palette.js', assets: './assets.js',
  regions: REGIONS.map((r) => ({ name: r.name, module: `./regions/${r.name}.js`, box: r.box })),
});

// "Explore": a tour of the points of interest the regions emit (lib/tour.js), in the order of a real Khao Sok visit —
// park HQ → jungle trail → river and elephants → waterfall → bat cave → canopy → boat landing → lake → rafts → dawn on the Brothers
stage.tour(pois, {
  order: ['trail', 'river', 'falls', 'cave', 'giant', 'mouth', 'lake', 'rafts', 'towers'],
  groups: { falls: 'The waterfall', cave: 'Bat cave ridge', towers: 'The Three Brothers', river: 'Elephant river', giant: 'The giant tree',
    rafts: 'Floating village', trail: 'Forest trail', mouth: 'River mouth', lake: 'Cheow Lan lake' },
  home: 'Whole valley', yaw: CAMERA.yaw, pitch: CAMERA.pitch,
});
stage.start();
