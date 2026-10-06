// Tiny module-worker pool. Jobs are { type, ...payload }; resolves with the worker's `res`.
//   const pool = getPool();  await pool.run({ type: 'mesh', ... }, transferList)
let shared = null;

export class WorkerPool {
  constructor(n = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))) {
    this.size = n;
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.jobs = new Map();
    this.nextId = 1;
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = ({ data }) => {
        const job = this.jobs.get(data.id);
        this.jobs.delete(data.id);
        if (data.error) job.reject(new Error(data.error)); else job.resolve(data.res);
        this.idle.push(w);
        this._pump();
      };
      w.onerror = (e) => { console.error('voxel worker error', e.message); };
      this.workers.push(w);
      this.idle.push(w);
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
  _pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop(), j = this.queue.shift();
      w.postMessage(j.msg, j.transfer);
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
