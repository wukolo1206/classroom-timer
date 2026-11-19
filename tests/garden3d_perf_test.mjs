import test from 'node:test';
import assert from 'node:assert/strict';
import { PerfMonitor } from '../garden3d/perf.js';

const run = (m, ms, frames) => { const out = []; for (let i = 0; i < frames; i++) { const d = m.tick(ms); if (d) out.push(d); } return out; };

test('fast device stays on high and stops measuring', () => {
  const m = new PerfMonitor();
  const d = run(m, 16, 600);
  assert.deepEqual(d.map((x) => [x.tier, x.slow, x.final]), [['high', false, true]]);
  assert.equal(m.done, true);
});

test('slow device drops to saver, then flags slow if still under the floor', () => {
  const m = new PerfMonitor();
  const d = run(m, 100, 200); // 10 fps
  assert.deepEqual(d.map((x) => [x.tier, x.slow, x.final]), [['saver', false, false], ['saver', true, true]]);
});

test('saver that reaches the floor is kept without the slow warning', () => {
  const m = new PerfMonitor({ initialTier: 'saver' });
  const d = run(m, 50, 200); // 20 fps
  assert.deepEqual(d.map((x) => [x.tier, x.slow, x.final]), [['saver', false, true]]);
});

test('warm-up and long gaps (hidden tab) are not measured', () => {
  const m = new PerfMonitor({ warmupMs: 1000, sampleMs: 1000 });
  assert.equal(m.tick(5000), null);          // returning from a hidden tab
  assert.deepEqual(run(m, 16, 62), []);       // still inside warm-up
  assert.equal(m.frames, 0);
  const d = run(m, 16, 80);
  assert.equal(d.length, 1); assert.equal(d[0].tier, 'high');
});
