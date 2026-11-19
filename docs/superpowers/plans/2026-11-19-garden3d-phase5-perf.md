# 3D 花園第五期：依 FPS 自動降畫質 — 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D 花園開始後自動量 FPS：低於 24 改省電畫質（DPR 1、關陰影）並再量一次；省電仍低於 16 就在 3D 開關旁建議改用平面。結果記在這台瀏覽器，下次直接用省電開始。不自動切回平面（避免上課中畫面突然改變）。

**Architecture:** 判斷邏輯放在純模組 `garden3d/perf.js` 的 `PerfMonitor`（餵每格真實毫秒，回傳決策），node 可測。`stage3d.js` 每格呼叫 `monitor.tick(ms)`，決策改變時 `applyTier()` 並呼叫 `options.onQuality(decision)`。`app.js` 建立控制器時帶 `initialTier`（localStorage `renderer3dTier`）與 `onQuality`（寫回 localStorage、更新 `#garden-3d-note`）。提示只寫在 3D 說明列，不動 `#garden-message`（避免干擾既有流程訊息）。

**Tech Stack:** ES modules、node:test、Playwright（SwiftShader）。

---

## Task 1: perf.js（純邏輯，TDD）

測試 `tests/garden3d_perf_test.mjs`：

```js
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
```

`garden3d/perf.js`：

```js
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
```

## Task 2: stage3d 套用畫質（含瀏覽器測試）

- 測試（`test_garden3d.py`）：

```python
    def test_low_fps_switches_to_saver_and_reports_slow(self):
        p = self.open()
        p.wait_for_function('window.Garden3D !== undefined')
        r = p.evaluate("""async () => { %s
          const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:400px'; document.body.appendChild(box);
          const seen = [];
          const g = window.Garden3D.create(box, { reducedMotion: true, onQuality: (d) => seen.push([d.tier, d.slow]), perf: { warmupMs: 100, sampleMs: 300, minFps: 1000, floorFps: 1000 } });
          g.setState({ visible: [], rosterSize: 31, stage: 0, active: true, reduced: true, idle: false });
          await until(() => g.debug().quality.slow, 20000);
          const q = g.debug().quality; g.dispose();
          return { seen, q };
        }""" % UNTIL)
        self.assertEqual(r['seen'], [['saver', False], ['saver', True]])
        self.assertEqual((r['q']['tier'], r['q']['shadows'], r['q']['pixelRatio']), ('saver', False, 1))
        self.assertEqual(p.errors, [])
```

- `stage3d.js`：
  1. import `import { PerfMonitor } from './perf.js';`
  2. 建立 renderer 後：

```js
  const monitor = new PerfMonitor(Object.assign({ initialTier: options.initialTier }, options.perf));
  let tier = null;
  function applyTier(next) {
    if (next === tier) return;
    tier = next;
    renderer.setPixelRatio(tier === 'saver' ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = tier !== 'saver';
    scene.traverse((o) => { if (o.isDirectionalLight) o.castShadow = tier !== 'saver'; if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    if (typeof resize === 'function') resize();
  }
```

     （`world` 建立後呼叫 `applyTier(monitor.tier);`，取代原本的 `renderer.setPixelRatio(...)` 那行。）
  3. `frame(t)` 開頭計算 `const rawMs = t - last;`（在 `last = t` 之前），之後：

```js
    const decision = monitor.tick(rawMs);
    if (decision) { applyTier(decision.tier); if (options.onQuality) options.onQuality(decision); }
```

  4. `capture()` 結束時還原的是 `before` pixelRatio，不影響 tier。
  5. `debug()` 加 `quality: { tier, fps: monitor.fps, slow: monitor.slow, done: monitor.done, shadows: renderer.shadowMap.enabled, pixelRatio: renderer.getPixelRatio() }`。

## Task 3: app.js 記住結果與提示（含測試）

- 測試：

```python
    def test_app_remembers_saver_tier_and_shows_hint(self):
        # SwiftShader renders only a few fps, so the real monitor drops to saver and flags the device as slow.
        p = self.open(enable=True)
        p.wait_for_function("document.body.dataset.renderer === '3d'")
        p.wait_for_function("window.__gardenDebug3d().quality.done", timeout=60000)
        self.assertIn('省電', p.inner_text('#garden-3d-note'))
        self.assertIn('平面', p.inner_text('#garden-3d-note'))
        self.assertEqual(p.evaluate("localStorage.getItem('c408_garden_renderer3dTier')"), '"saver"')
        p.reload()
        p.wait_for_function("document.body.dataset.renderer === '3d' && window.__gardenDebug3d()")
        self.assertEqual(p.evaluate('window.__gardenDebug3d().quality.tier'), 'saver')
        self.assertEqual(p.errors, [])
```

- `app.js`：
  1. `var g3=null,finishedArt3d=null,...` 改為 `var g3=null,finishedArt3d=null,g3Quality=null,use3d=read('renderer3d',false)===true;`
  2. `apply3d` 中 `api.create(box,{reducedMotion:reducedMotion.matches})` 改為：

```js
api.create(box,{reducedMotion:reducedMotion.matches,initialTier:read('renderer3dTier','high'),onQuality:function(d){g3Quality=d;write('renderer3dTier',d.tier);apply3dNote();}})
```

  3. 把 note 文字抽成 `apply3dNote()`（`apply3d` 內原本設定 textContent 的那段改呼叫它）：

```js
    function apply3dNote(){var api=window.Garden3D,ok=!!(api&&api.supported),on=use3d&&ok,saver=(g3Quality&&g3Quality.tier==='saver')||read('renderer3dTier','high')==='saver';
        $('garden-3d-note').textContent=!api?'正在檢查這台裝置能否使用 3D…':!ok?'這台裝置不支援 3D，使用平面花園。':!on?'勾選後改用 3D 花園。':'3D 模式：保存花園畫會存 3D 畫面。'+(saver?'已自動改用省電畫質。':'')+(g3Quality&&g3Quality.slow?'這台裝置跑 3D 較吃力，建議取消勾選改用平面花園。':'');}
```

  4. `dispose` 時 `g3Quality=null`。

## Task 4: 蓋章、回歸、文件、上線

- `python tools/stamp_garden.py`；`node --test tests/garden3d_perf_test.mjs tests/garden3d_layout_test.mjs`；`pytest tests/test_garden3d.py tests/test_garden.py`（預期 3D 14、平面 59）。
- CHANGELOG、guide（3D 一節：自動省電與建議改平面）、DECISIONS（不自動切回平面）、handoff、frontmatter。
- 問老師是否 push；上線驗證。
