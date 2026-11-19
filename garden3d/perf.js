// garden3d/perf.js
// Decides the 3D quality tier from real frame times. Pure logic (no DOM) so node can test it.
export class PerfMonitor {
  constructor({ initialTier = 'high', warmupMs = 2000, sampleMs = 4000, minFps = 24, floorFps = 16 } = {}) {
    Object.assign(this, { warmupMs, sampleMs, minFps, floorFps });
    this.reset(initialTier === 'saver' ? 'saver' : 'high');
  }
  reset(tier) { this.tier = tier; this.elapsed = 0; this.frames = 0; this.sampled = 0; this.done = false; this.slow = false; this.fps = null; }
  // ms: real time since the previous frame. Returns a decision when the tier / verdict changes, otherwise null.
  tick(ms) {
    if (this.done || !(ms > 0) || ms > 1000) return null; // finished, bogus, or a hidden-tab gap
    this.elapsed += ms;
    if (this.elapsed <= this.warmupMs) return null;
    this.frames++; this.sampled += ms;
    if (this.sampled < this.sampleMs) return null;
    const fps = this.fps = this.frames * 1000 / this.sampled;
    if (fps >= this.minFps) { this.done = true; return { tier: this.tier, fps, slow: false, final: true }; }
    if (this.tier === 'high') { this.reset('saver'); this.fps = fps; return { tier: 'saver', fps, slow: false, final: false }; }
    this.done = true; this.slow = fps < this.floorFps;
    return { tier: 'saver', fps, slow: this.slow, final: true };
  }
}
