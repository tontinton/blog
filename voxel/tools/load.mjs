// Load-time benchmark: how long a piece takes from navigation to its first frame, and where that time goes.
// Serves static/ like Cloudflare Pages does (HTTP/2 over TLS, brotli, ETag revalidation, static/_headers),
// throttles network + CPU like a phone on 4G, and prints a timeline:
//
//   node load.mjs /v/cot/ [/v/ks/ …] [--net 4g|wifi|none] [--cpu 4] [--runs 3] [--warm] [--json out.json]
//
//   loader   first paint of the loading screen (static markup in index.html)
//   modules  the last module of the piece/lib finished downloading
//   stage    new Stage() ran (renderer + look ready; all modules evaluated)
//   built    stage.start() called (scene generated, meshed, baked)
//   frame    first frame on screen (programs compiled + warmed up), loader starts fading
// plus request count, bytes over the wire and the longest main-thread task.
// --warm loads the page once first and measures a repeat visit (HTTP cache: revalidations / immutable hits).
// Headless WebGL is SwiftShader (CPU), so shader compile + first frame are slower than on a real GPU;
// use the numbers to compare before/after, not as absolute phone timings.
import { createSecureServer } from 'node:http2';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as Z } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const STATIC = resolve(here, '../../static');
const args = process.argv.slice(2);
const VALUED = ['net', 'cpu', 'runs', 'json', 'size'];
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const paths = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]?.slice(2)));
if (!paths.length) { console.log('usage: node load.mjs /v/<short>/ [--net 4g|wifi|none] [--cpu 4] [--runs 3] [--warm]'); process.exit(1); }
const NETS = { // Chrome DevTools-like profiles (latency = RTT ms, throughput bytes/s)
  '4g': { latency: 80, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  wifi: { latency: 25, downloadThroughput: (40 * 1024 * 1024) / 8, uploadThroughput: (10 * 1024 * 1024) / 8 },
};
const net = NETS[opt('net', '4g')] ?? null;
const cpu = Number(opt('cpu', 4));
const runs = Number(opt('runs', 3));
const warm = args.includes('--warm');
const [W, H] = opt('size', '1280x800').split('x').map(Number);

// ---- server: Cloudflare Pages-like --------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const COMPRESS = new Set(['.html', '.js', '.json', '.css', '.svg']);
function headerRules() { // static/_headers: "path-pattern" line, then indented "Name: value" lines
  const f = join(STATIC, '_headers');
  if (!existsSync(f)) return [];
  const rules = [];
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) rules.push({ re: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), h: {} });
    else { const [k, ...v] = line.trim().split(':'); rules.at(-1).h[k.trim().toLowerCase()] = v.join(':').trim(); }
  }
  return rules;
}
const cache = new Map();
function serve(stream, headers) {
  const url = new URL(headers[':path'], 'https://x');
  let path = decodeURIComponent(url.pathname), file = join(STATIC, path);
  if (!file.startsWith(STATIC)) return stream.respond({ ':status': 403 }) || stream.end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { stream.respond({ ':status': 404 }); return stream.end(); }
  const ext = extname(file), raw = readFileSync(file);
  const etag = '"' + createHash('sha1').update(raw).digest('hex').slice(0, 16) + '"';
  const h = { 'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate', etag };
  for (const r of headerRules()) if (r.re.test(path)) Object.assign(h, r.h);
  if (headers['if-none-match'] === etag) { stream.respond({ ':status': 304, ...h }); return stream.end(); }
  let body = raw;
  if (COMPRESS.has(ext) && /\bbr\b/.test(headers['accept-encoding'] ?? '')) {
    if (!cache.has(etag)) cache.set(etag, brotliCompressSync(raw, { params: { [Z.BROTLI_PARAM_QUALITY]: 9 } }));
    body = cache.get(etag); h['content-encoding'] = 'br';
  }
  stream.respond({ ':status': 200, ...h, 'content-length': body.length });
  stream.end(body);
}
const certDir = join(here, 'out/.cert');
if (!existsSync(join(certDir, 'key.pem'))) {
  mkdirSync(certDir, { recursive: true });
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${certDir}/key.pem -out ${certDir}/cert.pem -days 3650 -subj /CN=localhost -addext subjectAltName=DNS:localhost`, { stdio: 'ignore' });
}
const server = createSecureServer({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')), allowHTTP1: true }, () => {});
server.on('stream', (s, h) => { try { serve(s, h); } catch (e) { try { s.respond({ ':status': 500 }); s.end(String(e)); } catch {} } });
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `https://localhost:${server.address().port}`;

// ---- browser ------------------------------------------------------------------------------------
async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const root = execSync('npm root -g').toString().trim();
  return createRequire(resolve(root, 'noop.js'))('playwright');
}
const { chromium } = await loadPlaywright();
// trust the local cert by its key (plain --ignore-certificate-errors would keep every response out of the HTTP cache)
const spki = execSync(`openssl x509 -in ${certDir}/cert.pem -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`).toString().trim();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', `--ignore-certificate-errors-spki-list=${spki}`] });

