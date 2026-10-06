// Live links for a pushed commit: Cloudflare Pages builds every pushed branch and reports the preview URLs
// on the commit (the "Cloudflare Pages" check run). This waits for that build and prints direct links to
// the pieces — the URLs to hand back to the user.
//
//   node preview.mjs                 HEAD; links for the pieces changed since the default branch (else all)
//   node preview.mjs cot lighthouse  links for these pieces (short names or slugs)
//   node preview.mjs --wait 600      give up after N seconds (default 480)   --sha <sha>  another commit
//
// Prints e.g.
//   branch preview  https://claude-voxel-art-framework-s.blog-3t8.pages.dev   (latest push on the branch)
//   this commit     https://ff396145.blog-3t8.pages.dev
//   cottage         https://claude-voxel-art-framework-s.blog-3t8.pages.dev/v/cot/
//   after merge     https://tontinton.com/v/cot/
// Needs the commit pushed (git push first). Uses the public GitHub API (GITHUB_TOKEN raises the rate limit).
import { execFileSync } from 'node:child_process';
import { readPieces } from './links.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const wait = Number(opt('--wait', 480));
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const sha = opt('--sha', null) ?? git('rev-parse', 'HEAD');
const repo = (process.env.VOXEL_REPO ?? git('remote', 'get-url', 'origin')).replace(/\.git$/, '').split('/').slice(-2).join('/');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');

// is it pushed?
try {
  const remote = git('rev-parse', '@{u}');
  if (remote !== sha && !args.includes('--sha')) console.warn(`warning: HEAD ${sha.slice(0, 7)} is not the pushed tip (${remote.slice(0, 7)}) — git push first`);
} catch { console.warn('warning: branch has no upstream — git push -u origin <branch> first'); }

function api(path) {
  const headers = ['-H', 'Accept: application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? ['-H', `Authorization: Bearer ${process.env.GITHUB_TOKEN}`] : [])];
  return JSON.parse(execFileSync('curl', ['-sS', '--fail-with-body', ...headers, `https://api.github.com/repos/${repo}/${path}`], { encoding: 'utf8' }));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cloudflare() {
  const t0 = Date.now();
  let last = '';
  for (;;) {
    let run = null;
    try { run = api(`commits/${sha}/check-runs`).check_runs?.find((c) => /cloudflare/i.test(c.name) || /cloudflare/i.test(c.app?.slug ?? '')); }
    catch (e) { console.warn(`GitHub API: ${String(e.stdout ?? e.message).slice(0, 200)}`); }
    const state = run ? `${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}` : 'not reported yet';
    if (state !== last) { console.log(`cloudflare pages: ${state}`); last = state; }
    if (run?.status === 'completed') return run;
    if ((Date.now() - t0) / 1000 > wait) throw new Error(`no finished Cloudflare build for ${sha.slice(0, 7)} after ${wait}s`);
    await sleep(15000);
  }
}

const run = await cloudflare();
const summary = run.output?.summary ?? '';
const url = (label) => summary.match(new RegExp(`${label}:[\\s\\S]*?href='([^']+)'`))?.[1];
if (run.conclusion !== 'success') {
  console.error(`build ${run.conclusion}: ${run.details_url}`);
  process.exit(1);
}
// branch alias rule (lowercase, non-alphanumerics → '-', 28 chars) as a fallback if the summary format changes
const host = url('Preview URL')?.replace(/^https:\/\/[^.]+\./, '');
const branchUrl = url('Branch Preview URL') ?? (host && `https://${branch.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 28).replace(/-+$/, '')}.${host}`);
const commitUrl = url('Preview URL');
console.log(`\nbranch preview  ${branchUrl}   (always the latest push on ${branch})`);
console.log(`this commit     ${commitUrl}`);

// which pieces
const pieces = readPieces();
let pick = args.length ? pieces.filter((p) => args.includes(p.short) || args.includes(p.slug)) : null;
if (!pick) {
  let changed = [];
  for (const ref of ['origin/HEAD', 'origin/main', 'origin/master']) {
    try { changed = git('diff', '--name-only', `${ref}...${sha}`).split('\n'); break; } catch { /* try the next */ }
  }
  pick = pieces.filter((p) => changed.some((f) => f.startsWith(`static/voxel/${p.slug}/`)));
  if (!pick.length) pick = pieces;
}
const base = branchUrl ?? commitUrl;
for (const p of pick) {
  const path = p.short ? `/v/${p.short}/` : `/voxel/${p.slug}/`;
  console.log(`${p.slug.padEnd(15)} ${base}${path}`);
  console.log(`${''.padEnd(15)} after merge: https://tontinton.com${path}`);
}
