// Tiny module-worker pool. Jobs are { type, ...payload }; resolves with the worker's `res`.
//   const pool = getPool();  await pool.run({ type: 'mesh', ... }, transferList)
let shared = null;
// jobs handed to a worker at once: it starts the next one the moment it finishes, instead of idling until the
// main thread (busy placing actors, uploading meshes…) gets around to its message and posts another
const DEPTH = 2;

export class WorkerPool {
  constructor(n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))) {
    this.size = n;
    this.workers = [];
    this.load = new Map(); // worker → jobs posted, not yet answered
    this.queue = [];
    this.jobs = new Map();
    this.nextId = 1;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => {
        const job = this.jobs.get(data.id);
        this.jobs.delete(data.id);
        this.load.set(w, this.load.get(w) - 1);
        this._pump();
        if (data.error) job.reject(new Error(data.error)); else job.resolve(data.res);
      };
      w.onerror = (e) => { console.error('voxel worker error', e.message); };
      this.workers.push(w);
      this.load.set(w, 0);
    }
  }
  run(msg, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.jobs.set(id, { resolve, reject });
      this.queue.push({ msg: { ...msg, id }, transfer });
      this._pump();
    });
  }
  /**
   * Post msg to every worker now (ahead of any job posted after it): shared data that many jobs use, like a
   * baker's volumes, crosses the thread boundary once per worker instead of once per job. Once per key.
   */
  share(key, msg) {
    this.shared ??= new Set();
    if (this.shared.has(key)) return;
    this.shared.add(key);
    for (const w of this.workers) w.postMessage(msg);
  }
  _pump() {
    // idle workers first; a second job each only while there are more jobs than idle workers
    for (let d = 0; d < DEPTH && this.queue.length; d++) {
      for (const w of this.workers) {
        if (!this.queue.length) break;
        if (this.load.get(w) !== d) continue;
        const j = this.queue.shift();
        this.load.set(w, d + 1);
        w.postMessage(j.msg, j.transfer);
      }
    }
  }
  terminate() { this.workers.forEach((w) => w.terminate()); if (shared === this) shared = null; }
}

/** Shared pool (created on first use). Returns null where module workers aren't available. */
export function getPool(n) {
  if (typeof Worker === 'undefined') return null;
  if (!shared) shared = new WorkerPool(n);
  return shared;
}