// runs in the page before anything else: timestamps of the loader, the stage, the first frame
const PROBE = () => {
  const T = (window.__load = { longest: 0, tasks: 0 });
  const now = () => performance.now();
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') T.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { T.longest = Math.max(T.longest, e.duration); T.tasks += e.duration; } }).observe({ type: 'longtask', buffered: true });
  const seen = () => {
    const l = document.querySelector('.vx-loader');
    if (l && T.loader == null) requestAnimationFrame(() => { T.loader ??= now(); });
    if (l?.classList.contains('done') && T.done == null) T.done = now();
    if (window.VOXEL?.stage && T.stage == null) T.stage = now();
    if (window.VOXEL?.stage?._started && T.built == null) T.built = now();
    if (window.VOXEL?.ready && T.frame == null) T.frame = now();
    if (window.VOXEL?.error) T.error = window.VOXEL.error;
  };
  new MutationObserver(seen).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  const tick = () => { seen(); if (T.frame == null) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};

async function measure(path) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, ignoreHTTPSErrors: true });
  await ctx.addInitScript(PROBE);
  if (warm) { // fill the HTTP cache in a tab of its own (closed: its render loop mustn't compete), measure in a fresh one
    const first = await ctx.newPage();
    await first.goto(origin + path);
    await first.waitForFunction(() => window.__load?.frame != null || window.__load?.error, null, { timeout: 180000 });
    await first.close();
  }
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  let bytes = 0, reqs = 0;
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
  cdp.on('Network.responseReceived', () => { reqs++; });
  if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net });
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(origin + path, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__load?.frame != null || window.__load?.error, null, { timeout: 300000, polling: 100 });
  const r = await page.evaluate(() => {
    const T = window.__load;
    const res = performance.getEntriesByType('resource').filter((e) => /\.js(\?|$)/.test(e.name));
    T.modules = Math.max(0, ...res.map((e) => e.responseEnd));
    return T;
  });
  // (workers' module fetches don't show up in the page's resource timing or request count)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();
  if (r.error) throw new Error(r.error);
  return { ...r, bytes, reqs };
}

const ms = (v) => (v == null ? '   -  ' : String(Math.round(v)).padStart(6));
const out = {};
console.log(`net ${opt('net', '4g')}${net ? ` (${net.latency} ms RTT, ${Math.round(net.downloadThroughput * 8 / 1024 / 1024)} Mbit/s)` : ''}, cpu ${cpu}× slower, ${warm ? 'repeat visit' : 'cold cache'}, median of ${runs}`);
console.log('page            fcp  loader modules  stage  built  frame   reqs     KB  longest task');
for (const path of paths) {
  const all = [];
  for (let i = 0; i < runs; i++) all.push(await measure(path));
  const med = (k) => { const v = all.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v[(v.length - 1) >> 1]; };
  const m = Object.fromEntries(['fcp', 'loader', 'modules', 'stage', 'built', 'frame', 'bytes', 'reqs', 'longest'].map((k) => [k, med(k)]));
  out[path] = { median: m, runs: all };
  console.log(`${path.padEnd(12)} ${ms(m.fcp)}  ${ms(m.loader)}  ${ms(m.modules)} ${ms(m.stage)} ${ms(m.built)} ${ms(m.frame)} ${String(m.reqs).padStart(6)} ${String(Math.round(m.bytes / 1024)).padStart(6)}  ${ms(m.longest)}`);
}
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(out, null, 1));
await browser.close();
server.close();
process.exit(0);
